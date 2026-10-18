"""Manifest for the model comparison stage (compare.html): every model in assets/generated/compare/ with its route,
settings, cost and measured stats (gltf-transform inspect). Writes assets/generated/compare/manifest.json.
  python3 tools/compare-manifest.py"""
import json, re, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
C = ROOT / 'assets/generated/compare'
GT = str(Path.home() / 'Tools/bin/gltf-transform')
API = 'v3.1-20260211 · 几何 detailed · 贴图 detailed · PBR'
SUBJ = {
 'radio': {'name': '开盖电子管收音机', 'ref': 'refs/radio.jpg', 'view': [0.75, 0.42, 1], 'models': [
   {'id': 'api', 'label': 'API', 'file': 'api/radio.glb', 'yaw': -90, 'settings': API, 'cost': '60 积分(开放平台)', 'time': '3 分 18 秒'},
   {'id': 'cli', 'label': 'CLI', 'file': 'cli/radio.glb', 'yaw': -90, 'settings': API, 'cost': '约 55 积分(Studio 账号)', 'time': '3 分 13 秒'},
   {'id': 'studio-h31', 'label': 'Studio H3.1', 'file': 'studio/tube-h3.1-8k.glb', 'yaw': 0, 'settings': 'H3.1 · 8K 贴图', 'cost': '—', 'time': '—'},
   {'id': 'studio-p20', 'label': 'Studio P2.0', 'file': 'studio/tube-p2.0-8k.glb', 'yaw': 0, 'settings': 'P2.0 · 8K 贴图', 'cost': '—', 'time': '—'},
   {'id': 'studio-h31-parts', 'label': 'Studio H3.1 分部件', 'file': 'studio/tube-分部件生成-h3.1.glb', 'yaw': 0, 'settings': 'H3.1 · 分部件生成', 'cost': '—', 'time': '—'},
   {'id': 'api-prev', 'label': 'API(早先一次)', 'file': 'api/radio-prev.glb', 'yaw': -90, 'settings': 'v3.1 · 贴图 v3.5 · 去光照 · PBR', 'cost': '约 60 积分(开放平台)', 'time': '—'}]},
 'robot': {'name': '旧家电拼成的机器人', 'ref': 'refs/robot.jpg', 'view': [-0.75, 0.38, 1], 'models': [
   {'id': 'api', 'label': 'API', 'file': 'api/robot.glb', 'yaw': -90, 'settings': API, 'cost': '60 积分(开放平台)', 'time': '3 分 07 秒'},
   {'id': 'cli', 'label': 'CLI', 'file': 'cli/robot.glb', 'yaw': -90, 'settings': API, 'cost': '约 55 积分(Studio 账号)', 'time': '3 分 16 秒'},
   {'id': 'studio-h31', 'label': 'Studio H3.1', 'file': 'studio/robot-h3.1-8k.glb', 'yaw': 0, 'settings': 'H3.1 · 8K 贴图', 'cost': '—', 'time': '—'},
   {'id': 'studio-p20', 'label': 'Studio P2.0', 'file': 'studio/robot-p2.0-四面-8k.glb', 'yaw': 0, 'settings': 'P2.0 · 四边面 · 8K 贴图', 'cost': '—', 'time': '—'}]},
}
def stats(p):
    t = subprocess.run([GT, 'inspect', str(p), '--format', 'md'], capture_output=True, text=True, timeout=600).stdout
    tris = sum(int(x.replace(',', '')) for x in re.findall(r'\| TRIANGLES \| \d+\s+\| ([\d,]+)', t))
    meshes = len(re.findall(r'\| TRIANGLES \|', t))
    tex = re.findall(r'\| (\w+Texture)\s+\| \d+\s+\| image/\w+\s+\|[^|]*\| (\d+)x(\d+)', t)
    maps = {}
    for slot, w, h in tex: maps[slot] = max(maps.get(slot, 0), int(w))
    short = {'baseColorTexture': '颜色', 'normalTexture': '法线', 'metallicRoughnessTexture': '金属/粗糙', 'occlusionTexture': 'AO', 'emissiveTexture': '自发光'}
    return {'tris': tris, 'meshes': meshes, 'textures': len(tex), 'maps': ' · '.join(f"{short.get(k, k)} {v // 1024}K" if v >= 1024 else f"{short.get(k, k)} {v}" for k, v in maps.items()), 'mb': round(p.stat().st_size / 1048576, 1)}
out = {}
for k, s in SUBJ.items():
    ms = []
    for m in s['models']:
        p = C / m['file']
        if not p.exists(): print('missing', p); continue
        ms.append({**m, **stats(p)}); print(k, m['id'], ms[-1]['tris'], ms[-1]['maps'], ms[-1]['mb'])
    out[k] = {**s, 'models': ms}
(C / 'manifest.json').write_text(json.dumps(out, ensure_ascii=False, indent=1))
print('manifest', C / 'manifest.json')
