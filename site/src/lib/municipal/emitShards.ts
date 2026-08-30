/**
 * Writes the per-ZIP Austin Resource Recovery shards.
 *
 * Node-only: this runs inside `npm run ingest`, never in the Worker. It lives
 * under `src/lib/municipal/` beside the code that reads the shards so the
 * written shape and the read shape stay in one place.
 *
 * Output goes to `public/data/arr-schedule/<zip>.json`. `public/` is copied
 * verbatim into the build with no module-graph involvement at all — which is
 * the point. Routing these through an Astro endpoint or an `import.meta.glob`
 * would put millions of address rows into the build's module graph, the same
 * class of mistake that took the Worker bundle from 0.79 MB to 2.78 MB in
 * Round 4. As plain public files they are only ever read one at a time, at
 * request time, through the ASSETS binding.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARR_SOURCE, MUNICIPAL_METHODOLOGY_VERSION } from "./config";
import { AMBIGUOUS } from "./shardFormat";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SHARD_DIR = path.join(here, "..", "..", "..", "public", "data", "arr-schedule");

export interface EmitContext {
  ingestedAt: string;
  fingerprint: (input: string) => string;
}

export interface EmitSummary {
  rowCount: number;
  zipCount: number;
  ambiguousCount: number;
  unusableCount: number;
  fingerprint: string;
}

export function emitArrShards(
  byZip: Map<string, Map<string, string>>,
  ctx: EmitContext,
): EmitSummary {
  fs.mkdirSync(SHARD_DIR, { recursive: true });

  // Stale shards from a previous run must go: a ZIP the city stopped serving
  // has to stop answering, not keep serving last month's day forever.
  for (const file of fs.readdirSync(SHARD_DIR)) {
    if (file.endsWith(".json") && !byZip.has(file.replace(/\.json$/, ""))) {
      fs.unlinkSync(path.join(SHARD_DIR, file));
    }
  }

  let rowCount = 0;
  let ambiguousCount = 0;
  const digestParts: string[] = [];

  for (const [zip, table] of [...byZip.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Sorted so an unchanged republish produces a byte-identical file — no git
    // churn, and the fingerprint means what it says.
    const rows: Record<string, string> = {};
    for (const key of [...table.keys()].sort()) {
      const value = table.get(key)!;
      rows[key] = value;
      if (value === AMBIGUOUS) ambiguousCount++;
      digestParts.push(`${zip} ${key} ${value}`);
    }
    rowCount += Object.keys(rows).length;

    const shard = {
      zip,
      methodologyVersion: MUNICIPAL_METHODOLOGY_VERSION,
      source: ARR_SOURCE,
      sourceUpdatedAt: null as string | null,
      ingestedAt: ctx.ingestedAt,
      rowCount: Object.keys(rows).length,
      rows,
    };
    fs.writeFileSync(path.join(SHARD_DIR, `${zip}.json`), JSON.stringify(shard));
  }

  return {
    rowCount,
    zipCount: byZip.size,
    ambiguousCount,
    unusableCount: 0,
    fingerprint: ctx.fingerprint(digestParts.join("\n")),
  };
}
