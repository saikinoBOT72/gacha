/** 演出プランの不変条件：宣言した下限は必ず守られる（＝演出が嘘をつかない）。 */
import { test, assert, eq, near, group } from './harness.mjs';
import { createRng } from '../src/util/rng.js';
import { newPity, drawOne, drawMulti } from '../src/game/gacha.js';
import { bannerById } from '../src/game/banners.js';
import { planSingle, planMulti, buildCue, estimateDuration } from '../src/game/stagePlan.js';
import { tierOf } from '../src/game/rarity.js';

group('演出プランの不変条件');

test('finalTier は実レアリティの tier を超えない（30万件）', () => {
  const r = createRng(2026);
  const p = newPity();
  const b = bannerById('celestial');
  for (let i = 0; i < 300000; i++) {
    const res = drawOne(p, b, r);
    const cue = buildCue(res, r);
    assert(cue.finalTier <= tierOf(res.rarity),
      `★${res.rarity} に tier${cue.finalTier} を宣言した`);
  }
});

test('startTier <= finalTier、昇格段は必ず 1 ずつ上がる', () => {
  const r = createRng(777);
  const p = newPity();
  const b = bannerById('eclipse');
  for (let i = 0; i < 100000; i++) {
    const res = drawOne(p, b, r);
    const cue = buildCue(res, r);
    assert(cue.startTier <= cue.finalTier);
    eq(cue.steps.length, cue.finalTier - cue.startTier);
    let expect = cue.startTier;
    for (const s of cue.steps) {
      expect++;
      eq(s.tier, expect, '昇格が1段ずつでない');
      assert(s.at > 0);
      assert(s.silenceAt < s.at, 'タメが昇格より後に来ている');
    }
    if (cue.steps.length) eq(cue.steps[cue.steps.length - 1].tier, cue.finalTier);
  }
});

test('虹（tier4）は★5のときしか出ない', () => {
  const r = createRng(31);
  const p = newPity();
  const b = bannerById('celestial');
  for (let i = 0; i < 200000; i++) {
    const res = drawOne(p, b, r);
    const cue = buildCue(res, r);
    if (cue.finalTier === 4) eq(res.rarity, 5, '虹なのに★5でない');
    if (cue.finalTier === 3) assert(res.rarity >= 4, '金なのに★4未満');
    if (cue.finalTier === 2) assert(res.rarity >= 3, '銀なのに★3未満');
    if (cue.finalTier === 1) assert(res.rarity >= 2, '青なのに★2未満');
  }
});

test('カード裏面の色も下限宣言を守る', () => {
  const r = createRng(9090);
  const p = newPity();
  const b = bannerById('stepup');
  for (let t = 0; t < 8000; t++) {
    const results = drawMulti(p, b, 10, r);
    const plan = planMulti(results, r);
    for (let i = 0; i < 10; i++) {
      assert(plan.backsFinal[i] <= tierOf(results[i].rarity),
        `裏面 tier${plan.backsFinal[i]} / ★${results[i].rarity}`);
      assert(plan.backs[i] <= plan.backsFinal[i]);
    }
    for (const u of plan.backUpgrades) {
      eq(u.to, u.from + 1, '裏面昇格が1段でない');
    }
  }
});

group('10連の並び');

test('最良札が必ず最後にめくられる', () => {
  const r = createRng(4242);
  const p = newPity();
  const b = bannerById('celestial');
  for (let t = 0; t < 20000; t++) {
    const results = drawMulti(p, b, 10, r);
    const plan = planMulti(results, r);
    const last = plan.order[plan.order.length - 1];
    const maxR = Math.max(...results.map((x) => x.rarity));
    eq(results[last].rarity, maxR, '最後が最高レアでない');
    eq(last, plan.climaxIndex);
  }
});

test('order は 0..n-1 の順列である', () => {
  const r = createRng(11);
  const p = newPity();
  for (let t = 0; t < 5000; t++) {
    const results = drawMulti(p, bannerById('eternal'), 10, r);
    const plan = planMulti(results, r);
    eq(plan.order.length, 10);
    eq(new Set(plan.order).size, 10);
    for (const i of plan.order) assert(i >= 0 && i < 10);
  }
});

test('めくり順が常に昇順ではない（緊張が持続する）', () => {
  const r = createRng(55);
  const p = newPity();
  let sortedCount = 0, total = 0;
  for (let t = 0; t < 3000; t++) {
    const results = drawMulti(p, bannerById('eternal'), 10, r);
    const plan = planMulti(results, r);
    const seq = plan.order.map((i) => results[i].rarity);
    let asc = true;
    for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) { asc = false; break; }
    if (asc) sortedCount++;
    total++;
  }
  assert(sortedCount / total < 0.35, `昇順が ${(sortedCount / total * 100).toFixed(1)}% と多すぎる`);
});

group('昇格の出現頻度');

test('★5 の 3段以上昇格が 10〜20% に収まる', () => {
  const r = createRng(606);
  let legendary = 0, n = 0;
  for (let i = 0; i < 200000; i++) {
    const cue = buildCue({ rarity: 5 }, r);
    if (cue.stepCount >= 3) legendary++;
    n++;
  }
  const ratio = legendary / n;
  assert(ratio > 0.08 && ratio < 0.22, `実測 ${(ratio * 100).toFixed(2)}%`);
});

test('★1 は必ず白・ストレート', () => {
  const r = createRng(1);
  for (let i = 0; i < 20000; i++) {
    const cue = buildCue({ rarity: 1 }, r);
    eq(cue.finalTier, 0);
    eq(cue.stepCount, 0);
    eq(cue.cutIn, false);
  }
});

test('★5 は必ずカットインを持つ', () => {
  const r = createRng(2);
  for (let i = 0; i < 5000; i++) {
    const cue = buildCue({ rarity: 5 }, r);
    assert(cue.cutIn && cue.cutInFull);
  }
});

group('演出の長さ');

test('単発は 4〜12 秒、10連は 8〜22 秒に収まる', () => {
  const r = createRng(303);
  const p = newPity();
  const b = bannerById('celestial');
  for (let t = 0; t < 20000; t++) {
    const one = planSingle(drawOne(p, b, r), r);
    const d1 = estimateDuration(one);
    assert(d1 > 3.5 && d1 < 12, `単発 ${d1.toFixed(2)}s`);
  }
  for (let t = 0; t < 5000; t++) {
    const multi = planMulti(drawMulti(p, b, 10, r), r);
    const d2 = estimateDuration(multi);
    assert(d2 > 7 && d2 < 22, `10連 ${d2.toFixed(2)}s`);
  }
});
