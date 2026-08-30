/**
 * Which ZIPs the Austin Resource Recovery ingest is allowed to write shards for.
 *
 * Read from the same Census crosswalk the dashboard resolves ZIPs with, so the
 * set we ingest and the set we can render for cannot drift apart — the same
 * discipline `usdm.ts` follows for counties.
 *
 * Node-only, and it reads the CSV with `fs` rather than importing
 * `lib/zipCrosswalk.ts`. That module loads the file with Vite's `?raw` suffix,
 * which `astro build` resolves but plain Node — what `npm run ingest` runs
 * under — cannot. Parsing the two columns we need here keeps the ingest path
 * free of Vite-only syntax without giving `zipCrosswalk.ts` an `fs` import,
 * which would follow it into the Worker bundle through the SSR routes that
 * resolve a ZIP.
 *
 * This is a coverage ceiling, not a claim. A ZIP being in here means "we would
 * publish a dashboard for it", not "Austin collects here" — the city's own data
 * decides that, and a ZIP with no rows simply gets no shard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MUNICIPAL_AREA } from "./config";

const here = path.dirname(fileURLToPath(import.meta.url));
const CROSSWALK_PATH = path.join(here, "..", "..", "data", "zip-area-crosswalk.csv");

/** The crosswalk's `area` column uses `san_antonio`; areaIds use `san-antonio`. */
function normaliseArea(value: string): string {
  return value.trim().replace(/_/g, "-");
}

export function coveredArrZips(): Set<string> {
  const raw = fs.readFileSync(CROSSWALK_PATH, "utf8");
  const lines = raw.trim().split(/\r?\n/);
  const header = lines[0].trim();
  // Fail loudly if the crosswalk's shape changes, rather than silently
  // ingesting the wrong column and writing shards for the wrong ZIPs.
  if (!header.startsWith("zip,area,")) {
    throw new Error(`Unexpected crosswalk header in zip-area-crosswalk.csv: ${header}`);
  }

  const zips = new Set<string>();
  for (const line of lines.slice(1)) {
    const [zip, area] = line.split(",");
    if (zip && area && normaliseArea(area) === MUNICIPAL_AREA) zips.add(zip.trim());
  }
  if (zips.size === 0) {
    throw new Error(`No ${MUNICIPAL_AREA} ZIPs found in zip-area-crosswalk.csv`);
  }
  return zips;
}
