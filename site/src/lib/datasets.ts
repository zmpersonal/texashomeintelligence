/**
 * Build-time access to the generated dataset files.
 *
 * Every page reads its numbers from `src/data/generated/**` at build time —
 * never from a live DB or API on the serving path (COST.md). This module is
 * the single place that glob lives, so the location hub and the dataset pages
 * resolve feeds identically.
 */
import type { DatasetFile, Observation } from "../ingest/types";
import { resolveDisplayStatus, type DisplayStatus } from "./dataFreshness";

export type { DisplayStatus };

const generatedFiles = import.meta.glob<{ default: DatasetFile<unknown> }>(
  "../data/generated/*/*.json",
  { eager: true },
);

/** Resolve one generated feed, or undefined when no file covers that
 * dataset/location pair (e.g. San Antonio has no census-acs file). */
export function findDataset<T = unknown>(
  datasetId: string,
  location: string,
): DatasetFile<T> | undefined {
  const suffix = `/data/generated/${datasetId}/${location}.json`;
  const match = Object.entries(generatedFiles).find(([path]) => path.endsWith(suffix));
  return match?.[1].default as DatasetFile<T> | undefined;
}

/** Same, but throws — for a page whose whole reason to exist is this feed, a
 * missing file is a build error, not something to render around. */
export function requireDataset<T = unknown>(datasetId: string, location: string): DatasetFile<T> {
  const found = findDataset<T>(datasetId, location);
  if (!found) {
    throw new Error(
      `No generated dataset at src/data/generated/${datasetId}/${location}.json — ` +
        `run \`npm run ingest\` or remove the page that requires it.`,
    );
  }
  return found;
}

export interface Freshness {
  /** When we last confirmed the feed (null until a fetch has ever succeeded). */
  asOf?: string;
  /** How far the records themselves run — several sources publish on a lag,
   * so this is routinely months behind `asOf`. */
  dataThrough?: string;
  /**
   * What a badge may claim about this reading — computed, not stored.
   *
   * `DatasetFile.status` is the ingest outcome and cannot answer "is this
   * current?", because a successful fetch of a feed that publishes annually
   * still returns a year-old record. This field is the answer, resolved
   * against the per-source window in `dataFreshness.ts` at the moment of
   * rendering. Pass THIS to `DataStatus`, never `dataset.status`.
   */
  display: DisplayStatus;
}

/**
 * Freshness for a card or page header. A "sample" dataset reports no dates at
 * all: a fabricated placeholder has no honest "updated" or "data through"
 * value, and printing the seed's timestamps would imply it was measured.
 *
 * `now` is injectable so the round's verification can render a dataset at a
 * chosen age without editing committed data.
 */
export function freshnessOf<T>(dataset: DatasetFile<T>, now?: Date): Freshness {
  if (dataset.status === "sample") return { display: "sample" };
  const dataThrough = latestObservedAt(dataset.observations);
  return {
    asOf: dataset.lastSuccessAt ?? undefined,
    dataThrough,
    display: resolveDisplayStatus({
      datasetId: dataset.datasetId,
      feedStatus: dataset.status,
      dataThrough,
      now,
    }),
  };
}

export function latestObservedAt<T>(observations: Observation<T>[]): string | undefined {
  let latest: string | undefined;
  for (const o of observations) {
    if (!latest || o.observedAt > latest) latest = o.observedAt;
  }
  return latest;
}

export function earliestObservedAt<T>(observations: Observation<T>[]): string | undefined {
  let earliest: string | undefined;
  for (const o of observations) {
    if (!earliest || o.observedAt < earliest) earliest = o.observedAt;
  }
  return earliest;
}

/** Observations within the trailing `days` window, newest first. */
export function trailingWindow<T>(
  observations: Observation<T>[],
  days: number,
  now: Date = new Date(),
): Observation<T>[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return observations
    .filter((o) => new Date(o.observedAt).getTime() >= cutoff)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}
