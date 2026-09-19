/** 召喚（祈願）画面。バナー選択・天井表示・召喚ボタン。 */
import { h, clear, on, qs } from '../util/dom.js';
import { BANNERS, bannerById } from '../game/banners.js';
import { charById } from '../game/catalog.js';
import { state, ECONOMY } from '../game/state.js';
import { pitySummary } from '../game/gacha.js';
import { performSummon, pullCost, currentStep, SummonError } from '../game/summon.js';
import { crestSVG } from '../fx/crest.js';
import { stage } from '../fx/stage.js';
import { sfx, bgm } from '../audio/index.js';
import { pityPanel, stars, tierLegend } from './components.js';
import { openRates } from './ratesModal.js';
import { modal } from './modal.js';
import { toast, toastError } from './toast.js';
import { num } from '../util/format.js';
import { playSummon } from './summon.js';
import { showResult } from './resultScreen.js';

let current = 0;
let root = null;
let busy = false;

export function summonScreen() {
  root = h('section.screen.screen--summon');
  current = Math.max(0, BANNERS.findIndex((b) => b.id === state.data.lastBanner));
  render();
  return root;
}

function render() {
  if (!root) return;
  clear(root);
  const banner = BANNERS[current];
  state.data.lastBanner = banner.id;
  stage.starfield.setTint(banner.theme.a, 0.32);

  /* ── バナー本体 ── */
  const pu5 = (banner.pickup5 || []).map(charById).filter(Boolean);
  const pu4 = (banner.pickup4 || []).map(charById).filter(Boolean);
  const hero = pu5[0] || null;

  const art = h('div.banner__art');
  if (hero) art.innerHTML = crestSVG(hero, { size: 320 });
  else art.innerHTML = crestSVG(charById('ur_elpis'), { size: 320 });

  const bannerEl = h('div.banner', {
    style: { '--ba': banner.theme.a, '--bb': banner.theme.b, '--bbg': banner.theme.bg, '--bac': banner.theme.accent },
    dataset: { kind: banner.kind },
  },
    h('div.banner__bg'),
    h('div.banner__rays'),
    art,
    h('div.banner__label',
      h('div.banner__kind', { text: banner.kind === 'limited' ? 'LIMITED' : banner.kind === 'stepup' ? 'STEP UP' : 'STANDARD' }),
      h('h1.banner__name', { text: banner.name }),
      h('div.banner__sub', { text: banner.subtitle }),
    ),
    h('p.banner__copy', { text: banner.copy }),
  );

  const nav = h('div.banner-nav',
    h('button.banner-nav__btn', { 'aria-label': '前の祈願', onclick: () => move(-1) }, '‹'),
    h('div.banner-dots', ...BANNERS.map((b, i) =>
      h('button.banner-dot' + (i === current ? '.is-on' : ''), {
        'aria-label': b.name, onclick: () => go(i),
      }))),
    h('button.banner-nav__btn', { 'aria-label': '次の祈願', onclick: () => move(1) }, '›'),
  );

  /* ── ピックアップ ── */
  const pickups = h('div.pickups');
  if (pu5.length || pu4.length) {
    pickups.appendChild(h('div.pickups__head', 'ピックアップ'));
    const list = h('div.pickups__list');
    for (const c of [...pu5, ...pu4]) {
      list.appendChild(h(`div.pickup.pickup--r${c.rarity}`, {
        onclick: () => openCharInfo(c),
        role: 'button', tabindex: '0',
        onkeydown: (e) => { if (e.key === 'Enter') openCharInfo(c); },
      },
        h('div.pickup__art', { html: crestSVG(c, { size: 74 }) }),
        h('div.pickup__meta',
          stars(c.rarity, { small: true }),
          h('div.pickup__name', { text: c.name }),
        ),
      ));
    }
    pickups.appendChild(list);
  }

  /* ── ステップアップ ── */
  let stepBox = null;
  if (banner.kind === 'stepup') {
    const step = currentStep(banner);
    stepBox = h('div.stepup',
      h('div.stepup__head', `第 ${step.n} 段 / ${banner.steps.length}`),
      h('div.stepup__steps', ...banner.steps.map((s) =>
        h('div.stepup__step' + (s.n === step.n ? '.is-now' : s.n < step.n ? '.is-done' : ''),
          h('span.stepup__n', { text: `${s.n}` }),
          h('span.stepup__note', { text: s.note }),
          h('span.stepup__cost', { text: `◆${num(s.cost)}` }),
        ))),
    );
  }

  /* ── 天井 ── */
  const pity = pitySummary(state.data.pity[banner.pityPool]);
  const pityBox = pityPanel(pity);

  /* ── 操作 ── */
  const daily = state.dailyStatus();
  const singleCost = ECONOMY.costSingle;
  const multiCost = ECONOMY.costMulti;
  const isStep = banner.kind === 'stepup';
  const stepInfo = isStep ? currentStep(banner) : null;

  const actions = h('div.actions');
  if (!isStep) {
    actions.appendChild(actionBtn({
      label: '1 回 召喚', cost: singleCost, icon: '◆',
      onClick: () => doSummon(banner.id, 1, {}),
      disabled: !state.canAfford(singleCost),
    }));
    actions.appendChild(actionBtn({
      label: '10 回 召喚', cost: multiCost, icon: '◆', primary: true,
      note: '★4以上 1枚以上 確定',
      onClick: () => doSummon(banner.id, 10, {}),
      disabled: !state.canAfford(multiCost),
    }));
  } else {
    actions.appendChild(actionBtn({
      label: `第${stepInfo.n}段 10回 召喚`, cost: stepInfo.cost, icon: '◆', primary: true,
      note: stepInfo.note,
      onClick: () => doSummon(banner.id, 10, {}),
      disabled: !state.canAfford(stepInfo.cost),
    }));
  }

  const sub = h('div.actions-sub');
  if (!isStep) {
    sub.appendChild(h('button.btn.btn--ghost' + (daily.freeUsed ? '.is-disabled' : ''), {
      disabled: daily.freeUsed,
      onclick: () => doSummon(banner.id, 1, { free: true }),
    }, daily.freeUsed ? '本日の無料召喚：使用済' : '無料召喚（1日1回）'));
    sub.appendChild(h('button.btn.btn--ghost' + (state.tickets <= 0 ? '.is-disabled' : ''), {
      disabled: state.tickets <= 0,
      onclick: () => doSummon(banner.id, 1, { ticket: true }),
    }, `召喚符を使う（${state.tickets}）`));
  }

  const links = h('div.links',
    h('button.link', { onclick: () => { sfx.play('tap'); openRates(banner); } }, '提供割合を見る'),
    h('button.link', { onclick: () => { sfx.play('tap'); openLegend(); } }, '演出の見方'),
  );

  root.appendChild(bannerEl);
  root.appendChild(nav);
  if (pickups.childElementCount) root.appendChild(pickups);
  if (stepBox) root.appendChild(stepBox);
  root.appendChild(pityBox);
  root.appendChild(actions);
  if (sub.childElementCount) root.appendChild(sub);
  root.appendChild(links);

  requestAnimationFrame(() => bannerEl.classList.add('is-in'));
}

function actionBtn({ label, cost, icon, note, primary, disabled, onClick }) {
  return h('button.sbtn' + (primary ? '.sbtn--primary' : '') + (disabled ? '.is-disabled' : ''), {
    disabled: !!disabled,
    onclick: onClick,
  },
    h('span.sbtn__label', { text: label }),
    h('span.sbtn__cost', h('i', { text: icon }), h('b', { text: num(cost) })),
    note ? h('span.sbtn__note', { text: note }) : null,
    h('span.sbtn__shine'),
  );
}

function move(d) {
  go((current + d + BANNERS.length) % BANNERS.length);
}
function go(i) {
  if (i === current) return;
  sfx.play('swipe', { pan: i > current ? 0.4 : -0.4 });
  current = i;
  render();
}

async function doSummon(bannerId, count, opts) {
  if (busy) return;
  const banner = bannerById(bannerId);
  sfx.play('confirm');
  busy = true;
  let payload;
  try {
    payload = performSummon(bannerId, count, opts);
  } catch (e) {
    busy = false;
    if (e instanceof SummonError) {
      toastError(e.message);
      if (e.code === 'no_gems') sfx.play('error');
    } else {
      console.error(e);
      toastError('召喚に失敗しました');
    }
    return;
  }

  try {
    await playSummon(payload);
    await showResult(payload);
  } catch (e) {
    console.error('[summon] 表示でエラー', e);
  } finally {
    busy = false;
    const unlocked = state.checkAchievements();
    if (unlocked.length) {
      for (const a of unlocked) toast(`実績解除：${a.name}（◆${a.reward}）`, { duration: 3200 });
    }
    bgm.setMood('banner', 1.5);
    render();
    window.dispatchEvent(new CustomEvent('stella:currency'));
  }
}

function openCharInfo(c) {
  sfx.play('tap');
  modal({
    title: `${c.name}`,
    body: h('div.charinfo',
      h('div.charinfo__art', { html: crestSVG(c, { size: 200 }) }),
      h('div.charinfo__stars', stars(c.rarity)),
      h('div.charinfo__title', { text: c.title }),
      h('div.charinfo__yomi', { text: c.yomi }),
      h('p.charinfo__flavor', { text: c.flavor }),
      h('div.charinfo__tags',
        h('span.tag', { text: `属性：${c.element}` }),
        h('span.tag', { text: `所持：${state.ownedCount(c.id)}` }),
      ),
    ),
  });
}

function openLegend() {
  modal({
    title: '演出の見方',
    body: h('div.legendbox',
      h('p', 'オーラの色は「そのレアリティ以上が確定している」という下限の宣言です。'),
      tierLegend(),
      h('h3', '昇格演出'),
      h('p', '一度決まった色が、バチバチという音とともにさらに上の色へ上がることがあります。最大4段（白→虹）まで上がります。'),
      h('h3', '金からの★5'),
      h('p', '金オーラは「★4以上確定」です。まれに金オーラのまま★5が出ることがあります。'),
      h('h3', 'カードの裏面'),
      h('p', '10連ではカードの裏面の色もヒントになります。裏面も昇格します。'),
      h('h3', 'スキップ'),
      h('p', '演出中はいつでも SKIP（またはSキー）で飛ばせます。設定から常時スキップにもできます。'),
    ),
    wide: true,
  });
}

export function refreshSummonScreen() { if (root) render(); }
