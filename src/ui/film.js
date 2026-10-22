// Film-edge UI: the only interface. Frame counter on the edge, a hairline for the eye's remaining power,
// one faint hint word, a fade to black and an end card. Nothing else (on the title, a small link to the other language).
import { tr, otherLangHref } from './i18n.js';
export class Film {
  // text: optional { title, sub, start, credit, card: [lines], replay } (v4 shop); defaults are the v3 street's
  constructor(root, text = {}) {
    const T = { title: tr('青 石 巷', 'Bluestone Lane'), sub: tr('请戴上耳机', 'Best with headphones'), start: tr('点击画面开始', 'Click to begin'),
      credit: tr('现场录音来自 Freesound 与 Wikimedia Commons(CC0);远处的狗叫:YleArkisto,CC BY 4.0。出处见 CREDITS.md', 'Field recordings from Freesound and Wikimedia Commons (CC0); the distant dog: YleArkisto, CC BY 4.0. Sources in CREDITS.md'),
      card: [tr('刻度停在十一岁。', 'The marks stop at eleven.'), tr('灯灭了，门还是那么高。', 'The light is out; the door is as tall as ever.')], replay: tr('点击画面重看', 'Click to watch again'), ...text };
    root.innerHTML = `
      <div class="film-edge top"><span class="fe-l"></span><span class="fe-r">ISO 400 · <b class="fe-frame">0000</b></span></div>
      <div class="film-edge bottom"><span class="fe-l fe-phase">—</span><span class="fe-power"><i></i></span></div>
      <div class="film-hint"></div>
      <div class="film-black"></div>
      <div class="film-title"><h1>${T.title}</h1><p>${T.sub}</p><small>${T.start}</small><small class="film-credit">${T.credit}</small><a class="film-lang" href="${otherLangHref()}">${tr('English', '中文')}</a></div>
      <div class="film-card">${T.card.map((l) => `<p>${l}</p>`).join('')}<small class="film-replay">${T.replay}</small></div>`;
    this.el = root;
    this.frameEl = root.querySelector('.fe-frame');
    this.hintEl = root.querySelector('.film-hint');
    this.powerEl = root.querySelector('.fe-power');
    this.powerBar = root.querySelector('.fe-power i');
    this.black = root.querySelector('.film-black');
    this.card = root.querySelector('.film-card');
    this.phaseEl = root.querySelector('.fe-phase');
    this.titleEl = root.querySelector('.film-title');
    this.n = 0;
    setInterval(() => { this.n = (this.n + 1) % 10000; this.frameEl.textContent = String(this.n).padStart(4, '0'); }, 1000 / 24);
  }
  hint(text) { this.hintEl.textContent = text; this.hintEl.classList.toggle('on', !!text); }
  power(v, visible) { this.powerBar.style.width = `${(v * 100).toFixed(1)}%`; this.powerEl.classList.toggle('on', visible); }
  phase(name) {
    const label = { arrive: '01', wait: '02', waking: '03', look: '04', fade: '05', end: '06' }[name] || '—';
    this.phaseEl.textContent = ''; // (the phase label read as a UI; the film edge keeps only the counter)
    void label;
  }
  fade(v) { this.black.style.opacity = v; }
  endCard() { this.card.classList.add('on'); }
  replayHint() { this.card.classList.add('replay'); document.body.classList.remove('playing'); }
  // the cursor is hidden while the piece plays (the gaze is the cursor); it comes back for the title and replay
  title(on) { this.titleEl.classList.toggle('on', on); document.body.classList.toggle('playing', !on); }
}
