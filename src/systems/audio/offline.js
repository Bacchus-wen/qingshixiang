import { DEFAULTS, measure } from './control.js';
import { createSoundscape } from './graph.js';

export async function renderOffline({ seconds = 10, muted = false, levels = {}, memory = 'ramp', effects = true, storm = true } = {}) {
  const ac = new OfflineAudioContext(2, Math.ceil(24000 * seconds), 24000);
  const graph = createSoundscape(ac, { muted, levels });
  try {
    for (let i = 0; i < seconds * 60; i++) {
      const t = i / 60;
      graph.update(t, { rain: 1, lightning: storm && i === 60 ? 1 : 0 }, {
        strength: memory === 'ramp' ? Math.max(0, Math.min(1, (t - 4) / 3)) : memory,
      });
    }
    if (effects) {
      graph.schedule('servo', 0.6);
      graph.schedule('click', 2.1);
      graph.schedule('whine', 3);
    }
    const buffer = await ac.startRendering();
    const stats = measure(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
    return { ...stats, seconds };
  } finally { graph.dispose(); }
}

export async function runOfflineTest({ muted = false } = {}) {
  const main = await renderOffline({ muted });
  console.log(`[audio-test] 10s RMS=${main.rms.toFixed(6)} peak=${main.peak.toFixed(6)} finite=${main.finite} mute=${muted}`);
  const silence = await renderOffline({ muted: true });
  const onlyRain = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, ['master', 'nearRain', 'farRain', 'drips'].includes(k) ? DEFAULTS[k] : 0]));
  const rain = await renderOffline({ seconds: 3, memory: 0, effects: false, storm: false, levels: onlyRain });
  const rememberedRain = await renderOffline({ seconds: 3, memory: 1, effects: false, storm: false, levels: onlyRain });
  const layers = {};
  for (const name of Object.keys(DEFAULTS).filter(k => k !== 'master' && k !== 'reverb')) {
    const levels = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, k === 'master' || k === name ? DEFAULTS[k] : 0]));
    layers[name] = await renderOffline({ seconds: 10, memory: name === 'memory' ? 1 : 0, levels });
  }
  const audible = s => s.finite && s.rms > 0.000001 && s.peak < 0.98;
  const pass = (muted ? main.peak === 0 : audible(main)) && silence.peak === 0 &&
    rememberedRain.rms < rain.rms * 0.3 && Object.values(layers).every(audible);
  console.log(`[audio-test] mutePeak=${silence.peak} memoryRainRatio=${(rememberedRain.rms / rain.rms).toFixed(4)} layers=${Object.keys(layers).length} pass=${pass}`);
  if (!pass) console.error('[audio-test] FAILED', JSON.stringify({ main, silence, rain, rememberedRain, layers }));
  return { pass, main, silence, rain, rememberedRain, layers };
}
