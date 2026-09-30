import type { DatasetFile, Observation } from "../../ingest/types";
import type { DataPageSpec } from "./types";

/**
 * The observations a spec speaks for: measured rows only, narrowed to the
 * spec's own scope, newest first.
 *
 * Round 41a. Six surfaces built this list by hand — the data page, its CSV
 * endpoint, the location hub, the service pages, the homepage and the live
 * conditions panel — each repeating `.filter(not seed).sort(desc)`. That was
 * survivable while a dataset file was exactly one page's worth of data. It
 * stopped being survivable when `usdm-drought/austin.json` grew from one county
 * to three: the page's own copy said Travis County and all six surfaces went on
 * reading every row in the file.
 *
 * One place, so a page, its CSV and every card that quotes it cannot disagree
 * about what is in scope.
 */
export function specObservations<T>(
  spec: DataPageSpec<T>,
  dataset: DatasetFile<T>,
): Observation<T>[] {
  return dataset.observations
    .filter((o) => !o.seed)
    .filter((o) => (spec.scope ? spec.scope(o) : true))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}
