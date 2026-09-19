/**
 * イージング関数群。
 * すべて t:[0,1] → [0,1]（back/elastic はオーバーシュートで範囲外に出る）。
 * 「気持ちよさ」は大半がここのカーブで決まる。
 */
const C1 = 1.70158;
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const C4 = (2 * Math.PI) / 3;
const C5 = (2 * Math.PI) / 4.5;

const bounceOut = (t) => {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const Ease = {
  linear: (t) => t,

  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),

  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),

  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),

  inQuint: (t) => t ** 5,
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),

  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2,

  inCirc: (t) => 1 - Math.sqrt(1 - t * t),
  outCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  inOutCirc: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  inBack: (t) => C3 * t * t * t - C1 * t * t,
  outBack: (t) => 1 + C3 * Math.pow(t - 1, 3) + C1 * Math.pow(t - 1, 2),
  inOutBack: (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((C2 + 1) * 2 * t - C2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((C2 + 1) * (t * 2 - 2) + C2) + 2) / 2,

  inElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * C4),
  outElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * C4) + 1,
  inOutElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * C5)) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * C5)) / 2 + 1,

  inBounce: (t) => 1 - bounceOut(1 - t),
  outBounce: bounceOut,
  inOutBounce: (t) =>
    t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2,

  /** 強いオーバーシュート。カード着地やスラムに。 */
  outBackHard: (t) => {
    const c = 2.8, c3 = c + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },

  /** 山型（0→1→0）。フラッシュやパルスに。 */
  pulse: (t) => Math.sin(t * Math.PI),
  /** 鋭い山（立ち上がり即、減衰ゆっくり）。インパクト表現に。 */
  spike: (t) => (t <= 0 ? 0 : Math.pow(1 - t, 2.2) * Math.min(1, t * 14)),
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a1, b1, a2, b2) => lerp(a2, b2, clamp01(invLerp(a1, b1, v)));
/** フレームレート非依存の減衰補間。half = 半減にかかる秒数。 */
export const damp = (a, b, half, dt) => lerp(a, b, 1 - Math.pow(2, -dt / half));
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

export function resolveEase(e) {
  if (typeof e === 'function') return e;
  return Ease[e] || Ease.linear;
}
