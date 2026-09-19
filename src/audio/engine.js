/**
 * オーディオエンジン。
 * 音声素材は 1 バイトも使わず、すべて Web Audio で合成する。
 *
 * シグナルチェーン:
 *   voice ─┬─ dry ──────────────────────────┐
 *          ├─ hallSend → convolver(hall) ───┤→ bus.duck → bus.gain ─┐
 *          └─ roomSend → convolver(room) ───┘                        │
 *                                                       master → limiter → dest
 *
 * NOTES D1-D12 の落とし穴（ゲイン0禁止・onended で disconnect・同時発音上限など）を
 * ここで一括して面倒を見る。
 */

export const MIN_GAIN = 0.0001; // NOTES D3/D4: exponentialRamp は 0 を受け付けない

const MAX_VOICES = 64;
const DEFAULT_LOOKAHEAD = 0.02; // NOTES D2

class Bus {
  constructor(ctx, master, opts = {}) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.duck = ctx.createGain();
    this.gain = ctx.createGain();
    this.input.connect(this.duck);
    this.duck.connect(this.gain);
    this.gain.connect(master);
    this.gain.gain.value = opts.volume ?? 1;
    this.sends = {};
    this._volume = opts.volume ?? 1;
    this._muted = false;
  }
  addSend(name, convolver, level) {
    const send = this.ctx.createGain();
    send.gain.value = level;
    send.connect(convolver);
    convolver.connect(this.duck); // リバーブ成分もバスの音量/ダックに従う
    this.sends[name] = send;
    return send;
  }
  setVolume(v, ramp = 0.05) {
    this._volume = v;
    const t = this.ctx.currentTime;
    const target = this._muted ? MIN_GAIN : Math.max(MIN_GAIN, v);
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(MIN_GAIN, this.gain.gain.value), t);
    this.gain.gain.linearRampToValueAtTime(target, t + ramp);
  }
  setMuted(m) { this._muted = m; this.setVolume(this._volume, 0.03); }
  /** ダッキング。level=0.25 で -12dB 程度。 */
  duckTo(level, ramp = 0.12) {
    const t = this.ctx.currentTime;
    const g = this.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(MIN_GAIN, g.value), t);
    g.linearRampToValueAtTime(Math.max(MIN_GAIN, level), t + ramp);
  }
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.buses = {};
    this.noise = {};
    this.irs = {};
    this._voices = new Set();
    this._lastPlay = new Map();
    this._unlocking = false;
    this.volumes = { master: 0.9, bgm: 0.5, sfx: 0.85, ui: 0.7 };
    this.muted = false;
  }

  /** 最初のユーザー操作から呼ぶこと（NOTES D1）。 */
  async init() {
    if (this.ready) return this;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { console.warn('[audio] Web Audio 非対応'); return this; }
    this.ctx = new AC({ latencyHint: 'interactive' });

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;

    // マスターリミッタ。層を重ねた壮大なSFXが歪まないための保険。
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;

    // 全体のハイパス。サブ帯域の暴れを抑える（NOTES D10）。
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 26;

    this.master.connect(this.hp);
    this.hp.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this._buildNoise();
    this._buildIRs();

    this.buses.sfx = new Bus(ctx, this.master, { volume: this.volumes.sfx });
    this.buses.ui = new Bus(ctx, this.master, { volume: this.volumes.ui });
    this.buses.bgm = new Bus(ctx, this.master, { volume: this.volumes.bgm });

    this.buses.sfx.addSend('hall', this._conv(this.irs.hall), 0.9);
    this.buses.sfx.addSend('room', this._conv(this.irs.room), 0.9);
    this.buses.sfx.addSend('plate', this._conv(this.irs.plate), 0.9);
    this.buses.ui.addSend('room', this._conv(this.irs.room), 0.9);
    this.buses.bgm.addSend('hall', this._conv(this.irs.hall), 0.9);

    this.ready = true;

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });

    await this.resume();
    return this;
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch { /* noop */ }
    }
  }

  _conv(buffer) {
    const c = this.ctx.createConvolver();
    c.buffer = buffer;
    c.normalize = false;
    return c;
  }

  /** ノイズバッファは起動時に一度だけ作る（NOTES D8）。 */
  _buildNoise() {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2);

    const white = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = white.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.noise.white = white;

    // ピンクノイズ（Voss-McCartney 近似）。金属質でない「空気」の表現に。
    const pink = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = pink.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    this.noise.pink = pink;

    // ブラウンノイズ：地鳴り・サブの土台に。
    const brown = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = brown.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    this.noise.brown = brown;
  }

  /**
   * リバーブ IR をプログラム生成する。
   * 初期反射（離散タップ）＋指数減衰ノイズ の2段構成にすると、
   * 単なる減衰ノイズより「空間」に聞こえる。
   */
  _makeIR(seconds, decay, { preDelay = 0.02, damp = 0.5, early = true } = {}) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * seconds));
    const pd = Math.floor(sr * preDelay);
    const buf = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // ローパス1次でダンピング（高域が先に減衰する自然な残響）
      let lp = 0;
      const a = Math.exp(-damp * 4);
      for (let i = 0; i < len; i++) {
        if (i < pd) { d[i] = 0; continue; }
        const t = (i - pd) / (len - pd);
        const env = Math.pow(1 - t, decay);
        const w = (Math.random() * 2 - 1) * env;
        lp = lp * a + w * (1 - a);
        d[i] = lp;
      }
      if (early) {
        // 初期反射：ランダムな時刻に数発のタップを立てる
        const taps = 9;
        for (let k = 0; k < taps; k++) {
          const pos = pd + Math.floor((0.004 + Math.random() * 0.055) * sr);
          if (pos < len) d[pos] += (Math.random() * 2 - 1) * 0.55 * Math.pow(1 - k / taps, 1.6);
        }
      }
      // ステレオ感：チャンネルごとに微妙に違う位相を持たせる（上のランダムで自然に達成）
    }
    return buf;
  }

  _buildIRs() {
    this.irs.hall = this._makeIR(3.6, 2.6, { preDelay: 0.028, damp: 0.55 });
    this.irs.room = this._makeIR(0.45, 3.2, { preDelay: 0.006, damp: 0.75 });
    this.irs.plate = this._makeIR(1.5, 2.0, { preDelay: 0.012, damp: 0.3, early: false });
  }

  /* ───────────── 発音管理 ───────────── */

  now(offset = DEFAULT_LOOKAHEAD) { return this.ctx ? this.ctx.currentTime + offset : 0; }

  bus(name) { return this.buses[name] || this.buses.sfx; }

  /** 同名SFXの連打を抑制する（NOTES D7）。 */
  throttle(key, minGap = 0.025) {
    if (!this.ctx) return false;
    const t = this.ctx.currentTime;
    const last = this._lastPlay.get(key) || -1;
    if (t - last < minGap) return false;
    this._lastPlay.set(key, t);
    return true;
  }

  /** 発音を登録し、stopAt で自動的に切断する（NOTES D5/D6）。 */
  register(nodes, stopAt) {
    if (this._voices.size >= MAX_VOICES) {
      // 最古を強制終了
      const oldest = this._voices.values().next().value;
      if (oldest) this._kill(oldest);
    }
    const v = { nodes, stopAt };
    this._voices.add(v);
    const ms = Math.max(0, (stopAt - this.ctx.currentTime) * 1000) + 120;
    v.timer = setTimeout(() => this._kill(v), ms);
    return v;
  }

  _kill(v) {
    if (!this._voices.has(v)) return;
    this._voices.delete(v);
    clearTimeout(v.timer);
    for (const n of v.nodes) {
      try { n.stop && n.stop(); } catch { /* noop */ }
      try { n.disconnect(); } catch { /* noop */ }
    }
  }

  /** 全ての鳴っている音を即座に止める（画面遷移・スキップ時）。 */
  stopAll() {
    for (const v of Array.from(this._voices)) this._kill(v);
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(MIN_GAIN, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(
      this.muted ? MIN_GAIN : Math.max(MIN_GAIN, this.volumes.master), t + 0.05);
    this.buses.bgm.setVolume(this.volumes.bgm);
    this.buses.sfx.setVolume(this.volumes.sfx);
    this.buses.ui.setVolume(this.volumes.ui);
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(MIN_GAIN, this.master.gain.value), t);
    this.master.gain.linearRampToValueAtTime(
      m ? MIN_GAIN : Math.max(MIN_GAIN, this.volumes.master), t + 0.04);
  }

  /** BGM のダッキング。演出中に呼ぶ。 */
  duckBgm(level, ramp = 0.15) { this.ready && this.buses.bgm.duckTo(level, ramp); }
  duckSfx(level, ramp = 0.1) { this.ready && this.buses.sfx.duckTo(level, ramp); }
}

export const engine = new AudioEngine();
