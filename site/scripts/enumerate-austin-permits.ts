/**
 * TEMP (Round 5) — enumerate the real Austin permit taxonomy.
 * REMOVE THIS FILE once the trade-permit question is settled.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 * `austinPermits.ts` filters to roofing TWICE: a `%ROOF%` SoQL `$where`
 * clause applied server-side BEFORE download, and `isRoofingRelated()` again
 * on what comes back. So Austin's full permit taxonomy has never been
 * observed — not once, by anything in this repo.
 *
 * The San Antonio enumeration (run #32) showed that widening a filter without
 * that view is guesswork: SA's two largest categories are Mechanical Permit
 * and Plumbing General Permit, and its DECLARED VALUATION turned out to be a
 * commercial-only field. Widening San Antonio to trade permits without
 * knowing whether Austin has equivalents would leave the two metros
 * measuring different things. This script observes Austin. It widens nothing.
 *
 * It reads. It writes nothing, commits nothing, and modifies no fetcher.
 *
 * ── WHAT IT REUSES, AND WHAT IT CANNOT ────────────────────────────────────
 * `computeFetchWindow` is imported from `src/ingest/merge.ts` — the same
 * function `runIngestion` calls — so the date window below is computed by
 * the same code with the same 365-day backfill default, not a hand-rolled
 * date that could quietly disagree.
 *
 * Everything else worth reusing in `austinPermits.ts` (`RESOURCE_URL`,
 * `soqlTimestamp`, `isRoofingRelated`, `parseValuation`, the `$where`
 * clause) is module-private, and Round 5 places fetcher edits out of scope.
 * So those literals are re-stated here and guarded: `assertNoDrift()` reads
 * the fetcher's own source and warns loudly if any copied literal stops
 * matching, rather than quietly describing a different query than the one
 * ingestion issues.
 *
 * ── WHICH WINDOW ──────────────────────────────────────────────────────────
 * `computeFetchWindow` returns an INCREMENTAL window (last observation
 * forward) for a dataset that already has live history, and a 365-day
 * BACKFILL window for one that does not. municipal-permits/austin is live,
 * so its incremental window is a few hours wide and would enumerate almost
 * nothing. This enumerates the BACKFILL window — `computeFetchWindow(null)`,
 * the widest window the fetcher ever issues — and prints both so the
 * difference is visible rather than assumed.
 *
 * Run: npx tsx scripts/enumerate-austin-permits.ts   (from site/)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { computeFetchWindow } from "../src/ingest/merge";

// ── Copied verbatim from src/ingest/fetchers/austinPermits.ts ─────────────
const RESOURCE_URL = "https://data.austintexas.gov/resource/3syk-w9eu.json";
/** The roof half of the fetcher's `$where`, verbatim. Removed for enumeration. */
const ROOF_CLAUSE =
  "(upper(work_class) like '%ROOF%' OR upper(permit_type_desc) like '%ROOF%' OR upper(description) like '%ROOF%')";
/** `parseValuation`'s field list, in its coalescing order. */
const VALUATION_FIELDS = ["total_job_valuation", "building_valuation", "total_valuation_remodel"] as const;
/** `isRoofingRelated`'s haystack fields, in order. */
const ROOF_HAYSTACK_FIELDS = ["work_class", "permit_type_desc", "description"] as const;

/** `soqlTimestamp`, re-stated. SoQL literals carry no trailing Z/offset. */
function soqlTimestamp(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
}

const UA =
  "TexasHomeIntelligence-permit-taxonomy-enumeration/1.0 (+https://texashomeintelligence.com; one-off read-only diagnostic)";

/** Socrata's JSON endpoint caps `$limit` at 50,000 per request. */
const PAGE_SIZE = 50_000;
const MAX_PAGES = 40; // 2,000,000-row ceiling; a hit is reported, never silently truncated

function assertNoDrift(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, "../src/ingest/fetchers/austinPermits.ts"), "utf8");
  const checks: [string, string][] = [
    ["resource URL", RESOURCE_URL],
    ["roof $where clause", ROOF_CLAUSE],
    ["soqlTimestamp body", `.replace(/\\.\\d{3}Z$/, "").replace(/Z$/, "")`],
    ...VALUATION_FIELDS.map((f) => [`valuation field ${f}`, `row.${f}`] as [string, string]),
    ...ROOF_HAYSTACK_FIELDS.map((f) => [`roof haystack field ${f}`, `row.${f}`] as [string, string]),
  ];
  return checks.filter(([, literal]) => !src.includes(literal)).map(([label]) => label);
}

type Row = Record<string, string | undefined>;

/**
 * Offline escape hatch, for verifying the report itself without the network.
 * NOT how the workflow runs it: when unset — which is always, on the runner —
 * every query below goes to Socrata. It exists because the container Claude
 * Code runs in is denied data.austintexas.gov by network policy ("Host not in
 * allowlist"), so without it the print logic could only be compiled, never
 * executed. Any output produced this way is labelled as describing a local
 * file, and no value from it may be reported as Austin data.
 */
const FIXTURE: Row[] | null = process.env.AUSTIN_PERMIT_JSON_FILE
  ? (JSON.parse(readFileSync(process.env.AUSTIN_PERMIT_JSON_FILE, "utf8")) as Row[])
  : null;

async function soql(params: Record<string, string>, label: string): Promise<unknown> {
  if (FIXTURE) {
    if (params.$select === "count(1)") return [{ count_1: String(FIXTURE.length) }];
    const limit = Number(params.$limit ?? "1000");
    const offset = Number(params.$offset ?? "0");
    return FIXTURE.slice(offset, offset + limit);
  }
  const url = new URL(RESOURCE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json" };
  // Same header the fetcher sends, optional in exactly the same way.
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    // Socrata's error body echoes the dataset's real column list on a bad
    // column name — the single most useful thing in a failure here, and what
    // surfaced the issue_date/issued_date typo originally. Keep it verbatim.
    const body = await res.text();
    throw new Error(`${label}: HTTP ${res.status} from ${url.toString()} — ${body.slice(0, 900)}`);
  }
  return res.json();
}

/** Non-fatal variant: a probe that fails prints why and returns null. */
async function trySoql(params: Record<string, string>, label: string): Promise<unknown | null> {
  try {
    return await soql(params, label);
  } catch (err) {
    console.log(`  ✗ ${label} FAILED — ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(2)}%`);
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("en-US");

function quantiles(sorted: number[]): string {
  const q = (p: number) => sorted[Math.min(Math.floor(p * sorted.length), sorted.length - 1)];
  return (
    `min=${money(sorted[0])}  p10=${money(q(0.1))}  p25=${money(q(0.25))}  ` +
    `median=${money(q(0.5))}  p75=${money(q(0.75))}  p90=${money(q(0.9))}  max=${money(sorted[sorted.length - 1])}`
  );
}

/**
 * Distinct values with row counts, on the Round 4c convention: every distinct
 * value when the column is a bounded taxonomy; past the threshold, every
 * repeated value plus an exact accounting of the withheld singletons. Counts
 * always sum to the row total, and nothing is silently truncated.
 */
function printDistinct(label: string, values: string[], threshold = 300): void {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`\n── DISTINCT ${label} — ${num(sorted.length)} distinct value(s) over ${num(values.length)} row(s) ──`);
  if (sorted.length <= threshold) {
    for (const [v, c] of sorted) console.log(`  ${num(c).padStart(9)}  ${JSON.stringify(v)}`);
    console.log(`  (every distinct value listed; counts sum to ${num(values.length)})`);
    return;
  }
  const repeated = sorted.filter(([, c]) => c > 1);
  const singles = sorted.length - repeated.length;
  for (const [v, c] of repeated) console.log(`  ${num(c).padStart(9)}  ${JSON.stringify(v)}`);
  console.log(
    `  NOT LISTED: ${num(singles)} value(s) occurring exactly once (${pct(singles, values.length)} of rows). ` +
      `Free text, not a taxonomy — ${num(repeated.length)} repeated value(s) listed above. ` +
      `Listed + withheld = ${num(values.length - singles)} + ${num(singles)} = ${num(values.length)}.`,
  );
}

/** First candidate that is a real key in the returned rows. */
function pickField(keys: Set<string>, candidates: string[]): string | null {
  for (const c of candidates) if (keys.has(c)) return c;
  return null;
}

async function main(): Promise<void> {
  console.log("══ TEMP (Round 5): Austin permit taxonomy enumeration ══\n");
  if (FIXTURE) {
    console.log(`⚠️  AUSTIN_PERMIT_JSON_FILE set — serving ${FIXTURE.length} row(s) from ${process.env.AUSTIN_PERMIT_JSON_FILE}`);
    console.log(`⚠️  This output describes a LOCAL FILE, not Austin's data. Do not report values from it.\n`);
  }

  const drift = assertNoDrift();
  if (drift.length > 0) {
    console.log("::warning title=Round 5 enumeration has drifted from austinPermits.ts::" + drift.join("; "));
    console.log(`⚠️  DRIFT: these copied literals no longer appear in austinPermits.ts: ${drift.join("; ")}`);
    console.log("⚠️  The query below may not match the one ingestion issues. Re-sync before trusting it.\n");
  } else {
    console.log(`drift check: all ${8} copied literals still match austinPermits.ts verbatim.\n`);
  }

  // ── The window, from the fetcher's own function ────────────────────────
  const backfill = computeFetchWindow(null);
  console.log("── DATE WINDOW (computeFetchWindow, imported from src/ingest/merge.ts) ──");
  console.log(`  backfill window (computeFetchWindow(null), 365d): ${backfill.since}  ->  ${backfill.until}`);
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const live = JSON.parse(
      readFileSync(resolve(here, "../src/data/generated/municipal-permits/austin.json"), "utf8"),
    ) as { status?: string; observations?: { observedAt: string }[] };
    const incremental = computeFetchWindow(live as never);
    console.log(`  the window a REAL run would use right now (status=${live.status}): ${incremental.since}  ->  ${incremental.until}`);
    console.log(`  enumerating the BACKFILL window — the incremental one is hours wide and would show almost nothing.`);
  } catch {
    console.log(`  (could not read the committed austin.json to show the incremental window)`);
  }

  const windowWhere = `issue_date between '${soqlTimestamp(backfill.since)}' and '${soqlTimestamp(backfill.until)}'`;
  const fetcherWhere = `${windowWhere} AND ${ROOF_CLAUSE}`;

  console.log("\n── RESOLVED QUERY URLS (checkable against austinPermits.ts) ──");
  const showUrl = (label: string, params: Record<string, string>) => {
    const u = new URL(RESOURCE_URL);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    console.log(`  ${label}\n    ${u.toString()}`);
  };
  showUrl("WHAT THE FETCHER ISSUES (roof filter present):", {
    $where: fetcherWhere,
    $order: "issue_date",
    $limit: "5000",
    $offset: "0",
  });
  showUrl("WHAT THIS ENUMERATION ISSUES (roof filter REMOVED, same dataset, same window):", {
    $where: windowWhere,
    $order: ":id",
    $limit: String(PAGE_SIZE),
    $offset: "0",
  });
  console.log(
    `  Same dataset id: 3syk-w9eu. Same date column: issue_date. Only difference is the removed clause:\n    ${ROOF_CLAUSE}`,
  );
  console.log(
    `  $order is ":id" rather than the fetcher's "issue_date": offset paging over a non-unique\n` +
      `  sort key can skip or repeat rows, and this read has to be complete. Enumeration only.`,
  );

  // ── Exact counts, server-side. Not derived from the paged download. ────
  console.log("\n── EXACT ROW COUNTS (server-side count(1), no pagination involved) ──");
  const countOf = async (where: string, label: string): Promise<number | null> => {
    const r = (await trySoql({ $select: "count(1)", $where: where }, label)) as { count_1?: string }[] | null;
    const n = r?.[0]?.count_1 !== undefined ? Number(r[0].count_1) : null;
    if (n !== null) console.log(`  ${label}: ${num(n)}`);
    return n;
  };
  const totalInWindow = await countOf(windowWhere, "all permits issued in the window");
  const roofInWindow = await countOf(fetcherWhere, "rows the fetcher's %ROOF% $where keeps");
  if (totalInWindow !== null && roofInWindow !== null) {
    console.log(`  => the $where clause discards ${num(totalInWindow - roofInWindow)} of ${num(totalInWindow)} (${pct(totalInWindow - roofInWindow, totalInWindow)})`);
  }

  // ── Field list, as returned ────────────────────────────────────────────
  console.log("\n── FIELD LIST AS RETURNED (one row, no $select, so nothing is hidden by a projection) ──");
  const probe = (await soql({ $where: windowWhere, $order: ":id", $limit: "1" }, "field probe")) as Row[];
  if (probe.length === 0) throw new Error("the window returned zero rows — nothing to enumerate");
  const firstRowKeys = Object.keys(probe[0]);
  firstRowKeys.forEach((k, i) => console.log(`  [${String(i).padStart(2)}] ${JSON.stringify(k)}`));
  console.log(`\n  fields on the first row: ${firstRowKeys.length}`);
  console.log(
    `  NOTE: Socrata omits a null field from a row's JSON entirely rather than sending null, so this\n` +
      `  is the first row's shape, not the dataset's full column set. The union across every row, with\n` +
      `  per-field presence counts, is printed after the download below.`,
  );

  // ── Full download ──────────────────────────────────────────────────────
  console.log("\n── DOWNLOADING THE FULL WINDOW ──");
  const rows: Row[] = [];
  let order = ":id";
  let capped = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    let batch: Row[];
    try {
      batch = (await soql(
        { $where: windowWhere, $order: order, $limit: String(PAGE_SIZE), $offset: String(page * PAGE_SIZE) },
        `page ${page}`,
      )) as Row[];
    } catch (err) {
      if (order === ":id" && page === 0) {
        console.log(`  ⚠️  $order=":id" rejected, falling back to "issue_date" — offset paging over a`);
        console.log(`     non-unique sort key can skip or repeat rows, so treat the totals below as approximate.`);
        console.log(`     Socrata said: ${err instanceof Error ? err.message.slice(0, 300) : String(err)}`);
        order = "issue_date";
        page--;
        continue;
      }
      throw err;
    }
    rows.push(...batch);
    console.log(`  page ${page}: ${num(batch.length)} row(s), running total ${num(rows.length)}`);
    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  console.log(`\n  rows read: ${num(rows.length)}   $order used: ${order}`);
  if (totalInWindow !== null) {
    const complete = rows.length === totalInWindow;
    console.log(
      complete
        ? `  ✓ COMPLETE READ — matches the server-side count of ${num(totalInWindow)} exactly.`
        : `  ⚠️  PARTIAL READ — server-side count is ${num(totalInWindow)}, read ${num(rows.length)} ` +
            `(${pct(rows.length, totalInWindow)} of the window). Everything below describes only what was read; ` +
            `do not extrapolate it to the window.`,
    );
  } else {
    console.log(`  ⚠️  the server-side count query failed, so completeness of this read is UNVERIFIED.`);
  }
  if (capped) {
    console.log(`  ⚠️  hit MAX_PAGES (${MAX_PAGES} x ${num(PAGE_SIZE)}) — the window is larger than this script reads.`);
  }

  // ── Field union + presence ─────────────────────────────────────────────
  console.log("\n── EVERY FIELD SEEN, WITH PRESENCE COUNTS (union across all rows read) ──");
  const seen = new Map<string, number>();
  for (const r of rows) for (const [k, v] of Object.entries(r)) if (v !== undefined && String(v) !== "") seen.set(k, (seen.get(k) ?? 0) + 1);
  for (const k of firstRowKeys) if (!seen.has(k)) seen.set(k, 0);
  const ordered = [...seen.keys()].sort((a, b) => {
    const ia = firstRowKeys.indexOf(a), ib = firstRowKeys.indexOf(b);
    return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib) || a.localeCompare(b);
  });
  console.log(`  ${num(ordered.length)} distinct field(s) across ${num(rows.length)} row(s):`);
  for (const k of ordered) {
    const n = seen.get(k) ?? 0;
    console.log(`    ${JSON.stringify(k).padEnd(34)} non-empty on ${num(n).padStart(9)} row(s)  (${pct(n, rows.length)})`);
  }

  const keys = new Set(ordered);
  const permitTypeField = pickField(keys, ["permit_type", "permit_type_desc", "permittype"]);
  const workClassField = pickField(keys, ["work_class", "workclass"]);
  const at = (r: Row, f: string | null) => (f ? (r[f] ?? "") : "");
  console.log(`\n  permit-type field -> ${permitTypeField ? JSON.stringify(permitTypeField) : "NOT FOUND"}`);
  console.log(`  work-class field  -> ${workClassField ? JSON.stringify(workClassField) : "NOT FOUND"}`);
  if (permitTypeField === "permit_type" && keys.has("permit_type_desc")) {
    console.log(`  (both permit_type and permit_type_desc exist; the fetcher reads permit_type_desc, this`);
    console.log(`   enumerates permit_type as briefed — both are tabulated below so neither is guessed at.)`);
  }

  // ── Distinct value tables ──────────────────────────────────────────────
  for (const f of ["permit_type", "permit_type_desc", "work_class"]) {
    if (keys.has(f)) printDistinct(`${JSON.stringify(f)}`, rows.map((r) => at(r, f)));
    else console.log(`\n── DISTINCT ${JSON.stringify(f)}: FIELD NOT PRESENT in any row read ──`);
  }

  // ── Cross-tab ──────────────────────────────────────────────────────────
  if (permitTypeField && workClassField) {
    console.log(`\n── CROSS-TAB ${JSON.stringify(permitTypeField)} x ${JSON.stringify(workClassField)}, top 15 permit types ──`);
    const totals = new Map<string, number>();
    const cross = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const t = at(r, permitTypeField), w = at(r, workClassField);
      totals.set(t, (totals.get(t) ?? 0) + 1);
      const inner = cross.get(t) ?? new Map<string, number>();
      inner.set(w, (inner.get(w) ?? 0) + 1);
      cross.set(t, inner);
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [t, n] of top) {
      console.log(`  ${JSON.stringify(t)} — ${num(n)} row(s)`);
      const inner = [...(cross.get(t) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]);
      for (const [w, c] of inner) console.log(`      ${num(c).padStart(9)}  ${JSON.stringify(w)}  (${pct(c, n)})`);
    }
    const rest = [...totals.entries()].length - top.length;
    if (rest > 0) {
      const shown = top.reduce((s, [, n]) => s + n, 0);
      console.log(`  (${num(rest)} further permit type(s) not cross-tabulated, ${num(rows.length - shown)} row(s), ${pct(rows.length - shown, rows.length)})`);
    }
  }

  // ── Valuation ──────────────────────────────────────────────────────────
  console.log(`\n── VALUATION FIELDS ──`);
  console.log(`  Austin has no single "declared valuation" column. parseValuation() coalesces three, in this order:`);
  for (const f of VALUATION_FIELDS) {
    const present = rows.filter((r) => {
      const n = parseFloat(String(at(r, f)));
      return Number.isFinite(n) && n > 0;
    }).length;
    console.log(`    ${JSON.stringify(f).padEnd(30)} ${keys.has(f) ? "present in data" : "NOT PRESENT in any row read"} — > 0 on ${num(present)} row(s) (${pct(present, rows.length)})`);
  }
  const valuationOf = (r: Row): number | undefined => {
    for (const f of VALUATION_FIELDS) {
      const n = parseFloat(String(at(r, f)));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return undefined;
  };
  const allVals = rows.map(valuationOf);
  const usable = allVals.filter((v): v is number => v !== undefined);
  console.log(`\n  COALESCED (what the fetcher would store as valuationUsd):`);
  console.log(`    carrying a usable value: ${num(usable.length)}  (${pct(usable.length, rows.length)})`);
  console.log(`    null/blank/zero rate:    ${pct(rows.length - usable.length, rows.length)}`);
  if (usable.length > 0) {
    const s = [...usable].sort((a, b) => a - b);
    console.log(`    distribution: ${quantiles(s)}`);
  }
  if (permitTypeField) {
    console.log(`\n  ── per ${JSON.stringify(permitTypeField)}: rows / with a usable valuation / distribution ──`);
    const byType = new Map<string, { total: number; values: number[] }>();
    for (const r of rows) {
      const t = at(r, permitTypeField);
      const b = byType.get(t) ?? { total: 0, values: [] };
      b.total++;
      const v = valuationOf(r);
      if (v !== undefined) b.values.push(v);
      byType.set(t, b);
    }
    for (const [t, b] of [...byType.entries()].sort((a, b) => b[1].total - a[1].total)) {
      b.values.sort((x, y) => x - y);
      console.log(`    ${JSON.stringify(t)}`);
      console.log(
        `      ${num(b.values.length)} of ${num(b.total)} row(s) carry a value (${pct(b.values.length, b.total)})` +
          (b.values.length > 0 ? `  |  ${quantiles(b.values)}` : ""),
      );
    }
  }

  // ── What the live filter keeps ─────────────────────────────────────────
  console.log(`\n── WHAT THE CURRENT FILTER KEEPS, PER PERMIT TYPE ──`);
  console.log(
    `  isRoofingRelated() lowercases ${ROOF_HAYSTACK_FIELDS.join(" + ")} joined by spaces and tests .includes("roof").\n` +
      `  The $where clause ORs upper(...) like '%ROOF%' over the same three fields — equivalent, since a space\n` +
      `  always separates them and "roof" cannot straddle a boundary. Reproduced here on the downloaded rows.`,
  );
  const isRoof = (r: Row) => ROOF_HAYSTACK_FIELDS.map((f) => at(r, f)).join(" ").toLowerCase().includes("roof");
  const byType = new Map<string, { total: number; kept: number }>();
  let keptTotal = 0;
  for (const r of rows) {
    const t = at(r, permitTypeField);
    const kept = isRoof(r);
    if (kept) keptTotal++;
    const b = byType.get(t) ?? { total: 0, kept: 0 };
    b.total++;
    if (kept) b.kept++;
    byType.set(t, b);
  }
  console.log(`  kept ${num(keptTotal)} of ${num(rows.length)} row(s) read (${pct(keptTotal, rows.length)})`);
  if (roofInWindow !== null) {
    console.log(
      keptTotal === roofInWindow
        ? `  ✓ matches the server-side %ROOF% count (${num(roofInWindow)}) exactly.`
        : `  ⚠️  server-side %ROOF% count was ${num(roofInWindow)}; local reproduction gives ${num(keptTotal)}. ` +
            `A difference means the two predicates are not equivalent after all — investigate before trusting either.`,
    );
  }
  for (const [t, b] of [...byType.entries()].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${num(b.kept).padStart(9)} / ${num(b.total).padEnd(9)} (${pct(b.kept, b.total).padStart(7)} kept)  ${JSON.stringify(t)}`);
  }

  // The fetcher drops these for reasons unrelated to roofing — worth
  // separating so a gap in the observation count is not read as a filter bug.
  const noNumber = rows.filter((r) => isRoof(r) && !at(r, "permit_number")).length;
  const noDate = rows.filter((r) => isRoof(r) && !at(r, "issue_date")).length;
  console.log(
    `\n  of the kept rows, the fetcher additionally drops ${num(noNumber)} with no permit_number and ` +
      `${num(noDate)} with no issue_date.`,
  );

  console.log("\n══ enumeration complete ══");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.log(
    `::error title=TEMP (Round 5) Austin permit enumeration failed::${message.slice(0, 400)} — read-only diagnostic; ingestion itself is unaffected`,
  );
  console.error(`\n✗ TEMP (Round 5) AUSTIN PERMIT ENUMERATION FAILED — ${message}`);
  console.error(
    `  Nothing was written and no fetcher ran. A Socrata HTTP 400 names the offending column and echoes the\n` +
      `  dataset's real column list in the body above — read that before changing anything. An HTTP 404 means\n` +
      `  dataset 3syk-w9eu was re-published under a new id, which austinPermits.ts would also be hitting.`,
  );
  process.exitCode = 1;
});
