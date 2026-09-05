import type { FetcherModule, Observation } from "../types";

/**
 * One month of cooling demand, and the station or file the reading came from.
 *
 * `coolingDegreeDaysF` is degree-days Fahrenheit, base 65. It measures how
 * much cooling a period asked for. It is not a cost, a runtime, or a bill.
 *
 * `sourceRef` is NOT optional and never will be. Round 19b's binding rule:
 * every observation this dataset ever writes must name the station id or the
 * exact file it was read out of, so a reader can check which instrument
 * produced the number. A CDD figure with no attributable instrument is not
 * publishable.
 */
export interface CoolingDegreeDayValue {
  coolingDegreeDaysF: number;
  /** GHCN station id, or the exact filename the value was read from. */
  sourceRef: string;
  stationName?: string;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * NOT IMPLEMENTED. Round 19's implementation was FALSIFIED by Round 19b's
 * probe run, and this file records what was measured so the next round does
 * not repeat it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WHAT ROUND 19 SHIPPED, AND WHY IT CANNOT WORK. Round 19 read NCEI's
 * Global Summary of the Month through the Access Data Service, discovering a
 * station by bounding box around each metro's representative point,
 * specifically so that no station id had to be asserted. The 2026-09-05
 * dispatch of `.github/workflows/noaa-climate-probe.yml` measured that this
 * endpoint does not support it. Every station-discovery request — both bbox
 * orderings, both metros — returned:
 *
 *     HTTP 400  errors: [{"field":"stations","message":"A station is required."}]
 *
 * The data service requires explicit station ids. Bounding-box discovery is
 * not a thing it does. That is measured, not inferred.
 *
 * WHAT THE SAME RUN MEASURED AS WORKING:
 *   - `access/services/search/v1/datasets`                          HTTP 200
 *   - `data/normals-monthly/1991-2020/access/`                      HTTP 200
 *     an index of 1,162 static station CSVs, no token, no query shape
 *   - Climate at a Glance national CDD                              HTTP 200
 *     "Contiguous U.S. August Cooling Degree Days (base 65°F)", 2015-2025
 *
 * AND AS NOT WORKING:
 *   - both CPC population-weighted degree-day URLs                  HTTP 404
 *   - the 1991-2020 normals documentation PDF                       HTTP 404
 *   - CDO v2 ("Token parameter is required")                        HTTP 400
 *
 * THE CHOSEN PATH, and what still blocks it. Round 19b selects the **1991-2020
 * monthly normals station files**: static CSVs on a path measured at 200, with
 * no query parameters to get wrong, and a 30-year normal is by construction
 * the right basis for "how hard does a system work in a typical season".
 * Two things remain unmeasured and neither may be guessed:
 *
 *   1. the metro → station-file mapping. The probe showed the index exists;
 *      it did not show which of the 1,162 files covers Austin or San Antonio.
 *   2. the CSV's own shape — whether it carries a cooling-degree-day normal at
 *      all, under what column name, on what base, and in what month layout.
 *
 * Round 19b therefore ships a SECOND PROBE rather than a second fetcher. See
 * the Round 19b steps in `.github/workflows/noaa-climate-probe.yml` and
 * `docs/audits/round-19b-cdd-mechanism.md`. Round 19 shipped on an assumption
 * this probe falsified; shipping again on an unmeasured file layout would be
 * the same mistake with a different endpoint.
 *
 * Until that dispatch is read, this dataset stays in its honest unavailable
 * state: `noaa-climate/austin.json` remains a marked SAMPLE and no San Antonio
 * file exists. `scripts/replays/climateunit.ts` guards that — it asserts this
 * fetcher issues no request at all, so nobody re-ships a known-400 call path.
 */
const FALSIFIED_MECHANISM_NOTE =
  'NOAA NCEI Global Summary of the Month rejects bounding-box station discovery: HTTP 400, ' +
  'errors: [{"field":"stations","message":"A station is required."}] (measured, Round 19b probe, ' +
  "2026-09-05, both bbox orderings, both metros).";

/**
 * Deliberately not `notImplemented()`. That helper says "nobody has written
 * this yet", which was true in Round 19 and is not true now — this was
 * written, run, and measured to be wrong. The distinction is the whole point
 * of the message.
 */
function mechanismFalsified(location: string, window: { since: string; until: string }): never {
  throw new Error(
    `noaa-climate/${location}: no implemented fetch path. ${FALSIFIED_MECHANISM_NOTE} ` +
      "The replacement (1991-2020 monthly normals station CSVs) is blocked on the Round 19b " +
      "probe, which must establish the metro-to-station-file mapping and the CSV column layout " +
      "before a fetcher is written — see docs/audits/round-19b-cdd-mechanism.md. " +
      `Requested window ${window.since} .. ${window.until}.`,
  );
}

function makeFetcher(location: "austin" | "san-antonio"): FetcherModule<CoolingDegreeDayValue> {
  return {
    datasetId: "noaa-climate",
    location,
    // Kept pointing at the normals product rather than the falsified data
    // service, because that is where the next implementation reads from and a
    // dataset file's citation should not name an endpoint we have proven does
    // not answer for us.
    source: {
      name: "NOAA NCEI U.S. Climate Normals, 1991-2020 (monthly)",
      url: "https://www.ncei.noaa.gov/data/normals-monthly/1991-2020/access/",
    },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<CoolingDegreeDayValue>[]> {
      mechanismFalsified(location, ctx.window);
    },
  };
}

export const noaaClimateAustin = makeFetcher("austin");
export const noaaClimateSanAntonio = makeFetcher("san-antonio");
