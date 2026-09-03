/**
 * TEMP (Round 4b) — enumerate the real San Antonio permit taxonomy.
 * REMOVE THIS FILE once the trade-permit question is settled.
 *
 * ── WHY IT EXISTS ─────────────────────────────────────────────────────────
 * `sanAntonioPermits.ts` discards every row whose type + description doesn't
 * contain "roof". Widening that filter to plumbing and HVAC needs the real
 * vocabulary of the PERMIT TYPE and WORK TYPE columns, and the container
 * Claude Code runs in cannot reach data.sanantonio.gov (403 to CONNECT on
 * the agent proxy). A GitHub Actions runner can — the same run that failed
 * this enumeration fetched 5,148 SA permit observations successfully — so
 * this script exists to be run there and print what is actually in the file.
 *
 * It reads. It writes nothing, commits nothing, and touches no fetcher.
 *
 * ── WHY IT DOES NOT SIMPLY CALL THE FETCHER ───────────────────────────────
 * Two reasons, both structural rather than a matter of preference:
 *
 *  1. `sanAntonioPermits.fetchRaw()` returns only roof-filtered, date-windowed
 *     observations. Enumerating the taxonomy needs every row, so the one
 *     exported entry point cannot answer the question being asked.
 *
 *  2. The pieces that could be reused — `findPermitsIssuedCsvUrl()`,
 *     `PACKAGE_SHOW_URL`, `RESOURCE_NAME_MATCH`, `resolveHeader()` — are all
 *     module-private in `src/ingest/fetchers/sanAntonioPermits.ts`. Exporting
 *     them would be a change to a fetcher, which Round 4c places out of
 *     scope, so this script re-states them instead.
 *
 * What IS genuinely reused is the parsing: `parseCsv` and `rowsToRecords` are
 * imported from `src/ingest/csv.ts`, the same module the fetcher uses, so the
 * field counts and quoted-field handling reported below are exactly what
 * ingestion sees rather than a second parser's opinion of the same bytes.
 *
 * The re-stated constants are guarded. `assertNoDrift()` reads the fetcher's
 * own source and checks each copied literal still appears in it verbatim; if
 * one doesn't, the enumeration says so loudly instead of quietly describing a
 * different column than the one ingestion reads.
 *
 * Run: npx tsx scripts/enumerate-sa-permits.ts   (from site/)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseCsv, rowsToRecords } from "../src/ingest/csv";

// ── Copied verbatim from src/ingest/fetchers/sanAntonioPermits.ts ──────────
const PACKAGE_SHOW_URL = "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
const RESOURCE_NAME_MATCH = /permits?\s*issued/i;
const PERMIT_TYPE_CANDIDATES = ["PERMIT TYPE", "PERMIT_TYPE", "PERMITTYPE", "TYPE"];
const DESCRIPTION_CANDIDATES = ["WORK TYPE", "PROJECT NAME", "WORK DESCRIPTION", "DESCRIPTION", "WORK_DESCRIPTION", "SCOPE OF WORK"];
const VALUATION_CANDIDATES = ["DECLARED VALUATION", "VALUATION", "JOB VALUATION", "ESTIMATED COST", "PROJECT VALUATION"];

/**
 * A descriptive User-Agent, and the reason the step failed on run #31.
 *
 * Python's `urllib` sends `Python-urllib/3.12` and was answered with HTTP 403
 * after a 302 — while the fetcher's plain `fetch()` succeeded in the same run.
 * Node's fetch is therefore already the fix; this header is belt-and-braces,
 * and it identifies the caller to the city's logs rather than hiding.
 */
const UA = "TexasHomeIntelligence-permit-taxonomy-enumeration/1.0 (+https://texashomeintelligence.com; one-off read-only diagnostic)";

async function get(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    // Explicit rather than relying on the default: the run that failed did so
    // *after* following a 302, so redirect behaviour is load-bearing here.
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: accept },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${res.url || url}`);
  }
  return res;
}

/** Fails loudly if a copied literal no longer matches the fetcher's source. */
function assertNoDrift(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(resolve(here, "../src/ingest/fetchers/sanAntonioPermits.ts"), "utf8");
  const arr = (a: string[]) => "[" + a.map((s) => `"${s}"`).join(", ") + "]";
  const checks: [string, string][] = [
    ["package_show URL", PACKAGE_SHOW_URL],
    ["resource-name regex", RESOURCE_NAME_MATCH.source],
    ["permit-type header candidates", arr(PERMIT_TYPE_CANDIDATES)],
    ["description header candidates", arr(DESCRIPTION_CANDIDATES)],
    ["valuation header candidates", arr(VALUATION_CANDIDATES)],
  ];
  return checks.filter(([, literal]) => !src.includes(literal)).map(([label]) => label);
}

interface CkanResource {
  name?: string;
  url?: string;
  format?: string;
  last_modified?: string;
  created?: string;
}

/**
 * Same resolution as the fetcher's `findPermitsIssuedCsvUrl()`: same package
 * URL, same name regex, and the same freshest-by-`last_modified` reduce with
 * an unset `last_modified` sorting last. That tiebreak is what keeps the
 * frozen "PERMITS ISSUED 2020-2024" archive from being picked over the live
 * resource, so it has to be identical here or the enumeration would describe
 * a different file than ingestion reads.
 */
async function resolveResource(): Promise<CkanResource> {
  const body = (await (await get(PACKAGE_SHOW_URL, "application/json")).json()) as {
    success?: boolean;
    result?: { resources?: CkanResource[] };
  };
  if (!body.success || !body.result?.resources) {
    throw new Error(`CKAN package_show returned no resources for "building-permits"`);
  }
  const candidates = body.result.resources.filter((r) => r.name && RESOURCE_NAME_MATCH.test(r.name));
  if (candidates.length === 0) {
    throw new Error(
      `no resource matching ${RESOURCE_NAME_MATCH} among: ${body.result.resources.map((r) => r.name).join(", ")}`,
    );
  }
  console.log(`candidate resources matching ${RESOURCE_NAME_MATCH} (${candidates.length}):`);
  for (const r of candidates) {
    console.log(`  ${JSON.stringify(r.name)}  last_modified=${r.last_modified ?? "(unset)"}  format=${r.format ?? "?"}`);
    console.log(`      ${r.url ?? "(no url)"}`);
  }
  const resource = candidates.reduce((freshest, r) => {
    const freshestTime = freshest.last_modified ? Date.parse(freshest.last_modified) : -Infinity;
    const rTime = r.last_modified ? Date.parse(r.last_modified) : -Infinity;
    return rTime > freshestTime ? r : freshest;
  });
  if (!resource.url) throw new Error(`matched resource ${JSON.stringify(resource.name)} has no url`);
  return resource;
}

/** The fetcher's `resolveHeader`, re-stated. First candidate that is a real key. */
function resolveHeader(header: string[], candidates: string[]): { name: string; index: number } | null {
  const keys = new Map(header.map((h, i) => [h.trim().toUpperCase(), { name: h, index: i }] as const));
  for (const c of candidates) {
    const hit = keys.get(c.toUpperCase());
    if (hit) return hit;
  }
  return null;
}

/** The fetcher's `parseValuation`: strip $ and commas, keep only > 0. */
function parseValuation(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = parseFloat(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(2)}%`);

function quantiles(sorted: number[]): string {
  const q = (p: number) => sorted[Math.min(Math.floor(p * sorted.length), sorted.length - 1)];
  return (
    `min=${money(sorted[0])}  p10=${money(q(0.1))}  p25=${money(q(0.25))}  ` +
    `median=${money(q(0.5))}  p75=${money(q(0.75))}  p90=${money(q(0.9))}  max=${money(sorted[sorted.length - 1])}`
  );
}

/**
 * Distinct values with row counts.
 *
 * Prints every distinct value when the column is a bounded taxonomy. A column
 * that resolves to free text (PROJECT NAME is in the fetcher's own candidate
 * list) can carry tens of thousands of one-off values, so past the threshold
 * this prints every value seen more than once and then states exactly how
 * many singletons were withheld and what share of rows they are. Nothing is
 * silently truncated, and the counts always add up to the full row total.
 */
function printDistinct(label: string, values: string[], threshold = 300): void {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`\n── DISTINCT ${label} — ${sorted.length} distinct value(s) over ${values.length} row(s) ──`);
  if (sorted.length <= threshold) {
    for (const [v, c] of sorted) console.log(`  ${String(c).padStart(8)}  ${JSON.stringify(v)}`);
    console.log(`  (every distinct value listed)`);
    return;
  }
  const repeated = sorted.filter(([, c]) => c > 1);
  const singletons = sorted.length - repeated.length;
  for (const [v, c] of repeated) console.log(`  ${String(c).padStart(8)}  ${JSON.stringify(v)}`);
  console.log(
    `  NOT LISTED: ${singletons} value(s) occurring exactly once (${pct(singletons, values.length)} of rows). ` +
      `This column is free text, not a taxonomy — ${repeated.length} repeated value(s) listed above.`,
  );
}

async function main(): Promise<void> {
  console.log("══ TEMP (Round 4b): San Antonio permit taxonomy enumeration ══\n");

  const drift = assertNoDrift();
  if (drift.length > 0) {
    console.log("::warning title=Round 4b enumeration has drifted from the fetcher::" + drift.join("; "));
    console.log(`⚠️  DRIFT: these copied literals no longer appear in sanAntonioPermits.ts: ${drift.join("; ")}`);
    console.log("⚠️  The columns enumerated below may not be the columns ingestion reads. Re-sync before trusting them.\n");
  } else {
    console.log("drift check: all 5 copied literals still match sanAntonioPermits.ts verbatim.\n");
  }

  // Offline escape hatch, for verifying the report itself without the
  // network. NOT how the workflow runs it: when unset — which is always, on
  // the runner — the resource is resolved and downloaded exactly as above.
  // It exists because this container is network-blocked, so without it the
  // print logic below could only be compiled, never executed.
  const fixture = process.env.SA_PERMIT_CSV_FILE;
  let csvText: string;
  if (fixture) {
    console.log(`⚠️  SA_PERMIT_CSV_FILE set — reading ${fixture} instead of resolving the CKAN resource.`);
    console.log(`⚠️  This output describes a LOCAL FILE, not the city's data. Do not report values from it.\n`);
    csvText = readFileSync(fixture, "utf8");
  } else {
    const resource = await resolveResource();
    console.log(`\nCHOSEN (freshest by last_modified, same tiebreak as the fetcher):`);
    console.log(`  ${JSON.stringify(resource.name)}  last_modified=${resource.last_modified ?? "(unset)"}`);
    console.log(`  ${resource.url}\n`);
    csvText = await (await get(resource.url!, "text/csv,*/*")).text();
  }
  console.log(`read ${csvText.length.toLocaleString("en-US")} bytes\n`);

  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error("parseCsv returned zero rows");
  const header = rows[0];
  const body = rows.slice(1);

  console.log("── HEADER ROW, VERBATIM AND IN ORDER ──");
  header.forEach((h, i) => console.log(`  [${String(i).padStart(2)}] ${JSON.stringify(h)}`));
  console.log(`\nheader column count: ${header.length}     data rows: ${body.length.toLocaleString("en-US")}`);

  // Rows shorter than the header are the case that matters: `rowsToRecords`
  // does `r[i] ?? ""`, so a short row is indistinguishable from an empty
  // field once records are built — and DECLARED VALUATION sits at index 10.
  console.log("\n── FIELD-COUNT DISTRIBUTION vs HEADER ──");
  const widths = new Map<number, number>();
  for (const r of body) widths.set(r.length, (widths.get(r.length) ?? 0) + 1);
  for (const [n, c] of [...widths.entries()].sort((a, b) => a[0] - b[0])) {
    const flag = n === header.length ? "MATCHES HEADER" : n < header.length ? "SHORT" : "LONG";
    console.log(`  ${String(n).padStart(4)} field(s) : ${String(c).padStart(8)} row(s)   <-- ${flag}`);
  }

  const permitType = resolveHeader(header, PERMIT_TYPE_CANDIDATES);
  const description = resolveHeader(header, DESCRIPTION_CANDIDATES);
  const valuation = resolveHeader(header, VALUATION_CANDIDATES);
  console.log("\n── COLUMNS THE FETCHER RESOLVES (its candidate order, applied to this header) ──");
  for (const [label, hit, candidates] of [
    ["permit type", permitType, PERMIT_TYPE_CANDIDATES],
    ["description", description, DESCRIPTION_CANDIDATES],
    ["valuation", valuation, VALUATION_CANDIDATES],
  ] as const) {
    console.log(
      hit
        ? `  ${label.padEnd(12)} -> ${JSON.stringify(hit.name)} at index ${hit.index}`
        : `  ${label.padEnd(12)} -> NOT FOUND among candidates ${candidates.join(" | ")}`,
    );
  }

  // Records, built by the same helper ingestion uses.
  const records = rowsToRecords(rows);
  const at = (rec: Record<string, string>, hit: { name: string } | null) => (hit ? rec[hit.name] ?? "" : "");

  if (permitType) printDistinct(`${JSON.stringify(permitType.name)} (permit type)`, records.map((r) => at(r, permitType)));
  else console.log("\n── DISTINCT permit type: COLUMN NOT FOUND, nothing to enumerate ──");

  if (description) printDistinct(`${JSON.stringify(description.name)} (work type / description)`, records.map((r) => at(r, description)));
  else console.log("\n── DISTINCT work type / description: COLUMN NOT FOUND, nothing to enumerate ──");

  console.log(`\n── ${valuation ? JSON.stringify(valuation.name) : "VALUATION"} ──`);
  if (!valuation) {
    console.log("  COLUMN NOT FOUND in header — this is the whole explanation for SA carrying no valuationUsd.");
  } else {
    const shortRows = valuation.index >= 0 ? body.filter((r) => r.length <= valuation.index).length : 0;
    let blank = 0,
      zeroOrNegative = 0,
      unparseable = 0;
    const positives: number[] = [];
    for (const rec of records) {
      const raw = at(rec, valuation);
      if (raw.trim() === "") {
        blank++;
        continue;
      }
      const n = parseFloat(raw.replace(/[$,]/g, ""));
      if (!Number.isFinite(n)) unparseable++;
      else if (n <= 0) zeroOrNegative++;
      else positives.push(n);
    }
    console.log(`  rows where the field does not exist (row shorter than index ${valuation.index}): ${shortRows}`);
    console.log(`  present but blank:            ${blank}  (${pct(blank, records.length)})`);
    console.log(`  zero or negative:             ${zeroOrNegative}  (${pct(zeroOrNegative, records.length)})`);
    console.log(`  unparseable after stripping $ and ,: ${unparseable}`);
    console.log(`  carrying a usable value:      ${positives.length}  (${pct(positives.length, records.length)})`);
    console.log(
      `  NULL RATE by the fetcher's own parseValuation (blank + zero/negative + unparseable): ` +
        `${pct(records.length - positives.length, records.length)}`,
    );
    if (positives.length > 0) {
      positives.sort((a, b) => a - b);
      console.log(`  distribution: ${quantiles(positives)}`);
    }

    if (permitType) {
      console.log(`\n  ── per permit type: rows / with a usable valuation / distribution ──`);
      const byType = new Map<string, { total: number; values: number[] }>();
      for (const rec of records) {
        const t = at(rec, permitType);
        const bucket = byType.get(t) ?? { total: 0, values: [] };
        bucket.total++;
        const v = parseValuation(at(rec, valuation));
        if (v !== undefined) bucket.values.push(v);
        byType.set(t, bucket);
      }
      for (const [t, b] of [...byType.entries()].sort((a, b) => b[1].total - a[1].total)) {
        b.values.sort((x, y) => x - y);
        console.log(`    ${JSON.stringify(t)}`);
        console.log(
          `      ${b.values.length} of ${b.total} row(s) carry a value (${pct(b.values.length, b.total)})` +
            (b.values.length > 0 ? `  |  ${quantiles(b.values)}` : ""),
        );
      }
    }
  }

  // Directly the number Round 4 stalled on: what the live filter keeps, and
  // what it discards, per permit type. Reports the current behaviour; changes
  // nothing.
  if (permitType || description) {
    console.log(`\n── WHAT THE CURRENT ROOF FILTER KEEPS (haystack = type + " " + description, .includes("roof")) ──`);
    const byType = new Map<string, { total: number; kept: number }>();
    let keptTotal = 0;
    for (const rec of records) {
      const t = at(rec, permitType);
      const haystack = `${t} ${at(rec, description)}`.toLowerCase();
      const kept = haystack.includes("roof");
      if (kept) keptTotal++;
      const b = byType.get(t) ?? { total: 0, kept: 0 };
      b.total++;
      if (kept) b.kept++;
      byType.set(t, b);
    }
    console.log(`  kept ${keptTotal.toLocaleString("en-US")} of ${records.length.toLocaleString("en-US")} row(s) (${pct(keptTotal, records.length)})`);
    for (const [t, b] of [...byType.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`    ${String(b.kept).padStart(8)} / ${String(b.total).padEnd(8)} ${JSON.stringify(t)}`);
    }
  }

  console.log("\n══ enumeration complete ══");
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // One line, legible from the run summary without opening the log. The step
  // is `continue-on-error`, so a non-zero exit marks it failed without
  // failing the ingestion it rides along with.
  console.log(
    `::error title=TEMP (Round 4b) SA permit enumeration failed::${message} — read-only diagnostic; ingestion itself is unaffected`,
  );
  console.error(`\n✗ TEMP (Round 4b) SA PERMIT ENUMERATION FAILED — ${message}`);
  console.error(
    `  Nothing was written and no fetcher ran. If this is an HTTP 403, the city rejected the User-Agent; ` +
      `if it is a name/column error, the CKAN resource or its header changed and sanAntonioPermits.ts needs the same look.`,
  );
  process.exitCode = 1;
});
