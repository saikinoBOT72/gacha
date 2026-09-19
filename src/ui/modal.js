/** モーダル。フォーカストラップ・Esc・背景タップで閉じる（NOTES B8）。 */
import { h, qs, trapFocus, on } from '../util/dom.js';
import { sfx } from '../audio/index.js';

let openCount = 0;

export function modal({ title, body, actions, wide = false, onClose, className = '' }) {
  const host = qs('#overlays') || document.body;
  const content = h('div.modal' + (wide ? '.modal--wide' : '') + (className ? '.' + className.split(' ').join('.') : ''),
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'ダイアログ' });

  const head = h('div.modal__head',
    h('h2.modal__title', { text: title || '' }),
    h('button.modal__close', { 'aria-label': '閉じる', onclick: () => close() }, '✕'),
  );
  const bodyEl = h('div.modal__body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  content.appendChild(head);
  content.appendChild(bodyEl);

  if (actions && actions.length) {
    const foot = h('div.modal__foot');
    for (const a of actions) {
      foot.appendChild(h(`button.btn${a.primary ? '.btn--primary' : ''}${a.danger ? '.btn--danger' : ''}`, {
        onclick: () => { sfx.play('tap'); a.onClick ? a.onClick(close) : close(); },
      }, a.label));
    }
    content.appendChild(foot);
  }

  const backdrop = h('div.modal-backdrop', { onclick: (e) => { if (e.target === backdrop) close(); } }, content);
  host.appendChild(backdrop);
  openCount++;
  document.body.classList.add('has-modal');

  const releaseFocus = trapFocus(content);
  const offKey = on(document, 'keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }, true);

  requestAnimationFrame(() => backdrop.classList.add('is-in'));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    sfx.play('back');
    offKey();
    releaseFocus();
    backdrop.classList.remove('is-in');
    setTimeout(() => {
      backdrop.remove();
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.body.classList.remove('has-modal');
      onClose && onClose();
    }, 260);
  }

  return { close, el: content, body: bodyEl };
}

export function confirmDialog({ title, message, confirmLabel = 'はい', cancelLabel = 'いいえ', danger = false }) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p.modal__message', { text: message }),
      actions: [
        { label: cancelLabel, onClick: (close) => { close(); resolve(false); } },
        { label: confirmLabel, primary: !danger, danger, onClick: (close) => { close(); resolve(true); } },
      ],
      onClose: () => resolve(false),
    });
  });
}
