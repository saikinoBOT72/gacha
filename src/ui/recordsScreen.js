/** 記録：統計・実績・履歴。実効確率まで開示する（NOTES A2/A4 の誠実さの実装）。 */
import { h, clear } from '../util/dom.js';
import { state } from '../game/state.js';
import { ACHIEVEMENTS } from '../game/achievements.js';
import { RARITY } from '../game/rarity.js';
import { BANNERS, bannerById } from '../game/banners.js';
import { BASE_RATES, computeEffective5Rate } from '../game/gacha.js';
import { charById } from '../game/catalog.js';
import { sfx } from '../audio/index.js';
import { stars, statRow } from './components.js';
import { num, pct, pctShort, dateJP } from '../util/format.js';
import { openDetail } from './collectionScreen.js';

let root = null;
let tab = 'stats';

export function recordsScreen() {
  root = h('section.screen.screen--records');
  render();
  return root;
}

function render() {
  clear(root);
  root.appendChild(h('div.tabs.tabs--wide',
    tabBtn('stats', '統計'),
    tabBtn('ach', '実績'),
    tabBtn('hist', '履歴'),
  ));
  if (tab === 'stats') renderStats();
  else if (tab === 'ach') renderAch();
  else renderHist();
}

function tabBtn(id, label) {
  return h(`button.tab${tab === id ? '.is-on' : ''}`, {
    onclick: () => { sfx.play('tap'); tab = id; render(); },
  }, label);
}

function renderStats() {
  const s = state.data.stats;
  const total = s.totalPulls;
  const eff = computeEffective5Rate();

  root.appendChild(h('div.panel',
    h('h3.panel__title', '召喚'),
    statRow('通算召喚回数', `${num(total)} 回`, { strong: true }),
    statRow('消費した星晶石', `◆ ${num(s.gemsSpent)}`),
    statRow('獲得した星片', `✦ ${num(s.shardsGained)}`),
    statRow('現在の祈刻', `⧗ ${num(state.chips)}`),
  ));

  const rateBox = h('div.panel', h('h3.panel__title', 'レアリティ別 実測'));
  rateBox.appendChild(h('p.panel__note',
    `公称レートは基礎提供割合です。★5/★4は天井によって実効値が上がります（★5の理論実効値：${pctShort(eff.rate)}）。`));
  const table = h('table.stat-table',
    h('thead', h('tr', h('th', ''), h('th', '回数'), h('th', '実測'), h('th', '基礎'))),
    h('tbody', ...[5, 4, 3, 2, 1].map((r) => h('tr',
      h('td', h('span.rates__rname', RARITY[r].label), stars(r, { small: true })),
      h('td', { text: num(s.byRarity[r] || 0) }),
      h('td', { text: total ? pct((s.byRarity[r] || 0) / total) : '—' }),
      h('td.is-dim', { text: pct(BASE_RATES[r]) }),
    ))),
  );
  rateBox.appendChild(table);
  root.appendChild(rateBox);

  root.appendChild(h('div.panel',
    h('h3.panel__title', '★5 の記録'),
    statRow('最短で引いた連数', s.best5Gap ? `${s.best5Gap} 連` : '—'),
    statRow('最長で引いた連数', s.worst5Gap ? `${s.worst5Gap} 連` : '—'),
    statRow('現在の未排出連数', `${s.sinceLast5} 連`),
    statRow('天井（90連）で引いた回数', `${s.hardPity5} 回`),
    statRow('ソフト天井で引いた回数', `${s.softPity5} 回`),
    statRow('50/50 勝敗', `${s.won5050} 勝 ${s.lost5050} 敗`),
    statRow('1回の10連で★5が2体', `${s.doubleUR} 回`),
  ));

  root.appendChild(h('div.panel',
    h('h3.panel__title', '演出の記録'),
    statRow('昇格演出を見た回数', `${num(s.upgrades)} 回`),
    statRow('3段昇格', `${s.upgrade3} 回`),
    statRow('4段昇格（白→虹）', `${s.upgrade4} 回`),
    statRow('金オーラからの★5', `${s.goldSurprise} 回`),
    statRow('特殊ゲート（暗転）', `${s.blackout} 回`),
  ));

  const byBanner = h('div.panel', h('h3.panel__title', '祈願別'));
  for (const b of BANNERS) {
    const n = s.byBanner[b.id] || 0;
    const p = state.data.pity[b.pityPool];
    byBanner.appendChild(statRow(b.name, `${num(n)} 回 / 天井カウンタ ${p.c5}`));
  }
  root.appendChild(byBanner);
}

function renderAch() {
  const got = state.data.achievements;
  const prog = state.achievementProgress();
  root.appendChild(h('div.ach-head',
    h('div.ach-head__num', h('b', { text: String(prog.have) }), h('span', { text: ` / ${prog.total}` })),
    h('div.col-progress__bar', h('div.col-progress__fill', { style: { width: (prog.pct * 100).toFixed(1) + '%' } })),
  ));
  const list = h('div.ach-list');
  for (const a of ACHIEVEMENTS) {
    const done = !!got[a.id];
    list.appendChild(h(`div.ach${done ? '.is-done' : ''}`,
      h('div.ach__icon', done ? '✦' : '◇'),
      h('div.ach__body',
        h('div.ach__name', { text: a.name }),
        h('div.ach__desc', { text: a.desc }),
      ),
      h('div.ach__reward', { text: `◆${num(a.reward)}` }),
      done ? h('div.ach__date', { text: dateJP(got[a.id].at) }) : null,
    ));
  }
  root.appendChild(list);
}

function renderHist() {
  const hist = state.data.history;
  if (!hist.length) { root.appendChild(h('p.empty', 'まだ召喚履歴がありません。')); return; }

  root.appendChild(h('p.panel__note', `直近 ${Math.min(hist.length, 300)} 件を表示しています（最大 3000 件まで保存）。`));
  const list = h('div.hist');
  for (const e of hist.slice(0, 300)) {
    const c = charById(e.charId);
    if (!c) continue;
    list.appendChild(h(`div.hist__row.hist__row--r${e.rarity}`, {
      onclick: () => openDetail(c), role: 'button', tabindex: '0',
      onkeydown: (ev) => { if (ev.key === 'Enter') openDetail(c); },
    },
      h('span.hist__no', { text: `#${num(e.pullNo)}` }),
      h('span.hist__stars', stars(e.rarity, { small: true })),
      h('span.hist__name', { text: c.name }),
      e.isNew ? h('span.hist__new', 'NEW') : null,
      e.isPickup ? h('span.hist__pu', 'PU') : null,
      e.rarity === 5 && e.gap ? h('span.hist__gap', { text: `${e.gap}連` }) : null,
      h('span.hist__banner', { text: bannerById(e.banner).name }),
      h('span.hist__time', { text: dateJP(e.t) }),
    ));
  }
  root.appendChild(list);
}

export function refreshRecords() { if (root) render(); }
