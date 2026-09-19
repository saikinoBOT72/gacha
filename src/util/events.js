/** 極小 EventEmitter。状態変更の購読に使う。 */
export class Emitter {
  constructor() { this._m = new Map(); }
  on(type, fn) {
    if (!this._m.has(type)) this._m.set(type, new Set());
    this._m.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (...a) => { off(); fn(...a); });
    return off;
  }
  off(type, fn) { const s = this._m.get(type); if (s) s.delete(fn); }
  emit(type, ...args) {
    const s = this._m.get(type);
    if (s) for (const fn of Array.from(s)) { try { fn(...args); } catch (e) { console.error(`[emit:${type}]`, e); } }
    const any = this._m.get('*');
    if (any) for (const fn of Array.from(any)) { try { fn(type, ...args); } catch (e) { console.error(e); } }
  }
  clear() { this._m.clear(); }
}
