/** 属性と役割。紋章生成と配色のソースになる。 */

export const ELEMENTS = {
  flame: { id: 'flame', name: '炎', yomi: 'ほむら', glyph: '焔', color: '#ff7a3c', color2: '#8c1f00', aura: 'rgba(255,122,60,.6)' },
  aqua:  { id: 'aqua',  name: '水', yomi: 'みなも', glyph: '澪', color: '#3ecfff', color2: '#08487a', aura: 'rgba(62,207,255,.6)' },
  gale:  { id: 'gale',  name: '風', yomi: 'かぜ',   glyph: '颯', color: '#6ff0b8', color2: '#0f6b4d', aura: 'rgba(111,240,184,.6)' },
  terra: { id: 'terra', name: '地', yomi: 'つち',   glyph: '巌', color: '#d9a55c', color2: '#5c3a12', aura: 'rgba(217,165,92,.6)' },
  volt:  { id: 'volt',  name: '雷', yomi: 'いかずち', glyph: '雷', color: '#ffe15c', color2: '#7a5a00', aura: 'rgba(255,225,92,.6)' },
  lumen: { id: 'lumen', name: '光', yomi: 'ひかり', glyph: '暁', color: '#fff3c9', color2: '#c99a2e', aura: 'rgba(255,243,201,.7)' },
  umbra: { id: 'umbra', name: '闇', yomi: 'やみ',   glyph: '闇', color: '#b07aff', color2: '#2a0a55', aura: 'rgba(176,122,255,.6)' },
  astra: { id: 'astra', name: '星', yomi: 'ほし',   glyph: '星', color: '#9ad8ff', color2: '#4a2a9c', aura: 'rgba(154,216,255,.7)' },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);
export const elementOf = (id) => ELEMENTS[id] || ELEMENTS.astra;

export const ROLES = {
  sword:  { id: 'sword',  name: '剣',  yomi: 'つるぎ', glyph: '剣' },
  shield: { id: 'shield', name: '盾',  yomi: 'たて',   glyph: '盾' },
  bow:    { id: 'bow',    name: '弓',  yomi: 'ゆみ',   glyph: '弓' },
  staff:  { id: 'staff',  name: '杖',  yomi: 'つえ',   glyph: '杖' },
  fist:   { id: 'fist',   name: '拳',  yomi: 'こぶし', glyph: '拳' },
  blade:  { id: 'blade',  name: '刃',  yomi: 'やいば', glyph: '刃' },
  chain:  { id: 'chain',  name: '鎖',  yomi: 'くさり', glyph: '鎖' },
  crown:  { id: 'crown',  name: '冠',  yomi: 'かんむり', glyph: '冠' },
};

export const roleOf = (id) => ROLES[id] || ROLES.sword;
