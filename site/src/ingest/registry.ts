import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FetcherModule } from "./types";

import { noaaStormEventsAustin, noaaStormEventsSanAntonio } from "./fetchers/noaaStormEvents";
import { austinPermits } from "./fetchers/austinPermits";
import { sanAntonioPermits } from "./fetchers/sanAntonioPermits";
import { eiaElectricityPrice } from "./fetchers/eiaElectricityPrice";
import { nwsAustin } from "./fetchers/nws";
import { noaaClimate } from "./fetchers/noaaClimate";
import { femaFlood } from "./fetchers/femaFlood";
import { tdiLosses } from "./fetchers/tdiLosses";
import { twdbDrought } from "./fetchers/twdbDrought";
import { usdaSoil } from "./fetchers/usdaSoil";
import { airnow } from "./fetchers/airnow";
import { censusAcs } from "./fetchers/censusAcs";
import { blsWages } from "./fetchers/blsWages";
import { ercot } from "./fetchers/ercot";
import { txForestService } from "./fetchers/txForestService";

const here = path.dirname(fileURLToPath(import.meta.url));
export const GENERATED_DIR = path.join(here, "..", "data", "generated");

export interface RegistryEntry {
  /** "deep" = real backfill/append/stale logic exercised with a rich
   * seeded historical series (this phase: NOAA Storm Events, Austin + San
   * Antonio permits, EIA electricity price). "stub" = same schema and
   * pipeline, seeded with a minimal 1-2 row sample only. */
  tier: "deep" | "stub";
  fetcher: FetcherModule<unknown>;
  filePath: string;
}

function entry(tier: "deep" | "stub", fetcher: FetcherModule<any>): RegistryEntry {
  return {
    tier,
    fetcher,
    filePath: path.join(GENERATED_DIR, fetcher.datasetId, `${fetcher.location}.json`),
  };
}

/** One entry per generated file — every id in `src/data/data-sources.yaml`
 * is represented, with `municipal-permits` and `noaa-storm-events`
 * producing one file per city per CLAUDE.md's Austin + San Antonio
 * launch scope. Stub feeds get a single representative-location file
 * (see BUILD_PLAN.md Phase 5) rather than full city coverage — that's
 * the "stub module + sample file only" scope for this phase. */
export const REGISTRY: RegistryEntry[] = [
  // --- deep: real backfill/append/stale logic, rich sample history ---
  entry("deep", noaaStormEventsAustin),
  entry("deep", noaaStormEventsSanAntonio),
  entry("deep", austinPermits),
  entry("deep", sanAntonioPermits),
  entry("deep", eiaElectricityPrice),

  // --- stub: interface + TODO fetchRaw + a minimal sample file ---
  entry("stub", nwsAustin),
  entry("stub", noaaClimate),
  entry("stub", femaFlood),
  entry("stub", tdiLosses),
  entry("stub", twdbDrought),
  entry("stub", usdaSoil),
  entry("stub", airnow),
  entry("stub", censusAcs),
  entry("stub", blsWages),
  entry("stub", ercot),
  entry("stub", txForestService),
];
