/** アプリシェル：ヘッダ・タブ・画面遷移・デイリー。 */
import { h, clear, qs, on, prefersReducedMotion } from '../util/dom.js';
import { state } from '../game/state.js';
import { sfx, bgm, engine, initAudio } from '../audio/index.js';
import { stage } from '../fx/stage.js';
import { currencyChip } from './components.js';
import { summonScreen, refreshSummonScreen } from './summonScreen.js';
import { collectionScreen, refreshCollection } from './collectionScreen.js';
import { shopScreen, refreshShop } from './shopScreen.js';
import { recordsScreen, refreshRecords } from './recordsScreen.js';
import { settingsScreen, refreshSettings } from './settingsScreen.js';
import { modal } from './modal.js';
import { toast } from './toast.js';
import { num, untilMidnight } from '../util/format.js';
import { tween } from '../util/tween.js';

const TABS = [
  { id: 'summon', label: '召喚', icon: '✦', build: summonScreen, refresh: refreshSummonScreen, mood: 'banner' },
  { id: 'collection', label: '図鑑', icon: '❖', build: collectionScreen, refresh: refreshCollection, mood: 'home' },
  { id: 'shop', label: '交換', icon: '⇄', build: shopScreen, refresh: refreshShop, mood: 'home' },
  { id: 'records', label: '記録', icon: '≡', build: recordsScreen, refresh: refreshRecords, mood: 'home' },
  { id: 'settings', label: '設定', icon: '⚙', build: settingsScreen, refresh: refreshSettings, mood: 'home' },
];

let currentTab = 'summon';
let screensEl = null;
let tabbarEl = null;
let walletEl = null;

export function buildApp() {
  const app = qs('#app-ui');
  clear(app);

  /* ── ヘッダ ── */
  walletEl = h('div.wallet');
  const header = h('header.topbar',
    h('div.topbar__brand',
      h('span.topbar__mark', '✦'),
      h('span.topbar__name', '星霊召喚'),
    ),
    walletEl,
    h('button.topbar__daily', { id: 'daily-btn', onclick: openDaily, 'aria-label': 'デイリーボーナス' }, '✧'),
  );
  app.appendChild(header);

  /* ── 画面 ── */
  screensEl = h('main.screens', { id: 'screens' });
  app.appendChild(screensEl);

  /* ── タブ ── */
  tabbarEl = h('nav.tabbar', { 'aria-label': 'メインメニュー' });
  for (const t of TABS) {
    tabbarEl.appendChild(h(`button.tabbtn${t.id === currentTab ? '.is-on' : ''}`, {
      dataset: { tab: t.id },
      'aria-label': t.label,
      onclick: () => switchTab(t.id),
    },
      h('span.tabbtn__icon', { 'aria-hidden': 'true' }, t.icon),
      h('span.tabbtn__label', { text: t.label }),
    ));
  }
  app.appendChild(tabbarEl);

  renderWallet();
  switchTab(currentTab, true);

  on(window, 'stella:currency', renderWallet);
  state.on('currency', renderWallet);
  state.on('achievements', () => { renderWallet(); });

  // キーボードショートカット
  on(document, 'keydown', (e) => {
    if (document.body.classList.contains('is-summoning')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const idx = '12345'.indexOf(e.key);
    if (idx >= 0) { switchTab(TABS[idx].id); }
  });

}

/** 初回案内が終わってから呼ぶ（モーダルが二重に開かないように）。 */
export function startDailyCheck() { checkDailyOnStart(); }

function renderWallet() {
  if (!walletEl) return;
  clear(walletEl);
  walletEl.appendChild(currencyChip('gems', state.gems));
  walletEl.appendChild(currencyChip('shards', state.shards));
  walletEl.appendChild(currencyChip('chips', state.chips));
  const btn = qs('#daily-btn');
  if (btn) btn.classList.toggle('has-badge', !state.dailyStatus().claimed);
}

export function switchTab(id, instant = false) {
  const tab = TABS.find((t) => t.id === id);
  if (!tab) return;
  if (id !== currentTab) sfx.play('swipe');
  currentTab = id;
  for (const b of tabbarEl.querySelectorAll('.tabbtn')) {
    b.classList.toggle('is-on', b.dataset.tab === id);
  }
  const old = screensEl.firstElementChild;
  const next = tab.build();
  next.classList.add('is-entering');
  clear(screensEl);
  screensEl.appendChild(next);
  screensEl.scrollTop = 0;
  requestAnimationFrame(() => next.classList.remove('is-entering'));
  bgm.setMood(tab.mood, 1.5);
  stage.setFocus(id === 'summon' ? 0.42 : 0.5);
}

/* ───────────── デイリー ───────────── */

function checkDailyOnStart() {
  const d = state.dailyStatus();
  if (!d.claimed) setTimeout(() => openDaily(), 700);
}

function openDaily() {
  const d = state.dailyStatus();
  if (d.claimed) {
    modal({
      title: 'デイリーボーナス',
      body: h('div.daily',
        h('p', '本日のボーナスは受け取り済みです。'),
        h('p.daily__timer', { text: `次のボーナスまで ${untilMidnight()}` }),
        h('p.daily__streak', { text: `連続ログイン ${d.streak} 日` }),
      ),
    });
    return;
  }
  const got = state.claimDaily();
  if (!got) return;
  sfx.play('reward');
  renderWallet();
  modal({
    title: 'デイリーボーナス',
    body: h('div.daily.is-claim',
      h('div.daily__icon', '✧'),
      h('p.daily__streak', { text: `連続ログイン ${got.streak} 日目` }),
      h('div.daily__items',
        h('div.daily__item', h('b', `◆ ${num(got.gems)}`), h('span', '星晶石')),
        h('div.daily__item', h('b', `✧ ${got.tickets}`), h('span', '召喚符')),
      ),
      got.bonus ? h('p.daily__bonus', { text: `連続ログインボーナス +${num(got.bonus)}` }) : null,
      h('p.daily__note', '無料召喚も1日1回利用できます。'),
    ),
    actions: [{ label: '受け取る', primary: true }],
  });
  state.checkAchievements();
}

/* ───────────── 初回起動 ───────────── */

export function firstRunFlow() {
  return new Promise((resolve) => {
    const reduce = prefersReducedMotion();
    if (reduce) {
      state.settings.reduceMotion = true;
      state.settings.reduceFlash = true;
      state.saveSettings();
    }
    const body = h('div.intro',
      h('p.intro__lead', '『星霊召喚 -STELLA SUMMON-』へようこそ。'),
      h('p', 'ソーシャルゲームのガチャ演出を研究し、映像も効果音もすべてコードで生成して再現した体験シミュレータです。'),
      h('div.intro__warn',
        h('strong', '⚠ 光の点滅に関する注意'),
        h('p', '本作の演出には強い光の変化が含まれます。光過敏性発作の既往がある方、体調のすぐれない方はご注意ください。下のボタンから、いつでも控えめな演出に切り替えられます。'),
      ),
      h('div.intro__opts',
        h('label.intro__opt',
          h('input', {
            type: 'checkbox', id: 'intro-reduce', checked: reduce ? true : null,
          }),
          h('span', '演出を控えめにする（揺れ・強い点滅を抑える）'),
        ),
      ),
      h('ul.intro__facts',
        h('li', '課金要素は一切ありません。'),
        h('li', '確率操作は行っていません。すべての提供割合と天井仕様を開示しています。'),
        h('li', 'ヘッドホン推奨。低音まで含めて設計しています。'),
      ),
    );
    modal({
      title: 'はじめに',
      body, wide: true,
      actions: [{
        label: '召喚をはじめる', primary: true,
        onClick: (close) => {
          const cb = qs('#intro-reduce');
          if (cb && cb.checked) {
            state.settings.reduceMotion = true;
            state.settings.reduceFlash = true;
          }
          state.saveSettings();
          state.data.firstRun = false;
          state.data.pseAcknowledged = true;
          state.save(true);
          close();
          resolve();
        },
      }],
      onClose: () => resolve(),
    });
  });
}
