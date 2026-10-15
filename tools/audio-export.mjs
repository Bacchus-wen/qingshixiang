// Export a 40 s listening preview of the soundscape to docs/audio-preview.wav (offline render in Chromium).
//   0-12 s: the present (rain, lamp, drips, alley tail) | 12 s: the eye opens (shutter, servo, whine),
//   memory layer fades in | 24 s: the cone leaves (memory cut) | 28 s: lightning, delayed thunder
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const SECONDS = 40, RATE = 44100;
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `
    import { createSoundscape } from './src/systems/audio/graph.js';
    export async function run(seconds, rate) {
      const ac = new OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
      const g = createSoundscape(ac, { seed: 0x5eed });
      for (let i = 0; i < seconds * 60; i++) {
        const t = i / 60;
        const strength = t < 12.4 ? 0 : t < 24 ? Math.min(1, (t - 12.4) / 2.5) : 0;
        const lamp = (t > 6 && t < 6.6) || (t > 19 && t < 19.4) ? 80 : 650;
        g.update(t, { rain: 1, lightning: t > 28 && t < 28.4 ? 1 : 0 }, { strength }, lamp, undefined);
      }
      for (const [name, at] of [['shutter', 12.0], ['servo', 12.1], ['whine', 12.15], ['click', 24.2]]) g.schedule(name, at, {});
      const buf = await ac.startRendering();
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const pcm = new Int16Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; pcm[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
      let s = ''; const u8 = new Uint8Array(pcm.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(s);
    }` },
  bundle: true, write: false, format: 'iife', globalName: 'AudioExport', platform: 'browser',
});
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const b64 = await page.evaluate(([s, r]) => AudioExport.run(s, r), [SECONDS, RATE]);
  const data = Buffer.from(b64, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  writeFileSync('docs/audio-preview.wav', Buffer.concat([header, data]));
  console.log('wrote docs/audio-preview.wav', (data.length / 1024 / 1024).toFixed(1), 'MB');
} finally { await browser.close(); }
