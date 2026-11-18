// Neon Bay — all sound is synthesized with the Web Audio API. No audio files.
// Engine hum, sirens, gunshots, UI and a simple bassline loop.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = 0;
    this.musicStep = 0;
    this.musicOn = true;
    // A minor-key bassline: A1 F1 C2 G1, eighth notes at ~104 BPM.
    this.bassline = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49];
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startSiren();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(m ? 0 : 0.5, this.ctx.currentTime);
    }
  }

  tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, filterFreq, vol, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  startEngine() {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 50;
    g.gain.value = 0;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    o.connect(f).connect(g).connect(this.master);
    o.start();
    this.engineOsc = o;
    this.engineGain = g;
  }

  setEngine(running, speedRatio) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(45 + speedRatio * 130, t, 0.1);
    this.engineGain.gain.setTargetAtTime(running ? 0.05 + speedRatio * 0.05 : 0, t, 0.1);
  }

  startSiren() {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 720;
    g.gain.value = 0;
    o.connect(g).connect(this.master);
    o.start();
    this.sirenOsc = o;
    this.sirenGain = g;
  }

  updateSiren(dt, active, near) {
    if (!this.sirenOsc) return;
    this.sirenTimer -= dt;
    if (this.sirenTimer <= 0) {
      this.sirenTimer = 0.45;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setValueAtTime(this.sirenHigh ? 950 : 700, this.ctx.currentTime);
    }
    const target = active ? (near ? 0.055 : 0.025) : 0;
    this.sirenGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  updateMusic(dt) {
    if (!this.ctx || !this.musicOn || this.muted) return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 0.29; // eighth note at ~104 BPM
      const freq = this.bassline[this.musicStep % this.bassline.length];
      this.musicStep++;
      this.tone(freq, 0.26, 'sine', 0.16);
      if (this.musicStep % 8 === 4) this.tone(freq * 2, 0.12, 'triangle', 0.05);
    }
  }

  gunshot() {
    this.noise(0.14, 3000, 0.5, 'highpass');
    this.tone(160, 0.08, 'square', 0.2, 0, 60);
  }

  punch() {
    this.noise(0.09, 500, 0.4);
    this.tone(90, 0.09, 'sine', 0.35, 0, 50);
  }

  crash(strength) {
    this.noise(0.2, 800, Math.min(0.5, 0.15 + strength * 0.3));
  }

  explosion() {
    this.noise(0.7, 300, 0.7);
    this.tone(60, 0.6, 'sine', 0.5, 0, 30);
  }

  horn() {
    this.tone(370, 0.25, 'square', 0.12);
    this.tone(466, 0.25, 'square', 0.1);
  }

  pickup() {
    this.tone(660, 0.09, 'sine', 0.25);
    this.tone(880, 0.12, 'sine', 0.25, 0.09);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.25, i * 0.11));
  }

  missionFailed() {
    this.tone(392, 0.2, 'triangle', 0.22);
    this.tone(311, 0.3, 'triangle', 0.22, 0.2);
  }

  click() {
    this.tone(700, 0.05, 'sine', 0.15);
  }

  wantedUp() {
    this.tone(520, 0.1, 'square', 0.15);
    this.tone(520, 0.1, 'square', 0.15, 0.14);
  }

  busted() {
    this.tone(440, 0.3, 'sawtooth', 0.15, 0, 220);
  }
}
