/** 召喚結果の一覧。NEW／重複／欠片／天井の更新をまとめて見せる。 */
import { h, clear, qs, on } from '../util/dom.js';
import { charCard, stars, pityPanel } from './components.js';
import { RARITY } from '../game/rarity.js';
import { state } from '../game/state.js';
import { sfx } from '../audio/index.js';
import { num } from '../util/format.js';
import { stage } from '../fx/stage.js';
import { KIND } from '../fx/particles.js';
import { wait } from '../util/tween.js';

export function showResult(payload) {
  const { results, summary, banner } = payload;
  const host = qs('#result-layer');
  clear(host);
  host.hidden = false;
  document.body.classList.add('has-result');

  const top = summary.topRarity;
  const wrap = h(`div.result.result--r${top}`);

  wrap.appendChild(h('div.result__head',
    h('div.result__banner', { text: banner.name }),
    h('h2.result__title', { text: `${summary.count} 回 召喚結果` }),
  ));

  const grid = h('div.result__grid');
  const sorted = results.map((r, i) => ({ r, i })).sort((a, b) => b.r.rarity - a.r.rarity || a.i - b.i);
  for (const { r } of sorted) {
    const card = charCard(r.char, {
      compact: true, isNew: r.isNew,
      count: state.ownedCount(r.charId),
      pickup: r.isPickup,
    });
    card.classList.add('result__card');
    grid.appendChild(card);
  }
  wrap.appendChild(grid);

  const breakdown = h('div.result__stats');
  for (const rr of [5, 4, 3, 2, 1]) {
    if (!summary.byRarity[rr]) continue;
    breakdown.appendChild(h(`div.result__stat.result__stat--r${rr}`,
      h('span.result__statlabel', { text: RARITY[rr].label }),
      h('span.result__statval', { text: `×${summary.byRarity[rr]}` }),
    ));
  }
  wrap.appendChild(h('div.result__summary',
    breakdown,
    h('div.result__gains',
      summary.news ? h('span.result__gain.is-new', { text: `NEW ×${summary.news}` }) : null,
      summary.pickups ? h('span.result__gain.is-pu', { text: `PICK UP ×${summary.pickups}` }) : null,
      summary.shards ? h('span.result__gain', { text: `星片 +${num(summary.shards)}` }) : null,
      h('span.result__gain', { text: `祈刻 +${summary.count}` }),
    ),
  ));

  wrap.appendChild(pityPanel(summary.pity));

  const foot = h('div.result__foot',
    h('button.btn.btn--primary', { onclick: () => close() }, '閉じる'),
  );
  wrap.appendChild(foot);

  host.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('is-in'));

  // カードが順に立ち上がる
  const cards = Array.from(grid.children);
  cards.forEach((c, i) => setTimeout(() => {
    c.classList.add('is-in');
    if (i < 10) sfx.play('cardDeal', { pan: ((i % 5) - 2) * 0.25 });
  }, 60 + i * 55));

  if (top >= 4) {
    setTimeout(() => {
      sfx.play('reward');
      stage.particles.emit({
        x: stage.cx, y: stage.vy(window.innerHeight * 0.3), kind: KIND.MOTE, count: 30,
        speed: 160, life: 1.6, lifeVar: 0.6, size: 3.4, shrink: 0.2,
        color: RARITY[top].color, color2: '#ffffff', drag: 1.2, fade: 1.4, flicker: 3,
      });
    }, 60 + cards.length * 55);
  }

  return new Promise((resolve) => {
    let closed = false;
    const offKey = on(document, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); }
    });
    function close() {
      if (closed) return;
      closed = true;
      sfx.play('tap');
      offKey();
      wrap.classList.remove('is-in');
      wrap.classList.add('is-out');
      setTimeout(() => {
        host.hidden = true;
        clear(host);
        document.body.classList.remove('has-result');
        resolve();
      }, 300);
    }
  });
}
