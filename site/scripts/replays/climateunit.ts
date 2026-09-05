/*
 * Round 19 — the cooling-degree-day fetcher, against synthetic GSOM responses.
 *
 * WHY THIS EXISTS. `www.ncei.noaa.gov` is unreachable from the sandbox this
 * fetcher was written in, so there is no live response to check it against.
 * That is exactly the situation in which the parsing has to be exercised
 * anyway: Round 16b's probe shipped only after a dry run caught two defects
 * that would otherwise have burned a runner cycle. This does the same job for
 * the fetcher — it proves the SHAPE handling (station choice, missing values,
 * bbox fallback, month keys, the refusal to invent) against payloads whose
 * right answer is known.
 *
 * WHAT IT CANNOT PROVE, and no local test can: that `CLDD` is GSOM's id for
 * cooling degree days, that `bbox` is ordered north,west,south,east, or that
 * `units=standard` yields base-65F degree-days. Those three are settled by
 * `.github/workflows/noaa-climate-probe.yml` on the runner, not here.
 *
 * Run: npx tsx scripts/replays/climateunit.ts
 */
import { noaaClimateAustin, noaaClimateSanAntonio } from "../../src/ingest/fetchers/noaaClimate";
import type { Observation } from "../../src/ingest/types";

let failures = 0;
let checks = 0;
function assert(label: string, cond: boolean, detail = "") {
  checks += 1;
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

/** Every URL the fetcher asked for, in order, across one scenario. */
let requested: string[] = [];

/**
 * Installs a fetch that answers from `byBbox`, keyed on the bbox value in the
 * query string. A bbox with no entry answers with an empty body — which is
 * what NCEI does for an empty result set, and which is the case the fallback
 * ordering exists for.
 */
function installFetch(byBbox: Record<string, unknown[] | string>) {
  requested = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    requested.push(url);
    const bbox = new URL(url).searchParams.get("bbox") ?? "";
    const hit = byBbox[bbox];
    const body =
      hit === undefined ? "" : typeof hit === "string" ? hit : JSON.stringify(hit);
    return {
      ok: true,
      status: 200,
      async text() {
        return body;
      },
    } as any;
  }) as typeof fetch;
}

const WINDOW = { since: "2026-08-01T00:00:00.000Z", until: "2026-09-04T00:00:00.000Z" };

function row(station: string, name: string, date: string, cldd: string) {
  return { STATION: station, NAME: name, DATE: date, CLDD: cldd };
}

async function run() {
  // ── 1. The documented bbox ordering answers; station choice is by coverage.
  console.log("\n1. station selection — best-covered station wins");
  const AUSTIN_NWSE = "30.6172,-98.0931,29.9172,-97.3931";
  installFetch({
    [AUSTIN_NWSE]: [
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-05", "300"),
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-06", "550"),
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-07", "700"),
      // Fewer usable months, so it must lose regardless of ordering.
      row("USW00099999", "SOMEWHERE ELSE TX US", "2026-07", "690"),
    ],
  });
  let obs = (await noaaClimateAustin.fetchRaw({
    env: {},
    window: WINDOW,
  })) as Observation<any>[];
  assert("only one station's rows are emitted", new Set(obs.map((o) => o.value.stationId)).size === 1);
  assert(
    "the better-covered station is the one chosen",
    obs[0]?.value.stationId === "USW00013904",
    `got ${obs[0]?.value.stationId}`,
  );
  assert("three months emitted", obs.length === 3, `got ${obs.length}`);
  assert("key is the month", obs.map((o) => o.key).join(",") === "2026-05,2026-06,2026-07");
  assert(
    "observedAt is the first of that month, UTC",
    obs[0].observedAt === "2026-05-01T00:00:00.000Z",
    obs[0].observedAt,
  );
  assert("station name rides along for auditability", obs[0].value.stationName === "AUSTIN CAMP MABRY TX US");
  assert("value is a number, not a string", typeof obs[0].value.coolingDegreeDaysF === "number");
  assert("no row is marked as a seed", obs.every((o) => o.seed === undefined));

  // The request has to reach back far enough that a fortnight-long incremental
  // window cannot re-choose the station off two weeks of evidence.
  const startDate = new URL(requested[0]).searchParams.get("startDate") ?? "";
  assert(
    "request spans at least three years regardless of the window asked for",
    startDate <= "2023-09-04",
    `startDate=${startDate} for window.since=${WINDOW.since}`,
  );
  assert("exactly one request when the first bbox ordering answers", requested.length === 1);

  // ── 2. Missing values are not zero.
  console.log("\n2. missing values — -9999 and empty are dropped, real zero is kept");
  installFetch({
    [AUSTIN_NWSE]: [
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-01", "0"),
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-02", "-9999"),
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-03", ""),
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-04", "120"),
    ],
  });
  obs = (await noaaClimateAustin.fetchRaw({ env: {}, window: WINDOW })) as Observation<any>[];
  assert("two months survive", obs.length === 2, `got ${obs.map((o) => o.key).join(",")}`);
  assert("a genuine zero-degree-day January is kept", obs.some((o) => o.key === "2026-01" && o.value.coolingDegreeDaysF === 0));
  assert("-9999 is not read as a reading", !obs.some((o) => o.key === "2026-02"));
  assert("an empty cell is not read as zero", !obs.some((o) => o.key === "2026-03"));

  // ── 3. bbox ordering fallback.
  console.log("\n3. bbox ordering — falls back to south,west,north,east");
  const SA_SWNE = "29.0741,-98.8436,29.7741,-98.1436";
  installFetch({
    [SA_SWNE]: [row("USW00012921", "SAN ANTONIO INTL AP TX US", "2026-07", "640")],
  });
  obs = (await noaaClimateSanAntonio.fetchRaw({ env: {}, window: WINDOW })) as Observation<any>[];
  assert("second ordering is tried when the first returns nothing", requested.length === 2);
  assert("San Antonio still yields a reading", obs.length === 1 && obs[0].value.stationId === "USW00012921");
  assert(
    "the two metros' boxes do not overlap",
    !requested.some((u) => (new URL(u).searchParams.get("bbox") ?? "").startsWith("30.")),
  );

  // ── 4. Duplicate months.
  console.log("\n4. duplicate month rows — one reading per month, first wins");
  installFetch({
    [AUSTIN_NWSE]: [
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-07", "700"),
      row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-07", "701"),
    ],
  });
  obs = (await noaaClimateAustin.fetchRaw({ env: {}, window: WINDOW })) as Observation<any>[];
  assert("one observation, not two under the same key", obs.length === 1);
  assert("the first value is the one kept", obs[0].value.coolingDegreeDaysF === 700);

  // ── 5. Nothing usable must throw, never return [].
  console.log("\n5. an unusable response refuses rather than reporting silence as success");
  installFetch({});
  let threw = "";
  try {
    await noaaClimateAustin.fetchRaw({ env: {}, window: WINDOW });
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  assert("empty responses from both orderings throw", threw !== "");
  assert("the message names the datatype id to check", threw.includes("CLDD"), threw);
  assert("the message names both bbox orderings tried", threw.split(" then ").length === 2, threw);

  console.log("\n6. an all-missing response is not a working feed either");
  installFetch({
    [AUSTIN_NWSE]: [row("USW00013904", "AUSTIN CAMP MABRY TX US", "2026-07", "-9999")],
  });
  threw = "";
  try {
    await noaaClimateAustin.fetchRaw({ env: {}, window: WINDOW });
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  assert("rows with no usable value throw rather than emitting nothing quietly", threw !== "");

  // ── 7. No secret is required, and none is read.
  console.log("\n7. no token, no secret, no owner seam");
  assert("Austin declares no required env vars", noaaClimateAustin.requiredEnvVars.length === 0);
  assert("San Antonio declares no required env vars", noaaClimateSanAntonio.requiredEnvVars.length === 0);
  assert(
    "no request carries a token or key parameter",
    !requested.some((u) => /token|key|apikey/i.test(u)),
  );
  assert(
    "both metros share one dataset id",
    noaaClimateAustin.datasetId === "noaa-climate" && noaaClimateSanAntonio.datasetId === "noaa-climate",
  );
  assert(
    "the two fetchers are the two launch metros",
    noaaClimateAustin.location === "austin" && noaaClimateSanAntonio.location === "san-antonio",
  );

  console.log(`\nCLIMATE_UNIT_STATUS=${failures === 0 ? "ok" : "fail"} checks=${checks} failures=${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((e) => {
  // A crash is a different finding from a failed assertion, and must not be
  // mistaken for one.
  console.log(`\nCLIMATE_UNIT_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
