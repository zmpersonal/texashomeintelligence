/**
 * The contract every published data page implements, plus the helpers specs
 * share. One spec per file in this directory; `index.ts` collects them.
 *
 * Two rules every spec must honor:
 *
 *  1. **Only genuinely-live feeds get a page.** `publishable()` refuses to
 *     build a page for a dataset that has never had a successful fetch, so a
 *     page can never present seeded placeholders as measured facts.
 *  2. **Figures are computed from the observations, never typed in.** Every
 *     number in a stat, key finding, or answer is derived at build time from
 *     the dataset file, so prose cannot drift away from the data (the failure
 *     this pattern exists to prevent: a page whose text claimed "no live feed
 *     is connected" while its own badge read LIVE over 75 real rows).
 */
import type { DatasetFile, Observation } from "../../ingest/types";
import { earliestObservedAt, latestObservedAt } from "../datasets";
import { formatMonth } from "../format";

export interface DataPageContext<T> {
  dataset: DatasetFile<T>;
  /** Observations, newest first. Seeded rows are already retired upstream. */
  observations: Observation<T>[];
}

export interface DataPageStat {
  label: string;
  value: string;
}

export interface DataPageColumn<T> {
  header: string;
  cell: (o: Observation<T>) => string;
}

export interface DataPageQuestion {
  /** Phrased the way a homeowner actually asks an answer engine. The answer's
   * first one or two sentences must stand alone as the extractable reply. */
  q: string;
  a: string;
}

export interface DataPageSpec<T> {
  location: string;
  topic: string;
  locationLabel: string;
  datasetId: string;

  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lede: string;

  /** schema.org Dataset metadata. */
  datasetName: string;
  datasetDescription: string;
  spatialCoverage: string;
  keywords: string[];
  /** Basename of the CSV served beside the page, e.g. "hail-events" ->
   * /data/austin/roofing/hail-events.csv. Existing URLs must not break. */
  csvName: string;

  /** One-line "what this measures / where / how often" statement. */
  coverage: (ctx: DataPageContext<T>) => string;
  keyFindings: (ctx: DataPageContext<T>) => string[];
  stats: (ctx: DataPageContext<T>) => DataPageStat[];
  questions: (ctx: DataPageContext<T>) => DataPageQuestion[];
  tableCaption: string;
  columns: DataPageColumn<T>[];
  /** Rows to tabulate. Defaults to every observation; feeds with thousands of
   * records narrow this to a readable slice and say so in the caption, with
   * the complete set still available as CSV. */
  tableRows?: (ctx: DataPageContext<T>) => Observation<T>[];
  /**
   * An optional summary table rendered above the record-level one. For a feed
   * with thousands of rows, the aggregate ("re-roof permits by month") is the
   * genuinely citable artifact, while the individual records matter mainly as
   * the auditable backing — which the CSV already provides in full.
   */
  aggregate?: {
    caption: string;
    headers: string[];
    rows: (ctx: DataPageContext<T>) => string[][];
  };
  interpretation: (ctx: DataPageContext<T>) => {
    data: string;
    interpretation: string;
    meaning: string;
    limitations: string;
  };
  methodology: string;
}

/** A dataset may back a published page only once a real fetch has succeeded.
 * "sample" means every row is fabricated; "error" means nothing was ever
 * fetched. Neither belongs on an indexed page (REVIEW.md). */
export function publishable<T>(dataset: DatasetFile<T> | undefined): boolean {
  if (!dataset) return false;
  if (dataset.status !== "live" && dataset.status !== "stale") return false;
  return dataset.observations.some((o) => !o.seed);
}

// --- helpers shared by specs -------------------------------------------

/** "October 2025 and May 2026", or a single month when the window is one. */
export function coverageRange<T>(observations: Observation<T>[]): string {
  const from = earliestObservedAt(observations);
  const to = latestObservedAt(observations);
  if (!from || !to) return "an unreported period";
  const fromLabel = formatMonth(from);
  const toLabel = formatMonth(to);
  return fromLabel === toLabel ? fromLabel : `${fromLabel} and ${toLabel}`;
}

export function countBy<T>(items: T[], key: (t: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** "a, b and c" */
export function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return n === 1 ? singular : plural;
}

/** Leading number in a free-text measurement ("1.75\"" -> 1.75). 0 when absent. */
export function numberIn(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
