/*
 * Round 22 — the SWDI nx3hail fetcher, against replayed responses.
 *
 * WHAT IS MEASURED AND WHAT IS NOT. The COLUMN SET, the fact that no units
 * column exists, the MAXSIZE value domain (0.75, 1, 1.25, 1.5, 2), the 744-hour
 * ceiling, the `totalTimeInSeconds` trailer and the absence of a county field
 * are all measured — 2026-09-05 dispatch, both metros, twelve windows.
 * COORDINATES AND TIMESTAMPS in the fixtures below are synthetic: the probe
 * reported counts and columns, not rows, so no assertion treats a lat/lon or a
 * date here as a fact about a real storm.
 *
 * Run: npx tsx scripts/replays/hailunit.ts
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { swdiHailAustin, swdiHailSanAntonio } from "../../src/ingest/fetchers/swdiHail";
import { REGISTRY } from "../../src/ingest/registry";
import { maxDataAgeDays } from "../../src/lib/dataFreshness";
import type { Observation } from "../../src/ingest/types";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failures = 0, checks = 0;
function assert(label: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) console.log(`  ok   ${label}${detail ? `  — ${detail}` : ""}`);
  else { failures += 1; console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`); }
}

const HEADER = "ZTIME,LON,LAT,WSR_ID,CELL_ID,RANGE,AZIMUTH,SEVPROB,PROB,MAXSIZE";
/** The measured MAXSIZE domain. Values only; no unit is asserted anywhere. */
const SIZES = [0.75, 1, 1.25, 1.5, 2];

function body(rows: string[], opts: { trailer?: boolean; comments?: boolean } = {}) {
  const out: string[] = [];
  if (opts.comments !== false) out.push("#SWDI", "#Data returned");
  out.push(HEADER, ...rows);
  // MEASURED: SWDI appends this after the records, and Round 21b's probe read
  // it as the newest timestamp for both metros.
  if (opts.trailer !== false) out.push("totalTimeInSeconds,0.412");
  return out.join("\n") + "\n";
}
function row(t: string, lon: number, lat: number, radar: string, cell: string, size: number) {
  return `${t},${lon},${lat},${radar},${cell},45,220,30,80,${size}`;
}

let requested: string[] = [];
/**
 * `count` is what SWDI's `stat=count` should answer. `null` makes that query
 * fail, which must read as "unavailable" and never as "disagrees".
 */
function installFetch(
  payload: string | { status: number; text: string },
  count: number | string | null = null,
) {
  requested = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("stat=count")) {
      if (count === null) {
        return { ok: false, status: 500, async text() { return "no count"; } } as any;
      }
      const text = `#SWDI
${count}
totalTimeInSeconds,0.02
`;
      return { ok: true, status: 200, async text() { return text; } } as any;
    }
    if (typeof payload === "string") {
      return { ok: true, status: 200, async text() { return payload; } } as any;
    }
    return { ok: false, status: payload.status, async text() { return payload.text; } } as any;
  }) as typeof fetch;
}

const WINDOW = { since: "2025-09-05T00:00:00.000Z", until: "2026-09-05T00:00:00.000Z" };
const run = (f: typeof swdiHailAustin) =>
  f.fetchRaw({ env: {}, window: WINDOW }) as Promise<Observation<any>[]>;

async function main() {
  // ── 1. The trailer. Round 21b's probe read it as a date.
  console.log("\n1. the totalTimeInSeconds trailer is filtered, not read as a record");
  installFetch(body([
    row("2026-05-14T22:11:00Z", -97.71, 30.31, "KGRK", "K1", 1.75),
    row("2026-06-02T19:40:00Z", -97.80, 30.19, "KGRK", "K2", 1),
  ]), 2);
  let obs = await run(swdiHailAustin);
  assert("two records survive", obs.length === 2, `got ${obs.length}`);
  assert("no observation came from the trailer",
    !obs.some((o) => /totalTimeInSeconds/.test(JSON.stringify(o))));
  const newest = obs.map((o) => o.observedAt).sort().at(-1)!;
  assert("the newest observedAt is a real timestamp, not the trailer string",
    /^\d{4}-\d{2}-\d{2}T/.test(newest) && newest.startsWith("2026-06-02"), newest);
  assert("every key is unique", new Set(obs.map((o) => o.key)).size === obs.length);

  // ── 2. THE DISTINCTION, carried in the data.
  console.log("\n2. radar-derived vs confirmed hail — carried in every row");
  assert("observationType is on every row and names radar",
    obs.every((o) => o.value.observationType === "radar-derived-hail-signature"));
  assert("the value itself cannot be read as confirmed hail",
    obs.every((o) => /radar-derived/.test(o.value.observationType)
                  && !/confirmed|reported|fell/i.test(o.value.observationType)));
  assert("the product is named on every row",
    obs.every((o) => o.value.sourceProduct === "SWDI nx3hail"));
  // Widened to `string` deliberately. Compared as literals, TypeScript proves
  // the inequality at compile time and rejects the comparison as pointless —
  // which is how Round 22 shipped a TS error that `npm run check` does not
  // look for, because astro check does not typecheck scripts/. The assertion
  // is about the RUNTIME id a consumer would branch on, so it reads it as one.
  // Evaluated separately on purpose: chaining them with && lets TypeScript
  // narrow `hailId` to the literal after the first comparison, and the second
  // is rejected as provably pointless all over again.
  const hailId: string = swdiHailAustin.datasetId;
  const isHailDataset = hailId === "swdi-nx3hail";
  const isNotStormEvents = !["noaa-storm-events"].includes(hailId);
  assert("the dataset id is NOT noaa-storm-events", isHailDataset && isNotStormEvents, hailId);
  assert("the feed's own source name says 'not confirmed hail reports'",
    /not confirmed hail reports/.test(swdiHailAustin.source.name), swdiHailAustin.source.name);

  // ── 3. UNITS. The documentation was not read, so no unit is stored.
  console.log("\n3. MAXSIZE carries no unit, because none was read");
  assert("maxSize is stored as a number", obs.every((o) => typeof o.value.maxSize === "number"));
  assert("maxSizeUnit is null on every row", obs.every((o) => o.value.maxSizeUnit === null));
  assert("no row asserts inches or millimetres anywhere",
    !/inch|millimet|\bmm\b|\bin\b/i.test(JSON.stringify(obs.map((o) => o.value))));
  const src = readFileSync(path.join(SITE_DIR, "src", "ingest", "fetchers", "swdiHail.ts"), "utf8");
  assert("the fetcher does not name a unit for MAXSIZE either",
    !/maxSizeUnit:\s*"(?!null)/.test(src) && !/MAXSIZE is in inches/i.test(src));

  // ── 4. The area is not a county.
  console.log("\n4. the query box is never described as a county");
  assert("areaBasis says not-a-county on every row",
    obs.every((o) => o.value.areaBasis === "box-around-metro-reference-point-not-a-county"));
  // A blunt /county/ match fails on `not-a-county`, which is the very token
  // that makes the row safe. So: no county NAME anywhere, and every occurrence
  // of the word "county" must be inside the not-a-county disclaimer.
  const valueJson = JSON.stringify(obs.map((o) => o.value));
  assert("no county is named", !/travis|bexar|williamson|hays|comal|guadalupe/i.test(valueJson));
  assert("the only use of the word 'county' is the not-a-county disclaimer",
    (valueJson.match(/county/gi) ?? []).length ===
      (valueJson.match(/not-a-county/gi) ?? []).length,
    `${(valueJson.match(/county/gi) ?? []).length} occurrence(s)`);
  assert("no response column is treated as a county",
    !/COUNTY/.test(HEADER), "nx3hail returns no county field — measured");

  // ── 5. The 744-hour ceiling.
  console.log("\n5. the request window is clamped to SWDI's 744-hour ceiling");
  const url = new URL(requested[0]);
  const m = url.pathname.match(/(\d{8}):(\d{8})$/)!;
  const d = (s: string) => new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}T00:00:00Z`);
  const spanDays = (d(m[2]).getTime() - d(m[1]).getTime()) / 86400000;
  assert("a 365-day request window becomes a 31-day query", spanDays <= 31,
    `${m[1]}..${m[2]} = ${spanDays} days`);
  assert("two requests per run: the records, then SWDI's own count",
    requested.length === 2, requested.length + " request(s)");
  assert("the count query is the SAME query plus stat=count",
    requested[1] === `${requested[0]}&stat=count`, requested[1]);
  assert("the bbox is sent, and no token", /bbox=/.test(requested[0])
    && !/token|apikey|[?&]key=/i.test(requested[0]));
  assert("the product path is nx3hail", /\/csv\/nx3hail\//.test(requested[0]));
  assert("plsr is never requested — it does not exist on SWDI",
    !requested.some((u) => /plsr/.test(u)));

  // ── 6. An empty window is a finding about the weather.
  console.log("\n6. no signatures is a finding, not an error");
  installFetch("#SWDI\n#No data\n");
  obs = await run(swdiHailSanAntonio);
  assert("an empty response returns no rows and does not throw", obs.length === 0);

  // ── 7. Failures carry what the server said.
  console.log("\n7. an HTTP error carries the server's own explanation");
  installFetch({ status: 500, text: "ERROR VALIDATING 'dateRange=startDate:endDate'. "
    + "'startDate' must be a date before 'endDate' and maximum date range currently "
    + "allowed is 744 hours." });
  let threw = "";
  try { await run(swdiHailAustin); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert("it throws", threw !== "");
  assert("and quotes the response body rather than discarding it",
    /744 hours/.test(threw), threw.slice(0, 150));

  // ── 8. A changed shape is refused, not guessed at.
  console.log("\n8. a missing column refuses rather than inventing a default");
  installFetch("ZTIME,LON,LAT\n2026-05-14T22:11:00Z,-97.71,30.31\n");
  threw = "";
  try { await run(swdiHailAustin); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert("a truncated column set throws", threw !== "");
  assert("and names what is missing and what came back", /MAXSIZE/.test(threw) && /Columns returned/.test(threw),
    threw.slice(0, 140));

  // ── 9. Rows without a position are dropped.
  console.log("\n9. a signature with no position is not stored");
  // Two rows parse; one is dropped for having no position. SWDI counts 2, and
  // the check must still read "agrees" — it compares against PARSED rows, not
  // against the observations this fetcher chose to keep.
  installFetch(body([
    row("2026-05-14T22:11:00Z", -97.71, 30.31, "KGRK", "K1", 1.5),
    `2026-05-15T01:00:00Z,,,KGRK,K9,45,220,30,80,${SIZES[0]}`,
  ]), 2);
  obs = await run(swdiHailAustin);
  assert("only the positioned row survives", obs.length === 1, `got ${obs.length}`);
  assert("it carries both coordinates",
    typeof obs[0].value.lat === "number" && typeof obs[0].value.lon === "number");

  // ── 9b. ROUND 23 — SWDI's own count as a cross-check.
  console.log("\n9b. the stat=count cross-check");
  assert("a dropped row does not make the check disagree",
    obs[0].value.countCheck === "agrees", obs[0].value.countCheck);
  assert("and the reported count rides on the row", obs[0].value.countCheckReported === 2);

  installFetch(body([
    row("2026-05-14T22:11:00Z", -97.71, 30.31, "KGRK", "K1", 1.5),
    row("2026-05-16T02:00:00Z", -97.60, 30.40, "KGRK", "K3", 1),
  ]), 5);
  obs = await run(swdiHailAustin);
  assert("a real disagreement is recorded, not swallowed",
    obs.every((o) => o.value.countCheck === "disagrees"), obs[0].value.countCheck);
  assert("what SWDI said is kept verbatim", obs[0].value.countCheckReported === 5);
  assert("a disagreement does NOT throw away the records",
    obs.length === 2, "failing on an unverified count semantic would keep the feed dark");

  installFetch(body([row("2026-05-14T22:11:00Z", -97.71, 30.31, "KGRK", "K1", 1.5)]), null);
  obs = await run(swdiHailAustin);
  assert("a failed count query reads 'unavailable', not 'disagrees'",
    obs[0].value.countCheck === "unavailable", obs[0].value.countCheck);
  assert("and reports null rather than a number it did not receive",
    obs[0].value.countCheckReported === null);

  installFetch(body([row("2026-05-14T22:11:00Z", -97.71, 30.31, "KGRK", "K1", 1.5)]), "not-a-number");
  obs = await run(swdiHailAustin);
  assert("an unparseable count is 'unavailable' too",
    obs[0].value.countCheck === "unavailable", obs[0].value.countCheck);

  // The count query must never become the source of the data.
  const src2 = readFileSync(path.join(SITE_DIR, "src", "ingest", "fetchers", "swdiHail.ts"), "utf8");
  assert("stat=count is never used to build an observation",
    !/reportedCount[^\n]*observations\.push/.test(src2)
      && /countCheck: "agrees" \| "disagrees" \| "unavailable"/.test(src2));

  // ── 10. Registration, scoring, freshness, seeding.
  console.log("\n10. registration, scoring, freshness, seeding");
  const entries = REGISTRY.filter((e) => e.fetcher.datasetId === "swdi-nx3hail");
  assert("both metros registered", entries.length === 2,
    entries.map((e) => e.fetcher.location).join(", "));
  assert("no secret required", entries.every((e) => e.fetcher.requiredEnvVars.length === 0));
  const compute = readFileSync(path.join(SITE_DIR, "src", "lib", "stressIndex", "compute.ts"), "utf8");
  assert("the Home Stress Index does not read this feed", !compute.includes("swdi-nx3hail"),
    "a score must not move on radar echoes nobody confirmed");
  assert("freshness window is 200 days", maxDataAgeDays("swdi-nx3hail") === 200);
  const seed = readFileSync(path.join(SITE_DIR, "src", "ingest", "seed.ts"), "utf8");
  assert("it is in NEVER_SEED", /"swdi-nx3hail",/.test(seed.split("NEVER_SEED")[1] ?? ""));
  const GEN = path.join(SITE_DIR, "src", "data", "generated", "swdi-nx3hail");
  const files = existsSync(GEN) ? readdirSync(GEN) : [];
  for (const f of files) {
    const dfile = JSON.parse(readFileSync(path.join(GEN, f), "utf8"));
    assert(`${f}: every row is radar-typed`,
      dfile.observations.every((o: any) => o.seed === true
        || o.value?.observationType === "radar-derived-hail-signature"));
  }
  if (files.length === 0) console.log("  ..   no committed files — the first live run writes them");

  console.log(`\nHAIL_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => {
  console.log(`\nHAIL_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
