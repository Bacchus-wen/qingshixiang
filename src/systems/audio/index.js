import { DEFAULTS, clamp } from './control.js';
import { createSoundscape } from './graph.js';

export default {
  name: 'audio',
  async init(ctx) {
    this.dispose?.();
    this.ctx = ctx;
    this.levels = { ...DEFAULTS };
    const query = ctx.params || new URLSearchParams(location.search);
    this.muted = query.has('mute');
    for (const key of Object.keys(this.levels)) {
      const name = key === 'master' ? 'volume' : `audio.${key}`;
      if (query.has(name)) this.levels[key] = clamp(Number(query.get(name)), 0, 1, DEFAULTS[key]);
    }
    this.disposed = false;
    this.unlock = () => {
      if (this.disposed) return;
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        if (!this.ac) {
          this.ac = new AudioContextClass({ latencyHint: 'interactive' });
          this.graph = createSoundscape(this.ac, { levels: this.levels, muted: this.muted });
          this.levels = this.graph.params;
          this.graph.update(this.ac.currentTime, ctx.world, ctx.memory, ctx.api.street?.lamp?.intensity);
          this.lastError = null;
        }
        // Keep the listeners: mobile interrupted contexts can resume on a later gesture.
        if (this.ac.state !== 'running') this.ac.resume().catch(() => { /* retry next gesture */ });
      } catch (error) {
        this.lastError = error.message;
        this.graph?.dispose(); this.graph = null;
        this.ac?.close().catch(() => {}); this.ac = null;
      }
    };
    globalThis.addEventListener('pointerdown', this.unlock, { capture: true, passive: true });
    globalThis.addEventListener('keydown', this.unlock, { capture: true });
    const self = this;
    this.api = {
      // Before the first gesture, discard effects instead of replaying a stale backlog.
      play: (name, opts = {}) => this.ac?.state === 'running' ? this.graph.play(name, opts) : false,
      get levels() { return self.levels; },
      get state() { return self.lastError ? 'unavailable' : self.ac?.state || 'locked'; },
      setMuted: value => { this.muted = !!value; this.graph?.setMuted(this.muted); },
    };
    ctx.api.audio = this.api;
    if (query.has('audiotest')) {
      // Awaiting here makes the existing screenshot ready flag wait for offline tests.
      const { runOfflineTest } = await import('./offline.js');
      this.api.test = await runOfflineTest({ muted: this.muted });
      if (!this.api.test.pass) throw new Error('audio offline verification failed');
    }
  },
  update(dt, t, ctx) {
    if (this.ac?.state === 'running') this.graph.update(this.ac.currentTime, ctx.world, ctx.memory, ctx.api.street?.lamp?.intensity);
  },
  dispose() {
    this.disposed = true;
    if (this.unlock) {
      globalThis.removeEventListener('pointerdown', this.unlock, true);
      globalThis.removeEventListener('keydown', this.unlock, true);
    }
    this.graph?.dispose(); this.graph = null;
    this.ac?.close().catch(() => {}); this.ac = null;
    if (this.api && this.ctx?.api.audio === this.api) delete this.ctx.api.audio;
    this.ctx = null; this.api = null; this.lastError = null;
  },
};
