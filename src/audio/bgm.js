/**
 * アダプティブ・プロシージャルBGM。
 *
 * 音源ファイルは持たず、D エオリアン / BPM 72 の進行を毎回その場で組み立てる。
 * 画面・状況で「レイヤー」を出し入れすることで、切れ目なく雰囲気が変わる。
 *
 *   home    : drone + pad + bell        （静かな夜）
 *   banner  : drone + pad + bell + arp + pulse
 *   charge  : + tension（不協和クラスタ）、テンポ感が増す
 *   result  : 解決感のある進行
 *   silence : 完全停止（虹演出の直前。無音は最強の効果音）
 *
 * Web Audio の定石どおり、25ms 間隔のスケジューラで 0.35秒先まで予約する
 * （setTimeout で直接鳴らすとズレるため）。
 */
import { engine, MIN_GAIN } from './engine.js';
import { tone, stack, fm, noise, pluck, mtof } from './synth.js';

const BPM = 72;
const BEAT = 60 / BPM;          // 0.833s
const BAR = BEAT * 4;           // 3.333s
const LOOKAHEAD = 0.35;
const TICK_MS = 25;

/** i - VI - III - VII （Dエオリアンのエピック進行） */
const PROG = [
  { root: 50, chord: [50, 53, 57, 62], name: 'Dm' },   // D F A D
  { root: 46, chord: [46, 50, 53, 58], name: 'Bb' },   // Bb D F Bb
  { root: 53, chord: [53, 57, 60, 65], name: 'F' },    // F A C F
  { root: 48, chord: [48, 52, 55, 60], name: 'C' },    // C E G C
];

/** 結果画面用：IV - V - i の解決 */
const PROG_RESOLVE = [
  { root: 55, chord: [55, 58, 62, 67], name: 'Gm' },
  { root: 57, chord: [57, 61, 64, 69], name: 'A' },
  { root: 50, chord: [50, 53, 57, 62], name: 'Dm' },
  { root: 50, chord: [50, 57, 62, 65], name: 'Dm' },
];

const MOODS = {
  off:     { drone: 0,    pad: 0,    bell: 0,   arp: 0,   pulse: 0,   tension: 0,   prog: PROG },
  home:    { drone: 0.85, pad: 0.7,  bell: 0.5, arp: 0,   pulse: 0,   tension: 0,   prog: PROG },
  banner:  { drone: 0.9,  pad: 0.85, bell: 0.4, arp: 0.6, pulse: 0.5, tension: 0,   prog: PROG },
  charge:  { drone: 1.0,  pad: 0.7,  bell: 0,   arp: 0.3, pulse: 0.9, tension: 0.8, prog: PROG },
  result:  { drone: 0.7,  pad: 0.95, bell: 0.7, arp: 0.5, pulse: 0.3, tension: 0,   prog: PROG_RESOLVE },
  silence: { drone: 0,    pad: 0,    bell: 0,   arp: 0,   pulse: 0,   tension: 0,   prog: PROG },
};

class Bgm {
  constructor() {
    this.running = false;
    this.mood = 'off';
    this.target = MOODS.off;
    this.cur = { ...MOODS.off };
    this._timer = 0;
    this._nextNoteTime = 0;
    this._step = 0;       // 8分音符単位
    this._bar = 0;
    this._fadeStart = 0;
    this._fadeFrom = null;
    this._fadeDur = 2.4;
  }

  start() {
    if (this.running || !engine.ready) return;
    this.running = true;
    this._nextNoteTime = engine.ctx.currentTime + 0.1;
    this._step = 0;
    this._bar = 0;
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    this.running = false;
    clearInterval(this._timer);
    this._timer = 0;
  }

  /** レイヤーを滑らかに切り替える。 */
  setMood(name, fadeDur = 2.0) {
    if (!MOODS[name]) return;
    if (this.mood === name) return;
    this.mood = name;
    this._fadeFrom = { ...this.cur };
    this.target = MOODS[name];
    this._fadeDur = Math.max(0.01, fadeDur);
    this._fadeStart = engine.ready ? engine.ctx.currentTime : 0;
    // 進行が変わるときは小節頭で切り替わるので、進行自体は _tick で参照する
  }

  _updateLevels(now) {
    if (!this._fadeFrom) { this.cur = { ...this.target }; return; }
    const t = Math.min(1, (now - this._fadeStart) / this._fadeDur);
    const e = t * t * (3 - 2 * t); // smoothstep
    for (const k of ['drone', 'pad', 'bell', 'arp', 'pulse', 'tension']) {
      this.cur[k] = this._fadeFrom[k] + (this.target[k] - this._fadeFrom[k]) * e;
    }
    if (t >= 1) this._fadeFrom = null;
  }

  _tick() {
    if (!this.running || !engine.ready) return;
    const ctx = engine.ctx;
    if (ctx.state !== 'running') return;

    while (this._nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      this._updateLevels(this._nextNoteTime);
      this._schedule(this._step, this._nextNoteTime);
      this._step++;
      if (this._step % 8 === 0) this._bar++;
      this._nextNoteTime += BEAT / 2; // 8分音符
    }
  }

  _schedule(step, t) {
    const L = this.cur;
    const prog = this.target.prog || PROG;
    const bar = Math.floor(step / 8) % prog.length;
    const ch = prog[bar];
    const inBar = step % 8;

    // ── ドローン（小節頭で更新） ──
    if (L.drone > 0.02 && inBar === 0) {
      tone(t, {
        freq: mtof(ch.root - 12), type: 'sine',
        a: 0.6, d: BAR, peak: 0.16 * L.drone, curve: 'lin', bus: 'bgm', hall: 0.5,
      });
      stack(t, {
        freq: mtof(ch.root), type: 'sawtooth', voices: 3, spread: 10,
        a: 0.8, d: BAR * 0.9, peak: 0.055 * L.drone, curve: 'lin',
        filter: { type: 'lowpass', freq: 400, to: 260, dur: BAR }, bus: 'bgm', hall: 0.6,
      });
    }

    // ── パッド（和音、小節頭） ──
    if (L.pad > 0.02 && inBar === 0) {
      ch.chord.forEach((m, i) => {
        stack(t + i * 0.03, {
          freq: mtof(m), type: 'sawtooth', voices: 3, spread: 12,
          a: 1.0, d: BAR * 0.95, peak: 0.032 * L.pad, curve: 'lin',
          filter: { type: 'lowpass', freq: 700, to: 1500, dur: BAR * 0.5 },
          bus: 'bgm', hall: 0.75, pan: (i - 1.5) * 0.35,
        });
      });
    }

    // ── 低音の鼓動（2拍ごと） ──
    if (L.pulse > 0.02 && inBar % 4 === 0) {
      tone(t, {
        freq: mtof(ch.root - 24), pitchTo: mtof(ch.root - 24) * 0.7, pitchDur: 0.12,
        type: 'sine', a: 0.01, d: 0.7, peak: 0.16 * L.pulse, bus: 'bgm',
      });
      noise(t, {
        color: 'brown', a: 0.005, d: 0.25, peak: 0.05 * L.pulse,
        filter: { type: 'lowpass', from: 300, to: 120, Q: 0.7 }, bus: 'bgm',
      });
    }

    // ── アルペジオ（8分） ──
    if (L.arp > 0.02) {
      const pattern = [0, 2, 3, 2, 1, 2, 3, 1];
      const m = ch.chord[pattern[inBar] % ch.chord.length] + 12;
      pluck(t, {
        freq: mtof(m), d: 0.9, peak: 0.055 * L.arp, damp: 3800,
        bus: 'bgm', hall: 0.6, pan: ((inBar % 4) - 1.5) * 0.4,
      });
    }

    // ── 遠い鐘（ランダム、小節頭付近） ──
    if (L.bell > 0.02 && inBar === 0 && Math.random() < 0.35) {
      const m = ch.chord[Math.floor(Math.random() * ch.chord.length)] + 24;
      fm(t + Math.random() * BEAT, {
        freq: mtof(m), ratio: 2.01, index: 300, indexDecay: 0.2,
        a: 0.004, d: 2.8, peak: 0.05 * L.bell, bus: 'bgm', hall: 0.9,
        pan: (Math.random() * 2 - 1) * 0.6,
      });
    }

    // ── 緊張レイヤー（短2度のクラスタ） ──
    if (L.tension > 0.02 && inBar === 0) {
      stack(t, {
        freq: mtof(ch.root + 13), type: 'sawtooth', voices: 4, spread: 18,
        a: 0.5, d: BAR * 0.8, peak: 0.03 * L.tension, curve: 'lin',
        filter: { type: 'bandpass', freq: 900, to: 2200, dur: BAR * 0.6, Q: 2 },
        bus: 'bgm', hall: 0.7,
      });
      noise(t, {
        color: 'white', a: BAR * 0.4, d: BAR * 0.5, peak: 0.022 * L.tension, curve: 'lin',
        filter: { type: 'bandpass', from: 2000, to: 6000, Q: 1.4, dur: BAR * 0.5 },
        bus: 'bgm', hall: 0.8,
      });
    }
  }
}

export const bgm = new Bgm();
