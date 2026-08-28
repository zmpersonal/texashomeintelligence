/**
 * Normalized ingestion schema — one shape for every feed in
 * `src/data/data-sources.yaml`, regardless of what the upstream API looks
 * like. CLAUDE.md: "data modules read normalized objects not raw API
 * shapes" and "store history, never overwrite."
 *
 * `FeedStatus` matches `DataStatus.astro`'s contract exactly on purpose —
 * whatever a dataset file says here is what a data card is able to render
 * without any page-level "is this real?" branching.
 */
export type FeedStatus = "sample" | "live" | "stale" | "error";

/** One recorded fact. `key` must be stable and unique *within one dataset
 * file* — it's how re-ingesting the same event (e.g. a corrected NOAA
 * storm report) updates in place instead of duplicating, while a genuinely
 * new key only ever appends. */
export interface Observation<T> {
  /** When the underlying real-world event/reading/period occurred. ISO 8601. */
  observedAt: string;
  /** When THI recorded this observation (ingestion time, not event time). */
  ingestedAt: string;
  key: string;
  value: T;
  /** True only on rows written by `seed.ts` — illustrative placeholders, never
   * measured facts. Set so a seeded row stays identifiable after it lands on
   * disk: `runIngestion` retires every one of them the first time a real fetch
   * succeeds, so a live dataset can never mix fabricated rows in with measured
   * ones (and a page can never derive a headline number from a seed). */
  seed?: true;
}

export interface DatasetSource {
  name: string;
  url: string;
}

/** The on-disk shape of every file under `src/data/generated/**`. */
export interface DatasetFile<T> {
  /** Matches an id in `src/data/data-sources.yaml`. */
  datasetId: string;
  /** e.g. "austin", "san-antonio", "texas" — whatever geography this one file covers. */
  location: string;
  methodologyVersion: string;
  status: FeedStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  /** Human-readable reason the last attempt didn't produce fresh data. Null when the last attempt succeeded. */
  lastError: string | null;
  source: DatasetSource;
  /** Append-only history, oldest first. Never cleared or overwritten wholesale — see `mergeObservations`. */
  observations: Observation<T>[];
}

export interface FetchContext {
  /** Explicit env passthrough (never read `process.env` directly inside a
   * fetcher) so `requiredEnvVars` is provably what each fetcher actually
   * uses, and so fetchers stay unit-testable without real process env. */
  env: Record<string, string | undefined>;
  /** The window this call should cover — a full backfill window on first
   * run, an incremental window on every run after. See `computeFetchWindow`. */
  window: { since: string; until: string };
}

export interface FetcherModule<T> {
  datasetId: string;
  location: string;
  source: DatasetSource;
  /** Env vars this fetcher needs to do a real fetch. Checked before
   * `fetchRaw` is even called — a missing var fails the same way an
   * unimplemented `fetchRaw` does (preserves prior data, marks stale). */
  requiredEnvVars: string[];
  fetchRaw(ctx: FetchContext): Promise<Observation<T>[]>;
}
