/** Every fetcher's real HTTP call is a stub — this is the one place that
 * throws for all of them, so `runIngestion`'s failure path (preserve
 * prior data, mark stale/leave sample) is exercised identically whether
 * you're looking at a priority feed or a stub-only one. Replace the call
 * site in each fetcher with a real implementation; this helper has
 * nothing to do with the merge/backfill logic around it. */
export function notImplemented(datasetId: string, window: { since: string; until: string }): never {
  throw new Error(
    `TODO(HANDOFF.md Seam 1): fetchRaw() for "${datasetId}" is not implemented yet. ` +
      `Requested window ${window.since} .. ${window.until}.`,
  );
}
