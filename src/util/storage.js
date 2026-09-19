/**
 * バージョン付き localStorage。
 * NOTES F1-F5: 壊れたデータでもクラッシュさせない。使えない環境ではメモリで継続。
 */
const memory = new Map();
let usable = null;

function storageOk() {
  if (usable !== null) return usable;
  try {
    const k = '__stella_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    usable = true;
  } catch { usable = false; }
  return usable;
}

function rawGet(key) {
  if (storageOk()) { try { return localStorage.getItem(key); } catch { return null; } }
  return memory.has(key) ? memory.get(key) : null;
}
function rawSet(key, val) {
  if (storageOk()) {
    try { localStorage.setItem(key, val); return true; }
    catch (e) { console.warn('[storage] 書き込み失敗（容量超過?）', e); }
  }
  memory.set(key, val);
  return false;
}
function rawDel(key) {
  if (storageOk()) { try { localStorage.removeItem(key); } catch { /* noop */ } }
  memory.delete(key);
}

/**
 * @param {string} key
 * @param {number} version 現在のスキーマ版
 * @param {object} migrations {2: (data)=>data, 3: (data)=>data} 旧→新
 */
export class Store {
  constructor(key, version, migrations = {}) {
    this.key = key;
    this.version = version;
    this.migrations = migrations;
    this._pending = null;
    this._timer = 0;
  }

  load(fallback) {
    const raw = rawGet(this.key);
    if (!raw) return structuredCloneSafe(fallback);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      console.warn('[storage] JSON 破損。初期状態に復帰します。', e);
      this.backupCorrupt(raw);
      return structuredCloneSafe(fallback);
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.v !== 'number') {
      return structuredCloneSafe(fallback);
    }
    let { v, data } = parsed;
    if (!data || typeof data !== 'object') return structuredCloneSafe(fallback);
    try {
      while (v < this.version) {
        const next = v + 1;
        const fn = this.migrations[next];
        data = fn ? fn(data) : data;
        v = next;
      }
    } catch (e) {
      console.warn('[storage] マイグレーション失敗。初期状態に復帰します。', e);
      this.backupCorrupt(raw);
      return structuredCloneSafe(fallback);
    }
    if (v > this.version) {
      // 新しい版のデータ＝古いコードで開いた。触らずに初期状態で動かす。
      console.warn('[storage] 保存データの版が新しいため読み込みません。');
      return structuredCloneSafe(fallback);
    }
    return data;
  }

  backupCorrupt(raw) {
    try { rawSet(this.key + '.corrupt.' + Date.now(), String(raw).slice(0, 50000)); } catch { /* noop */ }
  }

  /** 300ms デバウンス保存。 */
  save(data) {
    this._pending = data;
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = 0; this.flush(); }, 300);
  }

  /** 即時保存（抽選直後など、失ってはいけない瞬間に使う）。 */
  flush(data) {
    if (data !== undefined) this._pending = data;
    if (this._pending === null) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
    try { rawSet(this.key, JSON.stringify({ v: this.version, data: this._pending })); }
    catch (e) { console.warn('[storage] 保存失敗', e); }
    this._pending = null;
  }

  clear() { rawDel(this.key); }
  get available() { return storageOk(); }
}

function structuredCloneSafe(v) {
  try { return structuredClone(v); }
  catch { return JSON.parse(JSON.stringify(v)); }
}

/** 設定のような単純値用の軽量アクセサ。 */
export const simple = {
  get(key, fallback) {
    const raw = rawGet(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) { rawSet(key, JSON.stringify(value)); },
  del: rawDel,
};
