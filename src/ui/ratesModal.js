/**
 * 提供割合の開示（NOTES A3 / JOGA・CESA ガイドライン準拠の形）。
 * 「ピティ（天井）は事前開示された仕様であり確率操作ではない」ことも明記する。
 */
import { h } from '../util/dom.js';
import { modal } from './modal.js';
import { rateTable, BASE_RATES, PITY_CFG, PICKUP_RATE, computeEffective5Rate, effectiveRates } from '../game/gacha.js';
import { charById } from '../game/catalog.js';
import { POOL_LABEL } from '../game/banners.js';
import { pct, pctShort, num } from '../util/format.js';
import { RARITY } from '../game/rarity.js';
import { state } from '../game/state.js';
import { stars } from './components.js';

export function openRates(banner) {
  const rows = rateTable(banner);
  const eff = computeEffective5Rate();
  const pity = state.data.pity[banner.pityPool];
  const live = effectiveRates(pity);

  const body = h('div.rates');

  body.appendChild(h('p.rates__lead',
    `「${banner.name}」の提供割合です。本作は実課金を伴わない体験シミュレータであり、確率操作は一切行っていません。`));

  // ── 概要表 ──
  const sum = h('table.rates__table',
    h('thead', h('tr', h('th', 'レアリティ'), h('th', '基礎提供割合'), h('th', '現在の実確率'))),
    h('tbody', ...[5, 4, 3, 2, 1].map((r) => h('tr' + (r >= 4 ? '.is-high' : ''),
      h('td', h('span.rates__rname', RARITY[r].label), stars(r, { small: true })),
      h('td', { text: pct(BASE_RATES[r]) }),
      h('td' + (live[r] > BASE_RATES[r] * 1.02 ? '.is-boost' : ''), { text: pct(live[r]) }),
    ))),
  );
  body.appendChild(h('div.rates__block', h('h3', '提供割合'), sum,
    h('p.rates__note', '「現在の実確率」は、あなたの現在の天井カウンタにソフト天井の補正を適用した実際の抽選確率です。通常この値は公開されませんが、本作では誠実さのために表示しています。')));

  // ── 天井仕様 ──
  body.appendChild(h('div.rates__block',
    h('h3', '天井（ピティ）仕様'),
    h('ul.rates__list',
      h('li', `★5 ハード天井：${PITY_CFG[5].hard} 連目で必ず★5が排出されます。`),
      h('li', `★5 ソフト天井：${PITY_CFG[5].softStart} 連目から、1連ごとに★5確率が +${(PITY_CFG[5].softStep * 100).toFixed(1)}% 加算されます。`),
      h('li', `★4 天井：${PITY_CFG[4].hard} 連目で必ず★4以上が排出されます（10連には必ず★4以上が1枚以上含まれます）。`),
      h('li', `ピックアップ：★5・★4ともに ${pct(PICKUP_RATE, 0)} の確率でピックアップ対象になります。対象外を引いた場合（すり抜け）、次の同レアリティは必ずピックアップ対象になります。`),
      h('li', `天井カウンタは同種の祈願（現在のプール：${POOL_LABEL[banner.pityPool] || banner.pityPool}）の間で引き継がれます。`),
      h('li', `1連ごとに「祈刻」を1枚獲得します。200枚でピックアップ★5と確定交換できます（＝実質的な最終天井）。`),
    ),
    h('p.rates__note', `ソフト天井を含めた★5の実効確率は約 ${pctShort(eff.rate)}（平均 ${eff.avgPulls.toFixed(1)} 連で1体）です。`),
  ));

  // ── 個別提供割合 ──
  const detail = h('div.rates__block', h('h3', '個別提供割合'));
  for (const row of rows) {
    const items = h('div.rates__items');
    for (const it of row.items) {
      const c = charById(it.id);
      if (!c) continue;
      items.appendChild(h('div.rates__item' + (c.rarity >= 4 ? '.is-high' : ''),
        h('span.rates__iname', { text: c.name }),
        h('span.rates__irate', { text: pct(it.rate, 4) }),
      ));
    }
    detail.appendChild(h('details.rates__group', { open: row.label.includes('★5') ? true : null },
      h('summary',
        h('span', { text: row.label }),
        h('strong', { text: pct(row.rate) }),
        h('span.rates__count', { text: `${row.items.length}種` }),
      ),
      items,
    ));
  }
  body.appendChild(detail);

  body.appendChild(h('p.rates__legal',
    '本作は実在のギャンブルではなく、課金要素を一切含みません。獲得できるアイテムに現金価値はありません。'));

  return modal({ title: '提供割合', body, wide: true, className: 'modal--rates' });
}
