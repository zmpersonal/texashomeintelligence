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
import type { ArrShard } from "./shardFormat";

// The format itself lives in `shardFormat.ts` so the ingest path can share it
// without importing `cloudflare:workers`, which Node cannot resolve.
export { AMBIGUOUS } from "./shardFormat";
export type { ArrShard, ShardValue } from "./shardFormat";

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
