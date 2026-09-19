/**
 * バナー（祈願）定義。
 *
 * `pityPool` が天井カウンタの共有キー。同じプールのバナー同士は天井を引き継ぐ
 * （RESEARCH §2.4）。限定↔恒常は別プールにする。
 */
import { CATALOG } from './catalog.js';

/** 限定バナーでのみ入手できる★5（＝すり抜け先には出ない） */
export const LIMITED_EXCLUSIVE_5 = ['ur_kagura', 'ur_nocturna', 'ur_iris'];

/** 恒常★5プール（50/50 に負けたときの排出先） */
export const STANDARD_POOL_5 = CATALOG
  .filter((c) => c.rarity === 5 && !LIMITED_EXCLUSIVE_5.includes(c.id))
  .map((c) => c.id);

/** ★4は全て恒常プールに存在する（ピックアップ対象も重複して存在） */
export const STANDARD_POOL_4 = CATALOG.filter((c) => c.rarity === 4).map((c) => c.id);
export const POOL_3 = CATALOG.filter((c) => c.rarity === 3).map((c) => c.id);
export const POOL_2 = CATALOG.filter((c) => c.rarity === 2).map((c) => c.id);
export const POOL_1 = CATALOG.filter((c) => c.rarity === 1).map((c) => c.id);

export const BANNERS = [
  {
    id: 'celestial',
    name: '星辰祈願',
    yomi: 'せいしんきがん',
    subtitle: '暁を継ぐ者',
    kind: 'limited',
    pityPool: 'limited',
    pickup5: ['ur_kagura'],
    pickup4: ['ssr_akatsuki', 'ssr_lumiere', 'ssr_astrid'],
    copy: '——夜が明けぬ世界で、ただ一人だけ朝を覚えていた。',
    theme: { a: '#ffd77a', b: '#ff8a3d', bg: '#241206', accent: '#ffe6a8' },
    element: 'lumen',
  },
  {
    id: 'eclipse',
    name: '蝕月祈願',
    yomi: 'しょくげつきがん',
    subtitle: '星を喰らう者',
    kind: 'limited',
    pityPool: 'limited',
    pickup5: ['ur_nocturna'],
    pickup4: ['ssr_kurone', 'ssr_yoimiya', 'ssr_ariadne'],
    copy: '——喰らった星の数だけ、王冠の棘が増えていく。',
    theme: { a: '#c08bff', b: '#5a2aa8', bg: '#140726', accent: '#e0c4ff' },
    element: 'umbra',
  },
  {
    id: 'eternal',
    name: '常世祈願',
    yomi: 'とこよきがん',
    subtitle: '恒常・ピックアップなし',
    kind: 'standard',
    pityPool: 'standard',
    pickup5: [],
    pickup4: [],
    copy: '——絶えることなく、星は巡り続ける。',
    theme: { a: '#8fd8ff', b: '#3a5cc9', bg: '#08142c', accent: '#cfe9ff' },
    element: 'astra',
  },
  {
    id: 'stepup',
    name: '星導ステップアップ祈願',
    yomi: 'せいどうすてっぷあっぷきがん',
    subtitle: '5段階・第5段で★5確定',
    kind: 'stepup',
    pityPool: 'stepup',
    pickup5: ['ur_iris'],
    pickup4: ['ssr_nagisa', 'ssr_soraha', 'ssr_kohaku'],
    copy: '——全てを映す瞳は、あなたが最後に見たいものを既に知っている。',
    theme: { a: '#ff8fd8', b: '#6ee3ff', bg: '#1b0a2e', accent: '#ffd9f2' },
    element: 'astra',
    /** 各段の仕様。ループする（5段目のあと1段目へ戻る）。 */
    steps: [
      { n: 1, pulls: 10, cost: 1200, note: '割引 300' },
      { n: 2, pulls: 10, cost: 1500, note: '★3以上×3 確定' , guaranteeCount3: 3 },
      { n: 3, pulls: 10, cost: 1500, note: '★4 確定', guarantee4: true },
      { n: 4, pulls: 10, cost: 1800, note: '★4×2 確定', guarantee4Count: 2 },
      { n: 5, pulls: 10, cost: 2400, note: '★5 確定', guarantee5: true },
    ],
  },
];

export const BANNER_BY_ID = new Map(BANNERS.map((b) => [b.id, b]));
export const bannerById = (id) => BANNER_BY_ID.get(id) || BANNERS[0];
export const PITY_POOLS = [...new Set(BANNERS.map((b) => b.pityPool))];

/** 天井カウンタのプール名（表示用） */
export const POOL_LABEL = {
  limited: '限定祈願',
  standard: '恒常祈願',
  stepup: 'ステップアップ祈願',
};
