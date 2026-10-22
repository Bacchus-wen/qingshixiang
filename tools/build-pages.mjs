// The public web version for GitHub Pages: only the shop story, only the files it loads, without the raw meshes.
//   node tools/build-pages.mjs --netlog /tmp/netlog.json [--out /tmp/qsx-site-<time>] [--base /qingshixiang/]
// netlog: `node tools/play-shop.mjs --netlog f.json` against the dev server (every file the whole story requested).
// 1. vite build with PAGES_SITE=1 (index.html only, no copy of assets/), PAGES_BASE, VITE_LOD_MIN=1 (finest level L1)
// 2. copy the asset files the story requested, plus each LOD set's lod.json and its levels except L0
// 3. refuse anything that must not be published: raw generations, the unlicensed cybercity textures and models, the
//    CC BY-NC Kestrel robot (CREDITS.md); fail rather than ship it
// 4. credits.html (the sources of what ships, from CREDITS.md), .nojekyll, a size report
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const netlogFile = opt('netlog', null);
if (!netlogFile) { console.error('usage: node tools/build-pages.mjs --netlog <play-shop netlog.json> [--out dir] [--base /repo/]'); process.exit(2); }
const out = path.resolve(opt('out', `/tmp/qsx-site-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`));
const base = opt('base', '/qingshixiang/');
if (existsSync(out) && readdirSync(out).length) { console.error(`${out} is not empty: pick a fresh --out`); process.exit(2); }
const assets = path.join(root, 'assets');
const NEVER = [/^generated\//, /^textures\/cc\//, /^models\/cc\//, /robot_k1/i, /kestrel/i, /^mj\//];

// 1. the app
execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', 'false'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, PAGES_SITE: '1', PAGES_BASE: base, VITE_LOD_MIN: '1' },
});

// 2. the files the story loads (the dev server serves assets/ at the root)
const log = JSON.parse(readFileSync(netlogFile, 'utf8'));
const wanted = new Set();
for (const r of log.net) {
  if (r.status >= 400) continue;
  const rel = r.path.replace(/^\/+/, '');
  if (!rel || /^(src|node_modules|@vite|@fs|@id)\//.test(rel) || rel.endsWith('.html')) continue;
  if (/^models\/shop\/lod\/[^/]+\/L\d+\.glb$/.test(rel)) continue; // the levels themselves: below, by rule (index.json and each lod.json come from the log)
  const f = path.join(assets, rel);
  if (existsSync(f) && statSync(f).isFile()) wanted.add(rel);
}
const lodDir = path.join(assets, 'models/shop/lod');
for (const name of readdirSync(lodDir)) {
  const meta = path.join(lodDir, name, 'lod.json'); if (!existsSync(meta)) continue;
  wanted.add(`models/shop/lod/${name}/lod.json`);
  JSON.parse(readFileSync(meta, 'utf8')).levels.forEach((L, i) => { if (i > 0) wanted.add(`models/shop/lod/${name}/${L.file}`); });
}
const bad = [...wanted].filter((f) => NEVER.some((re) => re.test(f)));
if (bad.length) { console.error('REFUSED: the story loads files that must not be published:\n  ' + bad.join('\n  ')); process.exit(1); }
for (const f of wanted) { const src = path.join(assets, f); if (!existsSync(src)) { console.error('missing', f); process.exit(1); } mkdirSync(path.dirname(path.join(out, f)), { recursive: true }); cpSync(src, path.join(out, f)); }

// 3. credits: the CREDITS.md lines that name a shipped sound, plus the fixed sources of the rest
const credits = readFileSync(path.join(root, 'CREDITS.md'), 'utf8').split('\n');
const sounds = [...wanted].filter((f) => f.startsWith('audio/')).map((f) => path.basename(f).replace(/\.[^.]+$/, ''));
const soundLines = [...new Set(credits.filter((l) => /freesound|wikimedia/.test(l) && sounds.some((s) => new RegExp(`→[^\\n]*\\b${s.replace(/_[a-z]$/, '(_[a-z])?')}\\b`).test(l))))];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(https?:\/\/[^\s,，)）。]+)/g, '<a href="$1">$1</a>');
writeFileSync(path.join(out, 'credits.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>青石巷 · 出处与许可</title>
<style>body{font:15px/1.7 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#ddd;background:#111}a{color:#e9b46a}h1{font-weight:400}li{margin:.3em 0}</style>
<h1>青石巷 · 出处与许可</h1>
<p><a href="./?lang=zh">← 回到作品</a> · <a href="credits-en.html">English</a></p>
<h2>三维模型</h2><ul><li>修理铺里的旧物、工作台和机器人：Tripo 生成的原始网格（参考图由生图模型生成），网页版用的是减面后的级别。</li></ul>
<h2>图片</h2><ul><li>马路对面"现在"和"从前"两张街景：生图模型生成（gpt-image-2.5）；画面里的店名、人物都是生成的，不对应真实的店和人。</li><li>店内墙面、地面等贴图：生图模型生成或程序绘制。</li></ul>
<h2>声音</h2><ul>${soundLines.map((l) => `<li>${esc(l.replace(/^\s*-\s*/, ''))}</li>`).join('')}<li>钟摆、收音机里的曲子（本作原创）、电视测试音、机器人的舵机与开眼声、灯管与市电的嗡声：Web Audio 程序合成。</li></ul>
<h2>代码与库</h2><ul><li>three.js（MIT）、GSAP（标准许可）。</li></ul>
`);
// the same in English (the piece speaks English outside Chinese browsers, src/ui/i18n.js): the sound lines without their
// Chinese notes in brackets
const noZh = (l) => l.replace(/\s*[(（][^()（）]*[\u4e00-\u9fff][^()（）]*[)）]/g, '').replace(/。已剪辑、滤波/g, '; edited and filtered').replace(/。/g, '.').replace(/，/g, ', ');
writeFileSync(path.join(out, 'credits-en.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bluestone Lane · Sources and licences</title>
<style>body{font:15px/1.7 -apple-system,"Helvetica Neue",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#ddd;background:#111}a{color:#e9b46a}h1{font-weight:400}li{margin:.3em 0}</style>
<h1>Bluestone Lane · Sources and licences</h1>
<p><a href="./?lang=en">← Back to the piece</a> · <a href="credits.html">中文</a></p>
<h2>3D models</h2><ul><li>The old things in the repair shop, the workbench and the robot, and the sets in the electronics shop across the road: raw meshes generated with Tripo (from reference images made with an image model); the web version uses reduced levels.</li></ul>
<h2>Images</h2><ul><li>The street across the road, "now" and "then": generated with an image model (gpt-image-2.5); the shop names and the people in them are generated and do not stand for real shops or people.</li><li>The wall and floor textures inside the shop: generated with an image model or painted procedurally.</li></ul>
<h2>Sound</h2><ul>${soundLines.map((l) => `<li>${esc(noZh(l.replace(/^\s*-\s*/, '')))}</li>`).join('')}<li>The pendulum, the song on the radio (written for this piece), the TV test tones, the robot's servos and its eye opening, the hum of the tube and the mains: synthesised with Web Audio.</li></ul>
<h2>Code and libraries</h2><ul><li>three.js (MIT), GSAP (standard licence).</li></ul>
`);
writeFileSync(path.join(out, '.nojekyll'), '');

// 4. report
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(out).map((f) => ({ f: path.relative(out, f), n: statSync(f).size })).sort((a, b) => b.n - a.n);
const MB = (n) => (n / 1048576).toFixed(1) + ' MB';
console.log(`site ${out}: ${files.length} files, ${MB(files.reduce((s, x) => s + x.n, 0))}; largest:`);
for (const x of files.slice(0, 5)) console.log(`  ${MB(x.n).padStart(9)}  ${x.f}`);
console.log(`sounds credited: ${soundLines.length} lines for ${sounds.length} files`);
if (files.some((x) => x.n > 95 * 1048576)) { console.error('a file is over GitHub\'s 100 MB limit'); process.exit(1); }
