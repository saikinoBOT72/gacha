/**
 * 召喚トランザクション層。
 * 「通貨を払う → 抽選 → 所持へ反映 → 統計/履歴 → 保存 → 演出プラン生成」までを
 * **演出より先に、原子的に** 済ませる（NOTES F4: 演出中に閉じても結果は失われない）。
 */
import { rng } from '../util/rng.js';
import { state, ECONOMY } from './state.js';
import { bannerById } from './banners.js';
import { drawMulti, pitySummary } from './gacha.js';
import { planSingle, planMulti } from './stagePlan.js';
import { charById } from './catalog.js';

export class SummonError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** ステップアップの現在段の仕様を返す。 */
export function currentStep(banner) {
  if (banner.kind !== 'stepup') return null;
  const n = Math.min(Math.max(1, state.data.stepup.step), banner.steps.length);
  return banner.steps[n - 1];
}

/** 引くのに必要なコストと保証内容。 */
export function pullCost(bannerId, count, opts = {}) {
  const banner = bannerById(bannerId);
  if (banner.kind === 'stepup') {
    const step = currentStep(banner);
    return { gems: step.cost, count: step.pulls, step, guarantees: guaranteesOf(step) };
  }
  if (opts.ticket) return { gems: 0, tickets: count, count, guarantees: {} };
  if (opts.free) return { gems: 0, count, free: true, guarantees: {} };
  return {
    gems: count === 1 ? ECONOMY.costSingle : ECONOMY.costMulti * (count / 10),
    count,
    guarantees: {},
  };
}

function guaranteesOf(step) {
  const g = {};
  if (step.guarantee5) g.guarantee5 = true;
  if (step.guarantee4) g.guarantee4Count = 1;
  if (step.guarantee4Count) g.guarantee4Count = step.guarantee4Count;
  if (step.guaranteeCount3) g.guarantee3Count = step.guaranteeCount3;
  return g;
}

/**
 * 召喚を実行する。
 * @returns {{results, plan, summary, cost}}
 */
export function performSummon(bannerId, count, opts = {}) {
  const banner = bannerById(bannerId);
  const cost = pullCost(bannerId, count, opts);
  const n = cost.count;

  // ── 支払い ──
  if (opts.free) {
    if (!state.useFreePull()) throw new SummonError('no_free', '本日の無料召喚は使用済みです');
  } else if (opts.ticket) {
    for (let i = 0; i < n; i++) {
      if (!state.spendTicket()) throw new SummonError('no_ticket', '召喚チケットが足りません');
    }
  } else {
    if (!state.canAfford(cost.gems)) throw new SummonError('no_gems', '星晶石が足りません');
    state.spendGems(cost.gems);
  }

  // ── 抽選（演出は一切関与しない） ──
  const pity = state.data.pity[banner.pityPool];
  const before = { ...pity };
  const results = drawMulti(pity, banner, n, rng, cost.guarantees);

  // ── 反映 ──
  const now = Date.now();
  const st = state.data.stats;
  let urCount = 0;
  const enriched = results.map((res, i) => {
    const acq = state.acquire(res.charId, now);
    const char = charById(res.charId);
    st.totalPulls++;
    st.byRarity[res.rarity] = (st.byRarity[res.rarity] || 0) + 1;
    st.byBanner[banner.id] = (st.byBanner[banner.id] || 0) + 1;
    state.addChips(ECONOMY.chipsPerPull);

    // ★5 間隔の統計
    st.sinceLast5++;
    let gap = 0;
    if (res.rarity === 5) {
      gap = st.sinceLast5;
      st.best5Gap = st.best5Gap === 0 ? gap : Math.min(st.best5Gap, gap);
      st.worst5Gap = Math.max(st.worst5Gap, gap);
      st.sinceLast5 = 0;
      urCount++;
      if (res.hardPity5) st.hardPity5++;
      if (res.softPity5) st.softPity5++;
      if (res.won5050 === true) st.won5050++;
      if (res.won5050 === false) st.lost5050++;
    }

    const entry = {
      t: now + i,
      banner: banner.id,
      charId: res.charId,
      rarity: res.rarity,
      isPickup: !!res.isPickup,
      isNew: acq.isNew,
      pullNo: st.totalPulls,
      gap,
    };
    state.pushHistory(entry);

    return { ...res, char, isNew: acq.isNew, shards: acq.shards, gap };
  });

  if (urCount >= 2) st.doubleUR++;

  // ── ステップアップの段を進める ──
  if (banner.kind === 'stepup') {
    const total = banner.steps.length;
    if (state.data.stepup.step >= total) { state.data.stepup.step = 1; state.data.stepup.cycles++; }
    else state.data.stepup.step++;
  }

  state.data.lastBanner = banner.id;

  // ── 演出プラン（結果から逆算） ──
  const plan = n === 1 ? planSingle(enriched[0], rng) : planMulti(enriched, rng);

  // 演出統計（実績用）。プラン生成後にしか分からない値。
  if (plan.cue.stepCount >= 1) st.upgrades++;
  if (plan.cue.stepCount >= 3) st.upgrade3++;
  if (plan.cue.stepCount >= 4) st.upgrade4++;
  if (plan.cue.goldSurprise) st.goldSurprise++;
  if (plan.cue.specialGate) st.blackout++;

  // ── 保存（演出より先に確定させる） ──
  state.save(true);
  state.emit('summon', { bannerId: banner.id, results: enriched });

  const summary = buildSummary(enriched, before, pity, banner);
  return { results: enriched, plan, summary, cost, banner };
}

function buildSummary(results, pityBefore, pityAfter, banner) {
  const byRarity = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let shards = 0, news = 0, pickups = 0;
  for (const r of results) {
    byRarity[r.rarity]++;
    shards += r.shards;
    if (r.isNew) news++;
    if (r.isPickup) pickups++;
  }
  return {
    count: results.length,
    byRarity,
    shards,
    news,
    pickups,
    topRarity: results.reduce((a, b) => Math.max(a, b.rarity), 1),
    pity: pitySummary(pityAfter),
    pityBefore: pitySummary(pityBefore),
    bannerId: banner.id,
  };
}

/** 祈刻での確定交換。 */
export function exchangeChips(charId) {
  const c = charById(charId);
  if (!c || c.rarity !== 5) throw new SummonError('bad_target', '交換できない対象です');
  if (!state.spendChips(ECONOMY.chipCostUR)) throw new SummonError('no_chips', '祈刻が足りません');
  const acq = state.acquire(charId);
  state.data.stats.chipExchanges++;
  state.data.stats.byRarity[5] = (state.data.stats.byRarity[5] || 0) + 1;
  state.save(true);
  state.emit('exchange', { charId, kind: 'chip' });
  return { char: c, ...acq };
}

/** 欠片での交換。 */
export function exchangeShards(charId) {
  const c = charById(charId);
  if (!c) throw new SummonError('bad_target', '交換できない対象です');
  const cost = ECONOMY.shardCost[c.rarity];
  if (!cost) throw new SummonError('bad_target', 'このレアリティは交換対象外です');
  if (!state.spendShards(cost)) throw new SummonError('no_shards', '星片が足りません');
  const acq = state.acquire(charId);
  if (c.rarity === 5) state.data.stats.shardExchanges5++;
  state.data.stats.byRarity[c.rarity] = (state.data.stats.byRarity[c.rarity] || 0) + 1;
  state.save(true);
  state.emit('exchange', { charId, kind: 'shard' });
  return { char: c, cost, ...acq };
}
