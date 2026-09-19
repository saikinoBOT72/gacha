/**
 * 抽選エンジン。
 *
 * 設計の芯（NOTES A2 / E1）:
 *   このモジュールは **演出を一切知らない**。演出は `stagePlan.js` が結果から逆算して組む。
 *   したがって「演出が結果を変える」ことは構造的に起こり得ない。
 *
 * 公開仕様（画面上でも全て開示する）:
 *   ★5 基礎 0.600% / ソフト天井 74連目から +6.0%/連 / ハード天井 90連
 *   ★4 基礎 5.100% / ソフト天井  9連目から +30.0%/連 / ハード天井 10連
 *   ピックアップは 50/50、すり抜けたら次は確定（★5・★4 とも）
 *   ★5 を引くと ★4 カウンタもリセットされる
 */
import { rng as defaultRng } from '../util/rng.js';
import {
  STANDARD_POOL_5, STANDARD_POOL_4, POOL_3, POOL_2, POOL_1,
} from './banners.js';

/** 基礎提供割合。合計は必ず 1。 */
export const BASE_RATES = { 5: 0.006, 4: 0.051, 3: 0.18, 2: 0.32, 1: 0.443 };

export const PITY_CFG = {
  5: { hard: 90, softStart: 74, softStep: 0.06 },
  4: { hard: 10, softStart: 9, softStep: 0.30 },
};

/** ピックアップ当選率（50/50） */
export const PICKUP_RATE = 0.5;

const LOWER_SUM = BASE_RATES[3] + BASE_RATES[2] + BASE_RATES[1];

/**
 * 通算 n 回目（＝直前の★5から数えて n 回目）の★5確率。
 * n は 1 始まり。
 */
export function rate5(n) {
  const { hard, softStart, softStep } = PITY_CFG[5];
  if (n >= hard) return 1;
  if (n >= softStart) return Math.min(1, BASE_RATES[5] + (n - softStart + 1) * softStep);
  return BASE_RATES[5];
}

export function rate4(n) {
  const { hard, softStart, softStep } = PITY_CFG[4];
  if (n >= hard) return 1;
  if (n >= softStart) return Math.min(1, BASE_RATES[4] + (n - softStart + 1) * softStep);
  return BASE_RATES[4];
}

/** 現在のカウンタでの実効提供割合（UIの「今の確率」表示に使う）。 */
export function effectiveRates(pity) {
  const n5 = (pity.c5 | 0) + 1;
  const n4 = (pity.c4 | 0) + 1;
  const p5 = rate5(n5);
  const p4 = Math.max(0, Math.min(rate4(n4), 1 - p5));
  const rest = Math.max(0, 1 - p5 - p4);
  const k = LOWER_SUM > 0 ? rest / LOWER_SUM : 0;
  return {
    5: p5,
    4: p4,
    3: BASE_RATES[3] * k,
    2: BASE_RATES[2] * k,
    1: BASE_RATES[1] * k,
  };
}

export const newPity = () => ({ c5: 0, c4: 0, guaranteed5: false, guaranteed4: false, total: 0 });

/** 壊れた/欠けたピティを安全な値に正規化する（NOTES F2）。 */
export function normalizePity(p) {
  const o = newPity();
  if (!p || typeof p !== 'object') return o;
  o.c5 = clampInt(p.c5, 0, PITY_CFG[5].hard - 1);
  o.c4 = clampInt(p.c4, 0, PITY_CFG[4].hard - 1);
  o.guaranteed5 = !!p.guaranteed5;
  o.guaranteed4 = !!p.guaranteed4;
  o.total = clampInt(p.total, 0, 1e9);
  return o;
}
const clampInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

const pickFrom = (arr, r) => arr[Math.floor(r() * arr.length)];

/** レアリティのみを決める。forced が与えられたらそれを使う（ステップアップ確定枠）。 */
function rollRarity(pity, r, forced) {
  const n5 = pity.c5 + 1;
  const n4 = pity.c4 + 1;
  const p5 = rate5(n5);
  const p4 = Math.max(0, Math.min(rate4(n4), 1 - p5));
  const roll = r();

  let rarity;
  if (forced) {
    rarity = forced;
  } else if (roll < p5) {
    rarity = 5;
  } else if (roll < p5 + p4) {
    rarity = 4;
  } else {
    const rest = Math.max(0, 1 - p5 - p4);
    const k = LOWER_SUM > 0 ? rest / LOWER_SUM : 0;
    let acc = p5 + p4;
    const t3 = acc + BASE_RATES[3] * k;
    const t2 = t3 + BASE_RATES[2] * k;
    rarity = roll < t3 ? 3 : roll < t2 ? 2 : 1;
  }

  const meta = {
    rarity,
    pullIndex5: n5,
    pullIndex4: n4,
    hardPity5: !forced && rarity === 5 && n5 >= PITY_CFG[5].hard,
    softPity5: !forced && rarity === 5 && n5 >= PITY_CFG[5].softStart && n5 < PITY_CFG[5].hard,
    hardPity4: !forced && rarity === 4 && n4 >= PITY_CFG[4].hard,
    forced: !!forced,
    rate5At: p5,
    rate4At: p4,
  };
  return meta;
}

/** レアリティが決まった後に、どの星霊かを決める（ピックアップ 50/50 を含む）。 */
function rollChar(rarity, banner, pity, r) {
  if (rarity === 5) {
    const pu = banner.pickup5 || [];
    if (pu.length === 0) {
      return { charId: pickFrom(STANDARD_POOL_5, r), isPickup: false, won5050: null };
    }
    if (pity.guaranteed5) {
      pity.guaranteed5 = false;
      return { charId: pickFrom(pu, r), isPickup: true, won5050: true, wasGuaranteed: true };
    }
    if (r() < PICKUP_RATE) {
      return { charId: pickFrom(pu, r), isPickup: true, won5050: true };
    }
    pity.guaranteed5 = true; // すり抜け → 次は確定
    return { charId: pickFrom(STANDARD_POOL_5, r), isPickup: false, won5050: false };
  }

  if (rarity === 4) {
    const pu = banner.pickup4 || [];
    if (pu.length === 0) {
      return { charId: pickFrom(STANDARD_POOL_4, r), isPickup: false, won5050: null };
    }
    if (pity.guaranteed4) {
      pity.guaranteed4 = false;
      return { charId: pickFrom(pu, r), isPickup: true, won5050: true, wasGuaranteed: true };
    }
    if (r() < PICKUP_RATE) {
      return { charId: pickFrom(pu, r), isPickup: true, won5050: true };
    }
    pity.guaranteed4 = true;
    return { charId: pickFrom(STANDARD_POOL_4, r), isPickup: false, won5050: false };
  }

  const pool = rarity === 3 ? POOL_3 : rarity === 2 ? POOL_2 : POOL_1;
  return { charId: pickFrom(pool, r), isPickup: false, won5050: null };
}

/**
 * 1 回引く。`pity` は破壊的に更新される。
 * @returns {{charId,rarity,isPickup,won5050,pullIndex5,...}}
 */
export function drawOne(pity, banner, r = defaultRng, forced = null) {
  const meta = rollRarity(pity, r, forced);
  const who = rollChar(meta.rarity, banner, pity, r);

  // カウンタ更新：★5 は★4カウンタもリセットする（業界標準）
  if (meta.rarity === 5) { pity.c5 = 0; pity.c4 = 0; }
  else if (meta.rarity === 4) { pity.c4 = 0; pity.c5++; }
  else { pity.c4++; pity.c5++; }
  pity.total++;

  return { ...meta, ...who };
}

/**
 * 複数回引く。ステップアップ等の確定枠は「残り回数 <= 未達成数」になった時点で強制する。
 * @param {object} opts {guarantee5:bool, guarantee4Count:int, guarantee3Count:int}
 */
export function drawMulti(pity, banner, count, r = defaultRng, opts = {}) {
  const need5 = opts.guarantee5 ? 1 : 0;
  const need4 = opts.guarantee4Count || (opts.guarantee4 ? 1 : 0);
  const need3 = opts.guarantee3Count || 0;

  let got5 = 0, got4 = 0, got3 = 0;
  const out = [];

  for (let i = 0; i < count; i++) {
    const remaining = count - i;
    let forced = null;
    if (need5 && got5 < need5 && remaining <= need5 - got5) forced = 5;
    else if (need4 && got4 < need4 && remaining <= need4 - got4) forced = 4;
    else if (need3 && got3 < need3 && remaining <= need3 - got3) forced = 3;

    const res = drawOne(pity, banner, r, forced);
    if (res.rarity >= 5) { got5++; got4++; got3++; }
    else if (res.rarity >= 4) { got4++; got3++; }
    else if (res.rarity >= 3) { got3++; }
    out.push(res);
  }
  return out;
}

/* ---------------- 提供割合の開示用データ（JOGA/CESA 準拠の形） ---------------- */

/**
 * バナーごとの提供割合表。個別排出率まで開示する（NOTES A3）。
 */
export function rateTable(banner) {
  const rows = [];
  const add = (label, rate, items) => rows.push({ label, rate, items });

  const pu5 = banner.pickup5 || [];
  const pu4 = banner.pickup4 || [];

  if (pu5.length) {
    add('★5 ピックアップ', BASE_RATES[5] * PICKUP_RATE, pu5.map((id) => ({ id, rate: (BASE_RATES[5] * PICKUP_RATE) / pu5.length })));
    add('★5 その他', BASE_RATES[5] * PICKUP_RATE, STANDARD_POOL_5.map((id) => ({ id, rate: (BASE_RATES[5] * PICKUP_RATE) / STANDARD_POOL_5.length })));
  } else {
    add('★5', BASE_RATES[5], STANDARD_POOL_5.map((id) => ({ id, rate: BASE_RATES[5] / STANDARD_POOL_5.length })));
  }

  if (pu4.length) {
    add('★4 ピックアップ', BASE_RATES[4] * PICKUP_RATE, pu4.map((id) => ({ id, rate: (BASE_RATES[4] * PICKUP_RATE) / pu4.length })));
    add('★4 その他', BASE_RATES[4] * PICKUP_RATE, STANDARD_POOL_4.map((id) => ({ id, rate: (BASE_RATES[4] * PICKUP_RATE) / STANDARD_POOL_4.length })));
  } else {
    add('★4', BASE_RATES[4], STANDARD_POOL_4.map((id) => ({ id, rate: BASE_RATES[4] / STANDARD_POOL_4.length })));
  }

  add('★3', BASE_RATES[3], POOL_3.map((id) => ({ id, rate: BASE_RATES[3] / POOL_3.length })));
  add('★2', BASE_RATES[2], POOL_2.map((id) => ({ id, rate: BASE_RATES[2] / POOL_2.length })));
  add('★1', BASE_RATES[1], POOL_1.map((id) => ({ id, rate: BASE_RATES[1] / POOL_1.length })));

  return rows;
}

/** 天井までの残回数など、UI に出す要約。 */
export function pitySummary(pity) {
  return {
    to5: Math.max(0, PITY_CFG[5].hard - pity.c5),
    to4: Math.max(0, PITY_CFG[4].hard - pity.c4),
    toSoft5: Math.max(0, PITY_CFG[5].softStart - 1 - pity.c5),
    inSoft5: pity.c5 + 1 >= PITY_CFG[5].softStart,
    guaranteed5: !!pity.guaranteed5,
    guaranteed4: !!pity.guaranteed4,
    c5: pity.c5,
    c4: pity.c4,
    hard5: PITY_CFG[5].hard,
    hard4: PITY_CFG[4].hard,
  };
}

/**
 * ソフト天井込みの★5実効確率（＝平均何連で1体出るかの逆数）。
 * 開示用に計算しておく。
 */
export function computeEffective5Rate() {
  let survive = 1, expected = 0;
  for (let n = 1; n <= PITY_CFG[5].hard; n++) {
    const p = rate5(n);
    expected += survive * p * n;
    survive *= 1 - p;
    if (survive <= 0) break;
  }
  return { avgPulls: expected, rate: 1 / expected };
}
