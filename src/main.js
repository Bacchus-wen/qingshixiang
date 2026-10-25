import { tr } from './ui/i18n.js'; // (first: the page's language and title)
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
import farshop from './systems/shop/farshop.js';
import story, { TITLE_TEXT } from './systems/shop/story.js';
import { Film } from './ui/film.js';
import shopsound from './systems/shop/sound.js';

// Scene selection: ?scene=lookdev runs the look-dev bench; default is the street.
const q = new URLSearchParams(location.search);
// v4: the repair shop is the experience; ?scene=street is the v3 rainy street (its shots carry no scene: street)
const scene = q.get('scene') || (SHOTS[q.get('shot')] ? SHOTS[q.get('shot')].scene || 'street' : 'shop');
const list = scene === 'lookdev' ? SYSTEMS : scene === 'shop' ? [shop, eye, past, farshop, atmoShop, story, shopsound] // v4: the repair shop
  : [street, atmo, robot, cat, ghosts, ...SYSTEMS.filter((s) => s.name !== 'lookdev')];

const loading = document.getElementById('loading');
// the title at once, "loading" under it (2026-10-26: a first visit sat 4-8 s on black with a 2 px line, then the title);
// "click to begin" once it can begin -- a click before then started the arrival before the sound could unlock
const early = scene === 'shop' && !q.get('shot') && q.get('review') === null ? Film.shared(document.getElementById('ui'), TITLE_TEXT()) : null;
if (early) { early.start(tr('正在载入', 'Loading')); early.title(true); }
const engine = new Engine(document.getElementById('app'));
try {
  await engine.init(list, (p) => { loading.style.setProperty('--p', p); });
  loading.classList.add('done');
  early?.start(TITLE_TEXT().start);
  engine.start();
  if (engine.ctx.params.get('studio') !== null) import('./ui/studio.js').then((m) => m.studio(engine.ctx)); // live tuning panel
} catch (e) {
  console.error(e);
  const msg = e.core ? `${e.message}` : tr('这个浏览器无法运行 WebGPU 或 WebGL2', 'This browser cannot run WebGPU or WebGL2');
  const hint = e.core ? tr('请刷新页面重试(详细信息见浏览器控制台)', 'Please reload the page (details in the browser console)') : tr('请用最新的 Chrome、Edge 或 Safari 打开', 'Please open it in the latest Chrome, Edge or Safari');
  document.getElementById('ui').innerHTML = `<div class="film-title on"><p>${msg}</p><small>${hint}</small></div>`;
}
