/** 画面をまたいで使う小さな部品。 */
import { h } from '../util/dom.js';
import { RARITY, TIERS } from '../game/rarity.js';
import { elementOf, roleOf } from '../game/elements.js';
import { crestSVG } from '../fx/crest.js';
import { num, pctShort } from '../util/format.js';

/** ★ の並び。色だけでなく数と形でもレア度が分かるように（NOTES B5）。 */
export function stars(n, opts = {}) {
  const wrap = h('span.stars' + (opts.small ? '.stars--sm' : ''), { 'aria-label': `星${n}` });
  for (let i = 0; i < n; i++) wrap.appendChild(h('i.star', { 'aria-hidden': 'true' }, '★'));
  return wrap;
}

export function rarityBadge(r) {
  const R = RARITY[r];
  return h(`span.rbadge.rbadge--${R.code.toLowerCase()}`, { 'aria-label': `レアリティ ${R.code}` }, R.label);
}

/**
 * 星霊カード（図鑑・結果一覧で使う）。
 * @param {object} o {owned, isNew, count, compact, onClick, dupes}
 */
export function charCard(char, o = {}) {
  const R = RARITY[char.rarity];
  const el = elementOf(char.element);
  const owned = o.owned !== false;
  const card = h(`article.ccard.ccard--r${char.rarity}${o.compact ? '.ccard--compact' : ''}${owned ? '' : '.is-locked'}`, {
    style: {
      '--c1': (char.colors && char.colors[0]) || el.color,
      '--c2': (char.colors && char.colors[1]) || el.color2,
      '--rc': R.color,
      '--rc2': R.color2,
      '--glow': R.glow,
    },
    tabindex: o.onClick ? '0' : null,
    role: o.onClick ? 'button' : null,
    'aria-label': owned ? `${char.name} ★${char.rarity} ${el.name}属性` : '未取得',
  });

  card.appendChild(h('div.ccard__frame'));
  card.appendChild(h('div.ccard__glow'));
  const art = h('div.ccard__art' + (owned ? '' : '.is-silhouette'));
  art.innerHTML = crestSVG(char, { size: o.compact ? 96 : 150 });
  card.appendChild(art);
  card.appendChild(h('div.ccard__sheen'));

  const info = h('div.ccard__info',
    h('div.ccard__stars', stars(char.rarity, { small: true })),
    h('div.ccard__name', { text: owned ? char.name : '？？？' }),
    o.compact ? null : h('div.ccard__title', { text: owned ? char.title : '' }),
  );
  card.appendChild(info);

  card.appendChild(h(`span.ccard__elem.elem--${char.element}`, { title: `${el.name}属性` }, el.glyph));
  if (o.isNew) card.appendChild(h('span.ccard__new', 'NEW'));
  if (o.count > 1) card.appendChild(h('span.ccard__count', `×${o.count}`));
  if (o.pickup) card.appendChild(h('span.ccard__pickup', 'PICK UP'));

  if (o.onClick) {
    card.addEventListener('click', () => o.onClick(char));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onClick(char); } });
  }
  return card;
}

/** 通貨表示チップ。 */
export function currencyChip(kind, value, opts = {}) {
  const map = {
    gems: { icon: '◆', label: '星晶石', cls: 'gems' },
    shards: { icon: '✦', label: '星片', cls: 'shards' },
    chips: { icon: '⧗', label: '祈刻', cls: 'chips' },
    tickets: { icon: '✧', label: '召喚符', cls: 'tickets' },
  };
  const m = map[kind] || map.gems;
  return h(`div.chip.chip--${m.cls}`, { title: m.label, 'aria-label': `${m.label} ${num(value)}` },
    h('span.chip__icon', { 'aria-hidden': 'true' }, m.icon),
    h('span.chip__val', { text: num(value), dataset: { kind } }),
    opts.plus ? h('button.chip__plus', { 'aria-label': `${m.label}を入手`, onclick: opts.plus }, '＋') : null,
  );
}

/** 天井（ピティ）パネル。NOTES A4: 常時可視化。 */
export function pityPanel(summary) {
  const pct5 = Math.min(1, summary.c5 / summary.hard5);
  const soft = summary.inSoft5;
  const wrap = h('div.pity' + (soft ? '.pity--soft' : ''),
    h('div.pity__row',
      h('span.pity__label', '★5 天井まで'),
      h('strong.pity__val', { text: `あと ${summary.to5} 連` }),
    ),
    h('div.pity__bar',
      h('div.pity__fill', { style: { width: (pct5 * 100).toFixed(1) + '%' } }),
      h('div.pity__soft-mark', { style: { left: ((summary.hard5 - 17) / summary.hard5 * 100).toFixed(1) + '%' }, title: '74連目からソフト天井' }),
    ),
    h('div.pity__row.pity__row--sub',
      h('span', { text: `★4 まで あと ${summary.to4} 連` }),
      summary.guaranteed5
        ? h('span.pity__flag.is-on', 'すり抜け済 → 次の★5はPU確定')
        : h('span.pity__flag', 'ピックアップ 50%'),
    ),
    soft ? h('div.pity__soft-note', 'ソフト天井：★5確率が1連ごとに上昇中') : null,
  );
  return wrap;
}

/** オーラ段階の凡例（期待度コードの説明）。 */
export function tierLegend() {
  return h('div.legend',
    ...TIERS.map((t) => h(`div.legend__item.legend__item--${t.key}`,
      h('span.legend__swatch'),
      h('span.legend__name', { text: t.name }),
      h('span.legend__desc', { text: t.desc }),
    )),
  );
}

export function sectionTitle(text, sub) {
  return h('div.sect',
    h('h2.sect__title', { text }),
    sub ? h('p.sect__sub', { text: sub }) : null,
  );
}

export function statRow(label, value, opts = {}) {
  return h('div.stat' + (opts.strong ? '.stat--strong' : ''),
    h('span.stat__label', { text: label }),
    h('span.stat__value', { text: value }),
  );
}

export { pctShort, num };
