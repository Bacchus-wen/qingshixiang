import { Engine } from './engine/Engine.js';
import { SYSTEMS } from './systems/index.js';
import { SHOTS } from './engine/shots.js';
import street from './systems/street/index.js';
import atmo from './systems/atmo/index.js';

// Scene selection: ?scene=lookdev runs the look-dev bench; default is the street.
const q = new URLSearchParams(location.search);
const scene = q.get('scene') || SHOTS[q.get('shot')]?.scene || 'street';
const list = scene === 'lookdev' ? SYSTEMS : [street, atmo, ...SYSTEMS.filter((s) => s.name !== 'lookdev')];

const loading = document.getElementById('loading');
const engine = new Engine(document.getElementById('app'));
await engine.init(list, (p) => { loading.style.setProperty('--p', p); });
loading.classList.add('done');
engine.start();
