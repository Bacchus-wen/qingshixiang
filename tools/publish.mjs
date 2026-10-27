// What may be published, and the credits pages that go with it -- shared by the two ways the piece is published:
// tools/build-pages.mjs (a self-contained site of the files the story loads) and the Vercel build (vite.config.js:
// `vite build` copies assets/ whole, so it drops what must not be published and writes the same credits pages).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// never published: raw generations, the unlicensed cybercity textures and models, the CC BY-NC Kestrel robot, the
// Midjourney references (CREDITS.md). Paths relative to assets/ (= the site root)
export const NEVER = [/^generated\//, /^textures\/cc\//, /^models\/cc\//, /robot_k1/i, /kestrel/i, /^mj\//];

// credits.html and credits-en.html in out: the CREDITS.md lines that name a shipped sound (sounds: file names without
// extension), plus the fixed sources of the rest. Returns the sound lines used
export function writeCredits({ root, out, sounds }) {
  const credits = readFileSync(path.join(root, 'CREDITS.md'), 'utf8').split('\n');
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
  // the same in English (the piece speaks English unless ?lang=zh, src/ui/i18n.js): the sound lines without their
  // Chinese notes in brackets
  const noZh = (l) => l.replace(/\s*[(（][^()（）]*[\u4e00-\u9fff][^()（）]*[)）]/g, '').replace(/。已剪辑、滤波/g, '; edited and filtered').replace(/。/g, '.').replace(/，/g, ', ');
  writeFileSync(path.join(out, 'credits-en.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bluestone Lane · Sources and licences</title>
<style>body{font:15px/1.7 -apple-system,"Helvetica Neue",sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#ddd;background:#111}a{color:#e9b46a}h1{font-weight:400}li{margin:.3em 0}</style>
<h1>Bluestone Lane · Sources and licences</h1>
<p><a href="./">← Back to the piece</a> · <a href="credits.html">中文</a></p>
<h2>3D models</h2><ul><li>The old things in the repair shop, the workbench and the robot, and the sets in the electronics shop across the road: raw meshes generated with Tripo (from reference images made with an image model); the web version uses lower-detail meshes made from them.</li></ul>
<h2>Images</h2><ul><li>The street across the road, "now" and "then": generated with an image model (gpt-image-2.5); the shop names and the people in them are generated and do not stand for real shops or people.</li><li>The wall and floor textures inside the shop: generated with an image model or painted procedurally.</li></ul>
<h2>Sound</h2><ul>${soundLines.map((l) => `<li>${esc(noZh(l.replace(/^\s*-\s*/, '')))}</li>`).join('')}<li>The pendulum, the song on the radio (written for this piece), the TV test tones, the robot's servos and its eye opening, the hum of the tube and the mains: synthesised with Web Audio.</li></ul>
<h2>Code and libraries</h2><ul><li>three.js (MIT), GSAP (standard licence).</li></ul>
`);
  return soundLines;
}
