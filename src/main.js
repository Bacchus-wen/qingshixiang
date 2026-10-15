import { Engine } from './engine/Engine.js';
import { SYSTEMS } from './systems/index.js';
import { SHOTS } from './engine/shots.js';
import street from './systems/street/index.js';
import atmo from './systems/atmo/index.js';
import robot from './systems/robot/index.js';
import cat from './systems/cat/index.js';
import ghosts from './systems/ghosts/index.js';

// Scene selection: ?scene=lookdev runs the look-dev bench; default is the street.
const q = new URLSearchParams(location.search);
const scene = q.get('scene') || SHOTS[q.get('shot')]?.scene || 'street';
const list = scene === 'lookdev' ? SYSTEMS : [street, atmo, robot, cat, ghosts, ...SYSTEMS.filter((s) => s.name !== 'lookdev')];

const loading = document.getElementById('loading');
const engine = new Engine(document.getElementById('app'));
try {
  await engine.init(list, (p) => { loading.style.setProperty('--p', p); });
  loading.classList.add('done');
  engine.start();
} catch (e) {
  console.error(e);
  document.getElementById('ui').innerHTML = '<div class="film-title on"><p>这个浏览器无法运行 WebGPU 或 WebGL2</p><small>请用最新的 Chrome、Edge 或 Safari 打开</small></div>';
}
