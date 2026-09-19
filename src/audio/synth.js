/**
 * 合成プリミティブ。
 * すべて「t0（絶対時刻）を受け取り、終了時刻を返す」形に揃えてある。
 * こうしておくと SFX 側が層を積み上げるときに時間管理で悩まずに済む。
 */
import { engine, MIN_GAIN } from './engine.js';

export const SEMITONE = Math.pow(2, 1 / 12);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const cents = (f, c) => f * Math.pow(2, c / 1200);

/** 出力経路を作る。dry + 各リバーブへのセンドをまとめて面倒見る。 */
export function out(node, o = {}) {
  const ctx = engine.ctx;
  const b = engine.bus(o.bus || 'sfx');
  const extra = [];
  let tail = node;

  if (o.pan !== undefined && o.pan !== 0 && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    tail.connect(p); tail = p; extra.push(p);
  }

  const dry = ctx.createGain();
  dry.gain.value = o.dry === undefined ? 1 : o.dry;
  tail.connect(dry);
  dry.connect(b.input);
  extra.push(dry);

  for (const [key, amt] of [['hall', o.hall], ['room', o.room], ['plate', o.plate]]) {
    if (!amt || !b.sends[key]) continue;
    const g = ctx.createGain();
    g.gain.value = amt;
    tail.connect(g);
    g.connect(b.sends[key]);
    extra.push(g);
  }
  return extra;
}

/** アタック→減衰（打楽器型）。戻り値は消え終わる時刻。 */
export function adEnv(param, t0, { a = 0.004, peak = 1, d = 0.25, curve = 'exp' } = {}) {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  if (curve === 'lin') param.linearRampToValueAtTime(Math.max(MIN_GAIN, peak), t0 + a);
  else param.exponentialRampToValueAtTime(Math.max(MIN_GAIN, peak), t0 + a);
  const end = t0 + a + d;
  if (curve === 'lin') param.linearRampToValueAtTime(MIN_GAIN, end);
  else param.exponentialRampToValueAtTime(MIN_GAIN, end);
  return end;
}

/** ADSR（持続音型）。dur は「キーを押している時間」。 */
export function adsrEnv(param, t0, { a = 0.01, d = 0.08, s = 0.7, r = 0.2, peak = 1, dur = 0.3 } = {}) {
  const sus = Math.max(MIN_GAIN, peak * s);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(MIN_GAIN, t0);
  param.linearRampToValueAtTime(Math.max(MIN_GAIN, peak), t0 + a);
  param.exponentialRampToValueAtTime(sus, t0 + a + d);
  const off = t0 + Math.max(a + d, dur);
  param.setValueAtTime(sus, off);
  param.exponentialRampToValueAtTime(MIN_GAIN, off + r);
  return off + r;
}

/* ───────────── オシレータ系 ───────────── */

/**
 * 単音。glide（ピッチ envelope）付き。
 * pitchTo を与えるとサブドロップやライザーになる。
 */
export function tone(t0, o = {}) {
  const ctx = engine.ctx;
  const {
    freq = 440, type = 'sine', detune = 0,
    a = 0.004, d = 0.25, peak = 0.5, curve = 'exp',
    pitchTo = null, pitchCurve = 'exp', pitchDur = null,
    filter = null, dur = null, sustain = null,
  } = o;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.detune.value = detune;
  if (pitchTo !== null) {
    const pd = pitchDur ?? d;
    if (pitchCurve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(0.01, pitchTo), t0 + pd);
    else osc.frequency.linearRampToValueAtTime(Math.max(0.01, pitchTo), t0 + pd);
  }

  const g = ctx.createGain();
  let node = osc;
  const nodes = [osc, g];

  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.setValueAtTime(filter.freq ?? 2000, t0);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, filter.to), t0 + (filter.dur ?? d));
    f.Q.value = filter.Q ?? 1;
    node.connect(f); node = f; nodes.push(f);
  }
  node.connect(g);

  const end = sustain !== null
    ? adsrEnv(g.gain, t0, { ...sustain, peak, dur: dur ?? 0.3 })
    : adEnv(g.gain, t0, { a, peak, d, curve });

  nodes.push(...out(g, o));
  osc.start(t0);
  osc.stop(end + 0.05);
  engine.register(nodes, end + 0.05);
  return end;
}

/** デチューンした複数のオシレータを重ねる（厚み／合唱感の基礎）。 */
export function stack(t0, o = {}) {
  const { freq = 220, type = 'sawtooth', voices = 5, spread = 12, peak = 0.3, spreadPan = 0.6 } = o;
  let end = t0;
  for (let i = 0; i < voices; i++) {
    const k = voices === 1 ? 0 : i / (voices - 1) - 0.5;
    const e = tone(t0, {
      ...o,
      freq,
      type,
      detune: k * spread * 2,
      peak: peak / Math.sqrt(voices),
      pan: (o.pan || 0) + k * spreadPan,
    });
    end = Math.max(end, e);
  }
  return end;
}

/** FM 合成。金属質・ベル・非整数倍音に。 */
export function fm(t0, o = {}) {
  const ctx = engine.ctx;
  const {
    freq = 440, ratio = 2.01, index = 300, indexDecay = 0.2,
    a = 0.002, d = 0.4, peak = 0.4, type = 'sine', modType = 'sine',
  } = o;

  const car = ctx.createOscillator();
  car.type = type;
  car.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = modType;
  mod.frequency.value = freq * ratio;

  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(index, t0);
  modGain.gain.exponentialRampToValueAtTime(Math.max(0.01, index * 0.01), t0 + indexDecay);
  mod.connect(modGain);
  modGain.connect(car.frequency);

  const g = ctx.createGain();
  car.connect(g);
  const end = adEnv(g.gain, t0, { a, peak, d });

  const nodes = [car, mod, modGain, g, ...out(g, o)];
  car.start(t0); mod.start(t0);
  car.stop(end + 0.05); mod.stop(end + 0.05);
  engine.register(nodes, end + 0.05);
  return end;
}

/* ───────────── ノイズ系 ───────────── */

/**
 * ノイズバースト。トランジェント（衝撃の「カッ」）と空気感の両方に使う。
 * filter.from → filter.to のスイープでウーッシュやライザーになる。
 */
export function noise(t0, o = {}) {
  const ctx = engine.ctx;
  const {
    color = 'white', a = 0.002, d = 0.2, peak = 0.3, curve = 'exp',
    filter = { type: 'bandpass', from: 1200, to: 1200, Q: 1 },
    playbackRate = 1, dur = null,
  } = o;

  const src = ctx.createBufferSource();
  src.buffer = engine.noise[color] || engine.noise.white;
  src.loop = true;
  src.playbackRate.value = playbackRate;
  // 毎回違う箇所から再生して「同じ音」に聞こえないようにする
  const offset = Math.random() * (src.buffer.duration * 0.5);

  let node = src;
  const nodes = [src];

  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'bandpass';
    f.Q.value = filter.Q ?? 1;
    const from = filter.from ?? filter.freq ?? 1000;
    const to = filter.to ?? from;
    f.frequency.setValueAtTime(Math.max(20, from), t0);
    if (to !== from) {
      const fd = filter.dur ?? d;
      f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + fd);
    }
    node.connect(f); node = f; nodes.push(f);

    if (filter.hp) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = filter.hp;
      node.connect(hp); node = hp; nodes.push(hp);
    }
  }

  const g = ctx.createGain();
  node.connect(g);
  const end = adEnv(g.gain, t0, { a, peak, d, curve });
  nodes.push(g, ...out(g, o));

  src.start(t0, offset);
  src.stop(end + 0.05);
  engine.register(nodes, end + 0.05);
  return end;
}

/**
 * サブドロップ。インパクトの「腹に来る」成分。
 * 80Hz → 28Hz へ落ちるサイン。リミッタ前で抑えめに（NOTES D10）。
 */
export function subDrop(t0, o = {}) {
  const { from = 90, to = 28, d = 0.85, peak = 0.55 } = o;
  return tone(t0, {
    freq: from, pitchTo: to, pitchDur: d * 0.6, type: 'sine',
    a: 0.006, d, peak, hall: o.hall ?? 0.08, bus: o.bus, pan: o.pan,
  });
}

/**
 * 膜鳴（和太鼓）。ピッチの急降下 + ノイズボディ。
 */
export function membrane(t0, o = {}) {
  const { freq = 160, d = 0.6, peak = 0.7, bodyPeak = 0.22 } = o;
  const e1 = tone(t0, {
    freq, pitchTo: freq * 0.32, pitchDur: 0.09, type: 'sine',
    a: 0.002, d, peak, hall: o.hall ?? 0.35, bus: o.bus, pan: o.pan,
  });
  const e2 = noise(t0, {
    color: 'brown', a: 0.001, d: d * 0.35, peak: bodyPeak,
    filter: { type: 'lowpass', from: 900, to: 180, Q: 0.7 },
    hall: o.hall ?? 0.3, bus: o.bus, pan: o.pan,
  });
  const e3 = noise(t0, {
    color: 'white', a: 0.0008, d: 0.045, peak: bodyPeak * 0.7,
    filter: { type: 'bandpass', from: 2600, to: 1400, Q: 0.8 },
    bus: o.bus, pan: o.pan,
  });
  return Math.max(e1, e2, e3);
}

/**
 * 弦の撥弦（Karplus-Strong 風）。琴や竪琴の質感。
 */
export function pluck(t0, o = {}) {
  const ctx = engine.ctx;
  const { freq = 440, d = 1.2, peak = 0.3, damp = 3200 } = o;
  const delaySec = 1 / freq;

  const src = ctx.createBufferSource();
  src.buffer = engine.noise.white;
  const burst = ctx.createGain();
  adEnv(burst.gain, t0, { a: 0.0005, peak: 1, d: delaySec * 2 });
  src.connect(burst);

  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = delaySec;
  const fb = ctx.createGain();
  fb.gain.value = Math.min(0.995, Math.exp(-delaySec / (d * 0.5)));
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = damp;

  burst.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);

  const g = ctx.createGain();
  delay.connect(g);
  const end = adEnv(g.gain, t0, { a: 0.001, peak, d });

  const nodes = [src, burst, delay, fb, lp, g, ...out(g, o)];
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + delaySec * 4);
  engine.register(nodes, end + 0.1);
  return end;
}

/**
 * フォルマント付きの持続音＝合唱（Choir）の芯。
 * 「あ」に近い母音フォルマント（700/1220/2600Hz）を band-pass で作る。
 */
export function voxPad(t0, o = {}) {
  const ctx = engine.ctx;
  const {
    freq = 220, dur = 2.0, peak = 0.22, voices = 6, spread = 14,
    formants = [[700, 1.0, 8], [1220, 0.55, 10], [2600, 0.25, 12]],
    a = 0.35, r = 1.2, vibrato = 4.6, vibratoDepth = 7,
  } = o;

  const mix = ctx.createGain();
  const nodes = [mix];

  // 揺らぎ（ビブラート）。人の声らしさはここで決まる。
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = vibrato;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = vibratoDepth;
  lfo.connect(lfoGain);
  nodes.push(lfo, lfoGain);

  for (let i = 0; i < voices; i++) {
    const k = voices === 1 ? 0 : i / (voices - 1) - 0.5;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = k * spread * 2 + (Math.random() * 6 - 3);
    lfoGain.connect(osc.detune);
    const vg = ctx.createGain();
    vg.gain.value = 1 / voices;
    osc.connect(vg);
    vg.connect(mix);
    nodes.push(osc, vg);
    osc.start(t0);
  }

  const sum = ctx.createGain();
  for (const [f, amp, q] of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const fg = ctx.createGain();
    fg.gain.value = amp;
    mix.connect(bp); bp.connect(fg); fg.connect(sum);
    nodes.push(bp, fg);
  }
  // 素の成分も少し混ぜて痩せすぎないように
  const bleed = ctx.createGain();
  bleed.gain.value = 0.18;
  mix.connect(bleed); bleed.connect(sum);
  nodes.push(bleed, sum);

  const g = ctx.createGain();
  sum.connect(g);
  const end = adsrEnv(g.gain, t0, { a, d: 0.3, s: 0.85, r, peak, dur });

  nodes.push(...out(g, { hall: 0.85, ...o }));
  lfo.start(t0);
  // 全オシレータ（声部 + LFO）をまとめて停止予約する
  for (const n of nodes) { try { n.stop && n.stop(end + 0.1); } catch { /* noop */ } }
  engine.register(nodes, end + 0.15);
  return end;
}

/** 和音を鳴らす（voxPad / stack / tone のいずれかを重ねる）。 */
export function chord(t0, freqs, fn, o = {}) {
  let end = t0;
  freqs.forEach((f, i) => {
    const e = fn(t0 + (o.strum ? i * o.strum : 0), { ...o, freq: f });
    end = Math.max(end, e);
  });
  return end;
}

/** グレイン群（破砕・バチバチ）。短いノイズ粒をランダムに散らす。 */
export function grains(t0, o = {}) {
  const {
    count = 18, spread = 0.18, grainDur = 0.03, peak = 0.22,
    fMin = 900, fMax = 9000, color = 'white', Q = 6, panSpread = 0.8,
  } = o;
  let end = t0;
  for (let i = 0; i < count; i++) {
    const t = t0 + Math.pow(Math.random(), 0.7) * spread;
    const f = fMin * Math.pow(fMax / fMin, Math.random());
    const e = noise(t, {
      color, a: 0.0006, d: grainDur * (0.4 + Math.random()), peak: peak * (0.5 + Math.random() * 0.8),
      filter: { type: 'bandpass', from: f, to: f * (0.6 + Math.random() * 0.8), Q },
      pan: (Math.random() * 2 - 1) * panSpread,
      room: o.room ?? 0.25, hall: o.hall ?? 0.15, bus: o.bus,
    });
    end = Math.max(end, e);
  }
  return end;
}

/**
 * ライザー。複数オクターブを重ねた擬似シェパードトーンで「無限上昇」に聞こえる。
 * ガチャのチャージ部分の緊張はほぼこれが作る。
 */
export function riser(t0, o = {}) {
  const {
    dur = 1.6, fromHz = 110, toHz = 1760, layers = 3, peak = 0.14,
    noiseAmt = 0.16, type = 'sawtooth',
  } = o;
  let end = t0;
  for (let i = 0; i < layers; i++) {
    const mul = Math.pow(2, i);
    const e = tone(t0, {
      freq: fromHz * mul, pitchTo: toHz * mul, pitchDur: dur, pitchCurve: 'exp',
      type, a: dur * 0.35, d: dur * 0.65, peak: peak / (i + 1), curve: 'lin',
      filter: { type: 'lowpass', freq: 800 * mul, to: 9000, dur },
      hall: 0.3, bus: o.bus, pan: (i - 1) * 0.25,
    });
    end = Math.max(end, e);
  }
  if (noiseAmt > 0) {
    const e = noise(t0, {
      color: 'white', a: dur * 0.5, d: dur * 0.5, peak: noiseAmt, curve: 'lin',
      filter: { type: 'bandpass', from: 400, to: 11000, Q: 1.4, dur },
      hall: 0.35, bus: o.bus,
    });
    end = Math.max(end, e);
  }
  return end;
}

/** 逆再生風スウェル（吸い込まれる音）。カットイン直前に効く。 */
export function reverseSwell(t0, o = {}) {
  const { dur = 0.9, peak = 0.3 } = o;
  return noise(t0, {
    color: 'white', a: dur * 0.92, d: dur * 0.08, peak, curve: 'lin',
    filter: { type: 'bandpass', from: 300, to: 6000, Q: 0.9, dur: dur * 0.92 },
    hall: 0.5, bus: o.bus,
  });
}
