/**
 * 星辰儀（魔法陣）。
 * 多重リング × 逆回転 × ルーンの逐次点灯 × 中心の幾何図形。
 * charge(0→1) で明度・拡大・回転速度・点灯数が連動して上がる。
 */
import { hexToRgb } from './particles.js';

const RUNES = '☆✦✧✶✷✵✴✳❋❊❉❈✼✻✺✹✸◈◇◆⬡⬢⟡⟢⟣△▽◁▷☾☽⚝⚹✹ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

function ringGlyphs(count, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [];
  for (let i = 0; i < count; i++) out.push(RUNES[(rnd() * RUNES.length) | 0]);
  return out;
}

export class MagicCircle {
  constructor() {
    this.time = 0;
    this.charge = 0;        // 0..1 詠唱の進行
    this.ignite = 0;        // 0..1 全体の表示量
    this.runeLit = 0;       // 0..1 点灯しているルーンの割合
    this.spin = 0;
    this.spinBoost = 1;
    this.scale = 1;
    this.tilt = 0;          // 0..1 斜め（カメラ回り込み）
    this.colors = ['#ffffff', '#9ad8ff', '#4a2a9c'];
    this._rgb = this.colors.map(hexToRgb);
    this.rings = [
      { r: 1.00, w: 2.4, speed: -0.10, glyphs: 30, dash: null, ticks: 0 },
      { r: 0.92, w: 1.0, speed: 0.16, glyphs: 0, dash: [4, 10], ticks: 60 },
      { r: 0.76, w: 3.2, speed: -0.22, glyphs: 18, dash: null, ticks: 0 },
      { r: 0.62, w: 1.2, speed: 0.34, glyphs: 0, dash: [2, 6], ticks: 0 },
      { r: 0.46, w: 2.0, speed: -0.46, glyphs: 12, dash: null, ticks: 24 },
      { r: 0.30, w: 1.4, speed: 0.62, glyphs: 0, dash: [10, 6], ticks: 0 },
    ];
    this.glyphs = this.rings.map((r, i) => ringGlyphs(r.glyphs, 0x9e3779b9 ^ (i * 2654435761)));
    this.polys = [
      { n: 7, step: 3, r: 0.56, w: 1.4, speed: 0.08 },
      { n: 5, step: 2, r: 0.40, w: 1.1, speed: -0.13 },
      { n: 3, step: 1, r: 0.24, w: 1.8, speed: 0.19 },
    ];
  }

  setColors(arr) {
    this.colors = arr;
    this._rgb = arr.map(hexToRgb);
  }

  update(dt) {
    this.time += dt;
    this.spin += dt * (0.25 + this.charge * 2.4) * this.spinBoost;
  }

  _col(i, a) {
    const c = this._rgb[Math.min(i, this._rgb.length - 1)];
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }

  render(ctx, cx, cy, radius) {
    if (this.ignite <= 0.002) return;
    const ig = this.ignite;
    const ch = this.charge;
    const R = radius * this.scale * (1 + ch * 0.06);

    ctx.save();
    ctx.translate(cx, cy);
    if (this.tilt > 0) {
      // 斜めからの見下ろし（カメラ回り込み演出）
      ctx.transform(1, 0, 0, 1 - this.tilt * 0.55, 0, 0);
    }
    ctx.globalCompositeOperation = 'lighter';

    // ── 中心のコア光 ──
    const coreR = R * (0.18 + ch * 0.4);
    const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
    grd.addColorStop(0, this._col(0, 0.85 * ig * (0.35 + ch)));
    grd.addColorStop(0.35, this._col(1, 0.45 * ig * (0.25 + ch)));
    grd.addColorStop(1, this._col(2, 0));
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();

    // ── リング ──
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const rr = R * ring.r;
      const rot = this.spin * ring.speed * 6;
      const alpha = ig * (0.45 + ch * 0.55) * (i === 0 ? 1 : 0.85);

      ctx.save();
      ctx.rotate(rot);
      ctx.lineWidth = ring.w * (1 + ch * 0.5);
      ctx.strokeStyle = this._col(i % 2 === 0 ? 0 : 1, alpha);
      if (ring.dash) ctx.setLineDash(ring.dash.map((v) => v * (1 + ch)));
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 目盛り
      if (ring.ticks) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = this._col(1, alpha * 0.55);
        for (let k = 0; k < ring.ticks; k++) {
          const a = (k / ring.ticks) * Math.PI * 2;
          const long = k % 5 === 0;
          const r1 = rr - (long ? 9 : 4), r2 = rr + (long ? 5 : 2);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
          ctx.stroke();
        }
      }

      // ルーン（逐次点灯）
      const gl = this.glyphs[i];
      if (gl && gl.length) {
        const litCount = Math.floor(gl.length * this.runeLit);
        ctx.font = `${Math.max(8, rr * 0.085)}px "Hiragino Mincho ProN", "Yu Mincho", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let k = 0; k < gl.length; k++) {
          const a = (k / gl.length) * Math.PI * 2;
          const lit = k < litCount;
          const pulse = lit ? 0.7 + 0.3 * Math.sin(this.time * 6 + k) : 0.16;
          ctx.fillStyle = this._col(lit ? 0 : 2, alpha * pulse);
          ctx.save();
          ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillText(gl[k], 0, 0);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ── 中心の幾何図形（星型多角形） ──
    for (let i = 0; i < this.polys.length; i++) {
      const p = this.polys[i];
      const rr = R * p.r;
      ctx.save();
      ctx.rotate(this.spin * p.speed * 6);
      ctx.lineWidth = p.w * (1 + ch * 0.6);
      ctx.strokeStyle = this._col(i === 0 ? 1 : 0, ig * (0.3 + ch * 0.7));
      ctx.beginPath();
      for (let k = 0; k <= p.n; k++) {
        const a = ((k * p.step) % p.n) / p.n * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // ── 放射状の光条（チャージ時のみ） ──
    if (ch > 0.15) {
      const rays = 24;
      ctx.save();
      ctx.rotate(-this.spin * 0.4);
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * Math.PI * 2;
        const len = R * (0.35 + 0.55 * ch) * (0.6 + 0.4 * Math.sin(this.time * 3 + k * 1.7));
        const g2 = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        g2.addColorStop(0, this._col(0, ig * ch * 0.5));
        g2.addColorStop(1, this._col(1, 0));
        ctx.strokeStyle = g2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
}
