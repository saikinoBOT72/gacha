/**
 * 抽選結果 → 演出プラン（StagePlan）。
 *
 * ここが「結果」と「演出」の唯一の接続点。演出ディレクタ（ui/summon.js）は
 * StagePlan を再生するだけで、抽選には一切触れない（NOTES A2 / E1）。
 *
 * ── オーラ段階（tier）の意味論 ─────────────────────────────
 *  tier は「下限の宣言」である。
 *    tier0 白  … 宣言なし
 *    tier1 青  … ★2以上
 *    tier2 銀  … ★3以上 確定
 *    tier3 金  … ★4以上 確定   ← ★5 がここから出ることが稀にある（最高の裏切り）
 *    tier4 虹  … ★5 確定
 *  不変条件: 宣言した下限は必ず守られる（finalTier の下限 <= 実際のレアリティ）。
 *  この不変条件は tests/stageplan.test.mjs で検証する。
 * ──────────────────────────────────────────────
 */
import { rng as defaultRng, shuffle } from '../util/rng.js';
import { tierOf } from './rarity.js';

/* ───────────── 演出タイミング定数（秒） ───────────── */
export const T = {
  // 単発
  dim: 0.00,
  orbLaunch: 0.30,
  orbImpact: 0.72,
  circleIgnite: 0.92,
  chargeStart: 0.95,
  chargeDur: 1.25,
  auraReveal: 2.20,
  stepGap: 0.62,      // 昇格1段あたりの所要
  stepSilence: 0.22,  // 昇格前の「タメ」
  burstAfterAura: 0.34,
  cutInDur: 1.45,
  cardFly: 0.55,
  cardFlip: 0.42,
  starStep: 0.13,
  afterglow: 0.9,

  // 10連
  multiLaunchStagger: 0.055,
  multiSkyBurst: 0.95,
  multiDealStart: 1.25,
  multiDealStagger: 0.075,
  multiBackUpgradeAt: 2.35,
  multiFlipStagger: 0.16,
};

/**
 * 昇格段数の抽選テーブル。index = 段数（0=ストレート）。
 * finalTier ごとに配列を持つ。合計は 1。
 */
const UPGRADE_TABLE = {
  0: [1.00],
  1: [0.82, 0.18],
  2: [0.62, 0.28, 0.10],
  3: [0.45, 0.30, 0.18, 0.07],
  4: [0.38, 0.27, 0.20, 0.12, 0.03], // 4段昇格（白→虹）は 3%。約1100連に1度の伝説。
};

/**
 * レアリティ → 最終オーラ段階の抽選。
 * 「下限の宣言」なので、実際のレアリティより低い段階で止めることがある（＝めくりでの逆転）。
 */
const FINAL_TIER_TABLE = {
  1: [[0, 1.00]],
  2: [[1, 0.95], [0, 0.05]],
  3: [[2, 0.92], [1, 0.08]],
  4: [[3, 1.00]],
  5: [[4, 0.94], [3, 0.06]], // 6%：金オーラから★5が出る「金からの★5」
};

function rollWeighted(pairs, r) {
  let x = r();
  for (const [v, p] of pairs) { x -= p; if (x < 0) return v; }
  return pairs[pairs.length - 1][0];
}

function rollSteps(finalTier, r) {
  const table = UPGRADE_TABLE[finalTier] || [1];
  let x = r();
  for (let i = 0; i < table.length; i++) { x -= table[i]; if (x < 0) return i; }
  return 0;
}

/** 各昇格段の SFX 名。段が進むほど音を変える（NOTES E5）。 */
const STEP_SFX = ['crackle1', 'crackle2', 'crackle3', 'crackle3'];

/**
 * 1件の結果に対する「キュー（演出の芯）」を組む。
 */
export function buildCue(result, r = defaultRng, opts = {}) {
  const rarity = result.rarity;
  const maxTier = tierOf(rarity);
  let finalTier = rollWeighted(FINAL_TIER_TABLE[rarity], r);
  if (opts.forceTier !== undefined) finalTier = opts.forceTier;
  finalTier = Math.min(finalTier, maxTier);

  const steps = rollSteps(finalTier, r);
  const startTier = Math.max(0, finalTier - steps);

  const stepList = [];
  let at = T.auraReveal + 0.42;
  for (let i = 0; i < steps; i++) {
    stepList.push({
      tier: startTier + i + 1,
      at,
      silenceAt: at - T.stepSilence,
      sfx: STEP_SFX[Math.min(i, STEP_SFX.length - 1)],
      isFinal: i === steps - 1,
    });
    at += T.stepGap;
  }

  const burstAt = (stepList.length ? stepList[stepList.length - 1].at : T.auraReveal) + T.burstAfterAura;

  // 特殊ゲート：★5のみ、3%。開幕で画面が暗転し、星が降る＝実質の確定演出。
  const specialGate = rarity === 5 && r() < 0.03 ? 'blackout' : null;

  const cutIn = rarity === 5 || (rarity === 4 && r() < 0.35);
  const cameraMove =
    finalTier >= 4 ? 'orbit' : finalTier === 3 ? 'slam' : finalTier === 2 ? 'push' : 'static';

  return {
    rarity,
    finalTier,
    startTier,
    steps: stepList,
    stepCount: steps,
    burstAt,
    rainbowConfirm: finalTier >= 4,
    goldSurprise: finalTier === 3 && rarity === 5, // 金オーラからの★5
    specialGate,
    cutIn,
    cutInFull: rarity === 5,
    cameraMove,
    intensity: Math.min(1, finalTier / 4 + (rarity === 5 ? 0.15 : 0)),
    /** 語り草になる体験かどうか（実績判定にも使う） */
    legendary: steps >= 3 || specialGate !== null,
  };
}

/** カード裏面の色（10連のヒント）。オーラと同じ「下限の宣言」規則に従う。 */
function rollBackTier(rarity, r) {
  const maxTier = tierOf(rarity);
  // 裏面はオーラよりやや控えめに（ヒントを出しすぎない）
  if (rarity === 5) return r() < 0.55 ? 4 : 3;
  if (rarity === 4) return r() < 0.80 ? 3 : 2;
  if (rarity === 3) return r() < 0.75 ? 2 : Math.min(1, maxTier);
  if (rarity === 2) return r() < 0.70 ? 1 : 0;
  return 0;
}

/** 単発の演出プラン。 */
export function planSingle(result, r = defaultRng, opts = {}) {
  return {
    kind: 'single',
    results: [result],
    order: [0],
    climaxIndex: 0,
    cue: buildCue(result, r, opts),
    backs: null,
    backUpgrades: null,
  };
}

/**
 * 連続ガチャの演出プラン。
 *  - めくり順はシャッフルするが、**最良札は必ず最後**（RESEARCH §1.4 / NOTES E6）
 *  - 裏面色は昇格前の値を持ち、配り終え後に一部が昇格する
 */
export function planMulti(results, r = defaultRng, opts = {}) {
  const n = results.length;
  const idx = shuffle(results.map((_, i) => i), r);

  // 最高レアの1枚を最後へ。同率なら先に現れた方を採用（シャッフル済みなので実質ランダム）。
  let bestPos = 0;
  for (let i = 1; i < idx.length; i++) {
    if (results[idx[i]].rarity > results[idx[bestPos]].rarity) bestPos = i;
  }
  const order = idx.slice();
  const [best] = order.splice(bestPos, 1);
  order.push(best);
  const climaxIndex = best;

  // 裏面（配り時点の色）
  const backsFinal = results.map((res) => rollBackTier(res.rarity, r));
  const backs = backsFinal.slice();
  const backUpgrades = [];
  for (let i = 0; i < n; i++) {
    // 裏面昇格：最終色が 2 以上のカードのうち 35% が 1段下から始まる
    if (backsFinal[i] >= 2 && r() < 0.35) {
      backs[i] = backsFinal[i] - 1;
      backUpgrades.push({
        index: i,
        from: backs[i],
        to: backsFinal[i],
        at: T.multiBackUpgradeAt + backUpgrades.length * 0.28,
      });
    }
  }

  const cue = buildCue(results[climaxIndex], r, opts);

  return {
    kind: 'multi',
    results,
    order,
    climaxIndex,
    cue,
    backs,
    backsFinal,
    backUpgrades,
    /** 全体の最高レアリティ（結果画面の盛り上げに使う） */
    topRarity: results.reduce((a, b) => Math.max(a, b.rarity), 1),
  };
}

/** 演出全体のおおよその長さ（秒）。スキップUIの表示やテストに使う。 */
export function estimateDuration(plan) {
  const c = plan.cue;
  let t = c.burstAt + 0.4;
  if (c.cutIn) t += c.cutInFull ? T.cutInDur : T.cutInDur * 0.55;
  t += T.cardFly + T.cardFlip + T.starStep * plan.results[plan.climaxIndex].rarity + T.afterglow;
  if (plan.kind === 'multi') t += T.multiDealStart + plan.results.length * T.multiDealStagger + 1.2;
  return t;
}
