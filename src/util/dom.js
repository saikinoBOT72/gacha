/** 最小限の DOM ヘルパ。フレームワークは使わない。 */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * h('div.card.is-new', {dataset:{id:1}, onclick}, child1, 'text')
 * タグは `tag#id.cls1.cls2` 形式。
 */
export function h(spec, props, ...children) {
  let tag = 'div', id = '', cls = [];
  const m = String(spec).match(/^([a-zA-Z0-9-]*)((?:[#.][^#.]+)*)$/);
  if (m) {
    if (m[1]) tag = m[1];
    const rest = m[2] || '';
    rest.replace(/([#.])([^#.]+)/g, (_, k, v) => { if (k === '#') id = v; else cls.push(v); return ''; });
  } else tag = spec;

  const el = document.createElementNS(
    tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'g' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml',
    tag
  );
  if (id) el.id = id;
  if (cls.length) el.setAttribute('class', cls.join(' '));

  if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
    children.unshift(props); props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') el.setAttribute('class', ((el.getAttribute('class') || '') + ' ' + v).trim());
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/** addEventListener + 解除関数を返す。AbortSignal も渡せる。 */
export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** 委譲。`on(root,'click','.btn',fn)` 相当。 */
export function delegate(root, type, selector, fn, opts) {
  const handler = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  };
  root.addEventListener(type, handler, opts);
  return () => root.removeEventListener(type, handler, opts);
}

export const setVar = (el, name, value) => el.style.setProperty(name, value);

/** CSS トランジション/アニメの完了を待つ（保険のタイムアウト付き）。 */
export function waitAnim(el, fallbackMs = 1200) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(tid); el.removeEventListener('animationend', fin); el.removeEventListener('transitionend', fin); resolve(); };
    const tid = setTimeout(fin, fallbackMs);
    el.addEventListener('animationend', fin);
    el.addEventListener('transitionend', fin);
  });
}

/** 一度だけクラスを付けてアニメを再生（再トリガのために reflow を挟む）。 */
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // 強制 reflow
  el.classList.add(cls);
}

export const raf = (fn) => requestAnimationFrame(fn);
export const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 触覚フィードバック。対応していなければ黙って無視。 */
export function vibrate(pattern) {
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* noop */ }
}

/** フォーカストラップ（モーダル用）。解除関数を返す。 */
export function trapFocus(container) {
  const prev = document.activeElement;
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const items = qsa(sel, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', handler);
  const firstEl = qsa(sel, container)[0];
  firstEl && firstEl.focus();
  return () => {
    container.removeEventListener('keydown', handler);
    if (prev && prev.focus) prev.focus();
  };
}
