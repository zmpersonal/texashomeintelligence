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
  rec("USW00012909", 29.3840, -98.5810, "SAN ANTONIO KELLY FIELD"),
  rec("USW00012970", 29.3372, -98.4711, "SAN ANTONIO STINSON MUNI AP"),
].join("\n");

function normals(id: string, name: string, cdd: number[], years: number[], flag: string) {
  return cdd.map((v, i) => ({
    STATION: id, NAME: name, DATE: String(i + 1).padStart(2, "0"),
    "MLY-CLDD-NORMAL": v.toFixed(1), "MLY-CLDD-STDDEV": "0.0",
    years_: String(years[i]), comp_flag_: flag,
  }));
}
const NORMALS: Record<string, unknown[]> = {
  USW00013958: normals("USW00013958", "AUSTIN CAMP MABRY, TX US", AUSTIN_CDD,
                       [29, 29, 30, 30, 30, 30, 30, 30, 29, 30, 29, 29], "C"),
  // MEASURED: every row years=2, comp_flag=E. A two-year estimated record.
  USW00012909: normals("USW00012909", "SAN ANTONIO KELLY FIELD, TX US", STINSON_CDD,
                       new Array(12).fill(2), "E"),
  USW00012970: normals("USW00012970", "SAN ANTONIO STINSON MUNI AP, TX US", STINSON_CDD,
                       [19, 20, 21, 22, 22, 22, 22, 22, 21, 20, 20, 19], "S"),
};

let requested: string[] = [];
/** `overrides` lets one scenario bend one response without rebuilding the world. */
function installFetch(overrides: Record<string, unknown[] | null> = {}, stationText = STATIONS) {
  requested = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    requested.push(url);
    const ok = (body: string) => ({ ok: true, status: 200, async text() { return body; } }) as any;
    if (url.includes("ghcnd-stations.txt")) return ok(stationText);
    const u = new URL(url);
    const ds = u.searchParams.get("dataset");
    const sid = u.searchParams.get("stations") ?? "";
    if (ds === "normals-monthly-1991-2020") {
      const o = overrides[sid];
      return ok(JSON.stringify(o === null ? [] : o ?? NORMALS[sid] ?? []));
    }
    if (ds === "global-summary-of-the-month") {
      const o = overrides["__gsom"];
      if (o !== undefined) return ok(JSON.stringify(o === null ? [] : o));
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

  // ── 6. Never a bounding box. Three rounds died on this parameter.
  console.log("\n6. no request asks a server to interpret a bounding box");
  assert("no bbox parameter anywhere", !requested.some((u) => /bbox|boundingBox/i.test(u)));
  assert("every data request names an explicit station",
    requested.filter((u) => u.includes("/data/v1")).every((u) => /[?&]stations=USW/.test(u)));
  assert("no token or key is ever sent", !requested.some((u) => /token|apikey|[?&]key=/i.test(u)));

  // ── 7. Failure paths refuse rather than reporting silence as success.
  console.log("\n7. refusals");
  installFetch({ USW00013958: null, USW00013904: null });
  let threw = "";
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
