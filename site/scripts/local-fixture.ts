/**
 * Idempotent local test fixture for the render replays.
 *
 * -- THE PROBLEM THIS SOLVES ------------------------------------------------
 * `wrangler dev` persists local D1 and KV to `.wrangler/state` RELATIVE TO CWD.
 * The replays start the worker from `dist/server`, so state landed inside
 * Astro's output directory - which `npm run build` clears. Every build silently
 * destroyed the migrations, the account rows and the KV sessions, and
 * `r7replay` then rendered logged-out and died on `getComputedStyle(null)`.
 * That cost three rounds of re-diagnosis before anyone looked at the cwd.
 *
 * Two things fix it together, and both are needed:
 *   1. `LOCAL_STATE_DIR` below, outside `dist/`, passed as `--persist-to` by
 *      every worker invocation (scripts/local-worker.sh).
 *   2. This script, which rebuilds the fixture from nothing. (1) alone is
 *      fragile in a fresh container; (2) alone means re-seeding every run.
 *
 * -- IDEMPOTENT, AND COLD-START CAPABLE ------------------------------------
 * Every migration uses `CREATE TABLE IF NOT EXISTS`, and every insert here is
 * `INSERT OR REPLACE` keyed on a FIXED id (no `crypto.randomUUID()`), so
 * running this twice leaves exactly the state of running it once. It assumes
 * nothing exists: an empty database is the expected input.
 *
 * -- LOCAL ONLY, ENFORCED ---------------------------------------------------
 * This writes rows that look like homeowner PII (email, address). It must be
 * impossible to point at the real database. Every wrangler call is built here,
 * always carries `--local`, never carries `--remote`, and `assertLocalOnly()`
 * re-checks the assembled argv before each one and refuses on anything
 * remote-shaped. The persist path is asserted to resolve inside this repo.
 * `site/.gitignore` ignores `.wrangler/`, so the database is never committed.
 *
 * Run: npx tsx scripts/local-fixture.ts        (from site/)
 *      npx tsx scripts/local-fixture.ts --check   verify only, write nothing
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const REPO = resolve(SITE, "..");

/**
 * Where local D1/KV live. Outside `dist/`, so `npm run build` cannot clear it,
 * and matched by `site/.gitignore`'s `.wrangler/` rule so it is never
 * committed. Everything that starts a worker must pass this as --persist-to.
 */
export const LOCAL_STATE_DIR = join(SITE, ".wrangler", "state");
/** Where the replays read their session ids from. Inside the state dir, so it
 * is gitignored and disappears together with the database it describes. */
export const SESSIONS_FILE = join(LOCAL_STATE_DIR, "sessions.json");

/** The built worker's config, so the fixture writes to the same D1 the
 * replays' worker reads. Falls back to the source config before a build. */
function wranglerConfig(): string {
  const built = join(SITE, "dist", "server", "wrangler.json");
  return existsSync(built) ? built : join(SITE, "wrangler.jsonc");
}

// -- the guard --------------------------------------------------------------
function assertLocalOnly(args: string[]): void {
  if (!args.includes("--local")) {
    throw new Error(`local-fixture: refusing to run a wrangler command without --local: ${args.join(" ")}`);
  }
  const remoteish = args.filter((a) => /remote/i.test(a));
  if (remoteish.length > 0) {
    throw new Error(`local-fixture: refusing - remote-shaped argument(s): ${remoteish.join(", ")}`);
  }
  const persistIdx = args.indexOf("--persist-to");
  const persist = persistIdx >= 0 ? resolve(args[persistIdx + 1]) : "";
  if (!persist.startsWith(REPO + "/")) {
    throw new Error(`local-fixture: refusing - --persist-to resolves outside the repo: ${persist || "(missing)"}`);
  }
  if (persist.includes(`${SITE}/dist/`)) {
    throw new Error(`local-fixture: refusing - --persist-to is inside dist/, which npm run build clears: ${persist}`);
  }
}

function wrangler(args: string[]): string {
  const full = [...args, "--local", "--persist-to", LOCAL_STATE_DIR, "--config", wranglerConfig()];
  assertLocalOnly(full);
  return execFileSync("npx", ["wrangler", ...full], {
    cwd: SITE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
}

const d1 = (sql: string) => wrangler(["d1", "execute", "DB", "--command", sql]);
const d1File = (file: string) => wrangler(["d1", "execute", "DB", "--file", file]);
const kvPut = (key: string, value: string) =>
  wrangler(["kv", "key", "put", key, value, "--binding", "SESSION"]);

// -- the fixture ------------------------------------------------------------
// Fixed ids, so a re-run replaces rather than duplicates. The session ids are
// the ones the replays have always used, kept so older captures still line up.
const NOW = "2026-01-01T00:00:00.000Z";

interface Fixture {
  label: string;
  sid: string;
  accountId: string;
  homeId: string;
  email: string;
  zip: string;
  areaId: string;
  county: string;
  fips: string;
  /** Address matters: 1001 W Milton St is in Austin's ARR table (Tuesday /
   * Week B) and its odd house number drives the Friday watering parity.
   * 999 Nowhere St is deliberately absent from that table, so the municipal
   * card must withhold rather than guess. */
  address: string;
  reminders: { key: string; label: string; cadence: number; dueInDays: number; lastDone?: string }[];
}

const FIXTURES: Fixture[] = [
  {
    label: "POP",
    sid: "6b9a693ab1260d2a7ba941a551c5bff41f22afacda0dd89026d3b9f2cca0f27e",
    accountId: "fixture-pop-account-0000-000000000001",
    homeId: "fixture-pop-home-0000-000000000001",
    email: "pop@fixture.local",
    zip: "78704",
    areaId: "austin",
    county: "Travis",
    fips: "48453",
    address: "1001 W Milton St",
    // Spread across due buckets, and one with a last_done_at so the
    // "last-done shown on a reminder row" assertion has something to find.
    reminders: [
      { key: "hvac-filter", label: "Change the HVAC filter", cadence: 90, dueInDays: -3, lastDone: "2025-10-01T00:00:00.000Z" },
      { key: "gutters", label: "Clear the gutters", cadence: 180, dueInDays: 10 },
      { key: "water-heater", label: "Flush the water heater", cadence: 365, dueInDays: 60 },
    ],
  },
  {
    label: "NOTRASH",
    sid: "99242f199fd2879ea9ce9147a9421b6cc98b543b54aa11f2e86c9f46d82b1044",
    accountId: "fixture-notrash-account-0000-00000001",
    homeId: "fixture-notrash-home-0000-00000001",
    email: "notrash@fixture.local",
    zip: "78704",
    areaId: "austin",
    county: "Travis",
    fips: "48453",
    address: "999 Nowhere St",
    reminders: [{ key: "hvac-filter", label: "Change the HVAC filter", cadence: 90, dueInDays: 5 }],
  },
  {
    label: "SA",
    sid: "00defcff7975a5a40c5fe2db69a8f486eaf28a39536f939d16a6ad1eef8d1b83",
    accountId: "fixture-sa-account-0000-0000000000001",
    homeId: "fixture-sa-home-0000-0000000000001",
    email: "sa@fixture.local",
    zip: "78205",
    areaId: "san-antonio",
    county: "Bexar",
    fips: "48029",
    address: "100 Main Plaza",
    reminders: [{ key: "hvac-filter", label: "Change the HVAC filter", cadence: 90, dueInDays: 5 }],
  },
  {
    label: "EMPTY",
    sid: "3db195571f33de3c99709f5b5ffef5c883519df44956bc87c17618db25215d61",
    accountId: "fixture-empty-account-0000-000000001",
    homeId: "fixture-empty-home-0000-000000001",
    email: "empty@fixture.local",
    zip: "78704",
    areaId: "austin",
    county: "Travis",
    fips: "48453",
    address: "1001 W Milton St",
    // r7replay snoozes these through the API to produce the all-clear state,
    // so there must be something to snooze.
    reminders: [{ key: "gutters", label: "Clear the gutters", cadence: 180, dueInDays: 2 }],
  },
];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

function migrationFiles(): string[] {
  const dir = join(SITE, "migrations");
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

function applyMigrations(): void {
  const files = migrationFiles();
  console.log(`applying ${files.length} migration(s) to the LOCAL database:`);
  for (const f of files) {
    d1File(f);
    console.log(`  ok  ${f.replace(SITE + "/", "")}`);
  }
}

function insertFixtures(): void {
  console.log("\nwriting fixture rows (INSERT OR REPLACE on fixed ids - safe to re-run):");
  for (const f of FIXTURES) {
    const stmts = [
      `INSERT OR REPLACE INTO accounts (id, email, status, consent, consent_source, consent_at, created_at, last_seen_at)
         VALUES (${q(f.accountId)}, ${q(f.email)}, 'active', 1, 'local-fixture', ${q(NOW)}, ${q(NOW)}, ${q(NOW)})`,
      `INSERT OR REPLACE INTO home_profiles (id, account_id, zip, area_id, county_name, county_fips, created_at, updated_at)
         VALUES (${q(f.homeId)}, ${q(f.accountId)}, ${q(f.zip)}, ${q(f.areaId)}, ${q(f.county)}, ${q(f.fips)}, ${q(NOW)}, ${q(NOW)})`,
      `INSERT OR REPLACE INTO home_addresses (home_id, address_line, consent, consent_source, consent_at, created_at)
         VALUES (${q(f.homeId)}, ${q(f.address)}, 1, 'local-fixture', ${q(NOW)}, ${q(NOW)})`,
      // Reminders are re-created from scratch each run so a replay that
      // snoozes them (r7replay's all-clear case) does not leave the fixture
      // permanently in that state.
      `DELETE FROM reminders WHERE home_id = ${q(f.homeId)}`,
      // Same reasoning for the weekly-email tables. r9render asserts the
      // preference is OFF by default and then toggles it ON; without this the
      // second run of that replay starts from ON and the assertion that a
      // missing row is never read as opt-in fails for fixture reasons rather
      // than product ones. Absent row IS the default-off state, so deleting is
      // the correct reset - never inserting `enabled = 0`.
      `DELETE FROM account_email_prefs WHERE account_id = ${q(f.accountId)}`,
      `DELETE FROM weekly_email_sends WHERE account_id = ${q(f.accountId)}`,
      `DELETE FROM email_suppressions WHERE email = ${q(f.email)}`,
    ];
    f.reminders.forEach((r, i) => {
      const id = `${f.homeId}-rem-${i}`;
      stmts.push(
        `INSERT OR REPLACE INTO reminders
           (id, home_id, task_key, label, cadence_days, next_due_at, last_done_at, snoozed_until, status, created_at, updated_at)
         VALUES (${q(id)}, ${q(f.homeId)}, ${q(r.key)}, ${q(r.label)}, ${r.cadence},
                 ${q(dayOffset(r.dueInDays))}, ${r.lastDone ? q(r.lastDone) : "NULL"}, NULL, 'active', ${q(NOW)}, ${q(NOW)})`,
        `INSERT OR REPLACE INTO reminder_events (id, reminder_id, home_id, event, occurred_at, next_due_at)
         VALUES (${1000 + FIXTURES.indexOf(f) * 10 + i}, ${q(id)}, ${q(f.homeId)}, 'created', ${q(NOW)}, ${q(dayOffset(r.dueInDays))})`,
      );
    });
    for (const s of stmts) d1(s);
    console.log(`  ok  ${f.label.padEnd(8)} ${f.email.padEnd(22)} ${f.zip} ${f.areaId} - ${f.reminders.length} reminder(s)`);
  }
}

function writeSessions(): void {
  console.log("\nwriting KV sessions:");
  const map: Record<string, string> = {};
  for (const f of FIXTURES) {
    // Shape must match src/lib/auth/session.ts: key `sess:<sid>`, value
    // {accountId, createdAt}.
    kvPut(`sess:${f.sid}`, JSON.stringify({ accountId: f.accountId, createdAt: NOW }));
    map[f.label] = f.sid;
    console.log(`  ok  sess:${f.sid.slice(0, 12)}...  -> ${f.label}`);
  }
  mkdirSync(LOCAL_STATE_DIR, { recursive: true });
  writeFileSync(SESSIONS_FILE, JSON.stringify(map, null, 2) + "\n", "utf8");
  console.log(`\nsession ids written to ${SESSIONS_FILE.replace(REPO + "/", "")}`);
}

/** True when the fixture is present and usable. Cheap enough to call on every
 * replay start. */
export function fixturePresent(): boolean {
  if (!existsSync(SESSIONS_FILE)) return false;
  try {
    const out = d1(`SELECT COUNT(*) AS n FROM accounts WHERE consent_source = 'local-fixture'`);
    const m = out.match(/"n":\s*(\d+)/);
    return m ? Number(m[1]) >= FIXTURES.length : false;
  } catch {
    return false; // no table, no database, no fixture
  }
}

/**
 * A running worker holds local D1 in memory and flushes its own state back to
 * disk, silently overwriting anything written underneath it. Measured in Round
 * 9: deleting a row while the worker was up left the row exactly as it was.
 * So the fixture must be applied BEFORE the worker starts, and this refuses
 * rather than appearing to succeed and leaving the replays failing on state
 * nobody can explain.
 */
function assertWorkerNotRunning(): void {
  const port = process.env.PORT ?? "9400";
  try {
    execFileSync("bash", ["-c", `exec 3<>/dev/tcp/127.0.0.1/${port}`], { stdio: "ignore" });
  } catch {
    return; // nothing listening - good
  }
  throw new Error(
    `local-fixture: a worker is already listening on 127.0.0.1:${port}.\n` +
      `  A running worker keeps local D1 in memory and will overwrite these writes.\n` +
      `  Stop it, run this script, then start it again with scripts/local-worker.sh`,
  );
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  console.log("== LOCAL FIXTURE (test data only; never remote) ==");
  console.log(`persist-to : ${LOCAL_STATE_DIR.replace(REPO + "/", "")}`);
  console.log(`config     : ${wranglerConfig().replace(SITE + "/", "")}\n`);

  if (checkOnly) {
    const ok = fixturePresent();
    console.log(ok ? "fixture PRESENT" : "fixture MISSING");
    process.exitCode = ok ? 0 : 1;
    return;
  }

  assertWorkerNotRunning();
  mkdirSync(LOCAL_STATE_DIR, { recursive: true });
  applyMigrations();
  insertFixtures();
  writeSessions();

  const accounts = d1(`SELECT COUNT(*) AS n FROM accounts`).match(/"n":\s*(\d+)/)?.[1];
  const homes = d1(`SELECT COUNT(*) AS n FROM home_profiles`).match(/"n":\s*(\d+)/)?.[1];
  const rem = d1(`SELECT COUNT(*) AS n FROM reminders`).match(/"n":\s*(\d+)/)?.[1];
  console.log(`\nfixture ready: ${accounts} account(s), ${homes} home(s), ${rem} reminder(s).`);
  console.log("start the worker with: scripts/local-worker.sh");
}

if (process.argv[1] && process.argv[1].endsWith("local-fixture.ts")) main();
