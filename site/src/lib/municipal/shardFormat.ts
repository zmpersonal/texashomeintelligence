/**
 * The Austin Resource Recovery shard format — the contract shared by the code
 * that writes shards (Node, during ingest) and the code that reads them (the
 * Worker, at request time).
 *
 * This module exists to stay import-clean for both runtimes. `shards.ts` reads
 * through the ASSETS binding and therefore imports `cloudflare:workers`, which
 * Node cannot resolve — so the ingest path must never reach it. Keeping the
 * format here means the emitter and the fetcher can share the shape and the
 * ambiguity marker without dragging a Workers-only import into `npm run ingest`.
 */

/** `"TUE|A"` — collection day, then the A/B recycling week. `"*"` marks a key
 * whose rows disagreed at ingest time; see `AMBIGUOUS`. */
export type ShardValue = string;

/** Written by the emitter when two or more source rows share a normalised key
 * but carry different day/week values. Resolving ambiguity once, at ingest,
 * means the serving path can never be tempted to pick a side. */
export const AMBIGUOUS = "*";

export interface ArrShard {
  zip: string;
  methodologyVersion: string;
  source: { name: string; url: string };
  /** When the city last published the underlying dataset. */
  sourceUpdatedAt: string | null;
  /** When our ingestion wrote this shard. */
  ingestedAt: string;
  rowCount: number;
  /** normalised address key → "DAY|WEEK", or `AMBIGUOUS`. */
  rows: Record<string, ShardValue>;
}
