/**
 * Build-time read of the Austin Water stage, for inclusion in the precomputed
 * area artifact.
 *
 * This module touches `datasets.ts` and therefore the eager generated-data
 * glob, so it must only ever be imported from build-time code — the static
 * `[area].json.ts` endpoint. The logged-in dashboard reads the stage back out
 * of that artifact through ASSETS, exactly as it does the score. Importing this
 * from the Worker would drag the whole data tree into the bundle.
 */
import { findDataset } from "../datasets";
import type { DatasetFile } from "../../ingest/types";
import type { WaterStageValue } from "../../ingest/fetchers/austinWaterStage";
import { isWaterStage, type StageReading } from "./watering";
import { AUSTIN_WATER_SOURCE } from "./config";

/**
 * The most recent stage observation, or null.
 *
 * Returns the last reading even when the feed is stale — deliberately. The
 * owner's requirement is that a stale card shows the last known stage, clearly
 * marked, with its as-of date, rather than going blank. Deciding whether that
 * reading is too old to publish a watering day from is `buildWateringView`'s
 * job, and it is made from the observation's own date, not from the feed's
 * status flag.
 *
 * Seeded rows are skipped outright: `seed.ts` placeholders are illustrative,
 * and a fabricated drought stage would drive a real watering day.
 */
export function readStageReading(areaId: string): StageReading | null {
  if (areaId !== "austin") return null;

  const file = findDataset("austin-water-stage", "austin") as
    | DatasetFile<WaterStageValue>
    | undefined;
  if (!file || file.status === "sample") return null;

  const real = file.observations.filter((o) => !o.seed);
  if (real.length === 0) return null;

  const latest = real.reduce((a, b) => (a.observedAt >= b.observedAt ? a : b));
  const stage = latest.value?.stage;
  // An unrecognised stage string on disk is not something to render around.
  if (typeof stage !== "string" || !isWaterStage(stage)) return null;

  return {
    stage,
    observedAt: latest.observedAt,
    sourceUrl: latest.value.sourceUrl ?? AUSTIN_WATER_SOURCE.url,
  };
}
