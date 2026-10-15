// Film-edge UI: the only interface. Frame counter on the edge, a hairline for the eye's remaining power,
// one faint hint word, a fade to black and an end card. Nothing else.
export class Film {
  constructor(root) {
    root.innerHTML = `
      <div class="film-edge top"><span class="fe-l">LARKHAVEN</span><span class="fe-r">ISO 400 · <b class="fe-frame">0000</b></span></div>
      <div class="film-edge bottom"><span class="fe-l fe-phase">—</span><span class="fe-power"><i></i></span></div>
      <div class="film-hint"></div>
      <div class="film-black"></div>
      <div class="film-title"><p>请戴上耳机</p><small>点击画面开始</small></div>
      <div class="film-card"><p>这条街的人都搬走了。</p><p>它记得每一扇门的高度。</p><small>新游戏 · 2026</small></div>`;
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
    this.phaseEl.textContent = `FRAME ${label}`;
  }
  fade(v) { this.black.style.opacity = v; }
  endCard() { this.card.classList.add('on'); }
  title(on) { this.titleEl.classList.toggle('on', on); }
}
