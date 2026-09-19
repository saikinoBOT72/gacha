/** 画面上部に短く出る通知。演出の邪魔をしないよう控えめに。 */
import { h, qs } from '../util/dom.js';
import { sfx } from '../audio/index.js';

let host = null;

function ensure() {
  if (!host) host = qs('#toasts') || document.body;
  return host;
}

export function toast(message, opts = {}) {
  const el = h('div.toast' + (opts.kind ? `.toast--${opts.kind}` : ''), { role: 'status' },
    opts.icon ? h('span.toast__icon', { html: opts.icon }) : null,
    h('span.toast__text', { text: message }),
  );
  ensure().appendChild(el);
  if (opts.sound !== false) sfx.play(opts.kind === 'error' ? 'error' : 'newBadge');
  requestAnimationFrame(() => el.classList.add('is-in'));
  const ttl = opts.duration ?? 2600;
  setTimeout(() => {
    el.classList.remove('is-in');
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 420);
  }, ttl);
  return el;
}

export const toastError = (m) => toast(m, { kind: 'error' });
