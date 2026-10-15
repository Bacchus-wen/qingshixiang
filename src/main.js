import { Engine } from './engine/Engine.js';
import { SYSTEMS } from './systems/index.js';

const loading = document.getElementById('loading');
const engine = new Engine(document.getElementById('app'));
await engine.init(SYSTEMS, (p) => { loading.style.setProperty('--p', p); });
loading.classList.add('done');
engine.start();
