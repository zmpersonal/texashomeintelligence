/**
 * Round 49, step 0 · Can a published `data` claim be checked against the UPSTREAM source?
 *
 * The ledger's `data` tier is documented as "traces to a figure in social-feed.json" and does
 * not even assert that much (Round 49 §1). Before proposing a tier that asserts upstream
 * verification, the question has to be answered with measurement rather than preference, for
 * the five sources behind every claim THI has ever published.
 *
 * THREE QUESTIONS PER SOURCE, from the round brief:
 *   1. Is it reachable, and by whom? (a key? a token? does a plain request get refused?)
 *   2. Does it serve a STABLE IDENTIFIER for the specific value a claim cites?
 *   3. What would checking cost, per claim, per run?
 *
 * THE DISTINCTION THIS IS BUILT TO MEASURE. Two unlike things wear the `data` tier:
 *   TRANSCRIBED — the upstream publishes the exact number we state (EIA's 15.88 c/kWh, NOAA's
 *                 695 cooling degree-days). One addressable request returns the same value.
 *   AGGREGATED  — the upstream publishes ROWS and we compute the number (1,097 HVAC permits).
 *                 There is no upstream value to compare against, so "verification" means
 *                 re-running our own aggregation — and Round 44 established that reimplementing
 *                 a request measures the reimplementation.
 *
 * The experiment that matters is #4: Socrata can aggregate SERVER-SIDE. If
 * `count(distinct permit_number)` answers, then an Austin permit count is checkable against the
 * city in one request, without reimplementing anything — and the Round 45 defect (rows counted
 * as permits) is visible from the source. San Antonio serves a CSV and cannot aggregate, so the
 * same claim may be verifiable in one metro and not the other. That asymmetry, if real, decides
 * the shape of the proposal.
 *
 * READ-ONLY. It fetches and prints. A workflow step asserts it wrote nothing under
 * `src/data/generated`.
 */
import { readFileSync } from "node:fs";
import { austinTradeWhere } from "../../src/ingest/fetchers/permitTradeActivity.ts";
import { redactUrl } from "../../src/ingest/redactSecrets.ts";

const GEN = new URL("../../src/data/generated/", import.meta.url);

function onDisk(path: string): any {
  return JSON.parse(readFileSync(new URL(path, GEN), "utf8"));
}

type Result = {
  source: string;
  kind: "transcribed" | "aggregated";
  question: string;
  url: string;
  status: number | string;
  ms: number;
  bytes: number;
  needs: string;
  addressable: string;
  ours: string;
  theirs: string;
  verdict: string;
};
const results: Result[] = [];

async function timed(url: string, init?: RequestInit) {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return { status: res.status, ms: Date.now() - started, bytes: text.length, text };
  } catch (error) {
    return { status: `ERROR ${(error as Error).message.slice(0, 80)}`, ms: Date.now() - started,
             bytes: 0, text: "" };
  }
}

// ── 1 · EIA — TRANSCRIBED. One month, one state, one sector. ────────────────
async function probeEia() {
  const key = process.env.EIA_API_KEY;
  const disk = onDisk("eia-electricity/texas.json");
  const newest = disk.observations.at(-1);
  const period = newest.key;
  const ours = String(newest.value.pricePerKwhCents);

  const url = new URL("https://api.eia.gov/v2/electricity/retail-sales/data/");
  if (key) url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.append("data[]", "price");
  url.searchParams.append("facets[stateid][]", "TX");
  url.searchParams.append("facets[sectorid][]", "RES");
  url.searchParams.set("start", period);
  url.searchParams.set("end", period);

  const r = await timed(url.toString());
  let theirs = "(unparsed)";
  try {
    const rows = JSON.parse(r.text)?.response?.data ?? [];
    theirs = rows.length === 1 ? String(rows[0].price) : `${rows.length} rows returned`;
  } catch { /* leave unparsed */ }
  results.push({
    source: "EIA retail-sales", kind: "transcribed",
    question: `the price THIS claim cites, for ${period}`,
    url: redactUrl(url), status: r.status, ms: r.ms, bytes: r.bytes,
    needs: key ? "EIA_API_KEY (present)" : "EIA_API_KEY (ABSENT — unmeasured)",
    addressable: "(stateid=TX, sectorid=RES, frequency=monthly, period) → exactly one row",
    ours, theirs,
    verdict: theirs === ours ? "MATCH" : "DIFFERS or unmeasurable",
  });
}

// ── 2 · NOAA GSOM — TRANSCRIBED. One station, one month, one dataType. ──────
async function probeGsom() {
  for (const location of ["austin", "san-antonio"]) {
    const disk = onDisk(`noaa-climate/${location}.json`);
    const actual = disk.observations.filter((o: any) => o.value?.kind === "monthly-actual").at(-1);
    const month = actual.key.replace("actual-", "");
    const station = actual.value.sourceRef;
    const ours = String(actual.value.coolingDegreeDaysF);
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));

    const url = new URL("https://www.ncei.noaa.gov/access/services/data/v1");
    url.searchParams.set("dataset", "global-summary-of-the-month");
    url.searchParams.set("stations", station);
    url.searchParams.set("dataTypes", "CLDD");
    url.searchParams.set("startDate", `${month}-01`);
    url.searchParams.set("endDate", last.toISOString().slice(0, 10));
    url.searchParams.set("format", "json");

    const r = await timed(url.toString());
    let theirs = "(unparsed)";
    try {
      const rows = JSON.parse(r.text);
      theirs = rows.length === 1 ? String(Number(rows[0].CLDD)) : `${rows.length} rows returned`;
    } catch { /* leave unparsed */ }
    results.push({
      source: `NOAA GSOM ${location} (${station})`, kind: "transcribed",
      question: `the cooling degree-days THIS claim cites, for ${month}`,
      url: redactUrl(url), status: r.status, ms: r.ms, bytes: r.bytes,
      needs: "no key",
      addressable: "(station id, month, dataType) → exactly one value",
      ours, theirs,
      verdict: theirs === ours ? "MATCH" : "DIFFERS or unmeasurable",
    });
  }
}

// ── 3 · AUSTIN SOCRATA — AGGREGATED, and the experiment. ────────────────────
// Can the CITY tell us how many DISTINCT permits match our own window and predicate? If it can,
// an aggregated claim is checkable at the source for the cost of one request, and the Round 45
// defect is visible from outside. `austinTradeWhere` is imported rather than retyped: a probe
// that rebuilds the predicate measures the rebuild (Round 44).
async function probeAustin() {
  const token = process.env.SOCRATA_APP_TOKEN;
  const headers: Record<string, string> = token ? { "X-App-Token": token } : {};
  const disk = onDisk("permit-trade-activity/austin.json");
  const newestVersion = disk.observations
    .map((o: any) => o.value.mappingVersion).sort().at(-1);
  const rows = disk.observations.filter((o: any) => o.value.mappingVersion === newestVersion);
  const month = rows.map((o: any) => o.value.month).sort().at(-2);  // newest COMPLETE month
  const ourCategorySum = rows.filter((o: any) => o.value.month === month)
    .reduce((s: number, o: any) => s + o.value.permitCount, 0);

  const since = `${month}-01T00:00:00.000`;
  const nextMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  const where = `${austinTradeWhere(since, nextMonth.toISOString().slice(0, 23))}`;

  for (const [label, select] of [
    ["rows", "count(1)"],
    ["distinct permits", "count(distinct permit_number)"],
  ] as const) {
    const url = new URL("https://data.austintexas.gov/resource/3syk-w9eu.json");
    url.searchParams.set("$select", select);
    url.searchParams.set("$where", where);
    const r = await timed(url.toString(), { headers });
    let theirs = "(unparsed)";
    try {
      const body = JSON.parse(r.text);
      theirs = String(Object.values(body[0] ?? {})[0] ?? "(no value)");
    } catch { /* leave unparsed */ }
    results.push({
      source: `Austin Socrata — ${label}`, kind: "aggregated",
      question: `how many ${label} match OUR predicate in ${month}`,
      url: redactUrl(url), status: r.status, ms: r.ms, bytes: r.bytes,
      needs: token ? "token optional (present)" : "token optional (absent; anonymous limit)",
      addressable: "server-side aggregate over our own $where",
      ours: label === "distinct permits"
        ? `${ourCategorySum} (sum of our per-category counts; a permit in two trades is in both)`
        : "(we publish no row count)",
      theirs,
      verdict: r.status === 200 ? "ANSWERED" : "REFUSED",
    });
  }
}

// ── 4 · SAN ANTONIO CKAN — AGGREGATED, and no server-side aggregate exists. ─
async function probeSanAntonio() {
  const pkg = "https://data.sanantonio.gov/api/3/action/package_show?id=building-permits";
  const meta = await timed(pkg);
  let csvUrl = "";
  try {
    const resources = JSON.parse(meta.text)?.result?.resources ?? [];
    const matches = resources.filter((r: any) => /permits?\s*issued/i.test(r.name ?? ""));
    csvUrl = matches.sort((a: any, b: any) =>
      Date.parse(b.last_modified ?? 0) - Date.parse(a.last_modified ?? 0))[0]?.url ?? "";
  } catch { /* leave empty */ }
  results.push({
    source: "San Antonio CKAN package_show", kind: "aggregated",
    question: "which CSV holds the permits a claim counts",
    url: pkg, status: meta.status, ms: meta.ms, bytes: meta.bytes,
    needs: "no key", addressable: "a resource URL, not a value",
    ours: "—", theirs: csvUrl ? "resolved a CSV url" : "(could not resolve)",
    verdict: meta.status === 200 ? "ANSWERED" : "REFUSED",
  });

  if (!csvUrl) return;
  // Does a PLAIN request get the file, and how big is it? There is no `$select` on a CSV, so
  // the only way to check a San Antonio count is to download the whole thing and recount.
  const plain = await timed(csvUrl);
  results.push({
    source: "San Antonio permits CSV (plain request)", kind: "aggregated",
    question: "can a plain script read the file a claim is computed from",
    url: csvUrl, status: plain.status, ms: plain.ms, bytes: plain.bytes,
    needs: "no key", addressable: "NONE — a CSV cannot be asked for a count",
    ours: "—", theirs: `${(plain.bytes / 1_000_000).toFixed(1)} MB downloaded`,
    verdict: plain.status === 200
      ? "ANSWERED, but only by downloading everything and recounting"
      : `REFUSED (${plain.status})`,
  });
}

for (const probe of [probeEia, probeGsom, probeAustin, probeSanAntonio]) {
  try {
    await probe();
  } catch (error) {
    console.error(`[probe failed] ${probe.name}: ${(error as Error).message}`);
  }
}

console.log("\n=== ROUND 49 · can a `data` claim be checked against its source? ===\n");
for (const r of results) {
  console.log(`── ${r.source}  [${r.kind}]`);
  console.log(`   question    ${r.question}`);
  console.log(`   url         ${r.url.slice(0, 150)}`);
  console.log(`   status      ${r.status}   ${r.ms}ms   ${r.bytes.toLocaleString()} bytes`);
  console.log(`   needs       ${r.needs}`);
  console.log(`   addressable ${r.addressable}`);
  console.log(`   ours        ${r.ours}`);
  console.log(`   theirs      ${r.theirs}`);
  console.log(`   verdict     ${r.verdict}\n`);
}
const total = results.reduce((s, r) => s + r.ms, 0);
console.log(`TOTAL ${results.length} requests, ${total}ms wall time.`);
