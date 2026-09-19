/**
 * 効果音ライブラリ。全てその場で合成する（音声ファイル 0 バイト）。
 *
 * 設計方針（RESEARCH §5.1）:
 *   インパクト系は必ず **3層** で作る。
 *     ① トランジェント（0-30ms のノイズ）… 「当たった」という情報
 *     ② ボディ（サブのピッチドロップ・膜鳴）… 「重さ」
 *     ③ テイル（リバーブ・金属クラスタ）  … 「空間の広さ＝壮大さ」
 *   1層だけだと必ず安っぽくなる。
 */
import { engine } from './engine.js';
import {
  tone, stack, fm, noise, subDrop, membrane, pluck, voxPad, chord, grains,
  riser, reverseSwell, mtof, cents,
} from './synth.js';

const R = () => Math.random();
/** ピッチ揺らぎ（NOTES: 同じ音の連打を避ける） */
const vary = (f, semis = 2) => f * Math.pow(2, ((R() * 2 - 1) * semis) / 12);

/* 音楽的な素材：Dエオリアン */
const D3 = mtof(50), A3 = mtof(57), D4 = mtof(62), F4 = mtof(65), A4 = mtof(69);
const D5 = mtof(74), F5 = mtof(77), A5 = mtof(81), C5 = mtof(72), E5 = mtof(76);
const Bb4 = mtof(70), G4 = mtof(67), C4 = mtof(60);

const DEFS = {
  /* ═════════════ UI ═════════════ */
  tap(t) {
    fm(t, { freq: vary(1180, 1), ratio: 1.41, index: 260, indexDecay: 0.03, a: 0.001, d: 0.075, peak: 0.16, bus: 'ui', room: 0.2 });
    return t + 0.09;
  },
  hover(t) {
    tone(t, { freq: vary(2100, 1), type: 'sine', a: 0.002, d: 0.045, peak: 0.045, bus: 'ui', room: 0.15 });
    return t + 0.05;
  },
  back(t) {
    fm(t, { freq: 720, ratio: 1.5, index: 180, indexDecay: 0.04, a: 0.001, d: 0.1, peak: 0.14, bus: 'ui', room: 0.25 });
    tone(t + 0.045, { freq: 480, type: 'triangle', a: 0.002, d: 0.12, peak: 0.1, bus: 'ui', room: 0.25 });
    return t + 0.2;
  },
  confirm(t) {
    tone(t, { freq: D5, type: 'triangle', a: 0.003, d: 0.16, peak: 0.16, bus: 'ui', room: 0.3 });
    tone(t + 0.055, { freq: A5, type: 'triangle', a: 0.003, d: 0.22, peak: 0.13, bus: 'ui', room: 0.35 });
    tone(t, { freq: D3, type: 'sine', a: 0.004, d: 0.22, peak: 0.16, bus: 'ui' });
    return t + 0.3;
  },
  error(t) {
    tone(t, { freq: 180, type: 'square', a: 0.003, d: 0.1, peak: 0.1, filter: { type: 'lowpass', freq: 900 }, bus: 'ui' });
    tone(t + 0.09, { freq: 140, type: 'square', a: 0.003, d: 0.14, peak: 0.09, filter: { type: 'lowpass', freq: 700 }, bus: 'ui' });
    return t + 0.26;
  },
  toggle(t) {
    noise(t, { color: 'white', a: 0.0008, d: 0.03, peak: 0.13, filter: { type: 'bandpass', from: 3200, to: 1800, Q: 3 }, bus: 'ui', room: 0.2 });
    return t + 0.05;
  },

  /* ═════════════ 召喚：導入 ═════════════ */

  /** 星晶石を投げ入れる。非整数倍音FM＝結晶／金属の質感。 */
  coinInsert(t) {
    fm(t, { freq: 1480, ratio: 2.76, index: 900, indexDecay: 0.07, a: 0.001, d: 0.5, peak: 0.24, hall: 0.4, plate: 0.3 });
    fm(t + 0.012, { freq: 2210, ratio: 3.41, index: 620, indexDecay: 0.05, a: 0.001, d: 0.35, peak: 0.13, hall: 0.35, pan: 0.2 });
    noise(t, { color: 'white', a: 0.0006, d: 0.035, peak: 0.2, filter: { type: 'bandpass', from: 5200, to: 3000, Q: 1.6 } });
    tone(t, { freq: 320, pitchTo: 150, pitchDur: 0.1, type: 'sine', a: 0.002, d: 0.22, peak: 0.16 });
    return t + 0.6;
  },

  /** 飛翔。バンドパスのスイープ＋パンの移動。 */
  whoosh(t, o = {}) {
    const d = o.dur ?? 0.5;
    noise(t, {
      color: 'white', a: d * 0.35, d: d * 0.65, peak: o.peak ?? 0.2, curve: 'lin',
      filter: { type: 'bandpass', from: o.from ?? 380, to: o.to ?? 4200, Q: 1.1, dur: d },
      hall: 0.3, pan: o.pan ?? -0.4,
    });
    noise(t + d * 0.15, {
      color: 'pink', a: d * 0.3, d: d * 0.5, peak: (o.peak ?? 0.2) * 0.6, curve: 'lin',
      filter: { type: 'bandpass', from: (o.from ?? 380) * 1.4, to: (o.to ?? 4200) * 0.8, Q: 2 },
      hall: 0.35, pan: -(o.pan ?? -0.4),
    });
    return t + d + 0.2;
  },

  /** 着弾（軽）。魔法陣に石が落ちる。 */
  impactSoft(t) {
    noise(t, { color: 'white', a: 0.0008, d: 0.06, peak: 0.24, filter: { type: 'bandpass', from: 3400, to: 900, Q: 0.8 }, room: 0.4 });
    subDrop(t, { from: 140, to: 42, d: 0.6, peak: 0.34 });
    membrane(t, { freq: 110, d: 0.4, peak: 0.26, hall: 0.4 });
    return t + 0.7;
  },

  /** 詠唱（チャージ）。ライザー＋うねるパッド。演出の緊張の主成分。 */
  charge(t, o = {}) {
    const dur = o.dur ?? 1.3;
    riser(t, { dur, fromHz: 96, toHz: 1520, layers: 3, peak: 0.13, noiseAmt: 0.13 });
    stack(t, {
      freq: D3, type: 'sawtooth', voices: 5, spread: 16, peak: 0.16,
      a: dur * 0.5, d: dur * 0.5, curve: 'lin',
      filter: { type: 'lowpass', freq: 260, to: 3600, dur },
      hall: 0.4,
    });
    tone(t, { freq: 36, type: 'sine', a: dur * 0.6, d: dur * 0.4, peak: 0.3, curve: 'lin' });
    return t + dur;
  },

  /** 鼓動。タメの区間に置くと、無音が「怖く」なる。 */
  heartbeat(t, o = {}) {
    const p = o.peak ?? 0.4;
    tone(t, { freq: 62, pitchTo: 38, pitchDur: 0.09, type: 'sine', a: 0.004, d: 0.24, peak: p });
    tone(t + 0.17, { freq: 56, pitchTo: 34, pitchDur: 0.09, type: 'sine', a: 0.004, d: 0.3, peak: p * 0.8 });
    return t + 0.5;
  },

  /* ═════════════ オーラ確定音（期待度の開示） ═════════════ */

  auraWhite(t) {
    tone(t, { freq: A4, type: 'sine', a: 0.02, d: 0.5, peak: 0.1, hall: 0.5 });
    noise(t, { color: 'pink', a: 0.03, d: 0.4, peak: 0.07, filter: { type: 'bandpass', from: 1800, to: 900, Q: 1 }, hall: 0.4 });
    return t + 0.6;
  },

  auraBlue(t) {
    chord(t, [D4, A4, D5], (tt, oo) => tone(tt, { ...oo, type: 'triangle', a: 0.01, d: 0.7, peak: 0.12, hall: 0.6, plate: 0.3 }), { strum: 0.02 });
    noise(t, { color: 'white', a: 0.006, d: 0.5, peak: 0.12, filter: { type: 'bandpass', from: 2600, to: 6200, Q: 1.2 }, hall: 0.5 });
    subDrop(t, { from: 110, to: 46, d: 0.5, peak: 0.2 });
    return t + 0.8;
  },

  auraSilver(t) {
    // ベルのクラスタ＋きらめき。銀は「冷たく澄んだ」音にする。
    [D5, F5, A5, mtof(86)].forEach((f, i) => {
      fm(t + i * 0.035, { freq: f, ratio: 2.01, index: 420, indexDecay: 0.12, a: 0.002, d: 1.1 - i * 0.12, peak: 0.16, hall: 0.7, plate: 0.4, pan: (i - 1.5) * 0.3 });
    });
    noise(t, { color: 'white', a: 0.008, d: 0.8, peak: 0.13, filter: { type: 'highpass', from: 4200, to: 9000, Q: 0.7 }, hall: 0.6 });
    subDrop(t, { from: 130, to: 44, d: 0.7, peak: 0.26 });
    membrane(t, { freq: 130, d: 0.5, peak: 0.24, hall: 0.5 });
    return t + 1.2;
  },

  auraGold(t) {
    // 金はブラス的な「決定感」。ノコギリのスタックにローパスのエンベロープ。
    stack(t, {
      freq: D4, type: 'sawtooth', voices: 7, spread: 18, peak: 0.3,
      a: 0.012, d: 1.0, filter: { type: 'lowpass', freq: 600, to: 5200, dur: 0.16 }, hall: 0.6,
    });
    stack(t, {
      freq: A4, type: 'sawtooth', voices: 5, spread: 14, peak: 0.18,
      a: 0.02, d: 0.9, filter: { type: 'lowpass', freq: 700, to: 4600, dur: 0.2 }, hall: 0.6,
    });
    [D5, F5, A5, mtof(86), mtof(89)].forEach((f, i) => {
      fm(t + 0.02 + i * 0.03, { freq: f, ratio: 2.01, index: 500, indexDecay: 0.1, a: 0.002, d: 1.0, peak: 0.13, hall: 0.65, pan: (i - 2) * 0.22 });
    });
    membrane(t, { freq: 150, d: 0.75, peak: 0.42, hall: 0.55 });
    subDrop(t, { from: 160, to: 34, d: 1.0, peak: 0.42 });
    noise(t, { color: 'white', a: 0.001, d: 0.08, peak: 0.26, filter: { type: 'bandpass', from: 5600, to: 2400, Q: 0.9 } });
    return t + 1.3;
  },

  /**
   * 虹。ここだけは「量」ではなく「質」で断絶させる（RESEARCH §1.5）。
   * 無音 → サブの立ち上がり → 合唱 → 全帯域の爆発 → ベルの降り注ぎ。
   */
  auraRainbow(t) {
    // ① 深いサブの立ち上がり（腹に来る）
    tone(t, { freq: 28, type: 'sine', a: 0.18, d: 2.6, peak: 0.55, curve: 'lin' });
    // ② 合唱：Dm add9 を積む
    chord(t + 0.02, [D4, F4, A4, E5], (tt, oo) => voxPad(tt, { ...oo, dur: 2.2, peak: 0.13, voices: 6, spread: 16, a: 0.16, r: 1.6, hall: 0.95 }));
    chord(t + 0.02, [D3, A3], (tt, oo) => voxPad(tt, { ...oo, dur: 2.4, peak: 0.1, voices: 4, spread: 10, a: 0.22, r: 1.8, hall: 0.9 }));
    // ③ オーケストラヒット
    stack(t + 0.06, {
      freq: D4, type: 'sawtooth', voices: 9, spread: 24, peak: 0.34,
      a: 0.008, d: 1.6, filter: { type: 'lowpass', freq: 500, to: 7200, dur: 0.12 }, hall: 0.8,
    });
    // ④ 和太鼓の連打（三連）
    membrane(t + 0.04, { freq: 165, d: 1.0, peak: 0.5, hall: 0.7 });
    membrane(t + 0.19, { freq: 140, d: 0.8, peak: 0.36, hall: 0.7 });
    membrane(t + 0.30, { freq: 120, d: 1.4, peak: 0.55, hall: 0.8 });
    // ⑤ サブドロップ（解放）
    subDrop(t + 0.04, { from: 190, to: 26, d: 1.8, peak: 0.55, hall: 0.2 });
    // ⑥ 全帯域のトランジェント
    noise(t + 0.03, { color: 'white', a: 0.001, d: 0.12, peak: 0.34, filter: { type: 'bandpass', from: 7000, to: 1600, Q: 0.6 }, hall: 0.4 });
    // ⑦ ベルの降り注ぎ（7音）
    [mtof(93), mtof(89), mtof(86), mtof(84), mtof(81), mtof(77), mtof(74)].forEach((f, i) => {
      fm(t + 0.22 + i * 0.075, {
        freq: f, ratio: 2.01, index: 680, indexDecay: 0.15,
        a: 0.002, d: 1.8 - i * 0.12, peak: 0.16, hall: 0.9, plate: 0.5,
        pan: Math.sin(i * 1.7) * 0.6,
      });
    });
    // ⑧ 空気の帯（シマー）
    noise(t + 0.1, { color: 'white', a: 0.5, d: 2.0, peak: 0.1, curve: 'lin', filter: { type: 'highpass', from: 5000, to: 11000, Q: 0.7, dur: 1.6 }, hall: 0.9 });
    return t + 3.0;
  },

  /* ═════════════ 昇格（バチバチ） ═════════════ */

  crackle1(t) {
    grains(t, { count: 14, spread: 0.13, grainDur: 0.025, peak: 0.2, fMin: 1800, fMax: 8000, Q: 7 });
    noise(t, { color: 'white', a: 0.0008, d: 0.07, peak: 0.2, filter: { type: 'bandpass', from: 4200, to: 2200, Q: 2 }, room: 0.4 });
    tone(t, { freq: 180, pitchTo: 70, pitchDur: 0.08, type: 'square', a: 0.002, d: 0.16, peak: 0.12, filter: { type: 'lowpass', freq: 1400 } });
    return t + 0.3;
  },

  crackle2(t) {
    grains(t, { count: 26, spread: 0.2, grainDur: 0.03, peak: 0.24, fMin: 900, fMax: 11000, Q: 9 });
    // リングモジュレーション的な金属感：非整数比の強いFM
    fm(t, { freq: 620, ratio: 3.77, index: 1800, indexDecay: 0.16, a: 0.001, d: 0.5, peak: 0.2, hall: 0.4, plate: 0.35 });
    noise(t, { color: 'white', a: 0.001, d: 0.11, peak: 0.26, filter: { type: 'bandpass', from: 6000, to: 1400, Q: 1.2 }, room: 0.5 });
    subDrop(t, { from: 130, to: 40, d: 0.5, peak: 0.3 });
    membrane(t + 0.01, { freq: 120, d: 0.4, peak: 0.28, hall: 0.4 });
    return t + 0.6;
  },

  /** 3段目。ここは「割れる」音。ガラス破砕＋合唱スタブ＋太鼓。 */
  crackle3(t) {
    grains(t, { count: 44, spread: 0.3, grainDur: 0.035, peak: 0.24, fMin: 700, fMax: 13000, Q: 10 });
    fm(t, { freq: 440, ratio: 4.19, index: 2600, indexDecay: 0.22, a: 0.001, d: 0.8, peak: 0.22, hall: 0.6, plate: 0.4 });
    noise(t, { color: 'white', a: 0.001, d: 0.18, peak: 0.3, filter: { type: 'bandpass', from: 8000, to: 900, Q: 0.7 }, hall: 0.5 });
    subDrop(t, { from: 200, to: 30, d: 1.1, peak: 0.45 });
    membrane(t, { freq: 155, d: 0.9, peak: 0.45, hall: 0.6 });
    chord(t + 0.03, [D4, A4, F5], (tt, oo) => voxPad(tt, { ...oo, dur: 0.5, peak: 0.12, voices: 5, a: 0.03, r: 0.7, hall: 0.9 }));
    return t + 1.2;
  },

  /* ═════════════ 解放・顕現 ═════════════ */

  /** 大インパクト（3層構成の教科書どおり）。 */
  impactFull(t, o = {}) {
    const s = o.scale ?? 1;
    // ① トランジェント
    noise(t, { color: 'white', a: 0.0006, d: 0.09, peak: 0.34 * s, filter: { type: 'bandpass', from: 9000, to: 1200, Q: 0.6 } });
    // ② ボディ
    subDrop(t, { from: 210, to: 27, d: 1.5 * s, peak: 0.55 * s });
    membrane(t, { freq: 170, d: 1.1 * s, peak: 0.5 * s, hall: 0.6 });
    // ③ テイル：金属クラスタ
    [1, 1.41, 1.93, 2.76, 3.41].forEach((r2, i) => {
      fm(t + i * 0.006, { freq: 300 * r2, ratio: 2.4, index: 800, indexDecay: 0.2, a: 0.001, d: 1.4 - i * 0.15, peak: 0.1 * s, hall: 0.8, plate: 0.5, pan: (i - 2) * 0.3 });
    });
    noise(t + 0.02, { color: 'pink', a: 0.02, d: 1.6 * s, peak: 0.12 * s, curve: 'lin', filter: { type: 'lowpass', from: 6000, to: 700, Q: 0.7, dur: 1.2 }, hall: 0.85 });
    return t + 1.8 * s;
  },

  taiko(t, o = {}) {
    return membrane(t, { freq: vary(o.freq ?? 160, 1), d: o.dur ?? 0.7, peak: o.peak ?? 0.5, hall: 0.55 });
  },

  orchHit(t, o = {}) {
    const p = o.peak ?? 0.3;
    stack(t, { freq: D4, type: 'sawtooth', voices: 8, spread: 22, peak: p, a: 0.006, d: 0.5, filter: { type: 'lowpass', freq: 500, to: 6000, dur: 0.1 }, hall: 0.6 });
    noise(t, { color: 'white', a: 0.001, d: 0.1, peak: p * 0.6, filter: { type: 'bandpass', from: 6000, to: 1800, Q: 0.8 } });
    subDrop(t, { from: 170, to: 34, d: 0.7, peak: p * 1.2 });
    return t + 0.8;
  },

  choirStab(t, o = {}) {
    chord(t, o.freqs || [D4, F4, A4], (tt, oo) => voxPad(tt, { ...oo, dur: o.dur ?? 0.45, peak: o.peak ?? 0.14, voices: 6, a: 0.025, r: 0.6, hall: 0.9 }));
    return t + (o.dur ?? 0.45) + 0.7;
  },

  choirSwell(t, o = {}) {
    chord(t, o.freqs || [D3, A3, D4, F4], (tt, oo) => voxPad(tt, { ...oo, dur: o.dur ?? 2.2, peak: o.peak ?? 0.12, voices: 7, a: 0.5, r: 1.6, hall: 0.95 }));
    return t + (o.dur ?? 2.2) + 1.8;
  },

  shatter(t, o = {}) {
    grains(t, { count: o.count ?? 38, spread: 0.36, grainDur: 0.04, peak: 0.2, fMin: 1600, fMax: 14000, Q: 12, hall: 0.5 });
    noise(t, { color: 'white', a: 0.0008, d: 0.25, peak: 0.22, filter: { type: 'highpass', from: 3000, to: 8000, Q: 0.8 }, hall: 0.6 });
    return t + 0.6;
  },

  /** 光柱。長いスウェル＋地鳴り＋高域のシマー。 */
  pillar(t, o = {}) {
    const d = o.dur ?? 1.8;
    noise(t, { color: 'white', a: d * 0.25, d: d * 0.75, peak: 0.16, curve: 'lin', filter: { type: 'bandpass', from: 700, to: 9000, Q: 0.8, dur: d * 0.6 }, hall: 0.9 });
    tone(t, { freq: 44, type: 'sine', a: 0.1, d, peak: 0.34, curve: 'lin' });
    stack(t, { freq: A3, type: 'sawtooth', voices: 6, spread: 20, peak: 0.16, a: 0.12, d, filter: { type: 'lowpass', freq: 400, to: 5000, dur: d * 0.5 }, hall: 0.8 });
    [mtof(86), mtof(93)].forEach((f, i) => fm(t + 0.05 + i * 0.09, { freq: f, ratio: 2.01, index: 500, indexDecay: 0.2, a: 0.004, d: d, peak: 0.1, hall: 0.9, pan: i ? 0.4 : -0.4 }));
    return t + d + 0.6;
  },

  /** カードを配る。ピッチをばらけさせて「同じ音の10連打」を避ける。 */
  cardDeal(t, o = {}) {
    const k = vary(1, 2);
    noise(t, { color: 'white', a: 0.0006, d: 0.055, peak: 0.16, filter: { type: 'bandpass', from: 2400 * k, to: 900 * k, Q: 1.4 }, room: 0.35, pan: o.pan ?? 0 });
    tone(t, { freq: 240 * k, pitchTo: 110 * k, pitchDur: 0.05, type: 'sine', a: 0.001, d: 0.09, peak: 0.1, pan: o.pan ?? 0 });
    return t + 0.15;
  },

  cardFlip(t, o = {}) {
    const k = vary(1, 1.5);
    noise(t, { color: 'white', a: 0.004, d: 0.13, peak: 0.16, filter: { type: 'bandpass', from: 900 * k, to: 4200 * k, Q: 1.1 }, room: 0.4, pan: o.pan ?? 0 });
    fm(t + 0.02, { freq: 1600 * k, ratio: 1.76, index: 300, indexDecay: 0.03, a: 0.001, d: 0.1, peak: 0.1, room: 0.3 });
    return t + 0.2;
  },

  /** レア枠が組み上がる金属音。 */
  frameLock(t, o = {}) {
    const s = o.scale ?? 1;
    fm(t, { freq: 880, ratio: 2.76, index: 1100, indexDecay: 0.08, a: 0.001, d: 0.45 * s, peak: 0.18, hall: 0.5, plate: 0.4 });
    noise(t, { color: 'white', a: 0.0006, d: 0.05, peak: 0.16, filter: { type: 'bandpass', from: 6200, to: 3000, Q: 2.2 }, room: 0.4 });
    tone(t, { freq: 150, pitchTo: 70, pitchDur: 0.07, type: 'sine', a: 0.002, d: 0.2, peak: 0.16 });
    return t + 0.5;
  },

  /** ★の点灯。i 番目（0始まり）で音程が上がる。 */
  chimeStar(t, o = {}) {
    const i = o.index ?? 0;
    const scale = [mtof(74), mtof(77), mtof(81), mtof(84), mtof(86), mtof(89)];
    const f = scale[Math.min(i, scale.length - 1)];
    fm(t, { freq: f, ratio: 2.01, index: 460, indexDecay: 0.1, a: 0.001, d: 0.85, peak: 0.16, hall: 0.7, plate: 0.45, pan: (i - 2) * 0.18 });
    tone(t, { freq: f * 2, type: 'sine', a: 0.001, d: 0.3, peak: 0.05, hall: 0.6 });
    return t + 0.9;
  },

  /** ホロ箔のスイープ。高域のきらめきが横切る。 */
  holoSheen(t, o = {}) {
    const d = o.dur ?? 0.7;
    noise(t, { color: 'white', a: d * 0.3, d: d * 0.7, peak: 0.12, curve: 'lin', filter: { type: 'bandpass', from: 3200, to: 13000, Q: 2.4, dur: d }, hall: 0.6, pan: -0.5 });
    noise(t + 0.04, { color: 'white', a: d * 0.3, d: d * 0.7, peak: 0.08, curve: 'lin', filter: { type: 'bandpass', from: 4200, to: 11000, Q: 3, dur: d }, hall: 0.6, pan: 0.5 });
    return t + d + 0.3;
  },

  /** ★5 専用ファンファーレ。i-VI-III-VII の「エピック進行」。 */
  fanfare5(t) {
    const brass = (tt, f, dur, peak, panv = 0) => stack(tt, {
      freq: f, type: 'sawtooth', voices: 7, spread: 16, peak,
      a: 0.018, d: dur, filter: { type: 'lowpass', freq: 420, to: 5200, dur: 0.11 }, hall: 0.7, pan: panv,
    });
    // 上昇するアルペジオ
    const arp = [D4, A4, D5, F5, A5];
    arp.forEach((f, i) => brass(t + i * 0.085, f, 0.38, 0.2, (i - 2) * 0.16));
    // 着地の和音（Dm → Bb → F → C）
    const t2 = t + 0.5;
    [[D4, F4, A4, D5], [Bb4, mtof(74), F5], [F4, A4, C5, F5], [C4, mtof(76), G4, C5]]
      .forEach((ch, i) => {
        const tt = t2 + i * 0.42;
        ch.forEach((f, j) => brass(tt, f, 0.5, 0.15, (j - 1.5) * 0.2));
        membrane(tt, { freq: 160 - i * 8, d: 0.6, peak: 0.4, hall: 0.6 });
        subDrop(tt, { from: 150, to: 40, d: 0.5, peak: 0.3 });
      });
    // 最後のシンバル代わり
    noise(t2 + 1.26, { color: 'white', a: 0.002, d: 1.6, peak: 0.14, filter: { type: 'highpass', from: 4000, to: 9000, Q: 0.7, dur: 1.2 }, hall: 0.9 });
    chord(t2 + 1.26, [D4, F4, A4, D5], (tt, oo) => voxPad(tt, { ...oo, dur: 1.6, peak: 0.1, voices: 6, a: 0.12, r: 1.4, hall: 0.95 }));
    return t2 + 3.0;
  },

  /** ★4 用の短いファンファーレ。 */
  fanfare4(t) {
    const brass = (tt, f, dur, peak, panv = 0) => stack(tt, {
      freq: f, type: 'sawtooth', voices: 5, spread: 14, peak,
      a: 0.014, d: dur, filter: { type: 'lowpass', freq: 400, to: 4400, dur: 0.1 }, hall: 0.6, pan: panv,
    });
    [D4, F4, A4].forEach((f, i) => brass(t + i * 0.075, f, 0.32, 0.18, (i - 1) * 0.2));
    const t2 = t + 0.26;
    [D4, F4, A4, D5].forEach((f, j) => brass(t2, f, 0.55, 0.14, (j - 1.5) * 0.2));
    membrane(t2, { freq: 155, d: 0.5, peak: 0.34, hall: 0.55 });
    subDrop(t2, { from: 140, to: 38, d: 0.55, peak: 0.28 });
    return t2 + 1.0;
  },

  /* ═════════════ メタ ═════════════ */

  reward(t) {
    [D5, F5, A5].forEach((f, i) => fm(t + i * 0.06, { freq: f, ratio: 2.01, index: 420, indexDecay: 0.1, a: 0.002, d: 0.7, peak: 0.15, hall: 0.6, plate: 0.4 }));
    subDrop(t, { from: 120, to: 48, d: 0.4, peak: 0.2 });
    return t + 0.9;
  },

  levelUp(t) {
    [D4, F4, A4, D5, F5].forEach((f, i) => fm(t + i * 0.055, { freq: f, ratio: 2.01, index: 500, indexDecay: 0.11, a: 0.002, d: 0.8, peak: 0.14, hall: 0.7 }));
    membrane(t, { freq: 150, d: 0.5, peak: 0.3, hall: 0.5 });
    return t + 1.0;
  },

  newBadge(t) {
    fm(t, { freq: mtof(88), ratio: 2.01, index: 380, indexDecay: 0.07, a: 0.001, d: 0.5, peak: 0.14, hall: 0.6, plate: 0.4 });
    fm(t + 0.05, { freq: mtof(93), ratio: 2.01, index: 320, indexDecay: 0.06, a: 0.001, d: 0.4, peak: 0.1, hall: 0.6 });
    return t + 0.6;
  },

  shardGain(t, o = {}) {
    const i = o.index ?? 0;
    fm(t, { freq: mtof(79 + (i % 5) * 2), ratio: 3.01, index: 260, indexDecay: 0.05, a: 0.001, d: 0.3, peak: 0.09, room: 0.4, hall: 0.3, pan: (R() * 2 - 1) * 0.4 });
    return t + 0.35;
  },

  /** 画面遷移。 */
  swipe(t, o = {}) {
    noise(t, { color: 'pink', a: 0.05, d: 0.22, peak: 0.1, curve: 'lin', filter: { type: 'bandpass', from: 600, to: 3200, Q: 1.2, dur: 0.22 }, room: 0.4, pan: o.pan ?? 0.3, bus: 'ui' });
    return t + 0.3;
  },

  /** 逆再生風の吸い込み。カットインの直前。 */
  suck(t, o = {}) {
    reverseSwell(t, { dur: o.dur ?? 0.85, peak: 0.26 });
    tone(t, { freq: 60, pitchTo: 240, pitchDur: (o.dur ?? 0.85) * 0.9, type: 'sine', a: (o.dur ?? 0.85) * 0.8, d: 0.12, peak: 0.24, curve: 'lin' });
    return t + (o.dur ?? 0.85) + 0.1;
  },
};

/** 連打を抑制したい音（キー → 最小間隔秒） */
const THROTTLE = { tap: 0.03, hover: 0.05, cardDeal: 0.02, cardFlip: 0.03, shardGain: 0.015, chimeStar: 0.03 };

export const sfx = {
  /** 今すぐ鳴らす。戻り値は終了予定時刻（秒・AudioContext 時間）。 */
  play(name, opts) {
    if (!engine.ready || !engine.ctx) return 0;
    const min = THROTTLE[name];
    if (min && !engine.throttle(name, min)) return 0;
    const fn = DEFS[name];
    if (!fn) { console.warn('[sfx] 未定義:', name); return 0; }
    try { return fn(engine.now(), opts || {}); }
    catch (e) { console.error('[sfx]', name, e); return 0; }
  },

  /** 絶対時刻に予約する（演出のタイムライン同期用）。 */
  at(name, t, opts) {
    if (!engine.ready || !engine.ctx) return 0;
    const fn = DEFS[name];
    if (!fn) { console.warn('[sfx] 未定義:', name); return 0; }
    try { return fn(Math.max(t, engine.ctx.currentTime + 0.005), opts || {}); }
    catch (e) { console.error('[sfx]', name, e); return 0; }
  },

  /** 秒後に予約する。 */
  after(name, seconds, opts) {
    if (!engine.ready || !engine.ctx) return 0;
    return this.at(name, engine.ctx.currentTime + seconds, opts);
  },

  names: Object.keys(DEFS),
  has: (n) => !!DEFS[n],
};

/** オーラ段階 → 確定音 */
export const AURA_SFX = ['auraWhite', 'auraBlue', 'auraSilver', 'auraGold', 'auraRainbow'];
