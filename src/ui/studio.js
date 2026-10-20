// Studio panel (?studio): tune light, grade, depth of field and the eye live instead of editing code and re-shooting
// (Chetan Ankola's "expose the controls", docs/LEARN-FROM-OTHERS.md). Best with a fixed shot: ?shot=key-street&studio.
// "copy" puts the current values on the clipboard (and the console) to write back into the code.
import GUI from 'three/addons/libs/lil-gui.module.min.js';

export function studio(ctx) {
  const gui = new GUI({ title: 'studio' });
  const P = ctx.postfx?.params || {}, out = {};
  const range = { exposure: [0, 3], focus: [0.1, 20], focalRange: [0.05, 8], bokeh: [0, 6], presentK: [0, 1], pastK: [0, 2] };
  const post = gui.addFolder('post');
  for (const k of ['exposure', 'contrast', 'saturation', 'vignette', 'grain', 'halation', 'scatter', 'presentK', 'pastK', 'focus', 'focalRange', 'bokeh']) {
    if (!P[k] || typeof P[k].value !== 'number') continue;
    const [lo, hi] = range[k] || [0, 2]; post.add(P[k], 'value', lo, hi, 0.01).name(k).onChange((v) => { out[`post.${k}`] = v; });
  }
  const A = ctx.api.atmo;
  if (A?.levels) {
    const L = A.levels[A.state], f = gui.addFolder(`light (${A.state})`);
    for (const k of Object.keys(L)) f.add(L, k, 0, ['lamp', 'robot', 'tube'].includes(k) ? 30 : 4, 0.01).onChange((v) => { out[`atmo.${A.state}.${k}`] = v; });
  }
  const m = ctx.memory, E = { spotK: m.spotK ?? 1, beamK: m.beamK ?? 1, memWide: m.memWide ?? 1 }, eye = gui.addFolder('eye');
  for (const k of Object.keys(E)) eye.add(E, k, 0, k === 'memWide' ? 5 : 3, 0.01).onChange((v) => { m[k] = v; out[`eye.${k}`] = v; });
  const fl = ctx.api.shop?.faceLight; if (fl) gui.add(fl, 'intensity', 0, 10, 0.01).name('face light').onChange((v) => { out.faceLight = v; });
  gui.add({ copy() { const s = JSON.stringify(out, null, 1); navigator.clipboard?.writeText(s).catch(() => {}); console.log('[studio]', s); } }, 'copy');
  return gui;
}
