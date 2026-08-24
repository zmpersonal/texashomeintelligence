/**
 * Downloads the current official U.S. Drought Monitor map of Texas and
 * self-hosts it at site/public/images/drought/current_tx.png, so the
 * homepage hero no longer hotlinks droughtmonitor.unl.edu directly.
 *
 * Source path is datestamped to the map's release Thursday:
 *   https://droughtmonitor.unl.edu/data/png/{YYYYMMDD}/{YYYYMMDD}_TX_trd.png
 * We compute the most recent Thursday and step back a week at a time on
 * a 404 (publication lag, or a week NDMC skipped) up to a bounded number
 * of attempts — never an unbounded loop.
 *
 * Non-fatal by design (CLAUDE.md: "never crash the build, never show
 * sample-as-fact" — the closest equivalent here is "never break the
 * cron over a stale weekly image"): on total failure this script logs a
 * warning and exits 0, leaving whatever local image already exists (or
 * none, on a first-ever run) rather than failing the whole ingestion job.
 *
 * Run via `npm run fetch-drought-map` (wired into the ingestion cron,
 * see .github/workflows/data-ingestion.yml).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(here, "..", "public", "images", "drought", "current_tx.png");
const MAX_ATTEMPTS = 8; // ~8 weeks back — comfortably covers any plausible publication lag

function mostRecentThursday(from: Date): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const daysSinceThursday = (d.getUTCDay() + 7 - 4) % 7; // Thursday = 4
  d.setUTCDate(d.getUTCDate() - daysSinceThursday);
  return d;
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function main() {
  let candidate = mostRecentThursday(new Date());

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const stamp = yyyymmdd(candidate);
    const url = `https://droughtmonitor.unl.edu/data/png/${stamp}/${stamp}_TX_trd.png`;
    console.log(`[fetch-drought-map] attempt ${attempt + 1}/${MAX_ATTEMPTS}: ${url}`);

    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      console.warn(`[fetch-drought-map] network error for ${url}: ${err instanceof Error ? err.message : err}`);
      candidate.setUTCDate(candidate.getUTCDate() - 7);
      continue;
    }

    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      writeFileSync(OUTPUT_PATH, bytes);
      console.log(`[fetch-drought-map] saved ${bytes.length} byte(s) from ${stamp} to ${OUTPUT_PATH}`);
      return;
    }

    console.log(`[fetch-drought-map] HTTP ${res.status} for ${stamp}, stepping back 7 days`);
    candidate.setUTCDate(candidate.getUTCDate() - 7);
  }

  console.warn(
    `[fetch-drought-map] no map found in the last ${MAX_ATTEMPTS} week(s) — leaving the existing local image (if any) in place.`,
  );
}

main().catch((err) => {
  // Non-fatal: log and exit 0 rather than fail the whole ingestion job
  // over a weekly decorative image.
  console.error("[fetch-drought-map] unexpected error:", err);
});
