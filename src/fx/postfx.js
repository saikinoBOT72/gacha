/**
 * ポストエフェクト：フラッシュ / 画面揺れ / 色収差 / ヴィネット / レターボックス / 暗転。
 *
 * 画面揺れは「トラウマ値」方式（Squirrel Eiserloh）:
 *   trauma を加算 → shake = trauma^2 → 毎フレーム減衰。
 *   1乗ではなく2乗にすることで「大きい衝撃だけが大きく揺れる」自然な挙動になる。
 *
 * NOTES B1/B2/E12: フラッシュは「1回の強い白 → 指数減衰」。毎秒3回を超える点滅は禁止。
 */
import { hexToRgb } from './particles.js';

const FLASH_MIN_GAP = 0.34; // NOTES B1: 秒あたり3回未満に制限

export class PostFX {
  constructor() {
    this.trauma = 0;
    this.traumaDecay = 2.6;
    this.maxOffset = 26;
    this.maxAngle = 0.021;   // 約1.2度（酔い対策の上限）
    this.shakeX = 0; this.shakeY = 0; this.shakeA = 0;
    this.shakeSeed = Math.random() * 1000;

    this.flash = 0;
    this.flashColor = [255, 255, 255];
    this.flashDecay = 5.5;
    this._lastFlash = -10;

    this.aberration = 0;
    this.abDecay = 4.5;

    this.vignette = 0.55;
    this.vignetteTarget = 0.55;

    this.darken = 0;         // 暗転（特殊ゲート／UIを引っ込めるとき）
    this.darkenTarget = 0;

    this.letterbox = 0;      // 0..1 上下の黒帯（カットイン用）
    this.letterboxTarget = 0;

    this.scan = 0;           // 走査線の乱れ

    this.time = 0;
    this.reduceFlash = false;
    this.reduceMotion = false;
    this.quality = 1;
  }

  /** 衝撃を加える（0..1）。複数回呼ぶと積み上がる。 */
  shake(amount) {
    if (this.reduceMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** 白飛び。連続呼び出しは間隔制限で間引く（光過敏性発作への配慮）。 */
  doFlash(intensity = 1, color = '#ffffff', decay = 5.5) {
    if (this.time - this._lastFlash < FLASH_MIN_GAP) {
      // 間引くが、既存のフラッシュを少し持ち上げるだけにする
      this.flash = Math.max(this.flash, intensity * 0.3);
      return;
    }
    this._lastFlash = this.time;
    const k = this.reduceFlash ? 0.28 : 1;
    this.flash = Math.max(this.flash, intensity * k);
    this.flashColor = hexToRgb(color);
    this.flashDecay = decay;
  }

  chroma(amount = 1, decay = 4.5) {
    if (this.reduceMotion) return;
    this.aberration = Math.max(this.aberration, amount);
    this.abDecay = decay;
  }

  setVignette(v, instant = false) { this.vignetteTarget = v; if (instant) this.vignette = v; }
  setDarken(v, instant = false) { this.darkenTarget = v; if (instant) this.darken = v; }
  setLetterbox(v, instant = false) { this.letterboxTarget = v; if (instant) this.letterbox = v; }

  reset() {
    this.trauma = 0; this.flash = 0; this.aberration = 0;
    this.darken = this.darkenTarget = 0;
    this.letterbox = this.letterboxTarget = 0;
    this.vignette = this.vignetteTarget = 0.55;
    this.scan = 0;
  }

  update(dt, realDt) {
    // ポストエフェクトはヒットストップ中も動く必要がある（realDt を使う）
    const d = realDt ?? dt;
    this.time += d;

    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - this.traumaDecay * d);
      const s = this.trauma * this.trauma;
      const t = this.time * 34 + this.shakeSeed;
      // 3つの異なる周波数の正弦を混ぜて「ノイズらしさ」を作る
      this.shakeX = s * this.maxOffset * (Math.sin(t) * 0.6 + Math.sin(t * 2.7) * 0.3 + Math.sin(t * 5.3) * 0.1);
      this.shakeY = s * this.maxOffset * (Math.sin(t * 1.3 + 2) * 0.6 + Math.sin(t * 3.1 + 1) * 0.3 + Math.sin(t * 6.1) * 0.1);
      this.shakeA = s * this.maxAngle * (Math.sin(t * 0.9 + 4) * 0.7 + Math.sin(t * 2.3) * 0.3);
    } else {
      this.shakeX = this.shakeY = this.shakeA = 0;
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - this.flashDecay * d * (0.4 + this.flash));
    if (this.aberration > 0) this.aberration = Math.max(0, this.aberration - this.abDecay * d);

    const k = Math.min(1, d * 6);
    this.vignette += (this.vignetteTarget - this.vignette) * k;
    this.darken += (this.darkenTarget - this.darken) * k;
    this.letterbox += (this.letterboxTarget - this.letterbox) * Math.min(1, d * 7);
  }

  /** 揺れを DOM 要素に適用する（Canvas と UI が一緒に揺れる）。 */
  applyShake(el) {
    if (!el) return;
    if (this.trauma <= 0.0005) {
      if (el._shaking) { el.style.transform = ''; el._shaking = false; }
      return;
    }
    el._shaking = true;
    el.style.transform =
      `translate3d(${this.shakeX.toFixed(2)}px, ${this.shakeY.toFixed(2)}px, 0) rotate(${this.shakeA.toFixed(4)}rad)`;
  }

  /** post レイヤに描く。 */
  render(ctx, w, h) {
    // ヴィネット
    if (this.vignette > 0.01) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${this.vignette})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // 暗転
    if (this.darken > 0.004) {
      ctx.fillStyle = `rgba(2,3,8,${this.darken})`;
      ctx.fillRect(0, 0, w, h);
    }

    // 走査線の乱れ
    if (this.scan > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.scan * 0.5;
      ctx.fillStyle = '#9ad8ff';
      const lines = 8;
      for (let i = 0; i < lines; i++) {
        const y = ((this.time * 900 + i * h / lines) % h);
        ctx.fillRect(0, y, w, 1.5);
      }
      ctx.restore();
    }

    // レターボックス
    if (this.letterbox > 0.004) {
      const bar = h * 0.13 * this.letterbox;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
    }

    // フラッシュ（最後に。全てを白く飛ばす）
    if (this.flash > 0.004) {
      const [r, g2, b] = this.flashColor;
      ctx.fillStyle = `rgba(${r},${g2},${b},${Math.min(1, this.flash)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
