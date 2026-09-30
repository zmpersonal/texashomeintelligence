/**
 * Pure helpers over an observation list. No data access, no Vite.
 *
 * Round 41a. These two lived in `datasets.ts`, which opens every generated file
 * with `import.meta.glob`. That glob only exists under Vite, so anything that
 * imported them — including the data-page spec layer, through `dataPages/
 * types.ts` — could not be loaded by a plain Node test runner. The layer that
 * decides which rows a page speaks for was therefore only testable by building
 * the whole site and reading the HTML back.
 *
 * They are six lines each and depend on nothing, so they move here and
 * `datasets.ts` re-exports them. No caller changes.
 */
import type { Observation } from "../ingest/types";

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
