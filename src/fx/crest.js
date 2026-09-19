/**
 * 星霊の紋章をシードから手続き的に生成する（SVG）。
 *
 * 画像アセットを一切持たないため、キャラクタの「見た目」はここが全て。
 * 同じ seed からは常に同じ紋章が出る（決定的）。86体すべてが別の形になるよう、
 * 対称数・コア形状・リング構成・翼・光輪・ルーンを独立に振る。
 */
import { mulberry32 } from '../util/rng.js';
import { elementOf, roleOf } from '../game/elements.js';
import { RARITY } from '../game/rarity.js';

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ✦✧✶✷✵✴';

let uid = 0;

const P = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];

/**
 * @param {object} char カタログの1体
 * @param {object} opts {size, id, animate}
 * @returns {string} SVG マークアップ
 */
export function crestSVG(char, opts = {}) {
  const size = opts.size ?? 240;
  const rnd = mulberry32(char.seed >>> 0);
  const el = elementOf(char.element);
  const role = roleOf(char.role);
  const rar = RARITY[char.rarity];
  const uidLocal = `c${(uid++).toString(36)}${(char.seed % 9973).toString(36)}`;

  const c1 = (char.colors && char.colors[0]) || el.color;
  const c2 = (char.colors && char.colors[1]) || el.color2;
  const accent = rar.color;

  const V = 200;            // viewBox 座標系
  const R = 88;             // 外周半径

  const sym = 5 + Math.floor(rnd() * 5);            // 5..9 回対称
  const coreType = Math.floor(rnd() * 5);           // コア形状
  const ringCount = 2 + Math.floor(rnd() * 3);      // 2..4
  const runeCount = [12, 16, 18, 24][Math.floor(rnd() * 4)];
  const hasWings = char.rarity >= 4 && rnd() < 0.75;
  const hasHalo = char.rarity >= 5;
  const hasOrbits = rnd() < 0.55;
  const tickStyle = Math.floor(rnd() * 3);
  const innerRot = (rnd() * 40 - 20).toFixed(1);

  const parts = [];

  /* ── 定義（グラデーション） ── */
  parts.push(`<defs>
    <radialGradient id="${uidLocal}-core" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/>
      <stop offset="35%" stop-color="${c1}" stop-opacity=".85"/>
      <stop offset="100%" stop-color="${c2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${uidLocal}-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="50%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <linearGradient id="${uidLocal}-wing" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity=".9"/>
      <stop offset="100%" stop-color="${c2}" stop-opacity=".1"/>
    </linearGradient>
    <radialGradient id="${uidLocal}-halo" cx="50%" cy="50%" r="50%">
      <stop offset="60%" stop-color="${accent}" stop-opacity="0"/>
      <stop offset="85%" stop-color="${accent}" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>`);

  const g = [];

  /* ── 光輪（★5のみ） ── */
  if (hasHalo) {
    g.push(`<circle cx="0" cy="0" r="${R * 1.1}" fill="url(#${uidLocal}-halo)"/>`);
  }

  /* ── 翼（★4以上） ── */
  if (hasWings) {
    const feathers = 4 + Math.floor(rnd() * 3);
    const wing = [];
    for (let i = 0; i < feathers; i++) {
      const t = i / (feathers - 1 || 1);
      const len = R * (0.55 + t * 0.62);
      const drop = -R * 0.12 + t * R * 0.5;
      const cur = R * (0.28 + t * 0.2);
      wing.push(`<path d="M0,0 C${P(-len * 0.4, drop - cur)} ${P(-len * 0.8, drop - cur * 0.4)} ${P(-len, drop)}
        C${P(-len * 0.75, drop + cur * 0.3)} ${P(-len * 0.35, drop + cur * 0.2)} 0,0 Z"
        fill="url(#${uidLocal}-wing)" opacity="${(0.34 + t * 0.3).toFixed(2)}"/>`);
    }
    g.push(`<g transform="translate(-6,4)">${wing.join('')}</g>`);
    g.push(`<g transform="translate(6,4) scale(-1,1)">${wing.join('')}</g>`);
  }

  /* ── 外周リング群 ── */
  for (let i = 0; i < ringCount; i++) {
    const rr = R * (1 - i * (0.11 + rnd() * 0.06));
    const sw = i === 0 ? 1.6 : 0.8 + rnd() * 0.9;
    const dash = i % 2 === 1 ? ` stroke-dasharray="${(2 + rnd() * 6).toFixed(1)} ${(3 + rnd() * 7).toFixed(1)}"` : '';
    g.push(`<circle cx="0" cy="0" r="${rr.toFixed(1)}" fill="none"
      stroke="url(#${uidLocal}-stroke)" stroke-width="${sw.toFixed(2)}" opacity="${(0.5 + i * 0.12).toFixed(2)}"${dash}/>`);
  }

  /* ── 目盛り ── */
  {
    const n = tickStyle === 0 ? 48 : tickStyle === 1 ? 36 : 72;
    const ticks = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const long = i % (n / 12) === 0;
      const [x1, y1] = polar(R * 0.965 - (long ? 7 : 3), a);
      const [x2, y2] = polar(R * 0.965 + (long ? 3 : 1), a);
      ticks.push(`M${P(x1, y1)}L${P(x2, y2)}`);
    }
    g.push(`<path d="${ticks.join('')}" stroke="${c1}" stroke-width=".8" opacity=".5" fill="none"/>`);
  }

  /* ── ルーン環 ── */
  {
    const runes = [];
    for (let i = 0; i < runeCount; i++) {
      const a = (i / runeCount) * Math.PI * 2 - Math.PI / 2;
      const rr = R * 0.78;
      const [x, y] = polar(rr, a);
      const ch = RUNES[Math.floor(rnd() * RUNES.length)];
      const deg = (a * 180 / Math.PI + 90).toFixed(1);
      runes.push(`<text x="0" y="0" transform="translate(${P(x, y)}) rotate(${deg})"
        font-size="${(R * 0.13).toFixed(1)}" text-anchor="middle" dominant-baseline="central"
        fill="${c1}" opacity=".75">${ch}</text>`);
    }
    g.push(`<g class="crest-rot-slow">${runes.join('')}</g>`);
  }

  /* ── コア（対称形状） ── */
  {
    const rr = R * 0.56;
    const core = [];
    if (coreType === 0) {
      // 星型多角形
      const step = Math.max(2, Math.floor(sym / 2));
      const pts = [];
      for (let k = 0; k <= sym; k++) {
        const a = ((k * step) % sym) / sym * Math.PI * 2 - Math.PI / 2;
        pts.push(P(...polar(rr, a)));
      }
      core.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="url(#${uidLocal}-stroke)" stroke-width="1.8" opacity=".9"/>`);
    } else if (coreType === 1) {
      // 入れ子多角形
      for (let j = 0; j < 3; j++) {
        const pts = [];
        const r2 = rr * (1 - j * 0.24);
        for (let k = 0; k < sym; k++) {
          const a = (k / sym) * Math.PI * 2 - Math.PI / 2 + j * 0.3;
          pts.push(P(...polar(r2, a)));
        }
        core.push(`<polygon points="${pts.join(' ')}" fill="none" stroke="${j % 2 ? c2 : c1}" stroke-width="${(1.6 - j * 0.4).toFixed(1)}" opacity="${(0.85 - j * 0.2).toFixed(2)}"/>`);
      }
    } else if (coreType === 2) {
      // 花弁（ベジエ）
      const petals = [];
      for (let k = 0; k < sym; k++) {
        const a = (k / sym) * Math.PI * 2 - Math.PI / 2;
        const [tx, ty] = polar(rr, a);
        const [c1x, c1y] = polar(rr * 0.6, a - 0.5);
        const [c2x, c2y] = polar(rr * 0.6, a + 0.5);
        petals.push(`M0,0 Q${P(c1x, c1y)} ${P(tx, ty)} Q${P(c2x, c2y)} 0,0 Z`);
      }
      core.push(`<path d="${petals.join('')}" fill="${c1}" opacity=".16" stroke="${c1}" stroke-width="1" />`);
    } else if (coreType === 3) {
      // 格子（全頂点を結ぶ）
      const pts = [];
      for (let k = 0; k < sym; k++) {
        const a = (k / sym) * Math.PI * 2 - Math.PI / 2;
        pts.push(polar(rr, a));
      }
      const lines = [];
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          lines.push(`M${P(pts[i][0], pts[i][1])}L${P(pts[j][0], pts[j][1])}`);
        }
      }
      core.push(`<path d="${lines.join('')}" stroke="${c1}" stroke-width=".7" fill="none" opacity=".55"/>`);
      core.push(`<polygon points="${pts.map((p) => P(p[0], p[1])).join(' ')}" fill="none" stroke="url(#${uidLocal}-stroke)" stroke-width="1.6"/>`);
    } else {
      // 同心の弧
      for (let j = 0; j < sym; j++) {
        const a0 = (j / sym) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2 / sym) * 0.72;
        const r2 = rr * (0.55 + (j % 3) * 0.22);
        const [x0, y0] = polar(r2, a0);
        const [x1, y1] = polar(r2, a1);
        core.push(`<path d="M${P(x0, y0)} A${r2.toFixed(1)},${r2.toFixed(1)} 0 0,1 ${P(x1, y1)}"
          fill="none" stroke="${j % 2 ? c1 : c2}" stroke-width="2" opacity=".8" stroke-linecap="round"/>`);
      }
    }
    // 頂点の小円
    const dots = [];
    for (let k = 0; k < sym; k++) {
      const a = (k / sym) * Math.PI * 2 - Math.PI / 2;
      const [x, y] = polar(rr, a);
      dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="${accent}" opacity=".9"/>`);
    }
    g.push(`<g class="crest-rot-rev" transform="rotate(${innerRot})">${core.join('')}${dots.join('')}</g>`);
  }

  /* ── 周回する小球 ── */
  if (hasOrbits) {
    const orbits = [];
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const rr = R * (0.36 + i * 0.16);
      const a = rnd() * Math.PI * 2;
      const [x, y] = polar(rr, a);
      orbits.push(`<ellipse cx="0" cy="0" rx="${rr.toFixed(1)}" ry="${(rr * (0.3 + rnd() * 0.5)).toFixed(1)}"
        fill="none" stroke="${c1}" stroke-width=".6" opacity=".35" transform="rotate(${(rnd() * 180).toFixed(0)})"/>`);
      orbits.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.8 + rnd() * 1.6).toFixed(1)}" fill="#ffffff" opacity=".85"/>`);
    }
    g.push(`<g class="crest-rot-slow2">${orbits.join('')}</g>`);
  }

  /* ── 中心：属性のコア光と文字 ── */
  g.push(`<circle cx="0" cy="0" r="${(R * 0.34).toFixed(1)}" fill="url(#${uidLocal}-core)"/>`);
  g.push(`<text x="0" y="1" font-size="${(R * 0.42).toFixed(1)}" text-anchor="middle" dominant-baseline="central"
    fill="#ffffff" opacity=".92" style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-weight:600">${el.glyph}</text>`);
  // 役割の小さな印（下部）
  g.push(`<text x="0" y="${(R * 0.62).toFixed(1)}" font-size="${(R * 0.15).toFixed(1)}" text-anchor="middle"
    dominant-baseline="central" fill="${accent}" opacity=".8"
    style="font-family:'Hiragino Mincho ProN','Yu Mincho',serif">${role.glyph}</text>`);

  parts.push(`<g transform="translate(${V / 2},${V / 2})">${g.join('')}</g>`);

  return `<svg class="crest" viewBox="0 0 ${V} ${V}" width="${size}" height="${size}"
    xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
    style="--crest-c1:${c1};--crest-c2:${c2};--crest-accent:${accent}">${parts.join('')}</svg>`;
}

/** シルエット用の大きな紋章（カットイン背景）。 */
export function crestSilhouette(char, size = 640) {
  return crestSVG(char, { size });
}
