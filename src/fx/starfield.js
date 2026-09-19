/**
 * 背景の星空・星雲。
 * 「雰囲気」の土台。派手さではなく、深さ（奥行き）と静けさを作る。
 */
import { hexToRgb } from './particles.js';

const PALETTE = [
  [255, 255, 255], [200, 225, 255], [255, 235, 200], [190, 200, 255], [255, 210, 230],
];

export class Starfield {
  constructor() {
    this.stars = [];
    this.nebula = null;
    this.w = 0; this.h = 0;
    this.time = 0;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.shooting = [];
    this.nextShooting = 4 + Math.random() * 8;
    this.tint = null;      // バナーのテーマ色で星雲を染める
    this.tintAmount = 0;
    this.intensity = 1;
  }

  resize(w, h, quality = 1) {
    this.w = w; this.h = h;
    const density = 0.00016 * quality;
    const n = Math.max(120, Math.min(900, Math.floor(w * h * density)));
    this.stars.length = 0;
    for (let i = 0; i < n; i++) {
      const depth = Math.random();
      const col = PALETTE[(Math.random() * PALETTE.length) | 0];
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: depth,
        r: (0.35 + Math.random() * 1.5) * (0.4 + depth * 0.9),
        base: 0.18 + Math.random() * 0.6,
        tw: 0.4 + Math.random() * 2.2,
        ph: Math.random() * Math.PI * 2,
        col,
        big: Math.random() < 0.035,
      });
    }
    this._buildNebula(w, h);
  }

  _buildNebula(w, h) {
    const c = document.createElement('canvas');
    const scale = 0.35; // 低解像度で作って引き伸ばす（コストと柔らかさの両取り）
    c.width = Math.max(2, Math.floor(w * scale));
    c.height = Math.max(2, Math.floor(h * scale));
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    const blobs = [
      { x: 0.24, y: 0.22, r: 0.55, c: [70, 40, 140], a: 0.5 },
      { x: 0.78, y: 0.36, r: 0.5, c: [24, 70, 130], a: 0.45 },
      { x: 0.5, y: 0.78, r: 0.62, c: [90, 30, 110], a: 0.35 },
      { x: 0.12, y: 0.7, r: 0.4, c: [20, 90, 120], a: 0.3 },
      { x: 0.62, y: 0.08, r: 0.38, c: [120, 60, 60], a: 0.18 },
    ];
    for (const b of blobs) {
      const cx = b.x * c.width, cy = b.y * c.height, rr = b.r * Math.max(c.width, c.height);
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      grd.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
      grd.addColorStop(0.55, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a * 0.28})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.nebula = c;
  }

  setTint(hex, amount = 0.35) {
    this.tint = hex ? hexToRgb(hex) : null;
    this.tintAmount = amount;
  }

  setParallax(nx, ny) { this.parallax.tx = nx * 22; this.parallax.ty = ny * 16; }

  update(dt) {
    this.time += dt;
    this.parallax.x += (this.parallax.tx - this.parallax.x) * Math.min(1, dt * 3);
    this.parallax.y += (this.parallax.ty - this.parallax.y) * Math.min(1, dt * 3);

    this.nextShooting -= dt;
    if (this.nextShooting <= 0) {
      this.nextShooting = 6 + Math.random() * 14;
      const fromLeft = Math.random() < 0.5;
      this.shooting.push({
        x: fromLeft ? -40 : this.w + 40,
        y: Math.random() * this.h * 0.55,
        vx: (fromLeft ? 1 : -1) * (520 + Math.random() * 420),
        vy: 190 + Math.random() * 180,
        life: 1.5, maxLife: 1.5,
        len: 90 + Math.random() * 130,
      });
    }
    for (let i = this.shooting.length - 1; i >= 0; i--) {
      const s = this.shooting[i];
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) this.shooting.splice(i, 1);
    }
  }

  render(ctx) {
    const { w, h } = this;
    // 深い夜の地色（上が暗く、下がわずかに明るい）
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04060f');
    bg.addColorStop(0.5, '#080b1c');
    bg.addColorStop(1, '#0d0a1e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (this.nebula) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85 * this.intensity;
      const px = this.parallax.x * 0.5, py = this.parallax.y * 0.5;
      ctx.drawImage(this.nebula, px - 20, py - 20, w + 40, h + 40);
      if (this.tint && this.tintAmount > 0) {
        ctx.globalAlpha = this.tintAmount * 0.5 * this.intensity;
        const [r, g, b] = this.tint;
        const grd = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.75);
        grd.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const t = this.time;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const a = s.base * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph)) * this.intensity;
      if (a <= 0.01) continue;
      const x = s.x + this.parallax.x * (0.2 + s.z);
      const y = s.y + this.parallax.y * (0.2 + s.z);
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${s.col[0]},${s.col[1]},${s.col[2]})`;
      if (s.big) {
        // 大きい星は十字の光条を付ける
        const g2 = ctx.createRadialGradient(x, y, 0, x, y, s.r * 7);
        g2.addColorStop(0, `rgba(${s.col[0]},${s.col[1]},${s.col[2]},0.9)`);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(x, y, s.r * 7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * 0.55;
        ctx.strokeStyle = `rgba(${s.col[0]},${s.col[1]},${s.col[2]},0.8)`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - s.r * 6, y); ctx.lineTo(x + s.r * 6, y);
        ctx.moveTo(x, y - s.r * 6); ctx.lineTo(x, y + s.r * 6);
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const s of this.shooting) {
      const k = s.life / s.maxLife;
      const a = Math.sin(Math.min(1, k * 2) * Math.PI) * 0.9;
      const ang = Math.atan2(s.vy, s.vx);
      const grd = ctx.createLinearGradient(
        s.x - Math.cos(ang) * s.len, s.y - Math.sin(ang) * s.len, s.x, s.y);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(1, `rgba(220,240,255,${a})`);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(ang) * s.len, s.y - Math.sin(ang) * s.len);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
