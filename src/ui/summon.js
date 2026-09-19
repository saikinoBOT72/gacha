/**
 * 演出ディレクター。StagePlan を「再生」する。
 *
 * 本作の心臓。RESEARCH §1 の「期待度の階段」をそのままタイムラインに落とす:
 *   予兆 → 投入 → 詠唱 → 色の確定 → 昇格 → 解放 → カットイン → 顕現 → 余韻
 *
 * 重要な約束（NOTES E1/E9）:
 *   - 抽選は既に終わっていて保存済み。ここは「見せ方」しか持たない。
 *   - いつスキップされても、いつ画面を閉じられても結果は壊れない。
 */
import { h, clear, qs, on, vibrate, prefersReducedMotion } from '../util/dom.js';
import { tween, wait, during, Token, ticker } from '../util/tween.js';
import { Ease } from '../util/ease.js';
import { stage, KIND } from '../fx/stage.js';
import { crestSVG, crestSilhouette } from '../fx/crest.js';
import { TIERS, RARITY } from '../game/rarity.js';
import { elementOf, roleOf } from '../game/elements.js';
import { T } from '../game/stagePlan.js';
import { sfx, bgm, engine, AURA_SFX } from '../audio/index.js';
import { state } from '../game/state.js';
import { stars } from './components.js';

const RAINBOW = ['#ff6ec7', '#ffd166', '#5ad9ff', '#b388ff', '#7dffb0'];

/* ══════════════════════════════════════════════════════════
   DOM 組み立て
   ══════════════════════════════════════════════════════════ */

function cardEl(result, opts = {}) {
  const c = result.char;
  const R = RARITY[c.rarity];
  const el = elementOf(c.element);
  const node = h(`div.scard.scard--r${c.rarity}`, {
    style: {
      '--c1': (c.colors && c.colors[0]) || el.color,
      '--c2': (c.colors && c.colors[1]) || el.color2,
      '--rc': R.color,
      '--rc2': R.color2,
      '--glow': R.glow,
    },
    dataset: { rarity: String(c.rarity) },
  });

  const back = h('div.scard__face.scard__back',
    h('div.scard__back-art'),
    h('div.scard__back-sigil', '✦'),
  );

  const front = h('div.scard__face.scard__front',
    h('div.scard__frame'),
    h('div.scard__aura'),
    h('div.scard__art', { html: crestSVG(c, { size: opts.size || 200 }) }),
    h('div.scard__sheen'),
    h('div.scard__starrow'),
    h('div.scard__label',
      h('div.scard__name', { text: c.name }),
      h('div.scard__title', { text: c.title }),
    ),
    h(`div.scard__elem.elem--${c.element}`, el.glyph),
    result.isNew ? h('div.scard__new', 'NEW') : h('div.scard__dupe', `星片 +${result.shards}`),
    result.isPickup ? h('div.scard__pu', 'PICK UP') : null,
  );

  node.appendChild(back);
  node.appendChild(front);
  return node;
}

function setBackTier(cardNode, tier) {
  cardNode.dataset.backTier = String(tier);
  const t = TIERS[tier];
  cardNode.style.setProperty('--back-a', t.ring[0]);
  cardNode.style.setProperty('--back-b', t.ring[1]);
  cardNode.style.setProperty('--back-c', t.ring[2]);
}

/* ══════════════════════════════════════════════════════════
   個別の演出パーツ
   ══════════════════════════════════════════════════════════ */

/** 星晶石が飛んで魔法陣に落ちる。 */
async function flyOrb(token, { fromX, fromY, toX, toY, dur, color, trail = true }) {
  const pos = { x: fromX, y: fromY };
  await tween({
    from: 0, to: 1, dur, ease: 'inQuad', token,
    onUpdate: (t) => {
      // 放物線を描く
      const x = fromX + (toX - fromX) * t;
      const y = fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * 110;
      pos.x = x; pos.y = y;
      if (trail) {
        stage.particles.emit({
          x, y, kind: KIND.MOTE, count: 2, speed: 22, life: 0.5, lifeVar: 0.6,
          size: 3.4, shrink: 0.1, color: '#ffffff', color2: color, fade: 1.6, drag: 1.5,
        });
        if (Math.random() < 0.4) {
          stage.particles.emit({
            x, y, kind: KIND.SPARK, count: 1, speed: 70, life: 0.35,
            size: 2, shrink: 0, color, drag: 1.2, gravity: 120,
          });
        }
      }
    },
  });
  return pos;
}

/** オーラ色を切り替える（魔法陣・粒子・DOM 変数を一斉に）。 */
function applyTier(tier, layer) {
  const t = TIERS[tier];
  stage.circle.setColors(t.ring);
  stage.starfield.setTint(t.color, 0.3 + tier * 0.12);
  if (layer) {
    layer.style.setProperty('--tier-a', t.ring[0]);
    layer.style.setProperty('--tier-b', t.ring[1]);
    layer.style.setProperty('--tier-c', t.ring[2]);
    layer.dataset.tier = String(tier);
  }
}

/** オーラ確定の瞬間。 */
function auraHit(tier, layer) {
  const t = TIERS[tier];
  applyTier(tier, layer);
  sfx.play(AURA_SFX[tier]);

  const intensity = 0.15 + tier * 0.2;
  stage.post.doFlash(tier >= 3 ? 0.55 : 0.2 + tier * 0.08, t.color, 6);
  stage.post.shake(intensity);
  if (tier >= 3) stage.post.chroma(0.5 + tier * 0.15);
  stage.burst(tier, t.ring[0], t.ring[1]);
  stage.effects.shockwave(stage.cx, stage.cy, {
    rMax: stage.radius * (2 + tier * 0.7), color: t.ring[0], width: 3 + tier * 2, life: 0.7, flat: 1,
  });
  if (tier >= 2) {
    stage.effects.burstRays(stage.cx, stage.cy, {
      count: 6 + tier * 4, len: stage.radius * (1.4 + tier * 0.4), color: t.ring[0], life: 0.7,
    });
  }
  vibrate(state.settings.haptics ? [8 + tier * 10] : 0);
}

/** 昇格：タメ（無音）→ 破砕 → 次の色へ。 */
async function upgradeStep(token, step, layer, speed) {
  const t = TIERS[step.tier];

  // ── タメ：音を絞り、画面をほぼ止める。無音が一番怖い（RESEARCH §1.3）──
  engine.duckSfx(0.12, 0.05);
  sfx.play('heartbeat', { peak: 0.45 });
  stage.post.setVignette(0.95);
  stage.circle.spinBoost = 0.12;
  const hold = { v: 1 };
  await tween({
    from: 1, to: 0.15, dur: T.stepSilence * speed, ease: 'outQuad', token,
    onUpdate: (v) => { hold.v = v; stage.circle.charge = 0.45 + v * 0.3; },
  });
  if (token.cancelled) return;

  // ── 昇格の瞬間 ──
  engine.duckSfx(1, 0.02);
  sfx.play(step.sfx);
  stage.circle.spinBoost = 3.2;
  applyTier(step.tier, layer);

  stage.post.doFlash(0.45 + step.tier * 0.1, t.color, 7);
  stage.post.shake(0.35 + step.tier * 0.1);
  stage.post.chroma(0.7);
  stage.post.scan = 0.8;
  ticker.hold(step.tier >= 3 ? 70 : 40);

  stage.particles.emit({
    x: stage.cx, y: stage.cy, kind: KIND.SHARD, count: 30, radius: stage.radius * 0.9, radiusVar: 0.3,
    speed: 340, speedVar: 0.8, life: 0.8, size: 6, shrink: 0.2, color: t.ring[0], color2: t.ring[2],
    vrot: 12, drag: 0.7, gravity: 260,
  });
  stage.particles.emit({
    x: stage.cx, y: stage.cy, kind: KIND.SPARK, count: 36, speed: 520, speedVar: 0.9,
    life: 0.5, size: 2.6, color: t.ring[0], drag: 1.2,
  });
  stage.effects.shockwave(stage.cx, stage.cy, {
    rMax: stage.radius * 2.6, color: t.ring[0], width: 5, life: 0.55, flat: 1,
  });
  vibrate(state.settings.haptics ? [12, 30, 22] : 0);

  layer.classList.add('is-upgrade');
  setTimeout(() => layer.classList.remove('is-upgrade'), 320);

  await tween({
    from: 0, to: 1, dur: (T.stepGap - T.stepSilence) * speed, ease: 'outCubic', token,
    onUpdate: (v) => {
      stage.circle.charge = 0.7 + v * 0.3;
      stage.post.scan = 0.8 * (1 - v);
      stage.circle.spinBoost = 3.2 - v * 2.0;
    },
  });
  stage.post.setVignette(0.85);
}

/** 解放（バースト）。演出の最高点。 */
function release(cue, layer) {
  const tier = cue.finalTier;
  const t = TIERS[tier];
  const top = tier >= 4;

  stage.post.doFlash(top ? 1 : 0.5 + tier * 0.12, top ? '#ffffff' : t.color, top ? 3.2 : 5.5);
  stage.post.shake(0.55 + tier * 0.12);
  stage.post.chroma(top ? 1 : 0.5);
  ticker.hold(top ? 110 : tier === 3 ? 60 : tier === 2 ? 35 : 0);

  sfx.play('impactFull', { scale: 0.7 + tier * 0.12 });
  if (tier >= 2) sfx.play('pillar', { dur: 1.2 + tier * 0.3 });

  stage.effects.pillar(stage.cx, stage.cy, {
    color: top ? '#ffffff' : t.ring[0],
    color2: t.ring[1],
    width: 90 + tier * 46,
    life: 1.6 + tier * 0.35,
  });
  stage.effects.crossFlare(stage.cx, stage.cy, {
    color: t.ring[0], len: stage.w * (0.5 + tier * 0.15), width: 2 + tier, life: 0.9, arms: top ? 3 : 2,
  });
  for (let i = 0; i < 3; i++) {
    setTimeout(() => stage.effects.shockwave(stage.cx, stage.cy, {
      rMax: Math.max(stage.w, stage.h) * (0.6 + tier * 0.2), color: t.ring[i % t.ring.length],
      width: 6 + tier * 2, life: 0.8, flat: 1,
    }), i * 70);
  }
  stage.burst(tier, t.ring[0], t.ring[1]);
  stage.burst(tier, t.ring[1], t.ring[2]);

  if (top) {
    // 虹：全色の粒を撒く
    RAINBOW.forEach((col, i) => {
      setTimeout(() => stage.particles.emit({
        x: stage.cx, y: stage.cy, kind: i % 2 ? KIND.RIBBON : KIND.MOTE, count: 26,
        speed: 420 + i * 40, speedVar: 0.9, life: 1.6, lifeVar: 0.6,
        size: 5, shrink: 0.2, color: col, color2: '#ffffff', drag: 1.1, vrot: 6, fade: 1.4,
      }), i * 45);
    });
    stage.particles.emit({
      x: stage.cx, y: stage.cy, kind: KIND.STAR, count: 18, speed: 300, speedVar: 1,
      life: 2.2, lifeVar: 0.5, size: 9, shrink: 0.2, color: '#ffffff', color2: '#ffd166',
      drag: 1.3, vrot: 3, fade: 1.2,
    });
  }
  vibrate(state.settings.haptics ? (top ? [30, 40, 60, 30, 90] : [20, 30, 40]) : 0);
  layer.classList.add('is-burst');
  setTimeout(() => layer.classList.remove('is-burst'), 600);
}

/** ★5/★4 のカットイン。 */
async function cutIn(token, result, cue, layer, speed) {
  const c = result.char;
  const full = cue.cutInFull;
  const el = elementOf(c.element);
  const R = RARITY[c.rarity];

  const node = h('div.cutin' + (full ? '.cutin--ur' : '.cutin--ssr'), {
    style: {
      '--c1': (c.colors && c.colors[0]) || el.color,
      '--c2': (c.colors && c.colors[1]) || el.color2,
      '--rc': R.color,
    },
  },
    h('div.cutin__bg'),
    h('div.cutin__streaks'),
    h('div.cutin__sil', { html: crestSilhouette(c, 560) }),
    h('div.cutin__text',
      h('div.cutin__kicker', { text: full ? '★5 確定' : '★4 以上' }),
      h('div.cutin__name', { text: c.name }),
      h('div.cutin__title', { text: c.title }),
    ),
    full ? h('div.cutin__stamp', '確定') : null,
  );
  layer.appendChild(node);

  stage.post.setLetterbox(1);
  sfx.play('suck', { dur: 0.35 * speed });
  await wait(0.06 * speed, token);
  if (token.cancelled) { node.remove(); stage.post.setLetterbox(0); return; }

  node.classList.add('is-in');
  sfx.play(full ? 'fanfare5' : 'fanfare4');
  stage.post.shake(full ? 0.6 : 0.35);
  stage.post.chroma(full ? 0.9 : 0.5);
  stage.post.doFlash(full ? 0.7 : 0.35, '#ffffff', 6);
  if (full) ticker.slow(0.42, 260);

  await wait((full ? T.cutInDur : T.cutInDur * 0.55) * speed, token);

  node.classList.add('is-out');
  stage.post.setLetterbox(0);
  await wait(0.22 * speed, token);
  node.remove();
}

/** カード顕現（飛来 → フリップ → 枠 → ★点灯 → ホロ）。 */
async function revealCard(token, result, layer, speed, opts = {}) {
  const c = result.char;
  const wrap = h('div.reveal',
    h('div.reveal__glow'),
  );
  const card = cardEl(result, { size: 230 });
  card.classList.add('scard--hero');
  setBackTier(card, opts.backTier ?? RARITY[c.rarity].tier);
  wrap.appendChild(card);
  layer.appendChild(wrap);

  // 飛来
  sfx.play('whoosh', { dur: 0.35, peak: 0.16 });
  wrap.classList.add('is-fly');
  await wait(T.cardFly * speed, token);
  if (token.cancelled) { finishInstant(); return wrap; }

  // フリップ
  sfx.play('cardFlip');
  card.classList.add('is-flip');
  stage.post.shake(0.12);
  await wait(T.cardFlip * speed, token);
  if (token.cancelled) { finishInstant(); return wrap; }

  // 枠の組み上がり
  card.classList.add('is-framed');
  sfx.play('frameLock', { scale: 0.7 + c.rarity * 0.1 });
  stage.post.shake(0.08 + c.rarity * 0.03);
  stage.particles.emit({
    x: stage.cx, y: stage.cy, kind: KIND.SPARK, count: 18, speed: 240, life: 0.5,
    size: 2.2, color: RARITY[c.rarity].color, drag: 1.4, gravity: 200,
  });
  await wait(0.14 * speed, token);

  // ★ の点灯
  const row = card.querySelector('.scard__starrow');
  for (let i = 0; i < c.rarity; i++) {
    if (token.cancelled) break;
    const s = h('i.rstar', '★');
    row.appendChild(s);
    requestAnimationFrame(() => s.classList.add('is-lit'));
    sfx.play('chimeStar', { index: i });
    stage.post.shake(0.03);
    await wait(T.starStep * speed, token);
  }
  if (token.cancelled) { finishInstant(); return wrap; }

  // ホロ箔スイープ
  card.classList.add('is-holo');
  sfx.play('holoSheen', { dur: 0.75 });
  if (c.rarity >= 4) {
    stage.particles.emit({
      x: stage.cx, y: stage.cy, kind: KIND.MOTE, count: 24, radius: 150, radiusVar: 0.8,
      speed: -30, life: 1.8, lifeVar: 0.5, size: 3, shrink: 0.2,
      color: RARITY[c.rarity].color, color2: '#ffffff', drag: 0.8, fade: 1.4, flicker: 3,
    });
  }
  await wait(0.2 * speed, token);

  card.classList.add('is-settled');
  if (result.isNew) sfx.play('newBadge');
  else if (result.shards) sfx.play('shardGain');

  function finishInstant() {
    wrap.classList.add('is-fly');
    card.classList.add('is-flip', 'is-framed', 'is-holo', 'is-settled');
    if (!row.childElementCount) {
      for (let i = 0; i < c.rarity; i++) {
        const s = h('i.rstar.is-lit', '★');
        row.appendChild(s);
      }
    }
  }
  if (token.cancelled) finishInstant();
  return wrap;
}

/* ══════════════════════════════════════════════════════════
   シーケンス本体
   ══════════════════════════════════════════════════════════ */

async function prelude(token, plan, layer, speed) {
  const cue = plan.cue;

  stage.clearAll();
  stage.post.setVignette(0.88);
  bgm.setMood('charge', 0.6);
  engine.duckBgm(0.3, 0.25);
  applyTier(0, layer);
  if (token.cancelled) return;

  // 特殊ゲート：暗転（★5のみ・3%）
  if (cue.specialGate === 'blackout') {
    layer.classList.add('is-blackout');
    stage.post.setDarken(0.95);
    stage.starfield.intensity = 0.15;
    sfx.play('suck', { dur: 0.9 });
    // 星が降る
    for (let i = 0; i < 40; i++) {
      setTimeout(() => stage.particles.emit({
        x: Math.random() * stage.w, y: -20, kind: KIND.SPARK, count: 1,
        speed: 0, vy: 420 + Math.random() * 520, vx: (Math.random() - 0.5) * 60,
        life: 1.6, size: 2.4, color: '#cfe9ff', color2: '#ffffff', fade: 1.2,
      }), i * 24);
    }
    await wait(1.05 * speed, token);
    sfx.play('choirStab', { dur: 0.6, peak: 0.16 });
    stage.post.doFlash(0.5, '#9ad8ff', 5);
    stage.post.setDarken(0.35);
    stage.starfield.intensity = 1;
    await wait(0.35 * speed, token);
    layer.classList.remove('is-blackout');
    stage.post.setDarken(0);
  }

  // 投入
  stage.circle.ignite = 0;
  sfx.play('coinInsert');
  await flyOrb(token, {
    fromX: stage.cx, fromY: stage.h + 60,
    toX: stage.cx, toY: stage.cy,
    dur: (T.orbImpact - T.orbLaunch) * speed,
    color: '#bfe6ff',
  });
  if (token.cancelled) return;

  // 着弾 → 陣の点火
  sfx.play('impactSoft');
  stage.post.shake(0.2);
  stage.post.doFlash(0.22, '#bfe6ff', 8);
  stage.effects.shockwave(stage.cx, stage.cy, { rMax: stage.radius * 2.2, color: '#bfe6ff', width: 5, life: 0.7, flat: 0.45 });
  stage.particles.emit({
    x: stage.cx, y: stage.cy, kind: KIND.SPARK, count: 26, speed: 300, life: 0.6,
    size: 2.4, color: '#ffffff', color2: '#7fd8ff', drag: 1.2, gravity: 360,
  });
  await tween({
    from: 0, to: 1, dur: 0.3 * speed, ease: 'outCubic', token,
    onUpdate: (v) => { stage.circle.ignite = v; stage.circle.scale = 0.7 + v * 0.3; },
  });
}

async function chargePhase(token, plan, layer, speed) {
  const cue = plan.cue;
  const dur = T.chargeDur * speed;
  sfx.play('charge', { dur: dur * 0.95 });
  stage.circle.spinBoost = 1;

  let acc = 0;
  await during(dur, (t) => {
    stage.circle.charge = Ease.inQuad(t);
    stage.circle.runeLit = Ease.outQuad(t);
    stage.circle.scale = 1 + t * 0.08;
    acc += 1;
    if (acc % 2 === 0) stage.converge(TIERS[cue.startTier].color, 1 + t * 4);
    if (t > 0.6 && Math.random() < 0.12) {
      stage.particles.emit({
        x: stage.cx, y: stage.cy, kind: KIND.SPARK, count: 2, radius: stage.radius * 0.6,
        speed: 120, life: 0.4, size: 2, color: '#ffffff', drag: 1.5,
      });
    }
  }, token);

  if (token.cancelled) return;
  // 収束の完了 → 一瞬の圧縮
  stage.post.shake(0.14);
  await tween({
    from: 1.08, to: 0.9, dur: 0.16 * speed, ease: 'inQuad', token,
    onUpdate: (v) => { stage.circle.scale = v; },
  });
}

async function auraPhase(token, plan, layer, speed) {
  const cue = plan.cue;
  auraHit(cue.startTier, layer);
  stage.circle.scale = 1.05;
  await wait(0.42 * speed, token);
  if (token.cancelled) return;

  for (const step of cue.steps) {
    if (token.cancelled) return;
    await upgradeStep(token, step, layer, speed);
  }
}

async function climax(token, plan, result, layer, speed) {
  const cue = plan.cue;

  // 虹だけは BGM を完全に止める（RESEARCH §1.5 質的断絶）
  if (cue.finalTier >= 4) {
    bgm.setMood('silence', 0.05);
    engine.duckBgm(0.0001, 0.05);
  }

  if (cue.cameraMove === 'orbit') {
    tween({ from: 0, to: 0.55, dur: 0.7 * speed, ease: 'outCubic', token, onUpdate: (v) => { stage.circle.tilt = v; } });
  } else if (cue.cameraMove === 'slam') {
    tween({ from: 1.05, to: 1.25, dur: 0.22 * speed, ease: 'outBack', token, onUpdate: (v) => { stage.circle.scale = v; } });
  }

  release(cue, layer);
  await wait(0.34 * speed, token);
  if (token.cancelled) return;

  // 陣を畳む（カットインの背後で陣が主張しないように、カットインより先に始める）
  tween({
    from: stage.circle.ignite, to: cue.cutIn ? 0.06 : 0.25, dur: 0.5 * speed, ease: 'outCubic', token,
    onUpdate: (v) => { stage.circle.ignite = v; stage.circle.charge = v; },
  });

  if (cue.cutIn) {
    await cutIn(token, result, cue, layer, speed);
    if (token.cancelled) return;
    stage.circle.ignite = 0.25;
    stage.circle.charge = 0.25;
  }
}

/* ───────────── 単発 ───────────── */

async function runSingle(token, plan, layer, speed) {
  const result = plan.results[0];
  await prelude(token, plan, layer, speed);
  if (!token.cancelled) await chargePhase(token, plan, layer, speed);
  if (!token.cancelled) await auraPhase(token, plan, layer, speed);
  if (!token.cancelled) await climax(token, plan, result, layer, speed);

  const holder = h('div.reveal-stage');
  layer.appendChild(holder);
  await revealCard(token, result, holder, speed, { backTier: plan.cue.finalTier });
  return holder;
}

/* ───────────── 10連 ───────────── */

async function runMulti(token, plan, layer, speed) {
  const n = plan.results.length;

  stage.clearAll();
  stage.post.setVignette(0.88);
  bgm.setMood('charge', 0.6);
  engine.duckBgm(0.3, 0.25);
  applyTier(0, layer);

  // ── 一斉射出 ──
  if (token.cancelled) {
    const grid0 = h('div.multi-grid');
    layer.appendChild(grid0);
    const cards0 = plan.results.map((res, i) => {
      const c = cardEl(res, { size: 128 });
      c.classList.add('scard--grid', 'is-dealt');
      setBackTier(c, plan.backsFinal[i]);
      c.style.setProperty('--i', String(i));
      grid0.appendChild(c);
      return c;
    });
    return { grid: grid0, cards: cards0 };
  }
  sfx.play('coinInsert');
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    setTimeout(() => {
      if (token.cancelled) return;
      sfx.play('whoosh', { dur: 0.4, peak: 0.1, pan: k * 0.8, from: 300 + i * 40, to: 3400 + i * 200 });
      flyOrb(token, {
        fromX: stage.cx + k * 40, fromY: stage.h + 40,
        toX: stage.cx + k * stage.w * 0.55, toY: stage.h * 0.12,
        dur: 0.75 * speed, color: '#bfe6ff',
      });
    }, i * T.multiLaunchStagger * 1000 * speed);
  }
  await wait(T.multiSkyBurst * speed, token);
  if (token.cancelled) return null;

  // ── 天空で爆ぜる ──
  sfx.play('impactFull', { scale: 0.5 });
  stage.post.doFlash(0.4, '#cfe9ff', 6);
  stage.post.shake(0.32);
  stage.particles.emit({
    x: stage.cx, y: stage.h * 0.12, kind: KIND.SPARK, count: 70, speed: 520, speedVar: 1,
    life: 1.1, lifeVar: 0.7, size: 3, color: '#ffffff', color2: '#7fd8ff', drag: 0.8, gravity: 420,
  });
  stage.effects.shockwave(stage.cx, stage.h * 0.12, { rMax: stage.w * 0.9, color: '#cfe9ff', width: 6, life: 0.8, flat: 1 });

  // ── カードを配る ──
  const grid = h('div.multi-grid');
  layer.appendChild(grid);
  const cards = [];
  for (let i = 0; i < n; i++) {
    const c = cardEl(plan.results[i], { size: 128 });
    c.classList.add('scard--grid');
    setBackTier(c, plan.backs[i]);
    c.style.setProperty('--i', String(i));
    grid.appendChild(c);
    cards.push(c);
  }

  await wait(0.2 * speed, token);
  for (let i = 0; i < n; i++) {
    if (token.cancelled) break;
    cards[i].classList.add('is-dealt');
    sfx.play('cardDeal', { pan: ((i % 5) - 2) * 0.3 });
    stage.post.shake(0.03);
    await wait(T.multiDealStagger * speed, token);
  }
  if (token.cancelled) return { grid, cards };

  await wait(0.28 * speed, token);

  // ── 裏面昇格（バチバチ） ──
  for (const up of plan.backUpgrades) {
    if (token.cancelled) break;
    const card = cards[up.index];
    engine.duckSfx(0.2, 0.04);
    await wait(0.16 * speed, token);
    engine.duckSfx(1, 0.02);
    sfx.play(up.to >= 4 ? 'crackle3' : up.to >= 3 ? 'crackle2' : 'crackle1');
    setBackTier(card, up.to);
    card.classList.add('is-upgraded');
    stage.post.shake(0.12 + up.to * 0.05);
    stage.post.doFlash(0.12 + up.to * 0.06, TIERS[up.to].color, 7);
    if (up.to >= 3) stage.post.chroma(0.5);
    const r = card.getBoundingClientRect();
    stage.particles.emit({
      x: stage.vx(r.left + r.width / 2), y: stage.vy(r.top + r.height / 2), kind: KIND.SPARK,
      count: 18, speed: 240, life: 0.5, size: 2.2, color: TIERS[up.to].ring[0], drag: 1.2, gravity: 200,
    });
    vibrate(state.settings.haptics ? [10, 24, 18] : 0);
    setTimeout(() => card.classList.remove('is-upgraded'), 500);
    await wait(0.3 * speed, token);
  }

  // 虹裏があれば BGM を止める
  if (plan.backsFinal.some((t) => t >= 4)) {
    bgm.setMood('silence', 0.1);
    engine.duckBgm(0.0001, 0.1);
    sfx.play('choirSwell', { dur: 1.6, peak: 0.1 });
  }

  return { grid, cards };
}

/** 10連のめくり。タップ / 一括 / スキップ。 */
async function flipPhase(token, plan, layer, grid, cards, speed, ui) {
  const order = plan.order;
  const flipped = new Set();

  const flipOne = (idx, { silent = false } = {}) => {
    if (flipped.has(idx)) return;
    flipped.add(idx);
    const card = cards[idx];
    const res = plan.results[idx];
    card.classList.add('is-flipped');
    if (!silent) {
      sfx.play('cardFlip', { pan: ((idx % 5) - 2) * 0.3 });
      if (res.rarity >= 4) {
        sfx.play('frameLock', { scale: 0.6 + res.rarity * 0.12 });
        stage.post.shake(0.12 + (res.rarity - 3) * 0.12);
        stage.post.doFlash(0.14 + (res.rarity - 3) * 0.12, RARITY[res.rarity].color, 7);
        const r = card.getBoundingClientRect();
        stage.particles.emit({
          x: stage.vx(r.left + r.width / 2), y: stage.vy(r.top + r.height / 2), kind: KIND.SPARK,
          count: 20 + res.rarity * 6, speed: 260, life: 0.6, size: 2.4,
          color: RARITY[res.rarity].color, color2: '#ffffff', drag: 1.1, gravity: 240,
        });
      } else if (res.rarity === 3) {
        sfx.play('chimeStar', { index: 1 });
      }
      if (res.isNew) card.classList.add('has-new');
    }
    const row = card.querySelector('.scard__starrow');
    if (!row.childElementCount) {
      for (let i = 0; i < res.rarity; i++) row.appendChild(h('i.rstar.is-lit', '★'));
    }
  };

  // 最後の1枚（最良札）以外を、タップ or 自動でめくる
  const rest = order.slice(0, -1);
  const climaxIdx = order[order.length - 1];

  let resolveAll;
  const allDone = new Promise((r) => { resolveAll = r; });
  let auto = false;

  const onCardTap = (e) => {
    const card = e.target.closest('.scard');
    if (!card) return;
    const idx = cards.indexOf(card);
    if (idx < 0 || idx === climaxIdx) return;
    flipOne(idx);
    if (rest.every((i) => flipped.has(i))) resolveAll();
  };
  const offTap = on(grid, 'click', onCardTap);

  ui.setHint('タップでめくる　/　一括めくり');
  ui.showFlipAll(() => { auto = true; resolveAll(); });

  // 自動めくり（放置したら順に開く）
  let autoTimer = 0;
  const startAuto = () => {
    let i = 0;
    autoTimer = setInterval(() => {
      if (token.cancelled) { clearInterval(autoTimer); resolveAll(); return; }
      while (i < rest.length && flipped.has(rest[i])) i++;
      if (i >= rest.length) { clearInterval(autoTimer); resolveAll(); return; }
      flipOne(rest[i]);
    }, T.multiFlipStagger * 1000 * speed);
  };
  const autoDelay = setTimeout(startAuto, 2600 * speed);

  if (token.cancelled) resolveAll();
  token.onCancel(() => resolveAll());
  await allDone;

  clearTimeout(autoDelay);
  clearInterval(autoTimer);
  offTap();
  ui.hideFlipAll();

  // 残りを一気にめくる
  for (const i of rest) {
    if (!flipped.has(i)) {
      flipOne(i);
      await wait(0.05 * speed, token);
    }
  }

  return climaxIdx;
}

/**
 * 10連のクライマックス。最良札の扱いをレアリティで変える。
 *   ★5 … 陣を再点火して昇格込みのフル演出へ昇華（10連でも「虹」を体験できる）
 *   ★4 … 解放＋（あれば）カットイン＋顕現の短縮版
 *   ★3以下 … その場でめくるだけ
 */
async function climaxPhase(token, plan, layer, grid, cards, climaxIdx, speed) {
  const res = plan.results[climaxIdx];
  const card = cards[climaxIdx];

  const fillStars = () => {
    card.classList.add('is-flipped');
    if (res.isNew) card.classList.add('has-new');
    const row = card.querySelector('.scard__starrow');
    if (!row.childElementCount) {
      for (let i = 0; i < res.rarity; i++) row.appendChild(h('i.rstar.is-lit', '★'));
    }
  };

  if (token.cancelled || res.rarity < 4) { fillStars(); return; }

  grid.classList.add('is-dimmed');
  const holder = h('div.reveal-stage');
  layer.appendChild(holder);

  if (res.rarity >= 5) {
    // 陣を再点火 → 詠唱（短め）→ オーラ確定と昇格 → 解放
    stage.circle.ignite = 0;
    stage.circle.charge = 0;
    stage.circle.runeLit = 0;
    applyTier(plan.cue.startTier, layer);
    sfx.play('coinInsert');
    await tween({
      from: 0, to: 1, dur: 0.34 * speed, ease: 'outCubic', token,
      onUpdate: (v) => { stage.circle.ignite = v; stage.circle.scale = 0.75 + v * 0.25; },
    });
    if (!token.cancelled) await chargePhase(token, plan, layer, speed * 0.72);
    if (!token.cancelled) await auraPhase(token, plan, layer, speed);
    if (!token.cancelled) await climax(token, plan, res, layer, speed);
  } else {
    stage.post.setVignette(0.92);
    applyTier(3, layer);
    release(plan.cue, layer);
    await wait(0.32 * speed, token);
    if (plan.cue.cutIn && !token.cancelled) await cutIn(token, res, plan.cue, layer, speed);
  }

  await revealCard(token, res, holder, speed, { backTier: plan.backsFinal[climaxIdx] });
  fillStars();
  await wait(0.7 * speed, token);
  holder.classList.add('is-out');
  await wait(0.3, token);
  holder.remove();
  grid.classList.remove('is-dimmed');
  stage.circle.tilt = 0;
}

/* ══════════════════════════════════════════════════════════
   公開 API
   ══════════════════════════════════════════════════════════ */

let active = null;

export function isSummoning() { return !!active; }

/**
 * 演出を再生する。
 * @param {object} payload performSummon() の戻り値
 * @returns {Promise<void>} 演出が終わり、ユーザーが次へ進んだら解決
 */
export async function playSummon(payload) {
  const { plan } = payload;
  const settings = state.settings;
  const reduce = settings.reduceMotion || prefersReducedMotion();

  // スキップ設定の解決（NOTES E3: 初回は必ずフル演出）
  const top = plan.results.reduce((a, b) => Math.max(a, b.rarity), 1);
  const forceFull = top >= (settings.fullAnimFrom ?? 4) || !state.data.stats.seenFullAnim;
  let mode = settings.skipMode;
  if (forceFull && mode === 'auto') mode = 'fast';
  if (reduce) mode = mode === 'off' ? 'fast' : mode;

  let speed = 1;
  if (mode === 'fast') speed = 0.5;
  if (reduce) speed = Math.min(speed, 0.45);

  const host = qs('#summon-layer');
  clear(host);
  host.hidden = false;
  document.body.classList.add('is-summoning');

  const token = new Token();
  active = { token };

  const skipBtn = h('button.summon__skip', { 'aria-label': '演出をスキップ' }, 'SKIP ▶▶');
  const hint = h('div.summon__hint', { 'aria-live': 'polite' });
  const flipAll = h('button.summon__flipall', { hidden: true }, '一括めくり');
  const continueBtn = h('button.summon__continue', { hidden: true }, '結果を見る');
  host.appendChild(skipBtn);
  host.appendChild(hint);
  host.appendChild(flipAll);
  host.appendChild(continueBtn);

  const ui = {
    setHint: (t) => { hint.textContent = t || ''; hint.classList.toggle('is-on', !!t); },
    showFlipAll: (fn) => { flipAll.hidden = false; flipAll.onclick = () => { sfx.play('tap'); fn(); }; },
    hideFlipAll: () => { flipAll.hidden = true; flipAll.onclick = null; },
  };

  let skipped = false;
  const doSkip = () => {
    if (skipped) return;
    skipped = true;
    sfx.play('tap');
    engine.stopAll();
    engine.duckSfx(1, 0.02);
    token.cancel();
  };
  skipBtn.onclick = doSkip;
  const offKey = on(document, 'keydown', (e) => {
    if (e.key === 's' || e.key === 'S' || e.key === 'Escape') doSkip();
  });

  if (mode === 'auto') token.cancel();

  try {
    if (plan.kind === 'single') {
      await runSingle(token, plan, host, speed);
    } else {
      const dealt = await runMulti(token, plan, host, speed);
      if (dealt) {
        const { grid, cards } = dealt;
        if (!token.cancelled) {
          const climaxIdx = await flipPhase(token, plan, host, grid, cards, speed, ui);
          ui.setHint('');
          await climaxPhase(token, plan, host, grid, cards, climaxIdx, speed);
        } else {
          // スキップ：全部めくった状態にする
          cards.forEach((c, i) => {
            c.classList.add('is-dealt', 'is-flipped');
            const row = c.querySelector('.scard__starrow');
            if (!row.childElementCount) for (let k = 0; k < plan.results[i].rarity; k++) row.appendChild(h('i.rstar.is-lit', '★'));
            if (plan.results[i].isNew) c.classList.add('has-new');
          });
          if (top >= 4) sfx.play(top >= 5 ? 'fanfare5' : 'fanfare4');
        }
      }
    }
  } catch (e) {
    console.error('[summon] 演出でエラー。結果は保存済みなので続行します。', e);
  }

  // 余韻 → 次へ
  state.data.stats.seenFullAnim = true;
  skipBtn.hidden = true;
  ui.setHint('');
  continueBtn.hidden = false;
  requestAnimationFrame(() => continueBtn.classList.add('is-in'));

  stage.post.setVignette(0.7);
  bgm.setMood('result', 1.2);
  engine.duckBgm(1, 0.8);

  await new Promise((resolve) => {
    const done = () => { sfx.play('confirm'); cleanup(); resolve(); };
    continueBtn.onclick = done;
    const offEnter = on(document, 'keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(); }
    });
    function cleanup() { offEnter(); }
  });

  offKey();
  host.hidden = true;
  clear(host);
  document.body.classList.remove('is-summoning');
  stage.clearAll();
  stage.starfield.intensity = 1;
  stage.circle.tilt = 0;
  stage.circle.spinBoost = 1;
  stage.post.setVignette(0.55);
  active = null;
}
