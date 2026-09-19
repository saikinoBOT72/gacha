/** 星辰図鑑。全86体の収集状況。 */
import { h, clear } from '../util/dom.js';
import { CATALOG } from '../game/catalog.js';
import { ELEMENTS, elementOf, roleOf } from '../game/elements.js';
import { RARITY } from '../game/rarity.js';
import { state } from '../game/state.js';
import { charCard, stars } from './components.js';
import { crestSVG } from '../fx/crest.js';
import { modal } from './modal.js';
import { sfx } from '../audio/index.js';
import { dateJP, num } from '../util/format.js';

let filterR = 0;
let filterE = '';
let onlyOwned = false;
let root = null;

export function collectionScreen() {
  root = h('section.screen.screen--collection');
  render();
  return root;
}

function render() {
  clear(root);
  const st = state.collectionStats();

  root.appendChild(h('div.col-head',
    h('div.col-progress',
      h('div.col-progress__num', h('b', { text: String(st.have) }), h('span', { text: ` / ${st.total}` })),
      h('div.col-progress__bar', h('div.col-progress__fill', { style: { width: (st.pct * 100).toFixed(1) + '%' } })),
      h('div.col-progress__pct', { text: (st.pct * 100).toFixed(1) + '%' }),
    ),
    h('div.col-rarities', ...[5, 4, 3, 2, 1].map((r) =>
      h(`div.col-rarity.col-rarity--r${r}`,
        h('span.col-rarity__label', { text: RARITY[r].label }),
        h('span.col-rarity__val', { text: `${st.byRarity[r].have}/${st.byRarity[r].total}` }),
      ))),
  ));

  const filters = h('div.filters',
    h('div.filters__row',
      chip('すべて', filterR === 0, () => { filterR = 0; render(); }),
      ...[5, 4, 3, 2, 1].map((r) => chip(RARITY[r].label, filterR === r, () => { filterR = r; render(); }, `r${r}`)),
    ),
    h('div.filters__row',
      chip('全属性', filterE === '', () => { filterE = ''; render(); }),
      ...Object.values(ELEMENTS).map((e) => chip(e.glyph, filterE === e.id, () => { filterE = e.id; render(); }, `el-${e.id}`)),
    ),
    h('div.filters__row',
      chip(onlyOwned ? '所持のみ' : 'すべて表示', onlyOwned, () => { onlyOwned = !onlyOwned; render(); }),
    ),
  );
  root.appendChild(filters);

  const list = CATALOG
    .filter((c) => (!filterR || c.rarity === filterR) && (!filterE || c.element === filterE))
    .filter((c) => !onlyOwned || state.isOwned(c.id))
    .sort((a, b) => b.rarity - a.rarity || a.element.localeCompare(b.element) || a.id.localeCompare(b.id));

  const grid = h('div.col-grid');
  for (const c of list) {
    const owned = state.isOwned(c.id);
    grid.appendChild(charCard(c, {
      compact: true, owned, count: state.ownedCount(c.id),
      onClick: owned ? () => openDetail(c) : () => { sfx.play('error'); },
    }));
  }
  if (!list.length) grid.appendChild(h('p.empty', '該当する星霊がいません。'));
  root.appendChild(grid);
}

function chip(label, on, onClick, cls = '') {
  return h(`button.fchip${on ? '.is-on' : ''}${cls ? '.fchip--' + cls : ''}`, {
    onclick: () => { sfx.play('tap'); onClick(); },
  }, label);
}

export function openDetail(c) {
  sfx.play('tap');
  const owned = state.data.owned[c.id];
  const el = elementOf(c.element);
  const role = roleOf(c.role);
  modal({
    title: c.name,
    wide: true,
    className: `modal--char modal--r${c.rarity}`,
    body: h('div.detail',
      h('div.detail__art', { html: crestSVG(c, { size: 240 }) }),
      h('div.detail__main',
        h('div.detail__stars', stars(c.rarity)),
        h('div.detail__title', { text: c.title }),
        h('div.detail__yomi', { text: c.yomi }),
        h('p.detail__flavor', { text: c.flavor }),
        h('div.detail__grid',
          kv('属性', `${el.glyph} ${el.name}`),
          kv('役割', `${role.glyph} ${role.name}`),
          kv('レアリティ', RARITY[c.rarity].label),
          kv('所持数', owned ? `${owned.count}` : '未所持'),
          owned ? kv('初取得', dateJP(owned.firstAt)) : null,
          kv('重複時の星片', `+${num(RARITY[c.rarity].shards)}`),
        ),
      ),
    ),
  });
}

const kv = (k, v) => h('div.kv', h('span.kv__k', { text: k }), h('span.kv__v', { text: v }));

export function refreshCollection() { if (root) render(); }
