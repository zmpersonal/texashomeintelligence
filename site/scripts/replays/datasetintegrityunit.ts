/*
 * Round 46 — four properties the committed datasets claim, that nothing checked.
 *
 * WHAT THIS EXISTS TO PREVENT. Every property below was ALREADY TRUE of the
 * tree when this file was written. That is the whole point: each one is stated
 * somewhere — in a type's doc comment, in a fetcher's own reasoning, in a
 * correction note — and nothing executed it, so nothing would have noticed the
 * day it stopped being true. Round 43's purge guard, Round 45's `permitCount`
 * and Round 45's mapping-version constant were all discovered the same way, and
 * all three were found by a human reading rather than by a build failing.
 *
 * These are assertions over claims that hold today. They buy nothing now and
 * everything later, which is the only kind of guard worth having.
 *
 * EACH PROPERTY CARRIES A POSITIVE CONTROL. A check that scans a clean tree and
 * prints "ok" is indistinguishable from a check whose predicate is broken, so
 * every property is also run against a synthetic row that must trip it. That is
 * Round 46's class D in miniature — `saservicerender` passed for three rounds
 * while holding a defect in place, because nothing asked whether it COULD fail.
 *
 * Run: npx tsx scripts/replays/datasetintegrityunit.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GENERATED = path.join(SITE_DIR, "src", "data", "generated");

let checks = 0;
let failures = 0;
function assert(name: string, ok: boolean, detail = ""): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

interface Row {
  key: string;
  observedAt: string;
  ingestedAt: string;
  seed?: true;
  value: Record<string, unknown>;
}
interface File {
  datasetId: string;
  location: string;
  status: string;
  observations: Row[];
}

/** Every committed dataset file, read once. */
function readTree(): { path: string; file: File }[] {
  const out: { path: string; file: File }[] = [];
  for (const dir of readdirSync(GENERATED, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of readdirSync(path.join(GENERATED, dir.name))) {
      if (!f.endsWith(".json")) continue;
      const p = path.join(dir.name, f);
      out.push({ path: p, file: JSON.parse(readFileSync(path.join(GENERATED, p), "utf8")) as File });
    }
  }
  return out;
}

/* ── the four predicates, each a pure function of one file ────────────────── */

/** `types.ts` on `seed`: "`runIngestion` retires every one of them the first
 * time a real fetch succeeds, so a live dataset can never mix fabricated rows
 * in with measured ones." A `sample` file may hold them — that is what sample
 * means — so the property is about live and stale files only. */
function seedRowsInRealFile(f: File): string[] {
  if (f.status !== "live" && f.status !== "stale") return [];
  return f.observations.filter((o) => o.seed).map((o) => o.key);
}

/** `types.ts` on `key`: "must be stable and unique *within one dataset file*".
 * `mergeObservations` guarantees it by keying a Map — but only for rows that
 * went through it. A hand-edit or a future writer that appends directly would
 * not, and the readers that take `observations.at(-1)` would quietly pick one
 * of two rows claiming the same key. */
function duplicateKeys(f: File): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const o of f.observations) {
    if (seen.has(o.key)) dupes.push(o.key);
    seen.add(o.key);
  }
  return dupes;
}

/** `types.ts` on `observations`: "Append-only history, oldest first."
 * `computeFetchWindow` reads `observations.at(-1)?.observedAt` as the newest
 * record, and `dataFreshness` measures currency from the newest — so an
 * out-of-order file does not render wrong, it computes the wrong WINDOW and
 * silently narrows what the next ingest asks for. */
function outOfOrder(f: File): string[] {
  const bad: string[] = [];
  for (let i = 1; i < f.observations.length; i += 1) {
    const prev = f.observations[i - 1];
    const cur = f.observations[i];
    if (cur.observedAt < prev.observedAt) bad.push(`${prev.key} → ${cur.key}`);
  }
  return bad;
}

/** `swdiHail.ts` cross-checks SWDI's own `stat=count` against the rows its
 * parser kept, and records the verdict on every row. A mismatch WARNS — the
 * fetcher's comment explains why it does not throw, and recommends promoting it
 * once a live run agrees. That promotion has not happened, so nothing fails on
 * a `disagrees`; until it does, this at least refuses to COMMIT one.
 *
 * `noaaClimate.ts` rejects a station whose normal is flagged `E` (estimated),
 * with a positive control in `climateunit`. Nothing checks the committed rows,
 * so an `E` that arrived another way would publish a two-year estimate as a
 * thirty-year normal. */
const SUSPECT_VALUES: { dataset: string; field: string; forbidden: string; why: string }[] = [
  { dataset: "swdi-nx3hail", field: "countCheck", forbidden: "disagrees",
    why: "SWDI's row count and the parser's disagree — one of them is wrong" },
  { dataset: "noaa-climate", field: "completenessFlag", forbidden: "E",
    why: "an estimated record wearing a 30-year normal's clothes" },
];
function forbiddenValues(f: File): string[] {
  const out: string[] = [];
  for (const s of SUSPECT_VALUES) {
    if (f.datasetId !== s.dataset) continue;
    for (const o of f.observations) {
      const v = o.value?.[s.field];
      if (typeof v === "string" && v.toUpperCase() === s.forbidden.toUpperCase()) {
        out.push(`${o.key} ${s.field}=${v} (${s.why})`);
      }
    }
  }
  return out;
}

function main(): void {
  const tree = readTree();
  const rows = tree.reduce((n, t) => n + t.file.observations.length, 0);
  console.log(`\n══ ${tree.length} committed dataset file(s), ${rows.toLocaleString("en-US")} observation(s) ══\n`);

  // Scanning a tree that has nothing to find is the normal case, so each
  // assertion reports how much it looked at. A count of zero files or zero rows
  // is the signature of a check that has quietly stopped running.
  assert("the tree is non-empty, so the scans below mean something", tree.length > 0 && rows > 0,
    `${tree.length} file(s), ${rows} row(s)`);

  const realFiles = tree.filter((t) => t.file.status === "live" || t.file.status === "stale");
  const seeded = tree.flatMap((t) => seedRowsInRealFile(t.file).map((k) => `${t.path}:${k}`));
  assert(`no seed row in any of ${realFiles.length} live or stale file(s)`, seeded.length === 0,
    seeded.slice(0, 5).join(", "));

  const dupes = tree.flatMap((t) => duplicateKeys(t.file).map((k) => `${t.path}:${k}`));
  assert(`keys unique within each file (${rows} row(s) scanned)`, dupes.length === 0,
    dupes.slice(0, 5).join(", "));

  const unordered = tree.flatMap((t) => outOfOrder(t.file).map((d) => `${t.path} ${d}`));
  assert("observations oldest-first in every file", unordered.length === 0,
    unordered.slice(0, 3).join(", "));

  const scanned = tree.filter((t) => SUSPECT_VALUES.some((s) => s.dataset === t.file.datasetId));
  const forbidden = tree.flatMap((t) => forbiddenValues(t.file).map((d) => `${t.path} ${d}`));
  assert(
    `no recorded self-check failure in ${scanned.length} file(s) of ${SUSPECT_VALUES.map((s) => s.dataset).join(" + ")}`,
    forbidden.length === 0,
    forbidden.slice(0, 5).join(", "),
  );

  // ── POSITIVE CONTROLS ────────────────────────────────────────────────────
  // Each predicate run against a row built to trip it. If one of these passes
  // silently, the matching scan above is decoration.
  console.log("\n══ positive controls — each predicate must catch a planted row ══\n");

  const row = (over: Partial<Row> = {}): Row =>
    ({ key: "k1", observedAt: "2026-01-01T00:00:00.000Z", ingestedAt: "2026-01-01T00:00:00.000Z", value: {}, ...over });
  const file = (over: Partial<File> = {}): File =>
    ({ datasetId: "x", location: "austin", status: "live", observations: [row()], ...over });

  assert("a seed row in a live file is caught",
    seedRowsInRealFile(file({ observations: [row({ seed: true })] })).length === 1);
  assert("and the same row in a sample file is not",
    seedRowsInRealFile(file({ status: "sample", observations: [row({ seed: true })] })).length === 0);
  assert("a repeated key is caught",
    duplicateKeys(file({ observations: [row(), row()] })).length === 1);
  assert("a newer row before an older one is caught",
    outOfOrder(file({ observations: [row({ key: "b", observedAt: "2026-02-01T00:00:00.000Z" }), row({ key: "a" })] })).length === 1);
  assert("an in-order pair is not",
    outOfOrder(file({ observations: [row({ key: "a" }), row({ key: "b", observedAt: "2026-02-01T00:00:00.000Z" })] })).length === 0);
  assert('countCheck "disagrees" is caught',
    forbiddenValues(file({ datasetId: "swdi-nx3hail", observations: [row({ value: { countCheck: "disagrees" } })] })).length === 1);
  assert('and countCheck "agrees" is not',
    forbiddenValues(file({ datasetId: "swdi-nx3hail", observations: [row({ value: { countCheck: "agrees" } })] })).length === 0);
  assert('completenessFlag "E" is caught',
    forbiddenValues(file({ datasetId: "noaa-climate", observations: [row({ value: { completenessFlag: "E" } })] })).length === 1);
  assert('and flag "S" is not',
    forbiddenValues(file({ datasetId: "noaa-climate", observations: [row({ value: { completenessFlag: "S" } })] })).length === 0);
  assert("a forbidden value in the WRONG dataset is ignored",
    forbiddenValues(file({ datasetId: "airnow", observations: [row({ value: { countCheck: "disagrees" } })] })).length === 0);

  console.log(
    `\nDATASET_INTEGRITY_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.log(`\nDATASET_INTEGRITY_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
}
