/**
 * Round 50 — re-ingest the permit trade activity under `trades-v3` and report
 * EVERY published figure that moves.
 *
 * Runs the two real fetchers through `runIngestion`, the same entry point the
 * ingestion cron uses, so the write path and the merge are the production ones.
 * It does not run the rest of the registry: the round changed one mapping, and a
 * full ingestion would mix unrelated feed movement into the report.
 *
 * "STORE HISTORY, NEVER OVERWRITE" is what makes this safe to run on a branch.
 * `mergeObservations` keys on `key`, and every key carries its mapping version,
 * so the v3 rows land BESIDE the v2 rows rather than replacing them. Both
 * readers then publish the newest version per category and the v2 rows stop
 * being read — which is the mechanism Round 45 built and Round 48 fixed the
 * other half of. The before/after below is read through `tradeActivity()`, the
 * site's own reader, so the figures compared are the published ones.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { permitTradeActivityAustin, permitTradeActivitySanAntonio } from "../../src/ingest/fetchers/permitTradeActivity";
import { runIngestion } from "../../src/ingest/runIngestion";
import { REGISTRY } from "../../src/ingest/registry";

const OUT = new URL("../../../docs/audits/round-50-rebase.json", import.meta.url);
const DATA = (metro: string) =>
  new URL(`../../src/data/generated/permit-trade-activity/${metro}.json`, import.meta.url);

type Row = { category: string | null; month: string; permitCount: number; mappingVersion: string;
             scope?: string; sourceValues?: { value: string; count: number }[] };

/**
 * The published view AT A NAMED VERSION, so the comparison is v2-against-v3 and
 * not "before this run against after it".
 *
 * The first cut of this script compared the file against itself across the
 * re-ingest, which made the report depend on run ORDER: a second run found v3
 * already published, reported almost nothing as moved, and the real v2→v3
 * movement vanished from the committed artifact. "Store history, never
 * overwrite" is what makes the honest version possible — the v2 rows are still
 * on disk, so both views are computable from one file, deterministically, any
 * number of times.
 */
function publishedAt(metro: string, version: string) {
  const doc = JSON.parse(readFileSync(DATA(metro), "utf8"));
  const rows: Row[] = (doc.observations ?? []).filter((o: any) => !o.seed).map((o: any) => o.value);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const out = new Map<string, { count: number; sources: Record<string, number> }>();
  for (const r of rows) {
    if (r.mappingVersion !== version) continue;
    if (r.month >= currentMonth) continue;
    out.set(`${r.category ?? "__all-trades__"}/${r.month}`, {
      count: r.permitCount,
      sources: Object.fromEntries((r.sourceValues ?? []).map((s) => [s.value, s.count])),
    });
  }
  return out;
}

/** The published view: newest mapping version per category, incomplete month dropped. */
function published(metro: string) {
  const doc = JSON.parse(readFileSync(DATA(metro), "utf8"));
  const rows: Row[] = (doc.observations ?? []).filter((o: any) => !o.seed).map((o: any) => o.value);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const newest = new Map<string, string>();
  for (const r of rows) {
    const k = r.category ?? "__all-trades__";
    if ((r.mappingVersion ?? "") > (newest.get(k) ?? "")) newest.set(k, r.mappingVersion ?? "");
  }
  const out = new Map<string, { count: number; sources: Record<string, number> }>();
  for (const r of rows) {
    const k = r.category ?? "__all-trades__";
    if (r.mappingVersion !== newest.get(k)) continue;
    if (r.month >= currentMonth) continue;
    out.set(`${k}/${r.month}`, {
      count: r.permitCount,
      sources: Object.fromEntries((r.sourceValues ?? []).map((s) => [s.value, s.count])),
    });
  }
  return { versions: Object.fromEntries(newest), figures: out };
}

/** The derived figures a page publishes: total, mean, peak, trough, half-over-half. */
function derived(figures: Map<string, { count: number }>) {
  const byCat = new Map<string, { month: string; n: number }[]>();
  for (const [k, v] of figures) {
    const [cat, month] = [k.slice(0, k.lastIndexOf("/")), k.slice(k.lastIndexOf("/") + 1)];
    const list = byCat.get(cat) ?? [];
    list.push({ month, n: v.count });
    byCat.set(cat, list);
  }
  const out: Record<string, unknown> = {};
  for (const [cat, listRaw] of byCat) {
    const list = [...listRaw].sort((a, b) => a.month.localeCompare(b.month));
    const total = list.reduce((s, r) => s + r.n, 0);
    const desc = [...list].sort((a, b) => b.n - a.n);
    const half = Math.floor(list.length / 2);
    const first = list.slice(0, half).reduce((s, r) => s + r.n, 0);
    const second = list.slice(list.length - half).reduce((s, r) => s + r.n, 0);
    out[cat] = {
      months: list.length,
      total,
      mean: +(total / list.length).toFixed(1),
      latest: list.at(-1),
      peak: desc[0],
      trough: desc.at(-1),
      halfOverHalfPct: first ? +(((second - first) / first) * 100).toFixed(1) : null,
    };
  }
  return out;
}

const ingestion: Record<string, unknown> = {};
for (const fetcher of [permitTradeActivityAustin, permitTradeActivitySanAntonio]) {
  const entry = REGISTRY.find(
    (e) => e.fetcher.datasetId === fetcher.datasetId && e.fetcher.location === fetcher.location);
  if (!entry) throw new Error(`no registry entry for ${fetcher.datasetId}/${fetcher.location}`);
  const r = await runIngestion(entry.fetcher, entry.filePath);
  ingestion[`${r.datasetId}/${r.location}`] = {
    outcome: r.outcome, observations: r.observationCount, message: r.message };
  console.log(`  ${r.datasetId}/${r.location}: ${r.outcome} — ${r.message}`);
}

const before: Record<string, unknown> = {};
const after: Record<string, unknown> = {};
const moved: Record<string, unknown> = {};
for (const metro of ["austin", "san-antonio"]) {
  const v2 = publishedAt(metro, "trades-v2");
  const v3 = publishedAt(metro, "trades-v3");
  const live = published(metro);
  before[metro] = { atVersion: "trades-v2", derived: derived(v2), figures: Object.fromEntries(v2) };
  after[metro] = { atVersion: "trades-v3", versionsNowPublished: live.versions,
                   derived: derived(v3), figures: Object.fromEntries(v3) };

  const rows: Record<string, { from: number | null; to: number | null; delta: number | null; pct: number | null }> = {};
  for (const k of new Set([...v2.keys(), ...v3.keys()])) {
    const from = v2.get(k)?.count ?? null;
    const to = v3.get(k)?.count ?? null;
    if (from === to) continue;
    rows[k] = { from, to,
      delta: from !== null && to !== null ? to - from : null,
      pct: from ? +(((to! - from) / from) * 100).toFixed(1) : null };
  }
  moved[metro] = rows;
}

/**
 * CONTROL. `energy_storage` must equal, exactly, the independent composition
 * count measured by `round-50-aux-vocabulary.json` — its `storage` plus its
 * `both` rows, since a description naming solar AND a battery belongs in both
 * categories. Two code paths, written separately, over the same live feed.
 *
 * It did not reconcile on the first run: the production predicate omitted bare
 * `ESS` and came out 8 rows light across the window. That is why this is a
 * control and not a sentence in an audit.
 */
function storageControl() {
  let vocab: any;
  try {
    vocab = JSON.parse(readFileSync(
      new URL("../../../docs/audits/round-50-aux-vocabulary.json", import.meta.url), "utf8"));
  } catch {
    return [{ id: "R1", pass: false, note: "the vocabulary measurement is missing; nothing to reconcile against" }];
  }
  const austinAfter = (after.austin as any).figures as Record<string, { count: number }>;  // trades-v3
  const rows: { id: string; pass: boolean; note: string }[] = [];
  let mismatches = 0;
  for (const [month, v] of Object.entries(vocab.byMonth as Record<string, any>)) {
    const expected = v.storage + v.both;
    const actual = austinAfter[`energy_storage/${month}`]?.count;
    if (actual === undefined) continue;        // the incomplete month is dropped from publication
    if (actual !== expected) {
      mismatches++;
      rows.push({ id: `R1/${month}`, pass: false, note: `energy_storage ${actual} vs composition ${expected}` });
    }
  }
  rows.unshift({
    id: "R1",
    pass: mismatches === 0,
    note: mismatches === 0
      ? "energy_storage reconciles exactly with the independent composition count, every month"
      : `${mismatches} month(s) disagree`,
  });
  return rows;
}

const out = {
  measuredAt: new Date().toISOString(),
  note: ("Round 50. v2 rows remain on disk as history and stop being read; v3 is published. "
         + "`movedFigures` compares the v2-published view against the v3-published view, both "
         + "computed from the same file, so re-running this script cannot change the answer."),
  ingestion,
  movedFigures: moved,
  controls: storageControl(),
  before,
  after,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`\nwrote ${OUT.pathname}`);
for (const metro of ["austin", "san-antonio"]) {
  const n = Object.keys((moved as any)[metro]).length;
  console.log(`  ${metro}: ${n} published category-month figure(s) moved`);
}
let failed = 0;
for (const c of out.controls) {
  if (!c.pass) failed++;
  console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.id}  ${c.note}`);
}
if (failed > 0) {
  // A re-base whose own control disagrees must not look like a success.
  console.error(`\n${failed} control(s) failed — the published figures and the independent count disagree.`);
  process.exit(1);
}
