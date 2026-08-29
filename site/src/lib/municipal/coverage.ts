/**
 * Which ZIPs the Austin Resource Recovery ingest is allowed to write shards for.
 *
 * Derived from the same Census crosswalk the dashboard resolves ZIPs with, so
 * the set we ingest and the set we can render for cannot drift apart — the same
 * discipline `usdm.ts` follows for counties.
 *
 * This is a coverage ceiling, not a claim. A ZIP being in here means "we would
 * publish a dashboard for it", not "Austin collects here" — the city's own data
 * decides that, and a ZIP with no rows simply gets no shard.
 */
import { CROSSWALK_ROWS } from "../zipCrosswalk";
import { MUNICIPAL_AREA } from "./config";

export function coveredArrZips(): Set<string> {
  return new Set(
    CROSSWALK_ROWS.filter((row) => row.areaId === MUNICIPAL_AREA).map((row) => row.zip),
  );
}
