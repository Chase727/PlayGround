import { clamp } from './core.js';

/**
 * Fully synthesised engine / tyre / UI audio. No external assets, no autoplay:
 * the context is created on the first user gesture (Start Race).
 */
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.skidGain = null;
    this.windGain = null;
  }

  init() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = this.enabled ? 0.34 : 0;
      master.connect(ctx.destination);

      // Engine: two detuned saws through a soft low-pass.
      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 3.6;
      engineGain.connect(filter);
      filter.connect(master);

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.value = 52;
      oscA.connect(engineGain);
      const oscB = ctx.createOscillator();
      oscB.type = 'square';
      oscB.frequency.value = 26;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.4;
      oscB.connect(subGain);
      subGain.connect(engineGain);
      oscA.start();
      oscB.start();

      // Tyre screech: looped noise through a band-pass.
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const skidSource = ctx.createBufferSource();
      skidSource.buffer = noiseBuffer;
      skidSource.loop = true;
      const skidFilter = ctx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.value = 1650;
      skidFilter.Q.value = 1.4;
      const skidGain = ctx.createGain();
      skidGain.gain.value = 0.0001;
      skidSource.connect(skidFilter);
      skidFilter.connect(skidGain);
      skidGain.connect(master);
      skidSource.start();

      // Wind rush for speed.
      const windSource = ctx.createBufferSource();
      windSource.buffer = noiseBuffer;
      windSource.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'highpass';
      windFilter.frequency.value = 400;
      const windGain = ctx.createGain();
      windGain.gain.value = 0.0001;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();

      this.ctx = ctx;
      this.master = master;
      this.engineGain = engineGain;
      this.engineFilter = filter;
      this.engineOsc = oscA;
      this.engineOsc2 = oscB;
      this.skidGain = skidGain;
      this.windGain = windGain;
      this.ready = true;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch {
      this.ready = false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(enabled ? 0.34 : 0, now, 0.04);
    if (enabled && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  update(speed, slip, throttle, boosting, active = true) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    const norm = clamp(speed / 105, 0, 1);
    const gearBand = norm < 0.34 ? 0 : norm < 0.68 ? 1 : 2;
    const pitch = 46 + norm * 78 + gearBand * 9 + (boosting ? 24 : 0);
    this.engineOsc.frequency.setTargetAtTime(pitch, now, 0.07);
    this.engineOsc2.frequency.setTargetAtTime(pitch * 0.503, now, 0.07);
    this.engineFilter.frequency.setTargetAtTime(300 + norm * 920 + throttle * 190 + (boosting ? 500 : 0), now, 0.08);
    const engineTarget = active ? 0.048 + norm * 0.05 + Math.abs(throttle) * 0.018 + (boosting ? 0.03 : 0) : 0.0001;
    this.engineGain.gain.setTargetAtTime(engineTarget, now, 0.09);
    this.skidGain.gain.setTargetAtTime(active ? clamp((slip - 0.12) * 0.28, 0, 0.13) * (0.35 + norm) : 0.0001, now, 0.06);
    this.windGain.gain.setTargetAtTime(active ? clamp((norm - 0.25) * 0.05, 0, 0.035) : 0.0001, now, 0.12);
  }

  silence() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
    this.skidGain.gain.setTargetAtTime(0.0001, now, 0.05);
    this.windGain.gain.setTargetAtTime(0.0001, now, 0.1);
  }

  tone(freq, duration, type = 'square', volume = 0.08, slide = 0) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.03);
  }

  countdown(isGo = false) {
    this.tone(isGo ? 880 : 440, isGo ? 0.28 : 0.12, 'square', isGo ? 0.09 : 0.045, isGo ? 220 : 0);
  }

  gate() {
    this.tone(660, 0.08, 'triangle', 0.045);
    setTimeout(() => this.tone(990, 0.1, 'triangle', 0.04), 70);
  }

  crash() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  boost() {
    this.tone(180, 0.32, 'sawtooth', 0.05, 500);
  }
}
