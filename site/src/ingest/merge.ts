import type { DatasetFile, Observation } from "./types";

/**
 * Real backfill logic: a dataset with no observations yet (first run, or a
 * fresh seed with nothing live) needs a wide historical window so the
 * first successful fetch isn't just "today." Everything after that is
 * incremental — since whichever is later of the last observation we have
 * or the last successful fetch, so a fetch that adds no new events still
 * moves the window forward next time instead of re-requesting the same
 * backfill range forever.
 */
export function computeFetchWindow<T>(
  existing: DatasetFile<T> | null,
  backfillDays = 365,
  now: Date = new Date(),
): { since: string; until: string } {
  const until = now.toISOString();
  const lastObservedAt = existing?.observations.at(-1)?.observedAt;
  const since = lastObservedAt ?? existing?.lastSuccessAt ?? new Date(now.getTime() - backfillDays * 86_400_000).toISOString();
  return { since, until };
}

/**
 * Append-only merge: every existing observation survives unconditionally.
 * A fresh observation with a key we've already seen *replaces* that one
 * entry in place (a real correction to the same event/period, not a
 * duplicate) — a fresh observation with a new key is a genuine append.
 * Never truncates, never drops history to make room for new rows.
 */
export function mergeObservations<T>(
  existing: Observation<T>[],
  fresh: Observation<T>[],
): Observation<T>[] {
  const byKey = new Map(existing.map((o) => [o.key, o] as const));
  for (const obs of fresh) byKey.set(obs.key, obs);
  return Array.from(byKey.values()).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}
