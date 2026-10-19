// Draw the child's pencil height marks for the wall beside the back door (assets/textures/shop/marks.png):
// transparent background, graphite strokes and a child-height ladder of hand-written ages and dates, one mark a year
// from five to eleven (each on Children's Day), then nothing. Rendered in Playwright's own Chromium with an open-licence
// pen font (Long Cang), so every device shows the same handwriting (a canvas drawn at runtime would fall back to whatever font
// the visitor has).
//   node tools/marks-texture.mjs        (scale: 2048 px per metre; the image covers 0.5 m x 1.0 m of wall, bottom at 0.8 m)
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage();
// Long Cang (google/fonts, SIL OFL 1.1, tools/fonts/): a casual pen hand, used only to draw this texture
const font = readFileSync(new URL('./fonts/LongCang-Regular.ttf', import.meta.url)).toString('base64');
const data = await page.evaluate(async (font) => {
  const ff = new FontFace('LongCang', `url(data:font/ttf;base64,${font})`); await ff.load(); document.fonts.add(ff);
  const W = 1188, H = 2048, PX = 2048, Y0 = 0.8; // px per metre (0.58 m x 1.0 m); wall height of the image's bottom edge
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const yOf = (h) => H - (h - Y0) * PX; // wall height (m) -> pixel row
  // graphite: many thin, slightly wavering, semi-transparent passes (a real pencil line is never one clean stroke)
  const pencil = (x0, y0, x1, y1, w, a, passes = 3) => {
    for (let p = 0; p < passes; p++) {
      g.beginPath(); const n = 24, dx = (x1 - x0) / n, dy = (y1 - y0) / n, off = (rnd() - 0.5) * w * 0.8;
      g.moveTo(x0 + rnd() * 2, y0 + off);
      for (let i = 1; i <= n; i++) g.lineTo(x0 + dx * i + (rnd() - 0.5) * 0.8, y0 + dy * i + off + (rnd() - 0.5) * w * 0.35);
      g.strokeStyle = `rgba(48,46,44,${a * (0.55 + rnd() * 0.45)})`; g.lineWidth = w * (0.6 + rnd() * 0.5); g.lineCap = 'round'; g.stroke();
    }
  };
  const write = (txt, x, y, size, a, rot = 0) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.font = `400 ${size}px LongCang`;
    for (let p = 0; p < 2; p++) { g.fillStyle = `rgba(44,42,40,${a * (p ? 0.45 : 0.85)})`; g.fillText(txt, (rnd() - 0.5) * 2, (rnd() - 0.5) * 2); }
    g.restore();
  };
  const MARKS = [['五岁', 1.10, '81.6.1'], ['六岁', 1.165, '82.6.1'], ['七岁', 1.225, '83.6.1'], ['八岁', 1.29, '84.6.1'], ['九岁', 1.345, '85.6.1'], ['十岁', 1.405, '86.6.1'], ['十一岁', 1.47, '87.6.1']];
  // the line starts at the door frame (left edge of the image) and runs out across the plaster
  // long lines (the pencil laid flat on the child's head, drawn out to the side), the age at the end, the date under it:
  // the writing stays clear of the child's shadow, which falls beside her on the line's near half
  MARKS.forEach(([age, h, date], i) => {
    const y = yOf(h), L = 600 + ((i * 53) % 90) + (i === MARKS.length - 1 ? 50 : 0);
    const a = i === MARKS.length - 1 ? 0.95 : 0.78;
    pencil(6, y, 6 + L, y + (i % 2 ? 3 : -2), 5, Math.min(1, a * 1.15), 5);
    if (i === 2) pencil(10, y + 6, 6 + L * 0.7, y + 7, 4, 0.35, 2); // a second try that year (the child stood on tiptoe)
    write(age, 24 + L, y + 18, i === MARKS.length - 1 ? 70 : 62, Math.min(1, a * 1.15), (rnd() - 0.5) * 0.05);
    write(date, 30 + L, y + 62, 30, a * 0.7, (rnd() - 0.5) * 0.04);
  });
  // the name once, at the first mark, and a little drawn star at eleven (the child's own addition)
  write('小宁', 640, yOf(1.10) + 120, 58, 0.7, -0.03);
  { const x = 880, y = yOf(1.47) - 30; g.beginPath(); for (let i = 0; i <= 10; i++) { const r = i % 2 ? 11 : 25, an = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); }
    g.strokeStyle = 'rgba(46,44,42,0.6)'; g.lineWidth = 3; g.stroke(); }
  // smudges where a hand rested to steady the pencil, graphite dust
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(52,50,48,${0.02 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * 1000, yOf(1.05 + rnd() * 0.5), 1 + rnd() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 5; i++) { const y = yOf(1.12 + rnd() * 0.36); const gr = g.createRadialGradient(80, y, 4, 80, y, 70); gr.addColorStop(0, 'rgba(60,56,50,0.07)'); gr.addColorStop(1, 'rgba(60,56,50,0)'); g.fillStyle = gr; g.fillRect(0, y - 70, 160, 140); }
  return c.toDataURL('image/png');
}, font);
writeFileSync(new URL('../assets/textures/shop/marks.png', import.meta.url), Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
console.log('wrote assets/textures/shop/marks.png');
