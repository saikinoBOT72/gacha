/**
 * 中央 Ticker ＋ Promise ベースのトゥイーン／タイムライン。
 *
 * 設計意図:
 *  - RAF ループはアプリ全体で 1 本だけ（NOTES C8）。すべてのアニメはここに乗る。
 *  - `timeScale` を 1 か所で持つことで、ヒットストップ（0）とスローモー（0.25）が
 *    映像・パーティクル・トゥイーンすべてに一斉に効く。演出の「時間を歪める」表現の土台。
 *  - UI の応答（ボタンの押し込み等）は止まってはいけないので `unscaled` を用意。
 *  - 演出は途中でスキップされる。全てのトゥイーンは `cancel()` 可能で、
 *    await 中の Promise は「解決」する（reject しない＝ try/catch 地獄を避ける）。
 */
import { resolveEase, clamp01 } from './ease.js';

const MAX_DT = 1 / 30; // タブ復帰時の巨大 dt を防ぐ（NOTES C9）

class Ticker {
  constructor() {
    this.timeScale = 1;
    this.time = 0;          // スケール適用後の経過秒
    this.realTime = 0;      // 実時間の経過秒
    this.dt = 0;
    this.realDt = 0;
    this.frame = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._cbs = new Set();
    this._toAdd = [];
    this._running = false;
    this._last = 0;
    this._rafId = 0;
    this._holdUntil = 0; // ヒットストップの終了実時刻
  }

  add(fn) { this._toAdd.push(fn); return () => this.remove(fn); }
  remove(fn) { this._cbs.delete(fn); const i = this._toAdd.indexOf(fn); if (i >= 0) this._toAdd.splice(i, 1); }

  /** ヒットストップ。ms のあいだ timeScale を 0 相当にする。 */
  hold(ms) { this._holdUntil = Math.max(this._holdUntil, this.realTime + ms / 1000); }

  /** スローモー。ms のあいだ timeScale を scale にして、その後 1 に戻す。 */
  slow(scale, ms) {
    this.timeScale = scale;
    const end = this.realTime + ms / 1000;
    const restore = () => {
      if (this.realTime >= end) { this.timeScale = 1; this.remove(restore); }
    };
    this.add(restore);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    const loop = (now) => {
      this._rafId = requestAnimationFrame(loop);
      let realDt = (now - this._last) / 1000;
      this._last = now;
      if (!(realDt > 0)) realDt = 0;
      if (realDt > MAX_DT) realDt = MAX_DT;

      this.realDt = realDt;
      this.realTime += realDt;

      // fps 計測（品質の自動調整に使う）
      this._fpsAcc += realDt; this._fpsFrames++;
      if (this._fpsAcc >= 0.5) {
        this.fps = this._fpsFrames / this._fpsAcc;
        this._fpsAcc = 0; this._fpsFrames = 0;
      }

      const held = this.realTime < this._holdUntil;
      const scale = held ? 0 : this.timeScale;
      this.dt = realDt * scale;
      this.time += this.dt;
      this.frame++;

      if (this._toAdd.length) { for (const f of this._toAdd) this._cbs.add(f); this._toAdd.length = 0; }
      for (const cb of this._cbs) {
        try { cb(this.dt, this.realDt, this); }
        catch (err) { console.error('[ticker]', err); this._cbs.delete(cb); }
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() { this._running = false; cancelAnimationFrame(this._rafId); }
}

export const ticker = new Ticker();

/* ------------------------------------------------------------------ */

/** キャンセル可能な非同期トークン。演出のスキップ/中断に使う。 */
export class Token {
  constructor() { this.cancelled = false; this._subs = new Set(); }
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const f of this._subs) { try { f(); } catch (e) { console.error(e); } }
    this._subs.clear();
  }
  onCancel(fn) {
    if (this.cancelled) { fn(); return () => {}; }
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }
  /** キャンセル済みなら true。ループの途中で抜けるのに使う。 */
  get done() { return this.cancelled; }
}

/**
 * トゥイーン。
 * @param {object} o
 *  - from/to: 数値 or 数値のオブジェクト
 *  - dur: 秒
 *  - delay: 秒
 *  - ease: 名前 or 関数
 *  - unscaled: true なら timeScale を無視（UI 用）
 *  - onUpdate(value, t)
 *  - token: Token（cancel されたら即終了）
 * @returns Promise（cancel/完了どちらでも resolve）
 */
export function tween(o) {
  const {
    from = 0, to = 1, dur = 0.3, delay = 0,
    ease = 'outCubic', unscaled = false,
    onUpdate, onComplete, token,
  } = o;
  const fn = resolveEase(ease);
  const isObj = typeof from === 'object' && from !== null;
  const keys = isObj ? Object.keys(from) : null;
  const out = isObj ? { ...from } : 0;

  return new Promise((resolve) => {
    let elapsed = -delay;
    let finished = false;
    const finish = (complete) => {
      if (finished) return;
      finished = true;
      ticker.remove(step);
      unsub && unsub();
      if (complete && onComplete) { try { onComplete(); } catch (e) { console.error(e); } }
      resolve();
    };
    const step = (dt, realDt) => {
      elapsed += unscaled ? realDt : dt;
      if (elapsed < 0) return;
      const t = dur <= 0 ? 1 : clamp01(elapsed / dur);
      const e = fn(t);
      if (onUpdate) {
        if (isObj) {
          for (const k of keys) out[k] = from[k] + (to[k] - from[k]) * e;
          onUpdate(out, t, e);
        } else {
          onUpdate(from + (to - from) * e, t, e);
        }
      }
      if (t >= 1) finish(true);
    };
    const unsub = token ? token.onCancel(() => finish(false)) : null;
    if (token && token.cancelled) { finish(false); return; }
    ticker.add(step);
  });
}

/** await 可能な待機。token でキャンセルできる。 */
export function wait(seconds, token, unscaled = false) {
  return tween({ from: 0, to: 1, dur: seconds, ease: 'linear', token, unscaled });
}

/** 次フレームまで待つ。 */
export function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * タイムライン。時刻（秒）を指定してイベントを並べ、まとめて再生する。
 * 演出は「タイムライン上のキュー列」として書くと読みやすく、スキップも楽。
 *
 *   tl.at(0.0, () => sfx.play('coinInsert'))
 *     .at(0.3, () => burst())
 *     .tweenAt(0.4, {dur: .6, onUpdate: v => ...})
 *   await tl.play(token)
 */
export class Timeline {
  constructor() { this._cues = []; this._dur = 0; }

  at(time, fn) { this._cues.push({ time, fn }); this._dur = Math.max(this._dur, time); return this; }

  /** 指定時刻に tween を開始する（タイムラインは完了を待たない）。 */
  tweenAt(time, opts) {
    this._cues.push({ time, fn: (token) => { tween({ ...opts, token }); } });
    this._dur = Math.max(this._dur, time + (opts.dur || 0) + (opts.delay || 0));
    return this;
  }

  /** タイムライン全体の最短長を伸ばす。 */
  hold(time) { this._dur = Math.max(this._dur, time); return this; }

  get duration() { return this._dur; }

  async play(token, { unscaled = false } = {}) {
    const cues = this._cues.slice().sort((a, b) => a.time - b.time);
    let idx = 0, t = 0;
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        ticker.remove(step);
        unsub && unsub();
        resolve();
      };
      const step = (dt, realDt) => {
        t += unscaled ? realDt : dt;
        while (idx < cues.length && cues[idx].time <= t) {
          const c = cues[idx++];
          try { c.fn(token); } catch (e) { console.error('[timeline]', e); }
        }
        if (idx >= cues.length && t >= this._dur) finish();
      };
      const unsub = token ? token.onCancel(finish) : null;
      if (token && token.cancelled) { finish(); return; }
      ticker.add(step);
    });
  }
}

export const timeline = () => new Timeline();

/** 毎フレーム fn(dt) を dur 秒だけ呼ぶ（カスタム更新が必要な演出用）。 */
export function during(dur, fn, token, unscaled = false) {
  return tween({ dur, ease: 'linear', token, unscaled, onUpdate: (_v, t) => fn(t) });
}
