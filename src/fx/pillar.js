/**
 * 光柱・衝撃波・光条。解放の瞬間の主役。
 * どれも「生成 → 自動更新 → 寿命で消滅」の軽量エンティティ。
 */
import { hexToRgb } from './particles.js';

export class Effects {
  constructor() {
    this.pillars = [];
    this.waves = [];
    this.rays = [];
    this.beams = [];
    this.time = 0;
  }

  clear() { this.pillars.length = 0; this.waves.length = 0; this.rays.length = 0; this.beams.length = 0; }

  /** 光柱。空へ伸びる太い光。 */
  pillar(x, y, o = {}) {
    this.pillars.push({
      x, y,
      w: o.width ?? 160,
      life: o.life ?? 1.8, maxLife: o.life ?? 1.8,
      rgb: hexToRgb(o.color || '#ffffff'),
      rgb2: hexToRgb(o.color2 || o.color || '#8ad8ff'),
      rise: o.rise ?? 0.22,
      flare: o.flare ?? 1,
    });
  }

  /** 衝撃波リング（楕円で地面に沿う）。 */
  shockwave(x, y, o = {}) {
    this.waves.push({
      x, y,
      r: o.r0 ?? 8, rMax: o.rMax ?? 420,
      life: o.life ?? 0.75, maxLife: o.life ?? 0.75,
      w: o.width ?? 8,
      rgb: hexToRgb(o.color || '#ffffff'),
      flat: o.flat ?? 0.32,
      ease: o.ease ?? 2.2,
    });
  }

  /** 放射状の光条（クロスした光）。 */
  burstRays(x, y, o = {}) {
    const n = o.count ?? 12;
    for (let i = 0; i < n; i++) {
      this.rays.push({
        x, y,
        a: (i / n) * Math.PI * 2 + (o.rot ?? 0) + Math.random() * 0.2,
        len: (o.len ?? 300) * (0.5 + Math.random()),
        w: (o.width ?? 14) * (0.4 + Math.random()),
        life: (o.life ?? 0.55) * (0.6 + Math.random() * 0.7),
        maxLife: o.life ?? 0.55,
        rgb: hexToRgb(o.color || '#ffffff'),
        spin: (Math.random() - 0.5) * 0.6,
      });
    }
  }

  /** 十字の強い光（レンズフレア風）。 */
  crossFlare(x, y, o = {}) {
    this.beams.push({
      x, y,
      len: o.len ?? 520, w: o.width ?? 3,
      life: o.life ?? 0.7, maxLife: o.life ?? 0.7,
      rgb: hexToRgb(o.color || '#ffffff'),
      rot: o.rot ?? 0,
      arms: o.arms ?? 2,
    });
  }

  update(dt) {
    this.time += dt;
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const p = this.pillars[i]; p.life -= dt; if (p.life <= 0) this.pillars.splice(i, 1);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.life -= dt; if (w.life <= 0) this.waves.splice(i, 1);
    }
    for (let i = this.rays.length - 1; i >= 0; i--) {
      const r = this.rays[i]; r.life -= dt; r.a += r.spin * dt; if (r.life <= 0) this.rays.splice(i, 1);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.life -= dt; if (b.life <= 0) this.beams.splice(i, 1);
    }
  }

  render(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 光柱
    for (const p of this.pillars) {
      const t = 1 - p.life / p.maxLife;
      const grow = t < p.rise ? t / p.rise : 1;
      const fade = t < p.rise ? 1 : Math.pow(1 - (t - p.rise) / (1 - p.rise), 1.6);
      const width = p.w * (0.35 + grow * 0.65) * (1 + Math.sin(this.time * 22) * 0.03);
      const top = p.y - h * 1.2 * grow;

      const g = ctx.createLinearGradient(p.x - width, 0, p.x + width, 0);
      g.addColorStop(0, `rgba(${p.rgb2[0]},${p.rgb2[1]},${p.rgb2[2]},0)`);
      g.addColorStop(0.28, `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.4 * fade})`);
      g.addColorStop(0.5, `rgba(255,255,255,${0.85 * fade})`);
      g.addColorStop(0.72, `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.4 * fade})`);
      g.addColorStop(1, `rgba(${p.rgb2[0]},${p.rgb2[1]},${p.rgb2[2]},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(p.x - width, top, width * 2, p.y - top + 40);

      // 足元の光だまり
      const fg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, width * 2.4);
      fg.addColorStop(0, `rgba(255,255,255,${0.7 * fade})`);
      fg.addColorStop(0.4, `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${0.4 * fade})`);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(1, 0.4);
      ctx.beginPath(); ctx.arc(0, 0, width * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 衝撃波
    for (const w2 of this.waves) {
      const t = 1 - w2.life / w2.maxLife;
      const e = 1 - Math.pow(1 - t, w2.ease);
      const r = w2.r + (w2.rMax - w2.r) * e;
      const a = Math.pow(1 - t, 1.8);
      ctx.save();
      ctx.translate(w2.x, w2.y);
      ctx.scale(1, w2.flat);
      ctx.strokeStyle = `rgba(${w2.rgb[0]},${w2.rgb[1]},${w2.rgb[2]},${a})`;
      ctx.lineWidth = w2.w * (1 - t * 0.7);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = a * 0.35;
      ctx.lineWidth = w2.w * 3 * (1 - t);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // 光条
    for (const r of this.rays) {
      const t = 1 - r.life / r.maxLife;
      const a = Math.sin(Math.min(1, (1 - t) * 1.6) * Math.PI * 0.5);
      const len = r.len * (0.3 + t * 0.7);
      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.rotate(r.a);
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, `rgba(${r.rgb[0]},${r.rgb[1]},${r.rgb[2]},${a * 0.9})`);
      g.addColorStop(1, `rgba(${r.rgb[0]},${r.rgb[1]},${r.rgb[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -r.w * 0.5 * a);
      ctx.lineTo(len, -r.w * 0.06);
      ctx.lineTo(len, r.w * 0.06);
      ctx.lineTo(0, r.w * 0.5 * a);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 十字フレア
    for (const b of this.beams) {
      const t = 1 - b.life / b.maxLife;
      const a = Math.pow(1 - t, 1.4);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      for (let k = 0; k < b.arms * 2; k++) {
        ctx.save();
        ctx.rotate((k / (b.arms * 2)) * Math.PI * 2);
        const len = b.len * (k % 2 === 0 ? 1 : 0.55) * (0.6 + a * 0.4);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.25, `rgba(${b.rgb[0]},${b.rgb[1]},${b.rgb[2]},${a * 0.6})`);
        g.addColorStop(1, `rgba(${b.rgb[0]},${b.rgb[1]},${b.rgb[2]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -b.w * a);
        ctx.lineTo(len, 0);
        ctx.lineTo(0, b.w * a);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // 中心のコア
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, b.w * 14 * a);
      cg.addColorStop(0, `rgba(255,255,255,${a})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, 0, b.w * 14 * a, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
