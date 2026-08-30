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
import { usdmAustin, usdmSanAntonio } from "./fetchers/usdm";
import { usdaSoil } from "./fetchers/usdaSoil";
import { airnowAustin, airnowSanAntonio } from "./fetchers/airnow";
import { censusAcs } from "./fetchers/censusAcs";
import { blsWages } from "./fetchers/blsWages";
import { ercot } from "./fetchers/ercot";
import { txForestService } from "./fetchers/txForestService";
import { arrCollectionSchedule } from "./fetchers/arrCollectionSchedule";
import { austinWaterStage } from "./fetchers/austinWaterStage";

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

  // --- stub tier: minimal 1-row seed, but most of these now have real
  // fetchRaw() implementations (Seam 1 round 2) — "stub" here describes
  // the seed richness, not whether the fetch is real. noaaClimate,
  // tdiLosses, ercot, txForestService remain true TODO stubs.
  entry("stub", nwsAustin),
  entry("stub", noaaClimate),
  entry("stub", femaFlood),
  entry("stub", tdiLosses),
  entry("stub", usdmAustin),
  entry("stub", usdmSanAntonio),
  entry("stub", usdaSoil),
  entry("stub", airnowAustin),
  entry("stub", airnowSanAntonio),
  entry("stub", censusAcs),
  entry("stub", blsWages),
  entry("stub", ercot),
  entry("stub", txForestService),

  // --- Round 5b municipal. Both are Austin-only by design: this is the one
  // metro whose municipal schedules we have verified sources for, and a home
  // anywhere else renders the honest "not available for your area" state
  // rather than being shown Austin's answer.
  //
  // `arr-collection-schedule` is the registry's one lookup-table feed rather
  // than an observation series — its DatasetFile records a summary per run and
  // the addresses themselves go to public/data/arr-schedule/<zip>.json. See the
  // fetcher's header. It is deliberately unseeded: a placeholder row here would
  // be a wrong collection day for a real street.
  entry("stub", arrCollectionSchedule),
  entry("stub", austinWaterStage),
];
