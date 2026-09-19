/** 音響レイヤの入口。UI からはここだけを見る。 */
import { engine } from './engine.js';
import { sfx, AURA_SFX } from './sfx.js';
import { bgm } from './bgm.js';
import { state } from '../game/state.js';

let initialized = false;

/** 最初のユーザー操作で呼ぶ（NOTES D1）。 */
export async function initAudio() {
  if (initialized) return;
  initialized = true;
  await engine.init();
  applySettings();
  bgm.start();
}

export function applySettings() {
  const s = state.settings;
  engine.setVolumes({
    master: s.volMaster, bgm: s.volBgm, sfx: s.volSfx, ui: s.volUi,
  });
  engine.setMuted(s.muted);
}

export { engine, sfx, bgm, AURA_SFX };
