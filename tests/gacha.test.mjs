/** 抽選エンジンの統計検証。100万回規模で公称レート・天井・50/50 を確認する。 */
import { test, assert, eq, near, group } from './harness.mjs';
import { createRng } from '../src/util/rng.js';
import {
  BASE_RATES, PITY_CFG, rate5, rate4, newPity, drawOne, drawMulti,
  effectiveRates, computeEffective5Rate, rateTable, normalizePity,
} from '../src/game/gacha.js';
import { bannerById, STANDARD_POOL_5, LIMITED_EXCLUSIVE_5 } from '../src/game/banners.js';
import { charById, CATALOG } from '../src/game/catalog.js';

group('レートテーブルの整合性');

test('基礎提供割合の合計が 1', () => {
  const sum = Object.values(BASE_RATES).reduce((a, b) => a + b, 0);
  near(sum, 1, 1e-9);
});

test('実効レートはどのカウンタでも合計 1', () => {
  for (let c5 = 0; c5 < PITY_CFG[5].hard; c5++) {
    for (const c4 of [0, 5, 8, 9]) {
      const r = effectiveRates({ c5, c4 });
      const sum = Object.values(r).reduce((a, b) => a + b, 0);
      near(sum, 1, 1e-9, `c5=${c5} c4=${c4}`);
    }
  }
});

test('ソフト天井の曲線が仕様通り', () => {
  near(rate5(1), 0.006, 1e-9);
  near(rate5(73), 0.006, 1e-9);
  near(rate5(74), 0.066, 1e-9);
  near(rate5(80), 0.426, 1e-9);
  near(rate5(89), 0.966, 1e-9);
  eq(rate5(90), 1);
  near(rate4(8), 0.051, 1e-9);
  near(rate4(9), 0.351, 1e-9);
  eq(rate4(10), 1);
});

test('提供割合表の各行と個別レートが一致する', () => {
  for (const b of ['celestial', 'eternal']) {
    const rows = rateTable(bannerById(b));
    let total = 0;
    for (const row of rows) {
      const sum = row.items.reduce((a, i) => a + i.rate, 0);
      near(sum, row.rate, 1e-9, `${b} / ${row.label}`);
      for (const it of row.items) assert(charById(it.id), `未知のID ${it.id}`);
      total += row.rate;
    }
    near(total, 1, 1e-9, `${b} 合計`);
  }
});

group('天井（ピティ）の挙動');

test('90連以内に必ず★5が出る（10万回試行）', () => {
  const r = createRng(12345);
  const banner = bannerById('celestial');
  let worst = 0;
  for (let trial = 0; trial < 3000; trial++) {
    const pity = newPity();
    let n = 0;
    while (true) {
      n++;
      const res = drawOne(pity, banner, r);
      if (res.rarity === 5) break;
      assert(n <= PITY_CFG[5].hard, `${n} 連で★5が出なかった`);
    }
    worst = Math.max(worst, n);
  }
  assert(worst <= 90, `最悪ケース ${worst} 連`);
  assert(worst >= 80, `ソフト天井を超えるケースが観測されない（worst=${worst}）`);
});

test('10連以内に必ず★4以上が出る', () => {
  const r = createRng(777);
  const banner = bannerById('eternal');
  for (let trial = 0; trial < 5000; trial++) {
    const pity = newPity();
    let ok = false;
    for (let i = 0; i < 10; i++) {
      const res = drawOne(pity, banner, r);
      if (res.rarity >= 4) { ok = true; break; }
    }
    assert(ok, '10連に★4以上が含まれなかった');
  }
});

test('★5でも★4カウンタがリセットされる', () => {
  const pity = newPity();
  pity.c4 = 7; pity.c5 = 89;
  const r = createRng(1);
  const res = drawOne(pity, bannerById('eternal'), r);
  eq(res.rarity, 5);
  eq(pity.c4, 0);
  eq(pity.c5, 0);
});

group('確率の実測（100万連）');

const N = 1_000_000;
const r = createRng(20260919);
const banner = bannerById('celestial');
const pity = newPity();
const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
let pickup5 = 0, miss5 = 0, pickup4 = 0, miss4 = 0;
let guaranteedHonored = true;
let prevGuaranteed5 = false;
const gaps = [];
let sinceLast5 = 0;

for (let i = 0; i < N; i++) {
  const wasGuaranteed = pity.guaranteed5;
  const res = drawOne(pity, banner, r);
  counts[res.rarity]++;
  sinceLast5++;
  if (res.rarity === 5) {
    gaps.push(sinceLast5);
    sinceLast5 = 0;
    if (res.isPickup) pickup5++; else miss5++;
    if (wasGuaranteed && !res.isPickup) guaranteedHonored = false;
  }
  if (res.rarity === 4) { if (res.isPickup) pickup4++; else miss4++; }
  prevGuaranteed5 = pity.guaranteed5;
}

test('★5の実効確率が理論値（ソフト天井込み）と一致', () => {
  const theory = computeEffective5Rate();
  const observed = counts[5] / N;
  near(observed, theory.rate, theory.rate * 0.04,
    `実測 ${(observed * 100).toFixed(4)}% / 理論 ${(theory.rate * 100).toFixed(4)}%`);
  assert(theory.avgPulls > 55 && theory.avgPulls < 70, `平均 ${theory.avgPulls.toFixed(2)} 連`);
});

test('★4の実効確率が妥当（10連保証込みで 13% 前後）', () => {
  const observed = counts[4] / N;
  assert(observed > 0.10 && observed < 0.18, `実測 ${(observed * 100).toFixed(3)}%`);
});

test('★3以下の比率が基礎レートの比を保っている', () => {
  const low = counts[3] + counts[2] + counts[1];
  near(counts[3] / low, BASE_RATES[3] / (BASE_RATES[3] + BASE_RATES[2] + BASE_RATES[1]), 0.01);
  near(counts[2] / low, BASE_RATES[2] / (BASE_RATES[3] + BASE_RATES[2] + BASE_RATES[1]), 0.01);
});

test('★5ピックアップ率が 50/50 + すり抜け確定で 2/3 前後になる', () => {
  const ratio = pickup5 / (pickup5 + miss5);
  // 50% で当たり、外れたら次は確定 → 期待値は 2/3
  near(ratio, 2 / 3, 0.02, `実測 ${(ratio * 100).toFixed(2)}%`);
});

test('★4ピックアップ率も 2/3 前後', () => {
  const ratio = pickup4 / (pickup4 + miss4);
  near(ratio, 2 / 3, 0.02, `実測 ${(ratio * 100).toFixed(2)}%`);
});

test('すり抜け後の確定が必ず守られている', () => {
  assert(guaranteedHonored, 'guaranteed5 が立っているのにピックアップ以外が出た');
});

test('平均 ★5 間隔が 55〜70 連', () => {
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert(avg > 55 && avg < 70, `平均 ${avg.toFixed(2)} 連`);
});

test('★5間隔の最大値が 90 を超えない', () => {
  eq(Math.max(...gaps), Math.min(90, Math.max(...gaps)));
  assert(Math.max(...gaps) <= 90);
});

test('★5間隔の最頻値帯がソフト天井域(74-80)にある', () => {
  const hist = new Map();
  for (const g of gaps) hist.set(g, (hist.get(g) || 0) + 1);
  let best = 0, bestN = 0;
  for (const [g, n] of hist) if (n > bestN) { bestN = n; best = g; }
  assert(best >= 74 && best <= 82, `最頻 ${best} 連`);
});

group('ピックアップ・プールの整合性');

test('限定★5は恒常プールに含まれない', () => {
  for (const id of LIMITED_EXCLUSIVE_5) assert(!STANDARD_POOL_5.includes(id), id);
});

test('恒常バナーから限定★5は絶対に出ない（20万連）', () => {
  const r2 = createRng(999);
  const p = newPity();
  const b = bannerById('eternal');
  for (let i = 0; i < 200000; i++) {
    const res = drawOne(p, b, r2);
    if (res.rarity === 5) assert(!LIMITED_EXCLUSIVE_5.includes(res.charId), `恒常から ${res.charId}`);
  }
});

test('排出された ID はすべてカタログに存在する', () => {
  const r3 = createRng(4242);
  const p = newPity();
  for (const bid of ['celestial', 'eclipse', 'eternal', 'stepup']) {
    const b = bannerById(bid);
    for (let i = 0; i < 20000; i++) {
      const res = drawOne(p, b, r3);
      const c = charById(res.charId);
      assert(c, `未知のID ${res.charId}`);
      eq(c.rarity, res.rarity, `レアリティ不一致 ${res.charId}`);
    }
  }
});

group('ステップアップの確定枠');

test('guarantee5 指定で必ず★5が1枚含まれる', () => {
  const r4 = createRng(31337);
  for (let t = 0; t < 2000; t++) {
    const p = newPity();
    const res = drawMulti(p, bannerById('stepup'), 10, r4, { guarantee5: true });
    eq(res.length, 10);
    assert(res.some((x) => x.rarity === 5), '★5が含まれない');
  }
});

test('guarantee4Count:2 で★4以上が2枚以上', () => {
  const r5 = createRng(555);
  for (let t = 0; t < 2000; t++) {
    const p = newPity();
    const res = drawMulti(p, bannerById('stepup'), 10, r5, { guarantee4Count: 2 });
    assert(res.filter((x) => x.rarity >= 4).length >= 2, '★4以上が2枚未満');
  }
});

group('堅牢性');

test('壊れたピティを安全に正規化する', () => {
  const p = normalizePity({ c5: 'abc', c4: -5, guaranteed5: 'yes', total: NaN });
  eq(p.c5, 0); eq(p.c4, 0); eq(p.guaranteed5, true); eq(p.total, 0);
  const p2 = normalizePity(null);
  eq(p2.c5, 0);
  const p3 = normalizePity({ c5: 9999 });
  eq(p3.c5, 89);
});

test('カタログに重複IDがない', () => {
  const ids = new Set(CATALOG.map((c) => c.id));
  eq(ids.size, CATALOG.length);
});
