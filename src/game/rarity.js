/**
 * レアリティ定義。
 * 「オーラ段階（tier）」と「レアリティ」を別概念として持つのが要点。
 * tier は演出上の期待度コード（白0/青1/銀2/金3/虹4）で、昇格演出は tier 上を動く。
 */

export const RARITY = {
  1: {
    id: 1, code: 'N', label: 'N', stars: 1, tier: 0,
    name: '常闇', color: '#cfd6e6', color2: '#8d97ad', glow: 'rgba(207,214,230,.55)',
    frame: 'plain', shards: 1, intensity: 0.12,
  },
  2: {
    id: 2, code: 'R', label: 'R', stars: 2, tier: 1,
    name: '蒼明', color: '#5cb4ff', color2: '#2a5fd0', glow: 'rgba(92,180,255,.6)',
    frame: 'plain', shards: 2, intensity: 0.28,
  },
  3: {
    id: 3, code: 'SR', label: 'SR', stars: 3, tier: 2,
    name: '銀星', color: '#c7b6ff', color2: '#7a5cd6', glow: 'rgba(199,182,255,.65)',
    frame: 'silver', shards: 5, intensity: 0.5,
  },
  4: {
    id: 4, code: 'SSR', label: 'SSR', stars: 4, tier: 3,
    name: '金輝', color: '#ffc93c', color2: '#e0791a', glow: 'rgba(255,201,60,.75)',
    frame: 'gold', shards: 40, intensity: 0.78,
  },
  5: {
    id: 5, code: 'UR', label: 'UR', stars: 5, tier: 4,
    name: '虹星', color: '#ff6ec7', color2: '#5ad9ff', glow: 'rgba(255,255,255,.9)',
    frame: 'rainbow', shards: 200, intensity: 1,
  },
};

export const RARITY_IDS = [1, 2, 3, 4, 5];

/** 演出のオーラ段階（tier）。昇格演出はこの配列上を下から上へ動く。 */
export const TIERS = [
  {
    tier: 0, key: 'white', name: '白',
    color: '#e6ebf5', color2: '#9aa5bd',
    ring: ['#ffffff', '#c9d3e6', '#8d97ad'],
    sfx: 'auraWhite', desc: '静寂',
  },
  {
    tier: 1, key: 'blue', name: '青',
    color: '#5cb4ff', color2: '#1e4fb8',
    ring: ['#a8dcff', '#4aa0ff', '#1b47a8'],
    sfx: 'auraBlue', desc: '★2以上',
  },
  {
    tier: 2, key: 'silver', name: '銀',
    color: '#d8c8ff', color2: '#6b4fc9',
    ring: ['#f2ecff', '#c3aeff', '#6b4fc9'],
    sfx: 'auraSilver', desc: '★3以上 確定',
  },
  {
    tier: 3, key: 'gold', name: '金',
    color: '#ffd45c', color2: '#c96a10',
    ring: ['#fff3c4', '#ffc93c', '#c96a10'],
    sfx: 'auraGold', desc: '★4以上 確定',
  },
  {
    tier: 4, key: 'rainbow', name: '虹',
    color: '#ffffff', color2: '#7af0ff',
    ring: ['#ff6ec7', '#ffd166', '#5ad9ff'],
    sfx: 'auraRainbow', desc: '★5 確定',
  },
];

export const rarityOf = (r) => RARITY[r] || RARITY[1];
export const tierOf = (r) => RARITY[r].tier;
export const tierInfo = (t) => TIERS[Math.max(0, Math.min(4, t | 0))];

/** ★5 を「特別扱い」する境界。ここを 1 か所にまとめておく。 */
export const isHigh = (r) => r >= 4;
export const isTop = (r) => r >= 5;
