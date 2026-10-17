"""Tripo v3 pipeline for the repair-shop models (v4). Builds on the shared client (游戏产线配置/tools/tripo_api.py:
auth, transport, GLB validation) and adds the endpoints the shop needs. Every operation is a ledger file
assets/generated/tripo4/<op>/ledger.json; a recorded task_id is never resubmitted (a definite 4xx rejection may be).

  python3 tools/tripo4.py views  <op> <image>                  # image -> 4 views (10 cr), views saved for review
  python3 tools/tripo4.py model  <op> [--geo]                  # those views -> detailed model (+HD PBR unless --geo)
  python3 tools/tripo4.py mv4    <op> <front> <left> <back> <right>   # own 4 views -> detailed model
  python3 tools/tripo4.py single <op> <image> [--geo]          # one image -> detailed model
  python3 tools/tripo4.py decimate <op> <faces>                # Tripo retopology v3.0 + smart UV + bake (35 cr)
  python3 tools/tripo4.py status <op>                          # resume / download whatever is pending (no new spend)
  python3 tools/tripo4.py credits                              # total estimated credits in all ledgers
Credentials come from the keychain reference (ASSET_TRIPO_KEYCHAIN_SERVICE/ACCOUNT) and are never printed.
"""
import hashlib, json, os, sys, time
from pathlib import Path

sys.path.insert(0, '/Users/wenbin/Desktop/游戏产线配置/tools')
import tripo_api as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'assets/generated/tripo4'
MODEL = 'v3.1-20260211'
TEX = {'texture': True, 'pbr': True, 'texture_version': 'v3.5-20260815', 'texture_quality': 'detailed', 'delight': True}
GEO = {'model': MODEL, 'geometry_quality': 'detailed'}
COST = {'views': 10, 'model': 60, 'model_geo': 40, 'single': 60, 'single_geo': 40, 'decimate': 35}


def ledger(op):
    p = BASE / op / 'ledger.json'
    return json.loads(p.read_text()) if p.exists() else {'op': op, 'steps': {}, 'credits': 0}


def save(rec):
    d = BASE / rec['op']; d.mkdir(parents=True, exist_ok=True)
    tmp = d / 'ledger.tmp'; tmp.write_text(json.dumps(rec, indent=1, ensure_ascii=False)); os.replace(tmp, d / 'ledger.json')


def client():
    return T.TripoClient(T._cli_credential(), timeout=60)


def submit(c, rec, name, path, payload, cost):
    st = rec['steps'].get(name)
    if st and st.get('state') != 'rejected':
        return st.get('task_id')
    rec['steps'][name] = {'state': 'submitting', 'path': path}; save(rec)
    try:
        data = c._api('POST', path, json.dumps(payload).encode())
    except T.TripoError as e:
        rec['steps'][name] = {'state': 'unknown' if e.uncertain else 'rejected', 'error': str(e), 'path': path}; save(rec)
        raise
    tid = data.get('task_id')
    if not isinstance(tid, str):
        rec['steps'][name] = {'state': 'unknown', 'error': 'no task_id'}; save(rec)
        raise T.TripoError('no task_id returned; do not resubmit', uncertain=True)
    rec['steps'][name] = {'state': 'submitted', 'task_id': tid, 'path': path, 'payload': {k: v for k, v in payload.items() if k not in ('input', 'inputs')}}
    rec['credits'] = rec.get('credits', 0) + cost; save(rec)
    return tid


def poll(c, tid, wait=1200, every=10):
    t0 = time.time()
    while True:
        r = c.query(tid)
        if r['status'] in ('success', 'failed', 'cancelled', 'banned', 'expired', 'unknown') or time.time() - t0 >= wait:
            return r
        time.sleep(every)


def fetch(c, url, max_bytes=60 * 1024 * 1024):
    T._https_url(url)
    r = c._request('GET', url, {'Accept': '*/*'}, max_bytes=max_bytes)
    if r.status != 200:
        raise T.TripoError(f'download failed (HTTP {r.status})')
    return r.body


def finish_model(c, rec, name, tid, wait, out='model.glb'):
    r = poll(c, tid, wait)
    rec['steps'][name]['status'] = r['status']; save(rec)
    o = r.get('output') or {}
    url = o.get('pbr_model') or o.get('model_url') or o.get('model') or o.get('base_model')
    if r['status'] == 'success' and url:
        data = c.download_model(url)
        dst = BASE / rec['op'] / out; dst.write_bytes(data)
        rec['steps'][name]['glb'] = str(dst); rec['steps'][name]['sha256'] = hashlib.sha256(data).hexdigest(); save(rec)
    print(json.dumps({'op': rec['op'], 'step': name, 'status': r['status'], 'glb': rec['steps'][name].get('glb')}))


def cmd_views(op, image, wait=900):
    rec = ledger(op); c = client()
    if 'file_token' not in rec:
        rec['file_token'] = c.upload_image(Path(image)); rec['image'] = str(Path(image).resolve()); save(rec)
    tid = submit(c, rec, 'views', '/generation/image-to-multiview', {'input': rec['file_token'], 'model': MODEL}, COST['views'])
    r = poll(c, tid, wait)
    rec['steps']['views']['status'] = r['status']; save(rec)
    o = r.get('output') or {}
    if r['status'] == 'success':
        vd = BASE / op / 'views'; vd.mkdir(parents=True, exist_ok=True)
        src = o.get('generate_multiview_image') if isinstance(o.get('generate_multiview_image'), dict) else o
        for v in ('front', 'left', 'back', 'right'):
            url = src.get(f'{v}_view_url') or src.get(v)
            if isinstance(url, str):
                (vd / f'{v}.png').write_bytes(fetch(c, url))
    print(json.dumps({'op': op, 'step': 'views', 'status': r['status'], 'keys': sorted(o.keys())}))


def cmd_model(op, geo=False, wait=1500):
    rec = ledger(op); c = client()
    mv = rec['steps'].get('views', {}).get('task_id')
    if not mv:
        raise SystemExit('no views step; run views first')
    name = 'model_geo' if geo else 'model'
    payload = {'inputs': [{'task_id': mv}], **GEO, **({'texture': False, 'pbr': False} if geo else TEX)}
    tid = submit(c, rec, name, '/generation/multiview-to-model', payload, COST[name])
    finish_model(c, rec, name, tid, wait, out=f'{name}.glb')


def cmd_mv4(op, views, geo=False, wait=1500):
    rec = ledger(op); c = client()
    if 'view_tokens' not in rec:
        rec['view_tokens'] = [c.upload_image(Path(v)) for v in views]; rec['views'] = [str(Path(v).resolve()) for v in views]; save(rec)
    name = 'model_geo' if geo else 'model'
    inputs = [{k: t} for k, t in zip(('front', 'left', 'back', 'right'), rec['view_tokens'])]
    payload = {'inputs': inputs, **GEO, **({'texture': False, 'pbr': False} if geo else TEX)}
    tid = submit(c, rec, name, '/generation/multiview-to-model', payload, COST[name])
    finish_model(c, rec, name, tid, wait, out=f'{name}.glb')


def cmd_single(op, image, geo=False, wait=1500):
    rec = ledger(op); c = client()
    if 'file_token' not in rec:
        rec['file_token'] = c.upload_image(Path(image)); rec['image'] = str(Path(image).resolve()); save(rec)
    name = 'single_geo' if geo else 'single'
    payload = {'input': rec['file_token'], **GEO, **({'texture': False, 'pbr': False} if geo else TEX)}
    tid = submit(c, rec, name, '/generation/image-to-model', payload, COST[name])
    finish_model(c, rec, name, tid, wait, out=f'{name}.glb')


def cmd_decimate(op, faces, wait=1200):
    rec = ledger(op); c = client()
    src = next((rec['steps'][k]['task_id'] for k in ('model', 'single') if rec['steps'].get(k, {}).get('status') == 'success'), None)
    if not src:
        raise SystemExit('no successful textured model to decimate')
    tid = submit(c, rec, f'decimate_{faces}', '/mesh/decimate', {'input': src, 'model': 'v3.0', 'face_limit': int(faces), 'smart_uv': True, 'bake': True}, COST['decimate'])
    finish_model(c, rec, f'decimate_{faces}', tid, wait, out=f'decimate_{faces}.glb')


def cmd_status(op):
    rec = ledger(op); c = client()
    for name, st in rec['steps'].items():
        if name == 'views' and st.get('status') == 'success' and not (BASE / op / 'views' / 'front.png').exists():
            cmd_views(op, rec['image']); continue
        if st.get('task_id') and st.get('status') != 'success' and not st.get('glb'):
            if name == 'views':
                cmd_views(op, rec['image']); continue
            finish_model(c, rec, name, st['task_id'], 0, out=f'{name}.glb')
    print(json.dumps({'op': op, 'steps': {k: v.get('status') for k, v in rec['steps'].items()}, 'credits': rec.get('credits')}))


def cmd_credits():
    tot = 0
    for p in sorted(BASE.glob('*/ledger.json')):
        r = json.loads(p.read_text()); tot += r.get('credits', 0); print(f"{r['op']:32s} {r.get('credits', 0)}")
    print('TOTAL', tot)


if __name__ == '__main__':
    a = sys.argv[1:]
    geo = '--geo' in a; a = [x for x in a if x != '--geo']
    cmd = a[0]
    if cmd == 'views': cmd_views(a[1], a[2])
    elif cmd == 'model': cmd_model(a[1], geo)
    elif cmd == 'mv4': cmd_mv4(a[1], a[2:6], geo)
    elif cmd == 'single': cmd_single(a[1], a[2], geo)
    elif cmd == 'decimate': cmd_decimate(a[1], a[2])
    elif cmd == 'status': cmd_status(a[1])
    elif cmd == 'credits': cmd_credits()
    sys.stdout.flush(); os._exit(0)
