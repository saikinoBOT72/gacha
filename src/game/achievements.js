/**
 * 実績。演出体験そのものを実績化するのが本作の方針
 * （「3段昇格を見た」「金から★5が出た」など＝語り草の言語化）。
 */
export const ACHIEVEMENTS = [
  { id: 'first_pull',   name: '最初の一歩',       desc: '初めて召喚する',                     reward: 300,  check: (s) => s.stats.totalPulls >= 1 },
  { id: 'pull_10',      name: '祈りの十',         desc: '通算10連',                           reward: 300,  check: (s) => s.stats.totalPulls >= 10 },
  { id: 'pull_100',     name: '百の祈り',         desc: '通算100連',                          reward: 1500, check: (s) => s.stats.totalPulls >= 100 },
  { id: 'pull_500',     name: '五百の夜',         desc: '通算500連',                          reward: 4500, check: (s) => s.stats.totalPulls >= 500 },
  { id: 'pull_1000',    name: '千の星に願う',     desc: '通算1000連',                         reward: 9000, check: (s) => s.stats.totalPulls >= 1000 },

  { id: 'first_sr',     name: '銀の輝き',         desc: '★3を入手',                           reward: 150,  check: (s) => (s.stats.byRarity[3] || 0) >= 1 },
  { id: 'first_ssr',    name: '金の輝き',         desc: '★4を入手',                           reward: 600,  check: (s) => (s.stats.byRarity[4] || 0) >= 1 },
  { id: 'first_ur',     name: '虹を見た日',       desc: '★5を入手',                           reward: 3000, check: (s) => (s.stats.byRarity[5] || 0) >= 1 },
  { id: 'ur_5',         name: '星を集める者',     desc: '★5を5体入手',                        reward: 4500, check: (s) => (s.stats.byRarity[5] || 0) >= 5 },
  { id: 'ur_12',        name: '天球の主',         desc: '★5を12体入手',                       reward: 12000, check: (s) => (s.stats.byRarity[5] || 0) >= 12 },

  { id: 'upgrade_1',    name: 'バチバチ',         desc: '昇格演出を見る',                     reward: 300,  check: (s) => s.stats.upgrades >= 1 },
  { id: 'upgrade_3',    name: '三段跳び',         desc: '3段昇格を見る',                      reward: 2400, check: (s) => s.stats.upgrade3 >= 1 },
  { id: 'upgrade_4',    name: '白から虹へ',       desc: '4段昇格（白→虹）を見る',             reward: 9000, check: (s) => s.stats.upgrade4 >= 1 },
  { id: 'gold_surprise',name: '金からの奇跡',     desc: '金オーラから★5が出る',               reward: 3000, check: (s) => s.stats.goldSurprise >= 1 },
  { id: 'blackout',     name: '暗転',             desc: '特殊ゲート演出を引き当てる',         reward: 4500, check: (s) => s.stats.blackout >= 1 },

  { id: 'hard_pity',    name: '天井到達',         desc: '90連の天井で★5を引く',               reward: 1500, check: (s) => s.stats.hardPity5 >= 1 },
  { id: 'lucky_early',  name: '幸運',             desc: '10連以内で★5を引く',                 reward: 3000, check: (s) => s.stats.best5Gap > 0 && s.stats.best5Gap <= 10 },
  { id: 'lost_5050',    name: 'すり抜け',         desc: '50/50に敗北する（誰もが通る道）',    reward: 1500, check: (s) => s.stats.lost5050 >= 1 },
  { id: 'won_5050_3',   name: '寵愛',             desc: '50/50に3回勝利する',                 reward: 4500, check: (s) => s.stats.won5050 >= 3 },
  { id: 'double_ur',    name: '二重の虹',         desc: '1回の10連で★5を2体引く',             reward: 12000, check: (s) => s.stats.doubleUR >= 1 },

  { id: 'collect_25',   name: '図鑑・銅',         desc: '25種を収集',                         reward: 900,  check: (s) => Object.keys(s.owned).length >= 25 },
  { id: 'collect_50',   name: '図鑑・銀',         desc: '50種を収集',                         reward: 2400, check: (s) => Object.keys(s.owned).length >= 50 },
  { id: 'collect_75',   name: '図鑑・金',         desc: '75種を収集',                         reward: 6000, check: (s) => Object.keys(s.owned).length >= 75 },
  { id: 'collect_all',  name: '星辰図鑑 完成',     desc: '全86種を収集',                       reward: 30000, check: (s) => Object.keys(s.owned).length >= 86 },

  { id: 'daily_3',      name: '習慣',             desc: '3日連続でログイン',                  reward: 900,  check: (s) => s.daily.streak >= 3 },
  { id: 'daily_7',      name: '一週の祈り',       desc: '7日連続でログイン',                  reward: 3000, check: (s) => s.daily.streak >= 7 },
  { id: 'exchange_ur',  name: '確約',             desc: '祈刻で★5を交換する',                 reward: 3000, check: (s) => s.stats.chipExchanges >= 1 },
  { id: 'shard_ur',     name: '欠片より生まれる', desc: '欠片で★5を交換する',                 reward: 3000, check: (s) => s.stats.shardExchanges5 >= 1 },
];

export const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
