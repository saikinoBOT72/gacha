/**
 * プール式パーティクルシステム。
 *
 * NOTES C1: ループ内で new しない。生存個体を配列前方に詰める swap-remove 方式。
 * NOTES C4: shadowBlur は使わず、放射状グラデーション + 加算合成でグローを作る。
 */

export const KIND = {
  MOTE: 0,     // 光の粒（加算合成のふんわりした点）
  SPARK: 1,    // 火花（速度方向に伸びる線）
  SHARD: 2,    // 破片（回転する多角形）
  RIBBON: 3,   // 光の帯
  PETAL: 4,    // 花弁
  STAR: 5,     // 星形
  RAY: 6,      // 中心から伸びる光条
  DUST: 7,     // 漂う塵（減速して滞空）
};

const MAX = 2600;

class Particle {
  constructor() { this.reset(); }
  reset() {
    this.active = false;
    this.kind = KIND.MOTE;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.ax = 0; this.ay = 0;
    this.life = 0; this.maxLife = 1;
    this.size = 3; this.size2 = 3;
    this.rot = 0; this.vrot = 0;
    this.r = 255; this.g = 255; this.b = 255;
    this.r2 = 255; this.g2 = 255; this.b2 = 255;
    this.alpha = 1; this.fade = 1;
    this.drag = 0;
    this.attractX = null; this.attractY = null; this.attract = 0;
    this.orbit = 0; this.orbitR = 0; this.orbitA = 0;
    this.blend = 'lighter';
    this.trail = 0;
    this.px = 0; this.py = 0;
    this.spin = 0;
    this.flickerHz = 0;
  }
}

function hexToRgb(hex) {
  if (typeof hex !== 'string') return [255, 255, 255];
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class ParticleSystem {
  constructor(max = MAX) {
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = new Particle();
    this.count = 0;      // pool[0..count-1] が生存
    this.max = max;
    this.quality = 1;    // 品質スケール（自動調整で 0.4〜1）
    this.gradCache = new Map();
  }

  clear() {
    for (let i = 0; i < this.count; i++) this.pool[i].active = false;
    this.count = 0;
  }

  _alloc() {
    if (this.count >= this.max) {
      // 最古（＝先頭付近）を潰す。演出上、古い粒が消えても気づかれない。
      const p = this.pool[0];
      p.reset();
      return p;
    }
    const p = this.pool[this.count++];
    p.reset();
    p.active = true;
    return p;
  }

  /** 汎用の放出。angle/spread はラジアン。 */
  emit(o) {
    const n = Math.max(0, Math.round((o.count ?? 12) * (o.ignoreQuality ? 1 : this.quality)));
    const [r, g, b] = o.rgb || hexToRgb(o.color || '#ffffff');
    const [r2, g2, b2] = o.rgb2 || (o.color2 ? hexToRgb(o.color2) : [r, g, b]);
    for (let i = 0; i < n; i++) {
      const p = this._alloc();
      const a = (o.angle ?? 0) + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2);
      const sp = (o.speed ?? 120) * (1 + (Math.random() - 0.5) * (o.speedVar ?? 0.7));
      const rad = o.radius ? o.radius * (o.radiusVar ? 1 + (Math.random() - 0.5) * o.radiusVar : 1) : 0;
      p.kind = o.kind ?? KIND.MOTE;
      p.x = (o.x ?? 0) + Math.cos(a) * rad + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0);
      p.y = (o.y ?? 0) + Math.sin(a) * rad + (o.jitter ? (Math.random() - 0.5) * o.jitter : 0);
      p.px = p.x; p.py = p.y;
      p.vx = Math.cos(a) * sp + (o.vx ?? 0);
      p.vy = Math.sin(a) * sp + (o.vy ?? 0);
      p.ax = o.ax ?? 0;
      p.ay = o.gravity ?? 0;
      p.maxLife = (o.life ?? 1) * (1 + (Math.random() - 0.5) * (o.lifeVar ?? 0.5));
      p.life = p.maxLife;
      p.size = (o.size ?? 3) * (1 + (Math.random() - 0.5) * (o.sizeVar ?? 0.6));
      p.size2 = o.size2 !== undefined ? o.size2 : p.size * (o.shrink ?? 0);
      p.rot = o.rot ?? Math.random() * Math.PI * 2;
      p.vrot = (o.vrot ?? 0) * (Math.random() * 2 - 1);
      p.r = r; p.g = g; p.b = b;
      p.r2 = r2; p.g2 = g2; p.b2 = b2;
      p.alpha = o.alpha ?? 1;
      p.fade = o.fade ?? 1;
      p.drag = o.drag ?? 0;
      p.blend = o.blend || 'lighter';
      p.trail = o.trail ?? 0;
      p.flickerHz = o.flicker ?? 0;
      if (o.attractX !== undefined) {
        p.attractX = o.attractX; p.attractY = o.attractY; p.attract = o.attract ?? 400;
      }
      p.orbit = o.orbit ?? 0;
    }
  }

  /** 外周から中心へ吸い込まれる粒（詠唱の収束表現）。 */
  converge(o) {
    this.emit({
      ...o,
      radius: o.radius ?? 260,
      radiusVar: 0.5,
      speed: -(o.inward ?? 60),
      speedVar: 0.8,
      attractX: o.x, attractY: o.y, attract: o.attract ?? 900,
      drag: o.drag ?? 0.6,
      kind: o.kind ?? KIND.MOTE,
    });
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      const p = this.pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove（配列の再確保を起こさない）
        this.count--;
        this.pool[i] = this.pool[this.count];
        this.pool[this.count] = p;
        p.active = false;
        continue;
      }
      p.px = p.x; p.py = p.y;

      if (p.attractX !== null) {
        const dx = p.attractX - p.x, dy = p.attractY - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = p.attract / Math.max(40, d);
        p.vx += (dx / d) * f * dt;
        p.vy += (dy / d) * f * dt;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt * 6);
        p.vx *= k; p.vy *= k;
      }
      if (p.orbit) {
        const c = Math.cos(p.orbit * dt), s = Math.sin(p.orbit * dt);
        const nx = p.vx * c - p.vy * s;
        p.vy = p.vx * s + p.vy * c;
        p.vx = nx;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      i++;
    }
  }

  _grad(ctx, r, g, b, size) {
    // 放射状グラデーションはキャッシュできないので、都度作るが呼び出し回数を抑える
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
    grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grd.addColorStop(0.4, `rgba(${r},${g},${b},0.55)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    return grd;
  }

  render(ctx, time) {
    ctx.save();
    let lastBlend = null;
    for (let i = 0; i < this.count; i++) {
      const p = this.pool[i];
      const t = 1 - p.life / p.maxLife;              // 0→1
      let a = p.alpha * Math.pow(1 - t, p.fade);
      if (p.flickerHz) a *= 0.65 + 0.35 * Math.sin(time * p.flickerHz + p.rot * 7);
      if (a <= 0.004) continue;
      const size = p.size + (p.size2 - p.size) * t;
      if (size <= 0.15) continue;

      const cr = Math.round(p.r + (p.r2 - p.r) * t);
      const cg = Math.round(p.g + (p.g2 - p.g) * t);
      const cb = Math.round(p.b + (p.b2 - p.b) * t);

      if (p.blend !== lastBlend) { ctx.globalCompositeOperation = p.blend; lastBlend = p.blend; }
      ctx.globalAlpha = a;

      switch (p.kind) {
        case KIND.SPARK: {
          const len = Math.min(64, Math.hypot(p.vx, p.vy) * 0.035 + size * 2);
          const ang = Math.atan2(p.vy, p.vx);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(ang);
          const grd = ctx.createLinearGradient(-len, 0, size, 0);
          grd.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
          grd.addColorStop(1, `rgba(${cr},${cg},${cb},1)`);
          ctx.strokeStyle = grd;
          ctx.lineWidth = Math.max(0.6, size * 0.6);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.lineTo(size, 0);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case KIND.SHARD: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
          ctx.beginPath();
          ctx.moveTo(0, -size);
          ctx.lineTo(size * 0.55, size * 0.35);
          ctx.lineTo(-size * 0.45, size * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case KIND.RIBBON: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const grd = ctx.createLinearGradient(-size * 4, 0, size * 4, 0);
          grd.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
          grd.addColorStop(0.5, `rgba(${cr},${cg},${cb},1)`);
          grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = grd;
          ctx.fillRect(-size * 4, -size * 0.35, size * 8, size * 0.7);
          ctx.restore();
          break;
        }
        case KIND.PETAL: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.55 + 0.45 * Math.sin(time * 2 + p.rot * 3));
          ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
          ctx.beginPath();
          ctx.ellipse(0, 0, size, size * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case KIND.STAR: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},1)`;
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const ang = (k / 8) * Math.PI * 2;
            const rr = k % 2 === 0 ? size : size * 0.34;
            k === 0 ? ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
                    : ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case KIND.RAY: {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const grd = ctx.createLinearGradient(0, 0, size * 9, 0);
          grd.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
          grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.moveTo(0, -size * 0.5);
          ctx.lineTo(size * 9, -size * 0.06);
          ctx.lineTo(size * 9, size * 0.06);
          ctx.lineTo(0, size * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        default: { // MOTE / DUST
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.fillStyle = this._grad(ctx, cr, cg, cb, size * 2.2);
          ctx.beginPath();
          ctx.arc(0, 0, size * 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

export { hexToRgb };
