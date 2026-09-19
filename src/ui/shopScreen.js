/** 交換所。祈刻（確定天井）と星片（重複変換）での交換。 */
import { h, clear } from '../util/dom.js';
import { CATALOG, charById } from '../game/catalog.js';
import { RARITY } from '../game/rarity.js';
import { state, ECONOMY } from '../game/state.js';
import { exchangeChips, exchangeShards, SummonError } from '../game/summon.js';
import { LIMITED_EXCLUSIVE_5, STANDARD_POOL_5, BANNERS } from '../game/banners.js';
import { crestSVG } from '../fx/crest.js';
import { sfx } from '../audio/index.js';
import { confirmDialog } from './modal.js';
import { toast, toastError } from './toast.js';
import { stars, currencyChip } from './components.js';
import { num } from '../util/format.js';
import { stage } from '../fx/stage.js';
import { KIND } from '../fx/particles.js';

let root = null;
let tab = 'chips';

export function shopScreen() {
  root = h('section.screen.screen--shop');
  render();
  return root;
}

function render() {
  clear(root);
  root.appendChild(h('div.shop-head',
    h('div.shop-wallet',
      currencyChip('chips', state.chips),
      currencyChip('shards', state.shards),
    ),
    h('div.tabs',
      tabBtn('chips', '祈刻交換'),
      tabBtn('shards', '星片交換'),
    ),
  ));

  if (tab === 'chips') renderChips();
  else renderShards();
}

function tabBtn(id, label) {
  return h(`button.tab${tab === id ? '.is-on' : ''}`, {
    onclick: () => { sfx.play('tap'); tab = id; render(); },
  }, label);
}

function renderChips() {
  const cost = ECONOMY.chipCostUR;
  root.appendChild(h('p.shop-lead',
    `1連ごとに「祈刻」を1枚獲得します。${cost}枚で、任意の★5星霊と確定交換できます（＝最終的な天井）。`));

  const progress = Math.min(1, state.chips / cost);
  root.appendChild(h('div.shop-progress',
    h('div.shop-progress__bar', h('div.shop-progress__fill', { style: { width: (progress * 100).toFixed(1) + '%' } })),
    h('div.shop-progress__text', { text: `${num(state.chips)} / ${cost}` }),
  ));

  const ids = [...LIMITED_EXCLUSIVE_5, ...STANDARD_POOL_5];
  const grid = h('div.shop-grid');
  for (const id of ids) {
    const c = charById(id);
    if (!c) continue;
    const limited = LIMITED_EXCLUSIVE_5.includes(id);
    const can = state.chips >= cost;
    grid.appendChild(h(`div.shopitem.shopitem--r5${can ? '' : '.is-locked'}`,
      h('div.shopitem__art', { html: crestSVG(c, { size: 92 }) }),
      h('div.shopitem__meta',
        stars(5, { small: true }),
        h('div.shopitem__name', { text: c.name }),
        h('div.shopitem__title', { text: c.title }),
        limited ? h('span.shopitem__tag', '限定') : null,
        h('span.shopitem__own', { text: `所持 ${state.ownedCount(id)}` }),
      ),
      h('button.btn.btn--primary.shopitem__btn', {
        disabled: !can,
        onclick: () => doChipExchange(c),
      }, `⧗ ${cost}`),
    ));
  }
  root.appendChild(grid);
}

function renderShards() {
  root.appendChild(h('p.shop-lead',
    '重複した星霊は「星片」になります。星片は任意の星霊との交換に使えます。'));

  const costs = ECONOMY.shardCost;
  root.appendChild(h('div.shop-costs',
    ...[5, 4, 3].map((r) => h('div.shop-cost',
      h('span', { text: RARITY[r].label }), h('b', { text: `✦${num(costs[r])}` }))),
  ));

  const grid = h('div.shop-grid');
  for (const c of CATALOG.filter((x) => x.rarity >= 3).sort((a, b) => b.rarity - a.rarity)) {
    const cost = costs[c.rarity];
    if (!cost) continue;
    const can = state.shards >= cost;
    grid.appendChild(h(`div.shopitem.shopitem--r${c.rarity}${can ? '' : '.is-locked'}`,
      h('div.shopitem__art', { html: crestSVG(c, { size: 84 }) }),
      h('div.shopitem__meta',
        stars(c.rarity, { small: true }),
        h('div.shopitem__name', { text: c.name }),
        h('span.shopitem__own', { text: `所持 ${state.ownedCount(c.id)}` }),
      ),
      h('button.btn.shopitem__btn', {
        disabled: !can,
        onclick: () => doShardExchange(c),
      }, `✦ ${num(cost)}`),
    ));
  }
  root.appendChild(grid);
}

async function doChipExchange(c) {
  sfx.play('tap');
  const ok = await confirmDialog({
    title: '祈刻交換',
    message: `「${c.name}」と交換します。祈刻 ${ECONOMY.chipCostUR} 枚を消費します。よろしいですか？`,
    confirmLabel: '交換する',
  });
  if (!ok) return;
  try {
    const res = exchangeChips(c.id);
    celebrate(c, res.isNew);
    state.checkAchievements();
    render();
  } catch (e) {
    toastError(e instanceof SummonError ? e.message : '交換に失敗しました');
  }
}

async function doShardExchange(c) {
  sfx.play('tap');
  const cost = ECONOMY.shardCost[c.rarity];
  const ok = await confirmDialog({
    title: '星片交換',
    message: `「${c.name}」と交換します。星片 ${num(cost)} を消費します。よろしいですか？`,
    confirmLabel: '交換する',
  });
  if (!ok) return;
  try {
    const res = exchangeShards(c.id);
    celebrate(c, res.isNew);
    state.checkAchievements();
    render();
  } catch (e) {
    toastError(e instanceof SummonError ? e.message : '交換に失敗しました');
  }
}

function celebrate(c, isNew) {
  sfx.play(c.rarity >= 5 ? 'fanfare5' : 'reward');
  stage.post.doFlash(c.rarity >= 5 ? 0.5 : 0.2, RARITY[c.rarity].color, 6);
  stage.post.shake(c.rarity >= 5 ? 0.4 : 0.15);
  stage.burst(RARITY[c.rarity].tier, RARITY[c.rarity].color, RARITY[c.rarity].color2);
  toast(`${c.name} を入手${isNew ? '（NEW）' : ''}`, { duration: 3000, sound: false });
  window.dispatchEvent(new CustomEvent('stella:currency'));
}

export function refreshShop() { if (root) render(); }
