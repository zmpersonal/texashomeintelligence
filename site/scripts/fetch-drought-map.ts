/**
 * Downloads the current official U.S. Drought Monitor map of Texas and
 * self-hosts it at site/public/images/drought/current_tx.png, so the
 * homepage hero no longer hotlinks droughtmonitor.unl.edu directly.
 *
 * TEMP DIAGNOSTIC (2026-08-24): the originally-assumed datestamped path
 * (.../data/png/{YYYYMMDD}/{YYYYMMDD}_TX_trd.png, most recent Thursday)
 * came back a real HTTP 404 on all 8 weekly attempts on a live Actions
 * run — not a guess that just needs more retries, the pattern itself is
 * wrong. Rather than guess a 9th time, this now probes a small matrix of
 * plausible filename/date variants AND the bare directory listing (in
 * case autoindex is enabled, which would show the real filenames
 * directly) and logs every attempt's status, so the next real run's
 * log tells us the actual pattern instead of us guessing again. Once
 * that's confirmed, collapse this back down to the one real URL and
 * remove this comment + the probing loop below — same pattern as
 * noaaStormEvents.ts's per-stage diagnostic logging.
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

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

async function probe(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url);
    console.log(`[drought-map-diag] HTTP ${res.status} ${res.headers.get("content-type") ?? ""} — ${url}`);
    return res;
  } catch (err) {
    console.log(`[drought-map-diag] network error for ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function trySave(res: Response, label: string): Promise<boolean> {
  if (!res.ok) return false;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // A 200 that's actually an HTML error/redirect page isn't a real image —
  // only trust it if it looks like a PNG (magic bytes) or the server said so.
  const looksLikePng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
  const contentType = res.headers.get("content-type") ?? "";
  if (!looksLikePng && !contentType.includes("image")) {
    console.log(`[drought-map-diag] ${label}: HTTP 200 but doesn't look like a real image (content-type=${contentType}), skipping`);
    return false;
  }
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, bytes);
  console.log(`[drought-map-diag] MATCH (${label}): saved ${bytes.length} byte(s) to ${OUTPUT_PATH}`);
  return true;
}

async function main() {
  const thursday = mostRecentThursday(new Date());
  const tuesday = addDays(thursday, -2); // USDM's data cutoff, in case files are dated to that instead
  const dates = [thursday, addDays(thursday, -7), tuesday, addDays(tuesday, -7)];

  // Directory listing probes first — if autoindex is enabled this tells
  // us the real filenames directly, no guessing needed.
  for (const d of dates) {
    const stamp = yyyymmdd(d);
    const res = await probe(`https://droughtmonitor.unl.edu/data/png/${stamp}/`);
    if (res?.ok) {
      const text = await res.text();
      const hrefs = [...text.matchAll(/href="([^"]+\.(?:png|jpg))"/gi)].map((m) => m[1]);
      if (hrefs.length > 0) {
        console.log(`[drought-map-diag] directory listing for ${stamp} contains: ${hrefs.join(", ")}`);
      } else {
        console.log(`[drought-map-diag] directory listing for ${stamp} returned 200 but no image hrefs found (first 300 chars): ${text.slice(0, 300)}`);
      }
    }
  }

  // Filename candidate matrix against each candidate date.
  const suffixes = ["_TX_trd.png", "_tx_trd.png", "_TX.png", "_tx.png", "_Texas_trd.png", ".png"];
  for (const d of dates) {
    const stamp = yyyymmdd(d);
    for (const suffix of suffixes) {
      const url = `https://droughtmonitor.unl.edu/data/png/${stamp}/${stamp}${suffix}`;
      const res = await probe(url);
      if (res && (await trySave(res, `${stamp}${suffix}`))) return;
    }
    // Nested-by-year variant.
    const nestedUrl = `https://droughtmonitor.unl.edu/data/png/${d.getUTCFullYear()}/${stamp}/${stamp}_TX_trd.png`;
    const nestedRes = await probe(nestedUrl);
    if (nestedRes && (await trySave(nestedRes, `nested ${stamp}`))) return;
  }

  // Original "current" alias, in case it does exist under a different name.
  for (const url of [
    "https://droughtmonitor.unl.edu/data/png/current/current_tx.png",
    "https://droughtmonitor.unl.edu/data/png/current/current_TX.png",
  ]) {
    const res = await probe(url);
    if (res && (await trySave(res, url))) return;
  }

  console.warn(
    "[drought-map-diag] no match found across all probed patterns — leaving the existing local image (if any) in place. Read the [drought-map-diag] lines above to find the real pattern.",
  );
}

main().catch((err) => {
  // Non-fatal: log and exit 0 rather than fail the whole ingestion job
  // over a weekly decorative image.
  console.error("[fetch-drought-map] unexpected error:", err);
});
