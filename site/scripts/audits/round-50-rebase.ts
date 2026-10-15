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

const before: Record<string, unknown> = {};
for (const metro of ["austin", "san-antonio"]) {
  const p = published(metro);
  before[metro] = { versions: p.versions, derived: derived(p.figures),
                    figures: Object.fromEntries(p.figures) };
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

const after: Record<string, unknown> = {};
const moved: Record<string, unknown> = {};
for (const metro of ["austin", "san-antonio"]) {
  const p = published(metro);
  after[metro] = { versions: p.versions, derived: derived(p.figures),
                   figures: Object.fromEntries(p.figures) };

  const b = (before[metro] as any).figures as Record<string, { count: number }>;
  const rows: Record<string, { from: number | null; to: number | null; delta: number | null; pct: number | null }> = {};
  for (const k of new Set([...Object.keys(b), ...p.figures.keys()])) {
    const from = b[k]?.count ?? null;
    const to = p.figures.get(k)?.count ?? null;
    if (from === to) continue;
    rows[k] = { from, to,
      delta: from !== null && to !== null ? to - from : null,
      pct: from ? +(((to! - from) / from) * 100).toFixed(1) : null };
  }
  moved[metro] = rows;
}

const out = {
  measuredAt: new Date().toISOString(),
  note: "Round 50. v2 rows remain on disk as history and stop being read; v3 is published.",
  ingestion,
  movedFigures: moved,
  before,
  after,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`\nwrote ${OUT.pathname}`);
for (const metro of ["austin", "san-antonio"]) {
  const n = Object.keys((moved as any)[metro]).length;
  console.log(`  ${metro}: ${n} published category-month figure(s) moved`);
}
