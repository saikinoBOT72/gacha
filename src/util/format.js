/** 表示用フォーマッタ。 */

export const nf = new Intl.NumberFormat('ja-JP');
export const num = (n) => nf.format(Math.round(n));

/** 0.006 → "0.600%" */
export const pct = (p, digits = 3) => (p * 100).toFixed(digits) + '%';
/** 0.006 → "0.6%"（末尾ゼロ落とし） */
export const pctShort = (p) => {
  const v = p * 100;
  const s = v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3);
  return s.replace(/\.?0+$/, '') + '%';
};

export const dateJP = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const timeJP = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 「今日」を YYYY-MM-DD で（デイリー判定用、ローカル時刻基準） */
export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 翌日0時までの残り "hh:mm:ss" */
export function untilMidnight(now = Date.now()) {
  const d = new Date(now);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
  let s = Math.max(0, Math.floor((next - now) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
