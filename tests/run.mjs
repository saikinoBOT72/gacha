/** `node tests/run.mjs` で tests/*.test.mjs を全て実行する。 */
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !only || f.includes(only))
  .sort();

const t0 = Date.now();
for (const f of files) {
  await import(pathToFileURL(join(__dirname, f)).href);
}
const ms = Date.now() - t0;

console.log(
  `\n${stats.failed === 0 ? '\x1b[32m' : '\x1b[31m'}` +
  `${stats.passed} passed, ${stats.failed} failed\x1b[0m  (${ms}ms)\n`
);
process.exit(stats.failed === 0 ? 0 : 1);
