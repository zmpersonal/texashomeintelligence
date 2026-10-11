import type { DatasetFile, Observation } from "./types";
import { revisitDays } from "./fetchWindows";

/**
 * The window each run asks for.
 *
 * ── ROUND 47 CHANGED WHAT "INCREMENTAL" MEANS ─────────────────────────────
 * It used to mean "since the newest record we hold", which is correct for an
 * append-only event log and wrong for every source that REVISES. A revision to
 * anything older than the newest record was never re-requested, so
 * `mergeObservations`' replace-by-key could only ever fire for one row, and a
 * series could never grow backwards — `eia-electricity` was frozen at the
 * twelve months its first backfill happened to return.
 *
 * It now means "since `revisitDays` ago", per dataset, from `fetchWindows.ts`:
 * how far back that source can still change a record we have stored. A feed
 * with nothing to revise asks for two days; one that restates months asks for
 * four hundred.
 *
 * The first run is unchanged: a dataset with no real fetch history still gets
 * the full backfill, because dating a window from seeded sample rows would
 * narrow it (see below).
 */
export function computeFetchWindow<T>(
  existing: DatasetFile<T> | null,
  backfillDays = 365,
  now: Date = new Date(),
): { since: string; until: string } {
  const until = now.toISOString();
  const backfillSince = new Date(now.getTime() - backfillDays * 86_400_000).toISOString();
  // A dataset that has never been "live" or "stale" has no real fetch
  // history yet — only seeded SAMPLE observations, if any. Dating the
  // window from those sample rows' timestamps would produce a narrow
  // window on the very first real attempt (the sample series only spans
  // the last ~12 months up to whenever it was seeded) and could silently
  // filter out real historical events. Only a dataset with genuine prior
  // live/stale evidence gets the incremental (last-observed-forward) window.
  const hasRealHistory = existing?.status === "live" || existing?.status === "stale";
  if (!hasRealHistory) return { since: backfillSince, until };

  // Round 47. The revisit window, not the newest record. It is deliberately
  // NOT `max(revisitSince, newestObserved)`: taking the later of the two is
  // what produced the defect, because the newest record is always later.
  const revisitSince = new Date(now.getTime() - revisitDays(existing!.datasetId) * 86_400_000)
    .toISOString();
  return { since: revisitSince, until };
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
