import { DefaultLoadingManager } from 'three/webgpu';
import { Engine } from './engine/Engine.js';

// served from a sub-path (GitHub Pages: /<repo>/): root-absolute asset URLs ('/models/...') get the base prefix
const BASE = import.meta.env.BASE_URL;
if (BASE !== '/') DefaultLoadingManager.setURLModifier((u) => (u.startsWith('/') && !u.startsWith('//') && !u.startsWith(BASE) ? BASE + u.slice(1) : u)); // (loaders resolve twice: idempotent)
import { SYSTEMS } from './systems/index.js';
import { SHOTS } from './engine/shots.js';
import street from './systems/street/index.js';
import atmo from './systems/atmo/index.js';
import robot from './systems/robot/index.js';
import cat from './systems/cat/index.js';
import ghosts from './systems/ghosts/index.js';
import shop from './systems/shop/index.js';
import eye from './systems/shop/eye.js';
import past from './systems/shop/past.js';
import atmoShop from './systems/shop/atmo.js';
import story from './systems/shop/story.js';
import shopsound from './systems/shop/sound.js';

// Scene selection: ?scene=lookdev runs the look-dev bench; default is the street.
const q = new URLSearchParams(location.search);
// v4: the repair shop is the experience; ?scene=street is the v3 rainy street (its shots carry no scene: street)
const scene = q.get('scene') || (SHOTS[q.get('shot')] ? SHOTS[q.get('shot')].scene || 'street' : 'shop');
const list = scene === 'lookdev' ? SYSTEMS : scene === 'shop' ? [shop, eye, past, atmoShop, story, shopsound] // v4: the repair shop
  : [street, atmo, robot, cat, ghosts, ...SYSTEMS.filter((s) => s.name !== 'lookdev')];

const loading = document.getElementById('loading');
const engine = new Engine(document.getElementById('app'));
try {
  await engine.init(list, (p) => { loading.style.setProperty('--p', p); });
  loading.classList.add('done');
  engine.start();
} catch (e) {
  console.error(e);
  const msg = /核心系统/.test(e.message) ? `${e.message}` : '这个浏览器无法运行 WebGPU 或 WebGL2';
  const hint = /核心系统/.test(e.message) ? '请刷新页面重试(详细信息见浏览器控制台)' : '请用最新的 Chrome、Edge 或 Safari 打开';
  document.getElementById('ui').innerHTML = `<div class="film-title on"><p>${msg}</p><small>${hint}</small></div>`;
}
