// Minimal input: keys held/pressed this frame, pointer position (NDC) and primary button hold.
export class Input {
  constructor(el) {
    this.down = new Set(); this.pressed = new Set();
    this.pointer = { x: 0, y: 0, held: false };
    addEventListener('keydown', (e) => { if (!this.down.has(e.code)) this.pressed.add(e.code); this.down.add(e.code); });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    el.addEventListener('pointermove', (e) => { this.pointer.x = (e.clientX / innerWidth) * 2 - 1; this.pointer.y = -(e.clientY / innerHeight) * 2 + 1; });
    el.addEventListener('pointerdown', () => { this.pointer.held = true; });
    addEventListener('pointerup', () => { this.pointer.held = false; });
  }
  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  // "hold" = Space or primary pointer button (the eye-opening gesture)
  get hold() { return this.pointer.held || this.down.has('Space'); }
  endFrame() { this.pressed.clear(); }
}
