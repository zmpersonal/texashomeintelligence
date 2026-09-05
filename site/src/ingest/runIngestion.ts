import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { DatasetFile, FetcherModule } from "./types";
import { computeFetchWindow, mergeObservations } from "./merge";

export const METHODOLOGY_VERSION = "v1";

export function readDatasetFile<T>(filePath: string): DatasetFile<T> | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as DatasetFile<T>;
}

export function writeDatasetFile<T>(filePath: string, data: DatasetFile<T>): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** A dataset file that doesn't exist yet and has no seed — never fabricate
 * a value, so this starts life with an empty history and an honest
 * "error" status rather than a fake sample number. In practice every
 * fetcher registered in `registry.ts` gets seeded first (see `seed.ts`),
 * so this path is a safety net, not the normal one. */
function emptyDatasetFile<T>(fetcher: FetcherModule<T>): DatasetFile<T> {
  return {
    datasetId: fetcher.datasetId,
    location: fetcher.location,
    methodologyVersion: METHODOLOGY_VERSION,
    status: "error",
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    source: fetcher.source,
    observations: [],
  };
}

export interface IngestionResult {
  datasetId: string;
  location: string;
  outcome: "live" | "stale" | "sample-unchanged" | "error";
  observationCount: number;
  message: string;
}

/**
 * Runs one fetcher against one dataset file. Real logic, not a stub:
 * computes the backfill/incremental window, calls the (possibly stubbed)
 * fetcher, and merges the result — or, on any failure, preserves whatever
 * is already on disk and moves its status according to what it *was*:
 *
 *  - was "live"            -> "stale"   (a real feed that just broke; keep the last-good data)
 *  - was "stale"            -> "stale"   (still broken; data already frozen at last-good)
 *  - was "sample" (or new)   -> unchanged (illustrative data was never "live" to begin with —
 *                                          an unimplemented/failing fetch doesn't demote it to
 *                                          an error state; there's nothing wrong with showing a
 *                                          clearly-labeled placeholder)
 */
export async function runIngestion<T>(
  fetcher: FetcherModule<T>,
  filePath: string,
): Promise<IngestionResult> {
  const existing = readDatasetFile<T>(filePath) ?? emptyDatasetFile<T>(fetcher);
  const now = new Date().toISOString();
  const window = computeFetchWindow(existing);

  const missingEnv = fetcher.requiredEnvVars.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    return failAttempt(fetcher, filePath, existing, now, `Missing required env var(s): ${missingEnv.join(", ")}`);
  }

  try {
    const fresh = await fetcher.fetchRaw({ env: process.env, window });
    const wasEverLive = existing.status === "live" || existing.status === "stale";

    // A fetch that threw nothing but came back with zero raw records is
    // only real evidence of a working live feed if this dataset has *some*
    // prior live evidence. Otherwise every observation on file is still
    // seeded sample data, and flipping status to "live" here would present
    // sample rows as if a real fetch had produced them — never do that.
    if (fresh.length === 0 && !wasEverLive) {
      return failAttempt(
        fetcher,
        filePath,
        existing,
        now,
        "fetchRaw returned 0 raw records with no prior live/stale evidence for this dataset — leaving status unchanged rather than reporting sample data as live.",
      );
    }

    // Retire seeded placeholders now that a real fetch has succeeded. This is
    // the one case where dropping rows is correct rather than a violation of
    // "store history, never overwrite": seeds are fabricated illustrations,
    // not observed history, so carrying them alongside measured rows would
    // publish invented facts under a LIVE badge. Merging still preserves every
    // genuine observation unconditionally.
    const retained = existing.observations.filter((o) => !o.seed);
    const retiredCount = existing.observations.length - retained.length;
    const observations = mergeObservations(retained, fresh);
    const updated: DatasetFile<T> = {
      ...existing,
      // Round 19: take `source` from the fetcher, not from whatever the file
      // was first written with. Spreading `existing` alone froze a dataset's
      // citation at its bootstrap value, so re-pointing a fetcher at a new
      // upstream left the file — and every page that cites it — naming the old
      // one indefinitely. `noaa-storm-events` is live today under a
      // `ncdc.noaa.gov/stormevents/` citation while the fetcher reads
      // `ncei.noaa.gov/pub/data/swdi/...`; this line is what closes that on the
      // next successful run.
      source: fetcher.source,
      status: "live",
      lastAttemptAt: now,
      lastSuccessAt: now,
      lastError: null,
      observations,
    };
    writeDatasetFile(filePath, updated);
    return {
      datasetId: fetcher.datasetId,
      location: fetcher.location,
      outcome: "live",
      observationCount: observations.length,
      message:
        `Fetched ${fresh.length} raw record(s), ${observations.length} total after merge.` +
        (retiredCount > 0 ? ` Retired ${retiredCount} seeded sample row(s).` : ""),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return failAttempt(fetcher, filePath, existing, now, reason);
  }
}

function failAttempt<T>(
  fetcher: FetcherModule<T>,
  filePath: string,
  existing: DatasetFile<T>,
  now: string,
  reason: string,
): IngestionResult {
  const wasLive = existing.status === "live" || existing.status === "stale";
  const updated: DatasetFile<T> = {
    ...existing,
    // Round 19e. Round 19 fixed this on the SUCCESS path only, and the first
    // live noaa-climate run showed the gap: both generated files came back
    // citing sources their fetcher had long since stopped reading —
    // `austin.json` naming Global Summary of the Month and `san-antonio.json`
    // naming the normals CSV path, neither matching the fetcher at the time.
    // A file that has never succeeded still carries a citation, and a stale one
    // is a wrong citation.
    source: fetcher.source,
    status: wasLive ? "stale" : existing.status,
    lastAttemptAt: now,
    lastError: reason,
  };
  writeDatasetFile(filePath, updated);
  return {
    datasetId: fetcher.datasetId,
    location: fetcher.location,
    outcome: wasLive ? "stale" : existing.observations.length > 0 ? "sample-unchanged" : "error",
    observationCount: existing.observations.length,
    message: reason,
  };
}
