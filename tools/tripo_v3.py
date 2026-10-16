"""Project-local Tripo v3 workflow on top of the shared client (游戏产线配置/tools/tripo_api.py, auth/transport/validation).
Adds what the shared client's whitelist cannot send (see docs/tripo-guide.md): image-to-multiview, multiview-to-model
with detailed geometry + v3.5 detailed PBR texture + delight, and generic polling/download.

Every operation is a ledger file assets/generated/tripo3/<op>.json; a task_id once recorded is never resubmitted.

  python3 tools/tripo_v3.py hero <op> <image.png>      # image -> 4 views -> detailed textured model (2 paid steps)
  python3 tools/tripo_v3.py status <op>                 # one poll + download if finished (no new spending)
Credentials: TRIPO_API_KEY or ASSET_TRIPO_KEYCHAIN_SERVICE/ACCOUNT (never printed).
"""
import json, sys, os, time, hashlib
from pathlib import Path
sys.path.insert(0, '/Users/wenbin/Desktop/游戏产线配置/tools')
import tripo_api as T  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / 'assets/generated/tripo3'
MODEL = 'v3.1-20260211'
GEN = {'model': MODEL, 'geometry_quality': 'detailed', 'texture': True, 'pbr': True,
       'texture_version': 'v3.5-20260815', 'texture_quality': 'detailed', 'delight': True}


def load(op):
    p = LEDGER / f'{op}.json'
    return json.loads(p.read_text()) if p.exists() else {'op': op, 'steps': {}}


def save(rec):
    LEDGER.mkdir(parents=True, exist_ok=True)
    p = LEDGER / f"{rec['op']}.json"
    tmp = p.with_suffix('.tmp'); tmp.write_text(json.dumps(rec, indent=1, ensure_ascii=False)); os.replace(tmp, p)


def client():
    return T.TripoClient(T._cli_credential(), timeout=60)


def post(c, path, payload):
    data = c._api('POST', path, json.dumps(payload).encode())
    tid = data.get('task_id')
    if not isinstance(tid, str):
        raise T.TripoError('no task_id returned; do not resubmit', uncertain=True)
    return tid


def step(c, rec, name, path, payload):
    """Submit once; a recorded (or uncertain) step is never resubmitted."""
    st = rec['steps'].get(name)
    if st and st.get('state') != 'rejected':   # a definite rejection (e.g. 429) may be retried; unknown never
        return st.get('task_id')
    rec['steps'][name] = {'state': 'submitting', 'path': path, 'payload': payload}; save(rec)
    try:
        tid = post(c, path, payload)
    except T.TripoError as e:
        rec['steps'][name] = {'state': 'unknown' if e.uncertain else 'rejected', 'error': str(e)}; save(rec)
        raise
    rec['steps'][name] = {'state': 'submitted', 'task_id': tid}; save(rec)
    return tid


def poll(c, tid, wait=0, every=8):
    t0 = time.time()
    while True:
        r = c.query(tid)
        if r['status'] in ('success', 'failed', 'cancelled', 'banned', 'expired', 'unknown') or time.time() - t0 >= wait:
            return r
        time.sleep(every)


def hero(op, image, wait=900):
    rec = load(op); c = client()
    if 'file_token' not in rec:
        rec['file_token'] = c.upload_image(image); rec['image'] = str(image); save(rec)
    mv = step(c, rec, 'multiview', '/generation/image-to-multiview', {'input': rec['file_token'], 'model': MODEL})
    r = poll(c, mv, wait)
    rec['steps']['multiview']['status'] = r['status']; save(rec)
    if r['status'] != 'success':
        print(json.dumps({'op': op, 'stage': 'multiview', 'status': r['status']})); return
    if not rec['steps'].get('model', {}).get('task_id'):
        rec['steps'].pop('model', None)
    mdl = step(c, rec, 'model', '/generation/multiview-to-model', {'inputs': [{'task_id': mv}], **GEN})
    finish(c, rec, mdl, wait)


def finish(c, rec, tid, wait):
    r = poll(c, tid, wait)
    rec['steps']['model']['status'] = r['status']; save(rec)
    out = r.get('output') or {}
    url = out.get('pbr_model') or out.get('model_url') or out.get('model') or out.get('base_model')
    if r['status'] == 'success' and url:
        data = c.download_model(url)
        dst = LEDGER / f"{rec['op']}.glb"; dst.write_bytes(data)
        rec['glb'] = str(dst); rec['glb_sha256'] = hashlib.sha256(data).hexdigest(); save(rec)
    print(json.dumps({'op': rec['op'], 'status': r['status'], 'glb': rec.get('glb')}))


def status(op):
    rec = load(op); c = client()
    if rec.get('glb'):
        print(json.dumps({'op': op, 'status': 'done', 'glb': rec['glb']})); return
    m = rec['steps'].get('model', {})
    if m.get('task_id'):
        finish(c, rec, m['task_id'], 0); return
    mv = rec['steps'].get('multiview', {})
    if mv.get('task_id'):
        r = poll(c, mv['task_id'], 0)
        print(json.dumps({'op': op, 'stage': 'multiview', 'status': r['status']})); return
    print(json.dumps({'op': op, 'status': 'not started'}))


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'hero': hero(sys.argv[2], Path(sys.argv[3]).resolve(), int(os.environ.get('WAIT', '900')))
    elif cmd == 'status': status(sys.argv[2])
