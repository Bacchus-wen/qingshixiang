"""Same-camera close-ups and turnaround views of every model in assets/generated/compare/manifest.json (Blender,
neutral studio light, raw models). Writes docs/tripo-compare/all-<subject>-closeups.jpg and all-<subject>-views.jpg.
  python3 tools/compare-closeups.py"""
import json, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
C = ROOT / 'assets/generated/compare'; OUT = ROOT / 'docs/tripo-compare'; TMP = Path('/tmp/tripo-compare'); TMP.mkdir(exist_ok=True)
B = '/Applications/Blender.app/Contents/MacOS/Blender'
FONT = '/System/Library/Fonts/STHeiti Medium.ttc'
CLOSE = {'radio': ['--views', 'front', '--zoom', '0.62', '--tz', '0.66'], 'robot': ['--views', 'lq', '--zoom', '0.42', '--tz', '0.45']}
VIEWS = {'radio': 'fq,front,side,bq', 'robot': 'lq,front,side,bq'}
man = json.loads((C / 'manifest.json').read_text())
def render(glb, out, rotz, extra, size):
    subprocess.run([B, '-b', '--factory-startup', '-P', str(ROOT / 'tools/blender/render_views.py'), '--', '--in', str(glb), '--out', str(out), '--size', str(size), '--rotz', str(rotz)] + extra, capture_output=True, timeout=900)
def label(img, text, out, fs=30):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(img), '-vf', f"drawtext=fontfile='{FONT}':text='{text}':x=14:y=12:fontsize={fs}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8", str(out)], check=True)
for subj, S in man.items():
    cl, vw = [], []
    for m in S['models']:
        glb = C / m['file']; tag = f"{subj}_{m['id']}"
        c = TMP / f'all_{tag}_c.png'; render(glb, c, m['yaw'], CLOSE[subj], 760)
        v = TMP / f'all_{tag}_v.png'; render(glb, v, m['yaw'], ['--views', VIEWS[subj]], 300)
        tris = f"{m['tris'] / 1e4:.1f} 万面" if m['tris'] < 1e6 else f"{m['tris'] / 1e6:.2f} 百万面"
        if c.exists(): label(c, f"{m['label']} · {tris}", TMP / f'all_{tag}_cl.png'); cl.append(TMP / f'all_{tag}_cl.png')
        if v.exists(): label(v, f"{m['label']} · {tris} · {m['maps']}", TMP / f'all_{tag}_vl.png', 22); vw.append(TMP / f'all_{tag}_vl.png')
        print(subj, m['id'], c.exists(), v.exists())
    n = len(cl); cols = 3 if n > 4 else 2; rows = (n + cols - 1) // cols
    f = ''.join(f'[{k}:v]scale=760:760[c{k}];' for k in range(n)) + ''.join(f'[c{k}]' for k in range(n)) + f'xstack=inputs={n}:layout=' + '|'.join(f'{(k % cols) * 760}_{(k // cols) * 760}' for k in range(n)) + ':fill=black'
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + sum([['-i', str(x)] for x in cl], []) + ['-filter_complex', f, '-q:v', '3', str(OUT / f'all-{subj}-closeups.jpg')], check=True)
    f = ''.join(f'[{k}:v]scale=1200:-2[v{k}];' for k in range(len(vw))) + ''.join(f'[v{k}]' for k in range(len(vw))) + f'vstack=inputs={len(vw)}'
    subprocess.run(['ffmpeg', '-v', 'error', '-y'] + sum([['-i', str(x)] for x in vw], []) + ['-filter_complex', f, '-q:v', '3', str(OUT / f'all-{subj}-views.jpg')], check=True)
print('done')
