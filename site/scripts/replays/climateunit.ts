/*
 * Round 19d — the cooling-degree-day fetcher, against replayed NOAA payloads.
 *
 * WHAT IT REPLAYS. Every normals figure below is a value the 2026-09-05 runner
 * dispatch read from a live NOAA response. Nothing here is invented except the
 * GSOM actual magnitudes, whose SHAPE the probe measured (36 monthly rows) but
 * whose values it did not quote — those are labelled synthetic and no assertion
 * treats them as facts about a real month.
 *
 * WHY REPLAY AT ALL. www.ncei.noaa.gov is refused at CONNECT from the sandbox
 * this was written in, so the parsing has to be exercised some other way. Three
 * rounds were lost to assumptions about this API; the point of these assertions
 * is that the SHAPE handling is pinned even though the network is not reachable.
 *
 * WHAT IT CANNOT PROVE: that the live endpoint still answers, or that the
 * ghcnd-stations.txt fixed-width offsets are right (the dispatch confirmed both).
 *
 * Run: npx tsx scripts/replays/climateunit.ts
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  noaaClimateAustin,
  noaaClimateSanAntonio,
  __resetStationTableCacheForTests,
} from "../../src/ingest/fetchers/noaaClimate";
import { REGISTRY } from "../../src/ingest/registry";
import { maxDataAgeDays } from "../../src/lib/dataFreshness";
import type { Observation } from "../../src/ingest/types";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let failures = 0;
let checks = 0;
function assert(label: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) console.log(`  ok   ${label}${detail ? `  — ${detail}` : ""}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

// ── MEASURED, 1991-2020 normals, base 65F.
const AUSTIN_CDD = [9.6, 24.0, 73.2, 171.7, 369.9, 541.4, 644.8, 664.8, 473.7, 238.3, 62.3, 16.1];
const STINSON_CDD = [11.0, 35.2, 95.2, 206.6, 408.9, 563.9, 643.3, 667.9, 487.8, 263.9, 70.8, 19.5];

function rec(id: string, lat: number, lon: number, name: string) {
  return id.padEnd(11) + " " + lat.toFixed(4).padStart(8) + " " + lon.toFixed(4).padStart(9) +
         "  100.0" + "  TX " + name.padEnd(30);
}
// Kelly Field is placed NEARER than Stinson on purpose: distance alone must not
// be enough to pick it. USC and US1 are present so their exclusion is tested.
const STATIONS = [
  rec("USW00013958", 30.3208, -97.7603, "AUSTIN CAMP MABRY"),
  rec("USW00013904", 30.1831, -97.6799, "AUSTIN BERGSTROM INTL AP"),
  rec("USC00410428", 30.2700, -97.7400, "AUSTIN COOP"),
  rec("US1TXTRV001", 30.2650, -97.7420, "AUSTIN COCORAHS"),
  rec("USW00012931", 29.3400, -98.4400, "SAN ANTONIO BROOKS AFB"),
  rec("USW00012909", 29.3840, -98.5810, "SAN ANTONIO KELLY FIELD"),
  rec("USW00012970", 29.3372, -98.4711, "SAN ANTONIO STINSON MUNI AP"),
].join("\n");

/**
 * A normals CSV in the shape Round 19c measured: the value column plus its
 * per-element companions `years_`, `comp_flag_`, `meas_flag_`. The API returns
 * the value WITHOUT these, which is the whole Round 19e finding, so section 4
 * builds an API-shaped file too and proves it is rejected.
 */
function normalsCsv(id: string, name: string, cdd: number[], years: number[], flag: string,
                    withProvenance = true) {
  const cols = ["STATION", "DATE", "NAME", "MLY-CLDD-NORMAL", "MLY-CLDD-BASE40", "MLY-TMAX-NORMAL"];
  if (withProvenance) cols.push("years_MLY-CLDD-NORMAL", "comp_flag_MLY-CLDD-NORMAL", "meas_flag_MLY-CLDD-NORMAL");
  const lines = [cols.join(",")];
  for (let i = 0; i < 12; i++) {
    // The station NAME carries a comma on purpose — a naive split(",") would
    // shift every column after it, and these files run to 400+ columns.
    const row = [id, String(i + 1).padStart(2, "0"), `"${name}"`,
                 cdd[i].toFixed(1), "0.0", "80.0"];
    if (withProvenance) row.push(String(years[i]), flag, "");
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

const NORMALS_CSV: Record<string, string> = {
  USW00013958: normalsCsv("USW00013958", "AUSTIN-CAMP MABRY, TX US", AUSTIN_CDD,
                          [29, 29, 30, 30, 30, 30, 30, 30, 29, 30, 29, 29], "C"),
  // MEASURED: every row years=2, comp_flag=E. A two-year estimated record.
  USW00012909: normalsCsv("USW00012909", "SAN ANTONIO KELLY AFB, TX US", STINSON_CDD,
                          new Array(12).fill(2), "E"),
  USW00012970: normalsCsv("USW00012970", "SAN ANTONIO STINSON MUNI AP, TX US", STINSON_CDD,
                          [19, 20, 21, 22, 22, 22, 22, 22, 21, 20, 20, 19], "S"),
};

/** Only these station ids have a published normals file. */
const INDEXED = ["USW00013958", "USW00013904", "USW00012909", "USW00012970"];
const INDEX_HTML = "<html>" + INDEXED.map((i) => `<a href="${i}.csv">x</a>`).join("") + "</html>";

let requested: string[] = [];
/** `overrides` lets one scenario bend one response without rebuilding the world. */
function installFetch(
  overrides: Record<string, string | null> = {},
  stationText = STATIONS,
  indexHtml: string | null = INDEX_HTML,
) {
  requested = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    requested.push(url);
    const ok = (body: string) => ({ ok: true, status: 200, async text() { return body; } }) as any;
    const notFound = { ok: false, status: 404, async text() { return ""; } } as any;

    if (url.includes("ghcnd-stations.txt")) return ok(stationText);
    if (url.endsWith("/access/")) {
      return indexHtml === null ? { ok: false, status: 503, async text() { return ""; } } as any
                                : ok(indexHtml);
    }
    // Static normals CSV.
    const csvMatch = url.match(/access\/([A-Z0-9]+)\.csv$/);
    if (csvMatch) {
      const sid = csvMatch[1];
      const o = overrides[sid];
      if (o === null) return notFound;
      const body = o ?? NORMALS_CSV[sid];
      return body === undefined ? notFound : ok(body);
    }
    // GSOM actuals still come from data/v1 with an explicit station id.
    const u = new URL(url);
    if (u.searchParams.get("dataset") === "global-summary-of-the-month") {
      const sid = u.searchParams.get("stations") ?? "";
      const o = overrides["__gsom"];
      if (o !== undefined) return ok(o === null ? "[]" : o);
      const base = sid === "USW00013958" ? AUSTIN_CDD : STINSON_CDD;
      const rows: unknown[] = [];
      // 2026-09 is deliberately included: it is the current month for WINDOW and
      // must be dropped as partial.
      for (const d of ["2026-06", "2026-07", "2026-08", "2026-09"]) {
        rows.push({ STATION: sid, DATE: d, CLDD: (base[Number(d.slice(5)) - 1] * 1.04).toFixed(1) });
      }
      return ok(JSON.stringify(rows));
    }
    return { ok: false, status: 400, async text() { return "unexpected"; } } as any;
  }) as typeof fetch;
}

const WINDOW = { since: "2023-09-01T00:00:00.000Z", until: "2026-09-05T00:00:00.000Z" };
const run = (f: typeof noaaClimateAustin) =>
  f.fetchRaw({ env: {}, window: WINDOW }) as Promise<Observation<any>[]>;

async function main() {
  let threw = "";
  // ── 1. Austin: the measured normals come back exactly.
  console.log("\n1. Austin — the measured 1991-2020 normal, value for value");
  installFetch();
  let obs = await run(noaaClimateAustin);
  const aNorm = obs.filter((o) => o.value.kind === "normal-1991-2020");
  assert("twelve monthly normals", aNorm.length === 12, `got ${aNorm.length}`);
  assert("station is Camp Mabry, the nearest USW",
    aNorm[0].value.sourceRef === "USW00013958", aNorm[0].value.sourceRef);
  assert("every measured monthly value round-trips",
    JSON.stringify(aNorm.map((o) => o.value.coolingDegreeDaysF)) === JSON.stringify(AUSTIN_CDD),
    JSON.stringify(aNorm.map((o) => o.value.coolingDegreeDaysF)));
  assert("base is 65 on every row", aNorm.every((o) => o.value.baseF === 65));
  assert("units are stated on every row", aNorm.every((o) => o.value.units === "degree-days F"));
  assert("years of record ride along", aNorm.every((o) => (o.value.yearsOfRecord ?? 0) >= 29));
  assert("distance from the metro point is recorded",
    aNorm.every((o) => typeof o.value.distanceMiles === "number" && o.value.distanceMiles > 0),
    `${aNorm[0].value.distanceMiles} mi`);
  assert("station name rides along", aNorm[0].value.stationName.includes("CAMP MABRY"));

  // ── 2. The two kinds never blur into each other.
  console.log("\n2. normals and actuals stay distinguishable");
  const aAct = obs.filter((o) => o.value.kind === "monthly-actual");
  assert("both kinds present", aNorm.length > 0 && aAct.length > 0, `${aNorm.length}/${aAct.length}`);
  assert("normal keys are prefixed", aNorm.every((o) => o.key.startsWith("normal-1991-2020-")));
  assert("actual keys are prefixed", aAct.every((o) => o.key.startsWith("actual-")));
  assert("no key collides across the two kinds",
    new Set(obs.map((o) => o.key)).size === obs.length);
  assert("actuals carry no years-of-record",
    aAct.every((o) => o.value.yearsOfRecord === undefined),
    "a single month has no 30-year record behind it");

  // ── 3. Round 15's lesson.
  console.log("\n3. the current calendar month is dropped as partial");
  assert("2026-09 is not stored", !aAct.some((o) => o.key === "actual-2026-09"),
    aAct.map((o) => o.key).join(", "));
  assert("2026-08, the newest complete month, is stored",
    aAct.some((o) => o.key === "actual-2026-08"));

  // ── 4. San Antonio: quality beats distance.
  console.log("\n4. San Antonio — an estimated two-year record is rejected though it is nearer");
  installFetch();
  obs = await run(noaaClimateSanAntonio);
  const sNorm = obs.filter((o) => o.value.kind === "normal-1991-2020");
  const kelly = requested.find((u) => u.includes("USW00012909"));
  assert("Kelly Field WAS considered — it is nearer", kelly !== undefined);
  assert("but Stinson is the station selected",
    sNorm[0].value.sourceRef === "USW00012970", sNorm[0].value.sourceRef);
  assert("no Kelly Field value reached an observation",
    !obs.some((o) => o.value.sourceRef === "USW00012909"));
  assert("Stinson's measured values round-trip",
    JSON.stringify(sNorm.map((o) => o.value.coolingDegreeDaysF)) === JSON.stringify(STINSON_CDD));
  assert("its shorter-but-real record is recorded, not hidden",
    sNorm.every((o) => (o.value.yearsOfRecord ?? 0) >= 19 && (o.value.yearsOfRecord ?? 0) <= 22));

  // ── 5. Only the temperature-reporting tier is eligible.
  console.log("\n5. USC and US1 are never asked for");
  assert("no USC station is queried", !requested.some((u) => u.includes("USC00")));
  assert("no US1 station is queried", !requested.some((u) => u.includes("US1TX")),
    "Round 19b sampled US1 CoCoRaHS gauges and concluded the product had no degree days");

  // ── 5b. Round 19e: normals come from the static CSV, actuals from the API.
  console.log("\n5b. normals read from the static CSV; actuals stay on data/v1");
  installFetch();
  await run(noaaClimateAustin);
  assert("the normals request is a static .csv",
    requested.some((u) => /normals-monthly\/1991-2020\/access\/USW00013958\.csv$/.test(u)));
  assert("no normals request goes to data/v1",
    !requested.some((u) => u.includes("/data/v1") && u.includes("normals")),
    "the API returns values without years_ — that is what broke the first live run");
  assert("actuals still come from data/v1 with an explicit station",
    requested.some((u) => u.includes("/data/v1") && /dataset=global-summary-of-the-month/.test(u)
                          && /stations=USW/.test(u)));

  // ── 5c. An API-shaped normals file — value present, provenance absent.
  console.log("\n5c. a normals source with no years_ column is rejected, not worked around");
  installFetch({
    USW00013958: normalsCsv("USW00013958", "AUSTIN-CAMP MABRY, TX US", AUSTIN_CDD,
                            [], "", /* withProvenance */ false),
    USW00013904: normalsCsv("USW00013904", "AUSTIN BERGSTROM INTL AP, TX US", AUSTIN_CDD,
                            [], "", false),
  });
  threw = "";
  try { await run(noaaClimateAustin); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert("a values-only source is refused", threw !== "");
  assert("and the refusal names the missing column",
    threw.includes("years_MLY-CLDD-NORMAL"), threw.slice(0, 200));

  // ── 5d. Stations with no published file are never requested.
  console.log("\n5d. the access/ index pre-filters candidates");
  installFetch();
  await run(noaaClimateSanAntonio);
  assert("Brooks AFB is skipped without a request",
    !requested.some((u) => u.includes("USW00012931")),
    "it is in ghcnd-stations.txt but has no normals file — the first live run wasted a request on it");
  assert("the index is fetched once, not per station",
    requested.filter((u) => u.endsWith("/access/")).length <= 1);

  // ── 5e. Losing the index costs requests, not correctness.
  console.log("\n5e. an unreadable index degrades to 404-handling");
  __resetStationTableCacheForTests();
  installFetch({ USW00012931: null }, STATIONS, null);
  const degraded = await run(noaaClimateSanAntonio);
  assert("the run still succeeds", degraded.length > 0);
  assert("and still lands on Stinson",
    degraded[0].value.sourceRef === "USW00012970", degraded[0].value.sourceRef);

  // ── 6. Never a bounding box. Three rounds died on this parameter.
  console.log("\n6. no request asks a server to interpret a bounding box");
  assert("no bbox parameter anywhere", !requested.some((u) => /bbox|boundingBox/i.test(u)));
  assert("every data request names an explicit station",
    requested.filter((u) => u.includes("/data/v1")).every((u) => /[?&]stations=USW/.test(u)));
  assert("no token or key is ever sent", !requested.some((u) => /token|apikey|[?&]key=/i.test(u)));

  // ── 7. Failure paths refuse rather than reporting silence as success.
  console.log("\n7. refusals");
  installFetch({ USW00013958: null, USW00013904: null });
  threw = "";
  try { await run(noaaClimateAustin); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert("no usable station -> throws", threw !== "");
  assert("the message names what was rejected and why", /record-quality bar|Rejected/.test(threw), threw.slice(0, 160));

  installFetch({ __gsom: null });
  threw = "";
  try { await run(noaaClimateAustin); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert("normals without actuals -> throws rather than a 2020-dated 'success'", threw !== "");
  assert("and says so plainly", /actuals were not/.test(threw), threw.slice(0, 160));

  // The station table is memoised per process, so the cache has to be dropped
  // before this path can be reached at all. That memoisation is deliberate —
  // both metros share one ~10 MB download — and finding it here is the reason
  // the reset hook exists.
  __resetStationTableCacheForTests();
  installFetch({}, "");
  threw = "";
  try { await run(noaaClimateSanAntonio); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  assert("an unparseable station table -> throws", threw !== "", threw.slice(0, 120));

  // ── 8. Registration, scoring, freshness.
  console.log("\n8. registration, scoring, freshness");
  const entries = REGISTRY.filter((e) => e.fetcher.datasetId === "noaa-climate");
  assert("both launch metros registered", entries.length === 2,
    entries.map((e) => e.fetcher.location).join(", "));
  assert("no secret required", entries.every((e) => e.fetcher.requiredEnvVars.length === 0));
  const compute = readFileSync(path.join(SITE_DIR, "src", "lib", "stressIndex", "compute.ts"), "utf8");
  assert("the Home Stress Index does not read this feed", !compute.includes("noaa-climate"),
    "a 30-year normal cannot be news");
  assert("freshness window is 120 days", maxDataAgeDays("noaa-climate") === 120);

  // ── 9. Nothing fabricated is committed.
  console.log("\n9. committed generated data");
  const GEN = path.join(SITE_DIR, "src", "data", "generated", "noaa-climate");
  const files = existsSync(GEN) ? readdirSync(GEN) : [];
  for (const f of files) {
    const d = JSON.parse(readFileSync(path.join(GEN, f), "utf8"));
    assert(`${f}: every row is either measured or a marked seed`,
      d.observations.every((o: any) => o.seed === true || o.value?.sourceRef),
      "a CDD row with no station id is unattributable");
  }
  if (files.length === 0) console.log("  ..   no committed files — the first live run writes them");

  console.log(`\nCLIMATE_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log(`\nCLIMATE_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
