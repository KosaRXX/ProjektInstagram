import * as THREE from 'three';

/**
 * Dźwięk w całości proceduralny (Web Audio API). Brak plików audio: nic nie udajemy.
 * Źródła przestrzenne używają PannerNode – głośność maleje z odległością od obiektu.
 */

type Vec3 = { x: number; y: number; z: number };

export type SurfaceKind = 'wood' | 'rug';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private staticGain: GainNode | null = null;
  private musicLayers: GainNode[] = [];
  private noise: AudioBuffer | null = null;
  private muted = false;
  private thunderTimer = 8;
  private tickTimer = 0;
  private knockTimer = 40;
  private ringTimer = 0;
  private stepTimer = 0;
  private cache = new Map<string, AudioBuffer>();

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Wywoływane po pierwszym geście użytkownika (wymóg przeglądarek). */
  init(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    try {
      const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
      if (!AC) return false;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(ctx.destination);
      this.noise = this.makeNoise(4);
      this.startRain();
      this.startStatic();
      this.startMusic();
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /** Położenie słuchacza = kamera; dźwięki przestrzenne liczą się względem niego. */
  setListener(p: THREE.Vector3, yaw: number): void {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = -Math.sin(yaw);
      l.forwardY.value = 0;
      l.forwardZ.value = -Math.cos(yaw);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  /** Dźwięki ciągłe i cykliczne: grzmoty, tykanie zegara, pukanie, dzwonek telefonu. */
  update(dt: number, opts: { clockPos?: Vec3; clockRunning: boolean; knockPos?: Vec3; ringing: boolean; musicLevel: number; staticLevel: number; moving: boolean; surface: SurfaceKind; stepPos: Vec3 }): void {
    if (!this.ctx || !this.master) return;
    this.thunderTimer -= dt;
    if (this.thunderTimer <= 0) {
      this.thunderTimer = 14 + Math.random() * 22;
      this.playBuffer(this.thunderBuffer(), { gain: 0.5 + Math.random() * 0.3, pos: { x: 0, y: 3, z: -12 }, rate: 0.85 + Math.random() * 0.2 });
    }
    if (opts.clockRunning && opts.clockPos) {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        this.tickTimer = 1;
        this.playBuffer(this.tickBuffer(), { gain: 0.16, pos: opts.clockPos });
      }
    }
    if (opts.knockPos) {
      this.knockTimer -= dt;
      if (this.knockTimer <= 0) {
        this.knockTimer = 45 + Math.random() * 50;
        this.playBuffer(this.knockBuffer(), { gain: 0.35, pos: opts.knockPos, delay: 0.05 });
        this.playBuffer(this.knockBuffer(), { gain: 0.3, pos: opts.knockPos, delay: 0.45 });
      }
    }
    if (opts.ringing) {
      this.ringTimer -= dt;
      if (this.ringTimer <= 0) {
        this.ringTimer = 2.4;
        this.playBuffer(this.ringBuffer(), { gain: 0.35, pos: opts.stepPos });
      }
    } else {
      this.ringTimer = 0;
    }
    if (opts.moving) {
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.48;
        this.playBuffer(this.stepBuffer(opts.surface), { gain: 0.22, rate: 0.95 + Math.random() * 0.1 });
      }
    } else {
      this.stepTimer = 0;
    }
    if (this.staticGain) this.staticGain.gain.setTargetAtTime(opts.staticLevel * 0.35, this.ctx.currentTime, 0.08);
    this.musicLayers.forEach((g, i) => {
      const target = opts.musicLevel > i ? 0.05 - i * 0.01 : 0;
      g.gain.setTargetAtTime(Math.max(0, target), this.ctx!.currentTime, 0.8);
    });
  }

  /** Jednorazowe dźwięki zdarzeń. */
  oneShot(kind: 'creak' | 'click' | 'chime' | 'drone' | 'lever' | 'door', pos?: Vec3): void {
    if (!this.ctx) return;
    const buf = kind === 'creak' ? this.creakBuffer() : kind === 'chime' ? this.chimeBuffer() : kind === 'drone' ? this.droneBuffer() : kind === 'door' ? this.creakBuffer() : this.clickBuffer();
    this.playBuffer(buf, { gain: kind === 'drone' ? 0.5 : 0.4, pos });
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* ignorujemy */
    }
    this.ctx = null;
    this.master = null;
    this.musicLayers = [];
    this.cache.clear();
  }

  // ---------- Wewnętrzne ----------

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brązowy szum: deszcz i grzmot
      d[i] = (w * 0.6 + last * 3.5) * 0.5;
    }
    return buf;
  }

  private loopSource(buffer: AudioBuffer, filterType: BiquadFilterType, freq: number, q: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master!);
    src.start();
    return g;
  }

  private startRain(): void {
    this.loopSource(this.noise!, 'bandpass', 2600, 0.4, 0.09);
    this.loopSource(this.noise!, 'lowpass', 700, 0.5, 0.05);
  }

  private startStatic(): void {
    this.staticGain = this.loopSource(this.noise!, 'bandpass', 1500, 2.5, 0);
  }

  private startMusic(): void {
    const ctx = this.ctx!;
    // D-moll: D2, A2, D3, F3 – cztery warstwy dodawane wraz z odkryciami
    const chords = [
      [73.42, 110.0],
      [146.83, 174.61],
      [220.0, 261.63],
      [349.23, 440.0],
    ];
    chords.forEach((pair, layer) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(g).connect(this.master!);
      pair.forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 8;
        const og = ctx.createGain();
        og.gain.value = 0.5;
        o.connect(og).connect(lp);
        o.start();
        // powolny LFO na głośności – oddech pokoju
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + layer * 0.02;
        const lg = ctx.createGain();
        lg.gain.value = 0.15;
        lfo.connect(lg).connect(og.gain);
        lfo.start();
      });
      this.musicLayers.push(g);
    });
  }

  private playBuffer(buffer: AudioBuffer, opts: { gain?: number; pos?: Vec3; rate?: number; delay?: number }): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    g.gain.value = opts.gain ?? 0.3;
    if (opts.pos) {
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.rolloffFactor = 1.4;
      panner.positionX.value = opts.pos.x;
      panner.positionY.value = opts.pos.y;
      panner.positionZ.value = opts.pos.z;
      src.connect(g).connect(panner).connect(this.master);
    } else {
      src.connect(g).connect(this.master);
    }
    src.start(ctx.currentTime + (opts.delay ?? 0));
  }

  private cached(key: string, make: () => AudioBuffer): AudioBuffer {
    let b = this.cache.get(key);
    if (!b) {
      b = make();
      this.cache.set(key, b);
    }
    return b;
  }

  private envelopeBuffer(seconds: number, fn: (t: number) => number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fn(i / ctx.sampleRate);
    return buf;
  }

  private thunderBuffer(): AudioBuffer {
    return this.envelopeBuffer(3.5, (t) => {
      const env = Math.exp(-t * 1.1) * (t < 0.05 ? t / 0.05 : 1);
      return (Math.random() * 2 - 1) * env * 0.9 * Math.sin(t * 6);
    });
  }

  private tickBuffer(): AudioBuffer {
    return this.cached('tick', () => this.envelopeBuffer(0.05, (t) => Math.sin(t * 2 * Math.PI * 2800) * Math.exp(-t * 180)));
  }

  private knockBuffer(): AudioBuffer {
    return this.cached('knock', () => this.envelopeBuffer(0.3, (t) => (Math.sin(t * 2 * Math.PI * 90) * Math.exp(-t * 22) + (Math.random() - 0.5) * Math.exp(-t * 90) * 0.5)));
  }

  private ringBuffer(): AudioBuffer {
    return this.cached('ring', () => this.envelopeBuffer(1.6, (t) => {
      const on = t < 1.2 ? 1 : 0;
      const env = on * Math.min(1, t * 40) * Math.exp(-(t % 0.6) * 2);
      return (Math.sin(t * 2 * Math.PI * 440) + Math.sin(t * 2 * Math.PI * 480)) * 0.25 * env;
    }));
  }

  private stepBuffer(surface: SurfaceKind): AudioBuffer {
    return this.cached(`step-${surface}`, () => {
      const ctx = this.ctx!;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
      const d = buf.getChannelData(0);
      let lp = 0;
      const a = surface === 'wood' ? 0.45 : 0.08;
      for (let i = 0; i < d.length; i++) {
        const t = i / ctx.sampleRate;
        lp += a * ((Math.random() * 2 - 1) * Math.exp(-t * 60) - lp);
        d[i] = lp * 1.2;
      }
      return buf;
    });
  }

  private creakBuffer(): AudioBuffer {
    return this.cached('creak', () => this.envelopeBuffer(1.2, (t) => {
      const f = 180 - t * 60;
      return (Math.sin(t * 2 * Math.PI * f) * 0.35 + (Math.random() - 0.5) * 0.1) * Math.exp(-t * 2.2) * Math.min(1, t * 8);
    }));
  }

  private chimeBuffer(): AudioBuffer {
    return this.cached('chime', () => this.envelopeBuffer(2.2, (t) => (Math.sin(t * 2 * Math.PI * 880) * 0.4 + Math.sin(t * 2 * Math.PI * 1320) * 0.2) * Math.exp(-t * 2.2)));
  }

  private droneBuffer(): AudioBuffer {
    return this.cached('drone', () => this.envelopeBuffer(4, (t) => Math.sin(t * 2 * Math.PI * 55) * 0.4 * Math.min(1, t) * Math.exp(-t * 0.6)));
  }

  private clickBuffer(): AudioBuffer {
    return this.cached('click', () => this.envelopeBuffer(0.12, (t) => (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.7));
  }
}
