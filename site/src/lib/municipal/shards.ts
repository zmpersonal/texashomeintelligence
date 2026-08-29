/**
 * Reads one ZIP's Austin Resource Recovery shard from the Worker's own static
 * assets — the same ASSETS pattern `account/readIndex.ts` uses for the score,
 * and for the same reason: a local read inside the Worker, no network hop, no
 * database, and above all no call to a city API on the serving path (COST.md).
 *
 * One request touches exactly one ZIP's file. The full schedule is ~185k rows
 * across the metro; nothing ever loads all of it, and none of it is bundled.
 *
 * A missing shard is not an error — it is the answer. ZIPs Austin Resource
 * Recovery does not serve simply have no file, so "not covered" costs nothing
 * to represent and cannot be confused with a fetch failure.
 */
import { env } from "cloudflare:workers";

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

export async function readArrShard(zip: string): Promise<ArrShard | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  const assets = (env as unknown as { ASSETS?: { fetch: (req: Request) => Promise<Response> } }).ASSETS;
  if (!assets) return null;
  const res = await assets.fetch(new Request(`https://assets.local/data/arr-schedule/${zip}.json`));
  if (!res.ok) return null;
  try {
    return (await res.json()) as ArrShard;
  } catch {
    // A corrupt shard withholds, exactly like a missing one.
    return null;
  }
}
