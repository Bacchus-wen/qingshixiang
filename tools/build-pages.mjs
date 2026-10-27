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
import { NEVER, writeCredits } from './publish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const netlogFile = opt('netlog', null);
if (!netlogFile) { console.error('usage: node tools/build-pages.mjs --netlog <play-shop netlog.json> [--out dir] [--base /repo/]'); process.exit(2); }
const out = path.resolve(opt('out', `/tmp/qsx-site-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`));
const base = opt('base', '/qingshixiang/');
if (existsSync(out) && readdirSync(out).length) { console.error(`${out} is not empty: pick a fresh --out`); process.exit(2); }
const assets = path.join(root, 'assets');

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

// 3. credits: the CREDITS.md lines that name a shipped sound, plus the fixed sources of the rest (tools/publish.mjs)
const sounds = [...wanted].filter((f) => f.startsWith('audio/')).map((f) => path.basename(f).replace(/\.[^.]+$/, ''));
const soundLines = writeCredits({ root, out, sounds });
writeFileSync(path.join(out, '.nojekyll'), '');

// 4. report
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(out).map((f) => ({ f: path.relative(out, f), n: statSync(f).size })).sort((a, b) => b.n - a.n);
const MB = (n) => (n / 1048576).toFixed(1) + ' MB';
console.log(`site ${out}: ${files.length} files, ${MB(files.reduce((s, x) => s + x.n, 0))}; largest:`);
for (const x of files.slice(0, 5)) console.log(`  ${MB(x.n).padStart(9)}  ${x.f}`);
console.log(`sounds credited: ${soundLines.length} lines for ${sounds.length} files`);
if (files.some((x) => x.n > 95 * 1048576)) { console.error('a file is over GitHub\'s 100 MB limit'); process.exit(1); }
