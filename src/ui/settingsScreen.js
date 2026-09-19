/** 設定。音量・演出品質・アクセシビリティ・データ。 */
import { h, clear } from '../util/dom.js';
import { state, DEFAULT_SETTINGS } from '../game/state.js';
import { engine, sfx, bgm, applySettings } from '../audio/index.js';
import { stage } from '../fx/stage.js';
import { confirmDialog, modal } from './modal.js';
import { toast } from './toast.js';
import { RARITY } from '../game/rarity.js';

let root = null;

export function settingsScreen() {
  root = h('section.screen.screen--settings');
  render();
  return root;
}

function render() {
  clear(root);
  const s = state.settings;

  root.appendChild(panel('サウンド', [
    slider('マスター音量', 'volMaster', s.volMaster),
    slider('BGM', 'volBgm', s.volBgm),
    slider('効果音', 'volSfx', s.volSfx),
    slider('UI音', 'volUi', s.volUi),
    toggle('ミュート', 'muted', s.muted),
    h('div.setting',
      h('div.setting__label', 'サウンドテスト'),
      h('div.setting__control',
        h('button.btn.btn--sm', { onclick: () => sfx.play('auraGold') }, '金'),
        h('button.btn.btn--sm', { onclick: () => sfx.play('auraRainbow') }, '虹'),
        h('button.btn.btn--sm', { onclick: () => sfx.play('crackle3') }, '昇格'),
        h('button.btn.btn--sm', { onclick: () => sfx.play('fanfare5') }, '★5'),
      ),
    ),
  ]));

  root.appendChild(panel('演出', [
    select('スキップ', 'skipMode', s.skipMode, [
      ['off', 'スキップしない（フル演出）'],
      ['fast', '早送り（約2倍速）'],
      ['auto', '常にスキップ'],
    ]),
    select('この星以上はフル演出', 'fullAnimFrom', String(s.fullAnimFrom), [
      ['1', 'すべて'], ['3', '★3以上'], ['4', '★4以上'], ['5', '★5のみ'], ['6', 'なし'],
    ], (v) => parseInt(v, 10)),
    select('描画品質', 'quality', s.quality, [
      ['auto', '自動（fpsに応じて調整）'],
      ['high', '高'],
      ['medium', '中'],
      ['low', '低'],
    ], null, (v) => stage.setQualityMode(v)),
  ]));

  root.appendChild(panel('アクセシビリティ', [
    h('p.panel__note', '光の点滅が苦手な方、乗り物酔いしやすい方は以下をオンにしてください。'),
    toggle('演出を控えめにする（揺れ・スロー無効）', 'reduceMotion', s.reduceMotion, (v) => {
      stage.post.reduceMotion = v;
    }),
    toggle('フラッシュを弱める', 'reduceFlash', s.reduceFlash, (v) => {
      stage.post.reduceFlash = v;
    }),
    toggle('触覚フィードバック（バイブ）', 'haptics', s.haptics),
  ]));

  root.appendChild(panel('データ', [
    h('div.setting',
      h('div.setting__label', 'セーブデータ'),
      h('div.setting__control',
        h('button.btn.btn--sm', { onclick: exportSave }, 'エクスポート'),
        h('button.btn.btn--sm.btn--danger', { onclick: doReset }, 'すべて削除'),
      ),
    ),
    h('p.panel__note', `保存先：${state.store.available ? 'このブラウザの localStorage' : 'メモリのみ（このタブを閉じると消えます）'}`),
  ]));

  root.appendChild(panel('このアプリについて', [
    h('p.about',
      '『星霊召喚 -STELLA SUMMON-』は、ソーシャルゲームのガチャ演出を研究し再現した体験シミュレータです。'),
    h('ul.about__list',
      h('li', '実課金・課金導線は一切ありません。すべてのアイテムに現金価値はありません。'),
      h('li', '確率操作は行っていません。天井・ソフト天井・50/50 はすべて事前に開示された仕様です。'),
      h('li', 'すべての提供割合を「提供割合」画面で開示しています。'),
      h('li', 'コンプガチャ型の仕組みは実装していません。'),
      h('li', '画像・音声ファイルを一切使わず、映像も効果音もすべてコードで生成しています。'),
      h('li', '登場する星霊・世界観はすべてオリジナルです。'),
    ),
    h('p.about__pse',
      '⚠ 光の点滅に関する注意：一部の演出には強い光の変化が含まれます。気分が悪くなった場合はすぐに使用を中止し、「アクセシビリティ」の設定をご利用ください。'),
  ]));
}

function panel(title, children) {
  return h('div.panel', h('h3.panel__title', { text: title }), ...children);
}

function slider(label, key, value) {
  const out = h('output.setting__out', { text: Math.round(value * 100) + '%' });
  const input = h('input.slider', {
    type: 'range', min: '0', max: '1', step: '0.01', value: String(value),
    'aria-label': label,
    oninput: (e) => {
      const v = parseFloat(e.target.value);
      state.settings[key] = v;
      out.textContent = Math.round(v * 100) + '%';
      applySettings();
    },
    onchange: () => { state.saveSettings(); sfx.play('toggle'); },
  });
  return h('div.setting', h('div.setting__label', { text: label }), h('div.setting__control', input, out));
}

function toggle(label, key, value, after) {
  const input = h('input', {
    type: 'checkbox', checked: value ? true : null, 'aria-label': label,
    onchange: (e) => {
      const v = e.target.checked;
      state.setSetting(key, v);
      if (key === 'muted') engine.setMuted(v);
      applySettings();
      after && after(v);
      sfx.play('toggle');
    },
  });
  return h('div.setting',
    h('div.setting__label', { text: label }),
    h('label.switch', input, h('span.switch__track', h('span.switch__thumb'))),
  );
}

function select(label, key, value, options, parse, after) {
  const sel = h('select.select', {
    'aria-label': label,
    onchange: (e) => {
      const raw = e.target.value;
      const v = parse ? parse(raw) : raw;
      state.setSetting(key, v);
      sfx.play('toggle');
      after && after(v);
    },
  }, ...options.map(([v, l]) => h('option', { value: v, selected: String(value) === v ? true : null }, l)));
  return h('div.setting', h('div.setting__label', { text: label }), h('div.setting__control', sel));
}

function exportSave() {
  sfx.play('tap');
  const json = JSON.stringify({ v: 1, data: state.data }, null, 2);
  const body = h('div',
    h('p.panel__note', 'このテキストをコピーして保管してください。'),
    h('textarea.export', { readonly: true, rows: '12' }, json),
  );
  modal({ title: 'セーブデータのエクスポート', body, wide: true });
}

async function doReset() {
  sfx.play('tap');
  const ok1 = await confirmDialog({
    title: 'データ削除',
    message: 'すべての召喚履歴・所持星霊・通貨・実績が削除されます。この操作は取り消せません。',
    confirmLabel: '削除に進む', danger: true,
  });
  if (!ok1) return;
  const ok2 = await confirmDialog({
    title: '最終確認',
    message: '本当にすべて削除しますか？',
    confirmLabel: '削除する', danger: true,
  });
  if (!ok2) return;
  state.reset();
  toast('データを削除しました');
  window.dispatchEvent(new CustomEvent('stella:currency'));
  render();
}

export function refreshSettings() { if (root) render(); }
