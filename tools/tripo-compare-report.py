"""Route comparison report: renders every raw GLB in assets/generated/compare/<route>/<subject>.glb (no processing)
with the same Blender studio setup next to the input image, adds close-ups and stats, writes docs/tripo-compare/.
  python3 tools/tripo-compare-report.py [--rotz-<route>-<subject> deg ...]
"""
import json, os, re, subprocess, sys, random
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
B = '/Applications/Blender.app/Contents/MacOS/Blender'
GT = str(Path.home() / 'Tools/bin/gltf-transform')
OUT = ROOT / 'docs/tripo-compare'; TMP = Path('/tmp/tripo-compare'); TMP.mkdir(exist_ok=True); OUT.mkdir(exist_ok=True)
REF = {'radio': ROOT / 'assets/generated/shop/refs/tube_radio_open.png', 'robot': ROOT / 'assets/generated/shop/refs/robot_full.png'}
ROUTES = [('api', 'API'), ('cli', 'CLI'), ('studio', 'Studio')]
EXTRA = {'radio': [('prev', 'API earlier (tex v3.5 + delight)', ROOT / 'assets/generated/tripo4/radio_M1/single.glb')]}
CLOSE = {'radio': ['--views', 'front', '--zoom', '0.62', '--tz', '0.66'], 'robot': ['--views', 'lq', '--zoom', '0.42', '--tz', '0.45']}
VIEWS = {'radio': 'fq,front,side,bq', 'robot': 'lq,front,side,bq'}   # first view matches the angle of the input image
ROT = {}
for a in sys.argv[1:]:
    m = re.match(r'--rotz-(\w+)-(\w+)=(-?\d+)', a)
    if m: ROT[(m.group(1), m.group(2))] = m.group(3)

def stats(glb):
    t = subprocess.run([GT, 'inspect', str(glb), '--format', 'md'], capture_output=True, text=True, timeout=300).stdout
    tris = sum(int(x.replace(',', '')) for x in re.findall(r'\| TRIANGLES \| \d+\s+\| ([\d,]+)', t))
    verts = sum(int(x.replace(',', '')) for x in re.findall(r'\| TRIANGLES \| \d+\s+\| [\d,]+\s+\| ([\d,]+)', t))
    tex = re.findall(r'\| \d+\s+\| [^|]*\|[^|]*\| (\w+)\s+\| \d+\s+\| image/(\w+)\s+\|[^|]*\| (\d+x\d+)\s+\| ([\d.]+ \w+)', t)
    mats = len(re.findall(r'^\| \d+\s+\| [^|]*\| \d+\s+\| [^|]*(?:Texture|—)', t, re.M))
    return {'tris': tris, 'verts': verts, 'tex': [f'{s} {r} {m}' for s, m, r, _ in tex], 'mb': round(glb.stat().st_size / 1048576, 1)}

def render(glb, out, rotz, extra, ref=None, size='420'):
    cmd = [B, '-b', '--factory-startup', '-P', str(ROOT / 'tools/blender/render_views.py'), '--', '--in', str(glb), '--out', str(out), '--size', size, '--rotz', str(rotz)] + extra
    if ref: cmd += ['--ref', str(ref)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if not out.exists(): print('RENDER FAILED', glb, r.stdout[-400:], r.stderr[-400:])

def label(img, text, out):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(img), '-vf', f"drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='{text}':x=12:y=10:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6", str(out)], check=True)

def vstack(imgs, out):
    ins = sum([['-i', str(i)] for i in imgs], [])
    w = 'scale=1680:-2'
    f = ''.join(f'[{k}:v]{w}[s{k}];' for k in range(len(imgs))) + ''.join(f'[s{k}]' for k in range(len(imgs))) + f'vstack=inputs={len(imgs)}'
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + ins + ['-filter_complex', f, '-q:v', '3', str(out)], check=True)

report = {}
for subj in ('radio', 'robot'):
    rows, close, blind = [], [], []
    items = [(r, n, ROOT / f'assets/generated/compare/{r}/{subj}.glb') for r, n in ROUTES] + [('studio2', 'Studio #2', ROOT / f'assets/generated/compare/studio/{subj}2.glb')] + EXTRA.get(subj, [])
    for r, name, glb in items:
        if not glb.exists(): continue
        rot = ROT.get((r, subj), '-90')
        st = stats(glb); report.setdefault(subj, {})[r] = {'name': name, **st, 'rotz': rot}
        v = TMP / f'{subj}_{r}_views.png'; render(glb, v, rot, ['--views', VIEWS[subj]], ref=REF[subj])
        c = TMP / f'{subj}_{r}_close.png'; render(glb, c, rot, CLOSE[subj], size='840')
        if v.exists():
            label(v, f'{name}  -  {st["tris"]:,} tris  -  {st["mb"]} MB', TMP / f'{subj}_{r}_views_l.png'); rows.append(TMP / f'{subj}_{r}_views_l.png')
            if r in ('api', 'cli', 'studio'): blind.append((r, v, c))
        if c.exists(): label(c, name, TMP / f'{subj}_{r}_close_l.png'); close.append(TMP / f'{subj}_{r}_close_l.png')
    if rows: vstack(rows, OUT / f'{subj}-views.jpg')
    if close:  # close-ups side by side, two per row
        subprocess.run(['ffmpeg', '-v', 'error', '-y'] + sum([['-i', str(c)] for c in close], []) + ['-filter_complex',
            ''.join(f'[{k}:v]scale=840:840[c{k}];' for k in range(len(close))) + ''.join(f'[c{k}]' for k in range(len(close))) + f'xstack=inputs={len(close)}:layout=' +
            '|'.join(f'{(k % 2) * 840}_{(k // 2) * 840}' for k in range(len(close))) + (f':fill=black' if len(close) % 2 else ''), '-q:v', '3', str(OUT / f'{subj}-closeups.jpg')], check=True) if len(close) > 1 else None
    if len(blind) >= 2:  # anonymised set for the blind review: same images, routes shuffled and lettered
        random.seed(hash(subj) % 1000); order = random.sample(blind, len(blind)); key = {}
        bl = []
        for k, (r, v, c) in enumerate(order):
            L = 'ABC'[k]; key[L] = r
            label(v, f'{L}', TMP / f'blind_{subj}_{L}_v.png'); label(c, f'{L} close-up', TMP / f'blind_{subj}_{L}_c.png'); bl += [TMP / f'blind_{subj}_{L}_v.png']
        vstack(bl, OUT / f'blind-{subj}-views.jpg')
        cl = [TMP / f'blind_{subj}_{L}_c.png' for L in 'ABC'[:len(order)]]
        subprocess.run(['ffmpeg', '-v', 'error', '-y'] + sum([['-i', str(c)] for c in cl], []) + ['-filter_complex', ''.join(f'[{k}:v]scale=700:700[c{k}];' for k in range(len(cl))) + ''.join(f'[c{k}]' for k in range(len(cl))) + f'hstack=inputs={len(cl)}', '-q:v', '3', str(OUT / f'blind-{subj}-closeups.jpg')], check=True)
        report[subj]['_blind_key'] = key
(OUT / 'stats.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
print(json.dumps(report, indent=1, ensure_ascii=False))
