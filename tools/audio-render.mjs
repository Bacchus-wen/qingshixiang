// Browser OfflineAudioContext: no audio hardware, server, network or sound files.
// node tools/audio-render.mjs
import { chromium } from 'playwright';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: "export { runOfflineTest } from './src/systems/audio/offline.js';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'AudioTest', platform: 'browser',
});
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { console.log(m.text()); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => AudioTest.runOfflineTest());
  if (!result.pass || errors.length) throw new Error(`Audio verification failed: ${JSON.stringify({ result, errors })}`);
  console.log('PASS browser offline synthesis, silence, memory ducking and isolated layers');
} finally {
  await browser?.close();
}
