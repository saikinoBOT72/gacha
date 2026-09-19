/**
 * ブート。
 *  1. 状態の読み込み（壊れていてもクラッシュしない）
 *  2. Canvas ステージの起動
 *  3. 最初のユーザー操作で AudioContext を解禁（NOTES D1）
 *  4. UI の構築
 */
import { qs, on, prefersReducedMotion } from './util/dom.js';
import { state } from './game/state.js';
import { stage } from './fx/stage.js';
import { ticker } from './util/tween.js';
import { initAudio, applySettings, bgm, sfx, engine } from './audio/index.js';
import { buildApp, firstRunFlow, startDailyCheck } from './ui/app.js';

function boot() {
  // ── 状態 ──
  state.load();

  // ── ステージ ──
  stage.init({
    bg: qs('#canvas-bg'),
    fx: qs('#canvas-fx'),
    post: qs('#canvas-post'),
    shakeEl: qs('#world'),
  });
  stage.setQualityMode(state.settings.quality || 'auto');
  stage.post.reduceMotion = state.settings.reduceMotion || prefersReducedMotion();
  stage.post.reduceFlash = state.settings.reduceFlash;
  stage.circle.ignite = 0.18;
  stage.circle.charge = 0.05;
  stage.circle.runeLit = 0.25;

  // 環境の塵（画面が「生きている」感じを出す）
  ticker.add(() => stage.ambient('#9ad8ff', 1));

  // 視差（マウス／傾き）
  on(window, 'pointermove', (e) => {
    stage.starfield.setParallax(
      (e.clientX / window.innerWidth - 0.5) * 2,
      (e.clientY / window.innerHeight - 0.5) * 2,
    );
  });
  on(window, 'deviceorientation', (e) => {
    if (e.gamma === null) return;
    stage.starfield.setParallax(
      Math.max(-1, Math.min(1, (e.gamma || 0) / 35)),
      Math.max(-1, Math.min(1, ((e.beta || 0) - 45) / 45)),
    );
  });

  // ── 音の解禁（最初の操作で） ──
  const unlock = async () => {
    off1(); off2(); off3();
    await initAudio();
    applySettings();
    bgm.setMood('banner', 2.2);
  };
  const off1 = on(window, 'pointerdown', unlock, { once: true });
  const off2 = on(window, 'keydown', unlock, { once: true });
  const off3 = on(window, 'touchstart', unlock, { once: true });

  // ── UI ──
  buildApp();
  qs('#boot').classList.add('is-gone');
  setTimeout(() => { const b = qs('#boot'); b && b.remove(); }, 700);

  if (state.data.firstRun) {
    firstRunFlow().then(startDailyCheck);
  } else {
    startDailyCheck();
  }

  // ── 保険：どこかで例外が出ても真っ白にしない ──
  on(window, 'error', (e) => console.error('[stella] uncaught', e.error || e.message));
  on(window, 'unhandledrejection', (e) => console.error('[stella] unhandled', e.reason));

  // デバッグ用（コンソールから触れるように）
  window.STELLA = { state, stage, sfx, bgm, engine, ticker };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
