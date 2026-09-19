/**
 * Canvas ステージ。3レイヤ（bg / fx / post）を管理し、
 * 星空・魔法陣・パーティクル・光柱・ポストFX をまとめて更新／描画する。
 *
 * NOTES C2: DPR は 2 でクランプ。C3: レイヤは3枚まで。C8: RAF は ticker 1本。
 * C10: fps が落ちたら自動で品質を下げる。
 */
import { ticker } from '../util/tween.js';
import { ParticleSystem, KIND, hexToRgb } from './particles.js';
import { Starfield } from './starfield.js';
import { MagicCircle } from './magiccircle.js';
import { Effects } from './pillar.js';
import { PostFX } from './postfx.js';

const MAX_DPR = 2;

class Stage {
  constructor() {
    this.ready = false;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.cx = 0; this.cy = 0;      // 召喚の焦点
    this.focusY = 0.46;            // 画面高に対する焦点の位置
    this.particles = new ParticleSystem();
    this.starfield = new Starfield();
    this.circle = new MagicCircle();
    this.effects = new Effects();
    this.post = new PostFX();
    this.quality = 1;
    this.qualityMode = 'auto';
    this._fpsLow = 0;
    this._unsub = null;
    this.paused = false;
    this.supportsFilter = false;
    this.time = 0;
  }

  init({ bg, fx, post, shakeEl }) {
    this.bgC = bg; this.fxC = fx; this.postC = post;
    this.bg = bg.getContext('2d');
    this.fx = fx.getContext('2d');
    this.pp = post.getContext('2d');
    this.shakeEl = shakeEl;
    this.supportsFilter = typeof this.pp.filter === 'string';
    this.ready = true;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    this._unsub = ticker.add((dt, realDt) => this.frame(dt, realDt));
    ticker.start();
    return this;
  }

  setQualityMode(mode) {
    this.qualityMode = mode;
    if (mode === 'high') this.quality = 1;
    else if (mode === 'medium') this.quality = 0.65;
    else if (mode === 'low') this.quality = 0.38;
    this.particles.quality = this.quality;
    this.post.quality = this.quality;
    this.resize();
  }

  resize() {
    if (!this.ready) return;
    const el = this.bgC.parentElement || document.body;
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1) * (this.quality < 0.5 ? 0.75 : 1);
    this.w = w; this.h = h; this.dpr = dpr;
    for (const c of [this.bgC, this.fxC, this.postC]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    for (const c of [this.bg, this.fx, this.pp]) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = w / 2;
    this.cy = h * this.focusY;
    this.starfield.resize(w, h, this.quality);
    this._bgDirty = true;
  }

  setFocus(yRatio) { this.focusY = yRatio; this.cy = this.h * yRatio; }

  /** 召喚陣の基準半径。画面サイズに合わせる。 */
  get radius() { return Math.min(this.w, this.h) * 0.34; }

  frame(dt, realDt) {
    if (!this.ready || this.paused) return;
    this.time += realDt;

    // 品質の自動調整（NOTES C10）
    if (this.qualityMode === 'auto') {
      if (ticker.fps < 45) { this._fpsLow++; } else if (ticker.fps > 55) { this._fpsLow = Math.max(0, this._fpsLow - 1); }
      if (this._fpsLow > 6 && this.quality > 0.4) {
        this.quality = Math.max(0.4, this.quality - 0.2);
        this.particles.quality = this.quality;
        this._fpsLow = 0;
      }
    }

    this.starfield.update(dt);
    this.circle.update(dt);
    this.particles.update(dt);
    this.effects.update(dt);
    this.post.update(dt, realDt);
    this.post.applyShake(this.shakeEl);

    this.render();
  }

  render() {
    const { w, h } = this;

    // ── 背景（星空） ──
    this.starfield.render(this.bg);

    // ── FX ──
    const fx = this.fx;
    fx.clearRect(0, 0, w, h);
    this.circle.render(fx, this.cx, this.cy, this.radius);
    this.effects.render(fx, w, h);
    this.particles.render(fx, this.time);

    // ── POST ──
    const pp = this.pp;
    pp.clearRect(0, 0, w, h);

    // 色収差：FXレイヤを赤/シアンにずらして加算する
    const ab = this.post.aberration;
    if (ab > 0.012 && this.supportsFilter && this.quality > 0.55) {
      const d = ab * 10;
      pp.save();
      pp.globalCompositeOperation = 'lighter';
      pp.globalAlpha = Math.min(0.6, ab * 0.7);
      pp.filter = 'saturate(4) hue-rotate(-40deg)';
      pp.drawImage(this.fxC, -d, 0, w, h);
      pp.filter = 'saturate(4) hue-rotate(155deg)';
      pp.drawImage(this.fxC, d, 0, w, h);
      pp.filter = 'none';
      pp.restore();
    }
    this.post.render(pp, w, h);

    // DOM 側の色収差用（CSS が参照する）
    if (this.shakeEl) {
      this.shakeEl.style.setProperty('--ab', (ab * 6).toFixed(2) + 'px');
    }
  }

  /* ───────────── 便利ラッパ ───────────── */

  clearAll() {
    this.particles.clear();
    this.effects.clear();
    this.post.reset();
    this.circle.ignite = 0;
    this.circle.charge = 0;
    this.circle.runeLit = 0;
    this.circle.tilt = 0;
    this.circle.scale = 1;
  }

  /** 中心からの爆発。tier に応じて規模が変わる。 */
  burst(tier, color, color2) {
    const q = this.quality;
    const scale = 0.5 + tier * 0.28;
    this.particles.emit({
      x: this.cx, y: this.cy, kind: KIND.SPARK, count: Math.round(50 * scale),
      speed: 520 * scale, speedVar: 0.9, life: 0.75, lifeVar: 0.6,
      size: 3.2, shrink: 0.2, color, color2, drag: 0.9, gravity: 260,
    });
    this.particles.emit({
      x: this.cx, y: this.cy, kind: KIND.MOTE, count: Math.round(70 * scale),
      speed: 320 * scale, speedVar: 1, life: 1.4, lifeVar: 0.7,
      size: 4 * scale, shrink: 0.1, color: '#ffffff', color2: color, drag: 1.4, fade: 1.6,
    });
    if (tier >= 2) {
      this.particles.emit({
        x: this.cx, y: this.cy, kind: KIND.SHARD, count: Math.round(26 * scale),
        speed: 420 * scale, speedVar: 0.9, life: 1.1, lifeVar: 0.6,
        size: 7 * scale, shrink: 0.2, color: color2 || color, vrot: 9, gravity: 420, drag: 0.4,
      });
    }
    if (tier >= 3) {
      this.particles.emit({
        x: this.cx, y: this.cy, kind: KIND.RIBBON, count: 14,
        speed: 300, speedVar: 0.8, life: 1.3, lifeVar: 0.5,
        size: 9, shrink: 0.3, color, color2: '#ffffff', vrot: 4, drag: 1.1,
      });
    }
    this.effects.shockwave(this.cx, this.cy, {
      rMax: Math.max(this.w, this.h) * (0.45 + tier * 0.15), color, width: 4 + tier * 3,
      life: 0.6 + tier * 0.12, flat: 1,
    });
  }

  /** 収束（詠唱）。 */
  converge(color, amount = 1) {
    this.particles.converge({
      x: this.cx, y: this.cy, count: Math.round(6 * amount),
      radius: this.radius * 1.6, inward: 40, life: 1.1, lifeVar: 0.4,
      size: 2.6, shrink: 0.15, color, color2: '#ffffff', attract: 1100, drag: 0.3,
      kind: KIND.MOTE, fade: 1.2,
    });
  }

  /** 環境の漂う塵。常時うっすら出しておくと「生きている」画面になる。 */
  ambient(color = '#9ad8ff', amount = 1) {
    if (Math.random() > 0.35 * amount) return;
    this.particles.emit({
      x: Math.random() * this.w, y: this.h + 10, kind: KIND.DUST, count: 1,
      speed: 0, vy: -(8 + Math.random() * 22), vx: (Math.random() - 0.5) * 12,
      life: 7, lifeVar: 0.5, size: 1.4, sizeVar: 0.8, shrink: 0.6,
      color, alpha: 0.5, fade: 1.6, flicker: 2.2,
    });
  }
}

export const stage = new Stage();
export { KIND, hexToRgb };
