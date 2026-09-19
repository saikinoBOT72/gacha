/**
 * 乱数ユーティリティ。
 *
 * Math.random() は実装依存でシードを与えられない。抽選の統計検証（tests/）と
 * リプレイ可能なデバッグのために、シード可能な PRNG を自前で持つ。
 * 本番の抽選には crypto 由来のシードを与えるので、質は Math.random() 以上。
 */

/** 文字列 → 32bit シード（xmur3） */
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: 高速・十分な品質の 32bit PRNG */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 暗号品質のシードで初期化した PRNG（本番用） */
export function createRng(seed) {
  if (seed === undefined) {
    let s;
    try {
      const buf = new Uint32Array(1);
      (globalThis.crypto || globalThis.msCrypto).getRandomValues(buf);
      s = buf[0];
    } catch {
      s = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    }
    seed = s;
  } else if (typeof seed === 'string') {
    seed = hashSeed(seed)();
  }
  const next = mulberry32(seed);
  next.seed = seed >>> 0;
  return next;
}

/** [0,1) を返す既定 RNG。モジュールをまたいで共有する。 */
export const rng = createRng();

/* ---------- 便利関数（すべて rnd を注入できる＝テスト可能） ---------- */

export const rnd = (r = rng) => r();
export const randRange = (min, max, r = rng) => min + r() * (max - min);
export const randInt = (min, max, r = rng) => Math.floor(min + r() * (max - min + 1));
export const chance = (p, r = rng) => r() < p;
export const pick = (arr, r = rng) => arr[Math.floor(r() * arr.length)];
export const randSign = (r = rng) => (r() < 0.5 ? -1 : 1);

/** ガウス分布（Box-Muller）。パーティクルの自然なばらつきに使う。 */
export function gauss(mean = 0, sd = 1, r = rng) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 重み付き抽選。weights は非負数の配列。合計が 0 なら -1。
 * 累積和を都度作るので、ホットパスでは WeightedTable を使うこと。
 */
export function weightedIndex(weights, r = rng) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** 累積和をキャッシュし二分探索で引く、固定重みテーブル。 */
export class WeightedTable {
  constructor(items, weightOf = (x) => x.weight) {
    this.items = items;
    this.cum = new Float64Array(items.length);
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      acc += Math.max(0, weightOf(items[i]));
      this.cum[i] = acc;
    }
    this.total = acc;
  }
  pick(r = rng) {
    if (this.total <= 0) return undefined;
    const x = r() * this.total;
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return this.items[lo];
  }
}

/** Fisher-Yates（破壊的でない） */
export function shuffle(arr, r = rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
