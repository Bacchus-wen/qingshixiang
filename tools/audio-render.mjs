// Browser OfflineAudioContext: no audio hardware, server, network or sound files.
// node tools/audio-render.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: "export { runOfflineTest, runReviewTest, runDetailsTest } from './src/systems/audio/offline.js';", resolveDir: process.cwd() },
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
  const review = await page.evaluate(() => AudioTest.runReviewTest());
  for (const [name, passed] of Object.entries(review.checks)) {
    assert.equal(passed, true, `Visual-review audio regression: ${name}; ${JSON.stringify(review.results)}`);
  }
  assert.equal(review.pass, true);
  const details = await page.evaluate(() => AudioTest.runDetailsTest());
  for (const [name, passed] of Object.entries(details.checks)) {
    assert.equal(passed, true, `Street audio detail regression: ${name}; ${JSON.stringify(details.results)}`);
  }
  assert.equal(details.pass, true);
  assert.deepEqual(errors, [], 'offline audio must produce no browser errors');
  console.log('PASS offline synthesis, layers, shutter order, memory fade/cut, lamp sync, sparse drips and deep delayed thunder');
  console.log('PASS distant dogs (40–90s, 1–2 calls, level), radio (< -30 dBFS, local cone, distance/pan), present-only alley tail');
} finally {
  await browser?.close();
}
