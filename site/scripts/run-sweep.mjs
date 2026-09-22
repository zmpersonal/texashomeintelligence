/*
 * The verification sweep, in an order that cannot be got wrong.
 *
 * Every step below was already written down in scripts/replays/README.md and
 * run by hand. That is how it kept going wrong: `npm run build` DELETES
 * dist/client/data/stress-index/fixture-condition.json, which is what
 * r7replay's four condition-card assertions read, so a rebuild before a replay
 * run makes them fail with "no card rendered" — which reads exactly like a
 * product regression and is not one. It cost an investigation in Round 16 and
 * did it again in Round 32.
 *
 * So the ordering is code now, not prose: build, then re-seed the fixture with
 * the worker STOPPED (it holds local D1 in memory and would flush over the
 * writes), then start the worker, then run everything, then stop it again.
 * Nothing here is new work — it is the README's own sequence, executed.
 *
 * Usage:
 *   node scripts/run-sweep.mjs              build, seed, run everything
 *   node scripts/run-sweep.mjs --skip-build reuse dist/ — ONLY when you have
 *                                           not rebuilt since the last seed
 *   node scripts/run-sweep.mjs --only=r7replay,footerchrome
 *
 * Exits 1 if any step fails. Deliberately NOT included: check-citations, which
 * needs the real network and runs weekly in CI rather than in a round's sweep.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 9400;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE_ARTIFACT = join(SITE, 'dist', 'client', 'data', 'stress-index', 'fixture-condition.json');

const args = process.argv.slice(2);
const SKIP_BUILD = args.includes('--skip-build');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',');

/** Steps that need no worker. */
const UNITS = [
  ['weeklyunit', ['npx', 'tsx', 'scripts/replays/weeklyunit.ts']],
  ['r10unit', ['npx', 'tsx', 'scripts/replays/r10unit.ts']],
  ['badgeunit', ['npx', 'tsx', 'scripts/replays/badgeunit.ts']],
  ['alertcopyunit', ['npx', 'tsx', 'scripts/replays/alertcopyunit.ts']],
  ['noticefreshunit', ['npx', 'tsx', 'scripts/replays/noticefreshunit.ts']],
  ['hailunit', ['npx', 'tsx', 'scripts/replays/hailunit.ts']],
  ['privacyunit', ['npx', 'tsx', 'scripts/replays/privacyunit.ts']],
  ['climateunit', ['npx', 'tsx', 'scripts/replays/climateunit.ts']],
  ['citationcheckunit', ['npx', 'tsx', 'scripts/replays/citationcheckunit.ts']],
  ['verify-trade-mapping', ['npx', 'tsx', 'scripts/verify-trade-mapping.ts']],
  ['verify-content', ['node', 'scripts/verify-content.mjs']],
  ['check-links', ['node', 'scripts/check-links.mjs']],
  ['check-orphans', ['node', 'scripts/check-orphans.mjs', '--quiet']],
];

/** Steps that drive the built worker in a browser. */
const RENDERS = [
  'toolshubrender', 'roofscanrender', 'dashmobile', 'aclifespanrender', 'triagerender',
  'signinrender', 'r9render', 'saservicerender', 'footerchrome', 'analysisrender',
  'datalinksrender', 'eyebrowrender', 'r7replay',
].map((n) => [n, ['node', `scripts/replays/${n}.mjs`]]);

const wanted = ([name]) => !ONLY || ONLY.includes(name);
const run = (cmd, opts = {}) =>
  spawnSync(cmd[0], cmd.slice(1), { cwd: SITE, encoding: 'utf8', ...opts });

async function waitForWorker(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

function stopWorker() {
  // The fixture refuses to run while anything holds 9400, by design.
  run(['pkill', '-f', 'wrangler dev']);
}

const results = [];
function record(name, code, note = '') {
  results.push({ name, code, note });
  console.log(`${code === 0 ? '  ok  ' : ' FAIL '} ${name}${note ? `  — ${note}` : ''}`);
}

// ── 1. BUILD ──────────────────────────────────────────────────────────────
if (!SKIP_BUILD) {
  console.log('\n── build ──');
  const r = run(['npm', 'run', 'build'], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('build failed — nothing else can be trusted'); process.exit(1); }
  const c = run(['npm', 'run', 'check'], { stdio: 'inherit' });
  record('check', c.status ?? 1);
} else if (!existsSync(join(SITE, 'dist', 'client'))) {
  console.error('--skip-build but there is no dist/client'); process.exit(2);
}

// ── 2. SEED THE FIXTURE, WORKER STOPPED ───────────────────────────────────
// Unconditional after a build: the artifact is inside dist/ and the build just
// deleted it. Under --skip-build, seed only if it is actually missing, so an
// iteration loop does not pay for it every time.
console.log('\n── fixture ──');
stopWorker();
await new Promise((r) => setTimeout(r, 2000));
if (!SKIP_BUILD || !existsSync(FIXTURE_ARTIFACT)) {
  const f = run(['npm', 'run', 'fixture'], { stdio: 'inherit' });
  if (f.status !== 0) { console.error('fixture failed — r7replay would false-fail'); process.exit(1); }
} else {
  console.log('  fixture artifact present, reusing it');
}
if (!existsSync(FIXTURE_ARTIFACT)) {
  console.error(`fixture ran but ${FIXTURE_ARTIFACT} is missing`); process.exit(1);
}

// ── 3. UNITS AND GATES ────────────────────────────────────────────────────
console.log('\n── units and gates ──');
for (const [name, cmd] of UNITS.filter(wanted)) {
  const r = run(cmd);
  const tail = (r.stdout || r.stderr || '').trim().split('\n').filter(Boolean).pop() ?? '';
  record(name, r.status ?? 1, tail.slice(0, 96));
}

// ── 4. WORKER, THEN THE RENDER REPLAYS ────────────────────────────────────
console.log('\n── worker ──');
const worker = spawn(join(SITE, 'scripts', 'local-worker.sh'), [], {
  cwd: SITE, stdio: 'ignore', detached: true,
});
worker.unref();
if (!(await waitForWorker())) {
  stopWorker();
  console.error(`no worker answered on ${BASE} within 60s`);
  process.exit(1);
}
console.log(`  worker up on ${BASE}`);

console.log('\n── render replays ──');
for (const [name, cmd] of RENDERS.filter(wanted)) {
  const r = run(cmd);
  const line = (r.stdout || '').split('\n').reverse().find((l) => /passed, \d+ failed/.test(l)) ?? '';
  record(name, r.status ?? 1, line.replace(/[═\s]+/g, ' ').trim());
  if (r.status !== 0 && !line) console.log((r.stdout || r.stderr || '').split('\n').slice(-12).join('\n'));
}

stopWorker();

// ── 5. SUMMARY ────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.code !== 0);
console.log(`\n═══ ${results.length - failed.length}/${results.length} steps passed ═══`);
for (const f of failed) console.log(`  FAILED: ${f.name}`);
process.exit(failed.length === 0 ? 0 : 1);
