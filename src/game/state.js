/**
 * 全ゲーム状態の単一ソース。
 * UI は state を購読するだけ。state は自分で保存する（NOTES F1-F5）。
 */
import { Emitter } from '../util/events.js';
import { Store, simple } from '../util/storage.js';
import { dayKey } from '../util/format.js';
import { newPity, normalizePity } from './gacha.js';
import { CATALOG, charById } from './catalog.js';
import { RARITY } from './rarity.js';
import { BANNERS, PITY_POOLS } from './banners.js';
import { ACHIEVEMENTS, ACH_BY_ID } from './achievements.js';

export const SAVE_KEY = 'stella.save';
export const SAVE_VERSION = 1;

/* ───────────── 経済パラメータ ───────────── */
export const ECONOMY = {
  startGems: 30000,
  costSingle: 150,
  costMulti: 1500,
  dailyGems: 600,
  dailyTickets: 1,
  streakBonus: [0, 0, 300, 300, 600, 600, 900, 1500], // 連続日数 index（7日で1500）
  chipsPerPull: 1,
  chipCostUR: 200,          // 真の天井：祈刻200で確定交換
  shardCost: { 3: 60, 4: 400, 5: 2000 },
};

const HISTORY_CAP = 3000;

function freshState() {
  const pity = {};
  for (const p of PITY_POOLS) pity[p] = newPity();
  return {
    createdAt: Date.now(),
    firstRun: true,
    pseAcknowledged: false,
    currency: { gems: ECONOMY.startGems, tickets: 3, shards: 0, chips: 0 },
    owned: {},                    // charId -> {count, firstAt, lastAt}
    pity,
    stepup: { step: 1, cycles: 0 },
    history: [],                  // 新しい順
    stats: {
      totalPulls: 0,
      byRarity: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      byBanner: {},
      upgrades: 0, upgrade3: 0, upgrade4: 0,
      goldSurprise: 0, blackout: 0,
      hardPity5: 0, softPity5: 0,
      won5050: 0, lost5050: 0,
      doubleUR: 0,
      best5Gap: 0, worst5Gap: 0,
      sinceLast5: 0,
      gemsSpent: 0, shardsGained: 0,
      chipExchanges: 0, shardExchanges5: 0,
      seenFullAnim: false,
    },
    daily: { lastClaim: '', streak: 0, freeUsed: '' },
    achievements: {},             // id -> {at}
    lastBanner: BANNERS[0].id,
  };
}

/* ───────────── 設定（セーブとは別キーで保存） ───────────── */
export const DEFAULT_SETTINGS = {
  volMaster: 0.9,
  volBgm: 0.5,
  volSfx: 0.85,
  volUi: 0.7,
  muted: false,
  quality: 'auto',        // auto | high | medium | low
  skipMode: 'off',        // off | fast | auto  （auto = 常にスキップ）
  fullAnimFrom: 1,        // このレアリティ以上はスキップ設定でもフル演出
  reduceMotion: false,    // true で全演出を短縮（PSE/酔い配慮）
  reduceFlash: false,     // フラッシュを弱める
  haptics: true,
  showRates: true,
  cardBackStyle: 'astral',
};

class GameState extends Emitter {
  constructor() {
    super();
    this.store = new Store(SAVE_KEY, SAVE_VERSION, {
      // 将来の版で data を変換する関数をここに並べる
    });
    this.data = freshState();
    this.settings = { ...DEFAULT_SETTINGS };
  }

  load() {
    const loaded = this.store.load(freshState());
    this.data = this.sanitize(loaded);
    const s = simple.get('stella.settings', null);
    this.settings = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
    return this;
  }

  /** どんな壊れ方をしていても動く形に整える（NOTES F2）。 */
  sanitize(d) {
    const base = freshState();
    if (!d || typeof d !== 'object') return base;
    const out = base;

    out.createdAt = num(d.createdAt, Date.now());
    out.firstRun = d.firstRun !== false ? (d.firstRun === undefined ? true : !!d.firstRun) : false;
    out.pseAcknowledged = !!d.pseAcknowledged;

    if (d.currency && typeof d.currency === 'object') {
      out.currency.gems = clampNum(d.currency.gems, 0, 1e12, ECONOMY.startGems);
      out.currency.tickets = clampNum(d.currency.tickets, 0, 1e9, 0);
      out.currency.shards = clampNum(d.currency.shards, 0, 1e12, 0);
      out.currency.chips = clampNum(d.currency.chips, 0, 1e9, 0);
    }

    if (d.owned && typeof d.owned === 'object') {
      for (const [id, v] of Object.entries(d.owned)) {
        if (!charById(id) || !v || typeof v !== 'object') continue;
        out.owned[id] = {
          count: clampNum(v.count, 1, 1e6, 1),
          firstAt: num(v.firstAt, Date.now()),
          lastAt: num(v.lastAt, Date.now()),
        };
      }
    }

    for (const p of PITY_POOLS) out.pity[p] = normalizePity(d.pity && d.pity[p]);

    if (d.stepup && typeof d.stepup === 'object') {
      out.stepup.step = clampNum(d.stepup.step, 1, 5, 1);
      out.stepup.cycles = clampNum(d.stepup.cycles, 0, 1e6, 0);
    }

    if (Array.isArray(d.history)) {
      out.history = d.history
        .filter((h) => h && charById(h.charId))
        .slice(0, HISTORY_CAP)
        .map((h) => ({
          t: num(h.t, Date.now()),
          banner: String(h.banner || 'celestial'),
          charId: h.charId,
          rarity: clampNum(h.rarity, 1, 5, 1),
          isPickup: !!h.isPickup,
          isNew: !!h.isNew,
          pullNo: clampNum(h.pullNo, 0, 1e9, 0),
          gap: clampNum(h.gap, 0, 1e6, 0),
        }));
    }

    if (d.stats && typeof d.stats === 'object') {
      for (const k of Object.keys(out.stats)) {
        const v = d.stats[k];
        if (typeof out.stats[k] === 'number') out.stats[k] = clampNum(v, 0, 1e12, out.stats[k]);
        else if (typeof out.stats[k] === 'boolean') out.stats[k] = !!v;
      }
      if (d.stats.byRarity && typeof d.stats.byRarity === 'object') {
        for (const r of [1, 2, 3, 4, 5]) out.stats.byRarity[r] = clampNum(d.stats.byRarity[r], 0, 1e12, 0);
      }
      if (d.stats.byBanner && typeof d.stats.byBanner === 'object') {
        for (const [k, v] of Object.entries(d.stats.byBanner)) out.stats.byBanner[k] = clampNum(v, 0, 1e12, 0);
      }
    }

    if (d.daily && typeof d.daily === 'object') {
      out.daily.lastClaim = String(d.daily.lastClaim || '');
      out.daily.streak = clampNum(d.daily.streak, 0, 1e6, 0);
      out.daily.freeUsed = String(d.daily.freeUsed || '');
    }

    if (d.achievements && typeof d.achievements === 'object') {
      for (const [id, v] of Object.entries(d.achievements)) {
        if (ACH_BY_ID.has(id)) out.achievements[id] = { at: num(v && v.at, Date.now()) };
      }
    }

    out.lastBanner = BANNERS.some((b) => b.id === d.lastBanner) ? d.lastBanner : BANNERS[0].id;
    return out;
  }

  save(immediate = false) {
    if (immediate) this.store.flush(this.data);
    else this.store.save(this.data);
    this.emit('save');
  }

  saveSettings() {
    simple.set('stella.settings', this.settings);
    this.emit('settings', this.settings);
  }

  setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
  }

  reset() {
    this.store.clear();
    this.data = freshState();
    this.save(true);
    this.emit('reset');
    this.emit('change');
  }

  /* ───────────── 通貨 ───────────── */
  get gems() { return this.data.currency.gems; }
  get shards() { return this.data.currency.shards; }
  get chips() { return this.data.currency.chips; }
  get tickets() { return this.data.currency.tickets; }

  canAfford(cost) { return this.data.currency.gems >= cost; }

  spendGems(n) {
    if (this.data.currency.gems < n) return false;
    this.data.currency.gems -= n;
    this.data.stats.gemsSpent += n;
    this.emit('currency');
    return true;
  }
  addGems(n, reason = '') {
    this.data.currency.gems += n;
    this.emit('currency', { delta: n, reason });
    return n;
  }
  addShards(n) { this.data.currency.shards += n; this.data.stats.shardsGained += n; this.emit('currency'); }
  spendShards(n) {
    if (this.data.currency.shards < n) return false;
    this.data.currency.shards -= n; this.emit('currency'); return true;
  }
  addChips(n) { this.data.currency.chips += n; this.emit('currency'); }
  spendChips(n) {
    if (this.data.currency.chips < n) return false;
    this.data.currency.chips -= n; this.emit('currency'); return true;
  }
  spendTicket() {
    if (this.data.currency.tickets <= 0) return false;
    this.data.currency.tickets--; this.emit('currency'); return true;
  }
  addTickets(n) { this.data.currency.tickets += n; this.emit('currency'); }

  /* ───────────── 所持 ───────────── */
  ownedCount(id) { const o = this.data.owned[id]; return o ? o.count : 0; }
  isOwned(id) { return !!this.data.owned[id]; }

  /** 星霊を加える。新規なら isNew、重複なら欠片に変換。 */
  acquire(charId, now = Date.now()) {
    const c = charById(charId);
    if (!c) return { isNew: false, shards: 0 };
    const cur = this.data.owned[charId];
    if (!cur) {
      this.data.owned[charId] = { count: 1, firstAt: now, lastAt: now };
      return { isNew: true, shards: 0 };
    }
    cur.count++;
    cur.lastAt = now;
    const shards = RARITY[c.rarity].shards;
    this.addShards(shards);
    return { isNew: false, shards };
  }

  collectionStats() {
    const total = CATALOG.length;
    const have = Object.keys(this.data.owned).length;
    const byRarity = {};
    for (const r of [1, 2, 3, 4, 5]) byRarity[r] = { have: 0, total: 0 };
    for (const c of CATALOG) {
      byRarity[c.rarity].total++;
      if (this.data.owned[c.id]) byRarity[c.rarity].have++;
    }
    return { have, total, pct: total ? have / total : 0, byRarity };
  }

  /* ───────────── 履歴 ───────────── */
  pushHistory(entry) {
    this.data.history.unshift(entry);
    if (this.data.history.length > HISTORY_CAP) this.data.history.length = HISTORY_CAP;
  }

  /* ───────────── デイリー ───────────── */
  dailyStatus(now = Date.now()) {
    const today = dayKey(now);
    const claimed = this.data.daily.lastClaim === today;
    const freeUsed = this.data.daily.freeUsed === today;
    return { today, claimed, freeUsed, streak: this.data.daily.streak };
  }

  claimDaily(now = Date.now()) {
    const today = dayKey(now);
    if (this.data.daily.lastClaim === today) return null;
    const yesterday = dayKey(now - 86400000);
    this.data.daily.streak = this.data.daily.lastClaim === yesterday ? this.data.daily.streak + 1 : 1;
    this.data.daily.lastClaim = today;
    const idx = Math.min(this.data.daily.streak, ECONOMY.streakBonus.length - 1);
    const bonus = ECONOMY.streakBonus[idx] || 0;
    const gems = ECONOMY.dailyGems + bonus;
    this.addGems(gems, 'daily');
    this.addTickets(ECONOMY.dailyTickets);
    this.save(true);
    return { gems, tickets: ECONOMY.dailyTickets, streak: this.data.daily.streak, bonus };
  }

  useFreePull(now = Date.now()) {
    const today = dayKey(now);
    if (this.data.daily.freeUsed === today) return false;
    this.data.daily.freeUsed = today;
    return true;
  }

  /* ───────────── 実績 ───────────── */
  checkAchievements() {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(this.data); } catch { ok = false; }
      if (ok) {
        this.data.achievements[a.id] = { at: Date.now() };
        this.addGems(a.reward, 'achievement');
        unlocked.push(a);
      }
    }
    if (unlocked.length) { this.emit('achievements', unlocked); this.save(); }
    return unlocked;
  }

  achievementProgress() {
    const total = ACHIEVEMENTS.length;
    const have = Object.keys(this.data.achievements).length;
    return { have, total, pct: have / total };
  }
}

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clampNum = (v, lo, hi, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

export const state = new GameState();
