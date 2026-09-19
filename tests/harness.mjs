/** 依存ゼロのテストハーネス（アサーションと集計のみ）。実行は run.mjs。 */
export const stats = { passed: 0, failed: 0, failures: [] };

export function test(name, fn) {
  try {
    fn();
    stats.passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    stats.failed++;
    stats.failures.push({ name, e });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[31m${e.message}\x1b[0m`);
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
export function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'not equal'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
export function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) {
    throw new Error(`${msg || 'not near'}: ${a} vs ${b} (許容 ±${tol}, 差 ${Math.abs(a - b).toPrecision(3)})`);
  }
}
export function throws(fn, msg) {
  try { fn(); } catch { return; }
  throw new Error(msg || 'expected to throw');
}
export function group(name) { console.log(`\n\x1b[1m\x1b[36m${name}\x1b[0m`); }
