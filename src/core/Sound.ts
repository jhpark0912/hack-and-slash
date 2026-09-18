/**
 * Tiny procedural sound engine (WebAudio). No audio assets required —
 * every sound is synthesized: sword whooshes, hits, level-up chimes, etc.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  volume = 0.5;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  swing() { this.noise(0.18, 900, 1.2, 0.35, 'bandpass', 300); }
  heavySwing() { this.noise(0.35, 500, 1.0, 0.5, 'bandpass', 150); }
  hit() { this.noise(0.12, 2200, 0.8, 0.5, 'highpass'); this.tone(180, 0.1, 0.3, 'square', 60); }
  crit() { this.noise(0.18, 3000, 0.8, 0.6, 'highpass'); this.tone(320, 0.18, 0.4, 'sawtooth', 80); }
  hurt() { this.tone(220, 0.22, 0.4, 'sawtooth', 90); this.noise(0.15, 600, 1, 0.3); }
  dodge() { this.noise(0.22, 400, 0.7, 0.3, 'lowpass', 1600); }
  shoot() { this.noise(0.15, 1800, 2, 0.35, 'bandpass', 4000); this.tone(900, 0.08, 0.15, 'triangle', 300); }
  enemyDie() { this.tone(160, 0.35, 0.35, 'sawtooth', 40); this.noise(0.25, 300, 1, 0.3, 'lowpass'); }
  bigDie() { this.tone(90, 0.8, 0.6, 'sawtooth', 25); this.noise(0.6, 200, 0.7, 0.5, 'lowpass'); }
  pickup() { this.tone(880, 0.08, 0.2, 'sine'); this.tone(1320, 0.12, 0.2, 'sine', undefined, 0.06); }
  potion() { this.tone(500, 0.2, 0.25, 'sine', 900); this.tone(700, 0.25, 0.2, 'sine', 1200, 0.1); }
  heal() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 0.2, 'sine', undefined, i * 0.08)); }
  levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 0.28, 'triangle', undefined, i * 0.1)); this.noise(1.0, 3000, 0.5, 0.15, 'highpass'); }
  shock() { this.noise(0.7, 120, 0.6, 0.7, 'lowpass', 40); this.tone(60, 0.6, 0.6, 'sine', 30); }
  shriek() { this.tone(1400, 0.9, 0.35, 'sawtooth', 500); this.noise(0.8, 2500, 0.4, 0.35, 'bandpass', 800); }
  waveStart() { this.tone(196, 0.5, 0.35, 'triangle'); this.tone(261, 0.5, 0.35, 'triangle', undefined, 0.25); this.tone(392, 0.9, 0.4, 'triangle', undefined, 0.5); }
  slam() { this.noise(0.5, 150, 0.8, 0.8, 'lowpass', 50); this.tone(50, 0.5, 0.7, 'sine', 25); }
  ui() { this.tone(660, 0.06, 0.12, 'square'); }
  error() { this.tone(200, 0.12, 0.2, 'square', 150); }
}
