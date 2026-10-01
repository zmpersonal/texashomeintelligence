/**
 * Round 47 · Has anything we publish already drifted from its source?
 *
 * ── THE QUESTION ──────────────────────────────────────────────────────────
 * Round 46 F2: `computeFetchWindow` sets the incremental `since` to the newest
 * observation's `observedAt`, so a revision to any older record is never
 * re-requested. `mergeObservations` replaces by key, and `types.ts` names "a
 * corrected NOAA storm report" as its worked example — the correction mechanism
 * is fully built on the writing side and can only ever fire for one record.
 *
 * `/data/texas/electricity-prices/` tells readers, in rendered copy: "The EIA
 * revises recent months as utilities report, so the newest one or two figures
 * can move." Only the newest can. Whether any have ALREADY moved is the thing
 * that decides this round's priority, and it cannot be answered from a Claude
 * Code session — no external host is reachable from one. So this runs in
 * Actions.
 *
 * ── THE METHOD, AND WHY IT IS THIS ONE ────────────────────────────────────
 * It calls each fetcher's OWN `fetchRaw` with a widened window. It does not
 * re-implement a single request, predicate or parse.
 *
 * That is Round 44's lesson paid for twice. Pass 1 of that round's probe used
 * `Permit_Type = 'Residential Building'` where the feed says 'Residential
 * Building Permit', and thirteen silent zeros read as "no activity". Pass 2
 * posted a bbox query to NCEI and got HTTP 400, because that is not the
 * mechanism `noaaClimate.ts` uses. A probe that reimplements the request is
 * measuring its own reimplementation.
 *
 * THE WINDOW IS DERIVED FROM DISK, not a flat number of days. `since` is the
 * EARLIEST `observedAt` we already hold, minus a day; `until` is now. A flat
 * 365-day window would not reach `census-acs` (dated 2024-01-01) or
 * `noaa-climate`'s normals (dated 2020), so it would report "the source no
 * longer offers this" for records the request never asked about. Asking for
 * everything we hold is the only window under which a missing record means
 * something.
 *
 * ── WHAT IT WRITES, AND WHAT IT MUST NOT ──────────────────────────────────
 * READ-ONLY with respect to `src/data/generated/**`. It writes one report to
 * the path given by `--out`. Nothing merges, nothing commits. A probe that can
 * write the data it is auditing is not a probe.
 *
 * ── THE FOUR OUTCOMES, AND WHICH ONE IS THE FINDING ───────────────────────
 *   changed  — the source offers a DIFFERENT value under a key we publish.
 *              **This is the finding.** It means a published figure is stale
 *              against its own source and the window is why.
 *   absent   — we publish a key the source no longer offers inside a window
 *              that covers it. Withdrawn upstream, or re-keyed.
 *   new      — the source offers a key we never ingested, inside a window we
 *              claim to cover. The window defect's other face; Round 45 already
 *              proved it for permits (hvac 2025-09: 812 -> 926).
 *   same     — identical. The expected result almost everywhere.
 *
 * ── ONE FETCHER CANNOT BE ASKED ABOUT ITS OWN HISTORY ─────────────────────
 * `swdiHail` clamps every request to 31 days, because SWDI said so in an error
 * message that the fetcher's comment quotes: "maximum date range currently
 * allowed is 744 hours". Widening the window does not widen what it asks for.
 * So for that dataset every held row older than 31 days would come back
 * "absent" having never been requested — which is precisely the expected-noise
 * read as signal that these tags exist to prevent, and a tag alone would not
 * stop it being counted.
 *
 * `WINDOW_CAPPED_DAYS` records the cap, and a key older than the cap is
 * reported as `unassessable` rather than `absent`. The probe says what it could
 * not look at instead of mislabelling it.
 *
 * ── EXPECTATION TAGS, so expected noise is not read as signal ─────────────
 * Not every feed CAN drift, and a probe that reports a forecast feed's
 * yesterday-row as "absent" is generating noise it will then have to explain.
 * Each dataset carries a tag and a reason. The tags do not suppress anything —
 * every dataset is probed and every outcome is reported — they only say, in
 * advance and in writing, which outcomes were expected where. A finding under a
 * `revisable` tag is a finding; the same outcome under `current-conditions` is
 * the feed working as designed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { REGISTRY } from "../../src/ingest/registry";
import type { Observation } from "../../src/ingest/types";

/** Why a dataset's outcomes mean what they mean. Stated before the run. */
type Expectation = "revisable" | "current-conditions" | "digest-keyed" | "reference" | "stub";

const EXPECTATION: Record<string, { tag: Expectation; why: string }> = {
  "eia-electricity": { tag: "revisable", why: "monthly series; the page itself says the EIA revises recent months" },
  "noaa-storm-events": { tag: "revisable", why: "NCEI revises storm reports; types.ts uses this as its worked example" },
  "noaa-climate": { tag: "revisable", why: "GSOM monthly actuals are revised; the 1991-2020 normals are not" },
  "municipal-permits": { tag: "revisable", why: "city tables are restated; Round 45 measured late arrivals" },
  "permit-trade-activity": { tag: "revisable", why: "aggregated from the same city tables; Round 45's window fix was for exactly this" },
  "census-acs": { tag: "revisable", why: "ACS vintages are re-released; Round 42 pinned the vintage deliberately" },
  bls: { tag: "revisable", why: "OEWS is an annual release and can be restated" },
  "swdi-nx3hail": { tag: "revisable", why: "radar signatures are expected final, but that is an assumption this probe can test" },
  "usdm-drought": { tag: "revisable", why: "weekly maps are rarely revised, and 'rarely' is not 'never'" },
  "nws-api": { tag: "current-conditions", why: "a forecast for today; yesterday's row is not something the source still offers" },
  airnow: { tag: "current-conditions", why: "an hourly current-conditions endpoint; same" },
  "austin-water-stage": { tag: "current-conditions", why: "a scrape of the stage as it is now" },
  "arr-collection-schedule": { tag: "digest-keyed", why: "one row per run keyed by a digest of the whole table; a change makes a NEW key, it does not revise an old one" },
  "usda-soil": { tag: "reference", why: "SSURGO under a point; observedAt is our query date, not an event date" },
  "fema-nfhl": { tag: "stub", why: "sample feed, fetchRaw not implemented" },
  "tdi-losses": { tag: "stub", why: "sample feed, fetchRaw not implemented" },
  ercot: { tag: "stub", why: "sample feed, fetchRaw not implemented" },
  "tx-forest-service": { tag: "stub", why: "sample feed, fetchRaw not implemented" },
};

/** Fetchers that cannot be asked for more than N days however wide the window.
 * The value is the fetcher's own constant, not a guess. */
const WINDOW_CAPPED_DAYS: Record<string, { days: number; why: string }> = {
  "swdi-nx3hail": { days: 31, why: "swdiHail MAX_WINDOW_DAYS — SWDI's documented 744-hour ceiling" },
};

const DAY_MS = 86_400_000;

interface Diff {
  key: string;
  outcome: "changed" | "absent" | "new" | "unassessable";
  onDisk?: unknown;
  fromSource?: unknown;
}

interface DatasetReport {
  datasetId: string;
  location: string;
  expectation: Expectation;
  why: string;
  feedStatus: string;
  rowsOnDisk: number;
  window: { since: string; until: string } | null;
  rowsFromSource: number | null;
  same: number;
  /** Days this fetcher can actually be asked about, where it caps itself. */
  cappedToDays?: number;
  diffs: Diff[];
  skipped?: string;
  error?: string;
}

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

async function probeOne(entry: typeof REGISTRY[number]): Promise<DatasetReport> {
  const { fetcher, filePath } = entry;
  const exp = EXPECTATION[fetcher.datasetId] ?? { tag: "revisable" as Expectation, why: "no expectation recorded — treat any outcome as a finding" };
  const base: DatasetReport = {
    datasetId: fetcher.datasetId,
    location: fetcher.location,
    expectation: exp.tag,
    why: exp.why,
    feedStatus: "unknown",
    rowsOnDisk: 0,
    window: null,
    rowsFromSource: null,
    same: 0,
    diffs: [],
  };

  if (!existsSync(filePath)) return { ...base, skipped: "no committed file" };
  const file = JSON.parse(readFileSync(filePath, "utf8")) as {
    status: string;
    observations: Observation<unknown>[];
  };
  base.feedStatus = file.status;
  base.rowsOnDisk = file.observations.length;

  // A sample file has nothing measured to drift from. Recorded, not silent.
  if (file.status === "sample") return { ...base, skipped: `feedStatus=sample (${exp.tag})` };
  if (file.observations.length === 0) return { ...base, skipped: "no observations on disk" };

  // Ask for everything we hold. See the header: a window narrower than the data
  // makes "absent" meaningless.
  const earliest = file.observations.reduce((m, o) => (o.observedAt < m ? o.observedAt : m), file.observations[0].observedAt);
  const since = new Date(new Date(earliest).getTime() - DAY_MS).toISOString();
  const until = new Date().toISOString();
  base.window = { since, until };

  let fresh: Observation<unknown>[];
  try {
    fresh = await fetcher.fetchRaw({ env: process.env, window: { since, until } });
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
  base.rowsFromSource = fresh.length;

  // A fetch that returns nothing is not evidence of anything. `runIngestion`
  // treats zero rows as a failed attempt rather than an empty truth, and so
  // does this: reporting every held key as "absent" because one request came
  // back empty would be the Round 44 silent-zeros mistake again.
  if (fresh.length === 0) return { ...base, skipped: "source returned zero rows — not evidence of drift" };

  const diskByKey = new Map(file.observations.map((o) => [o.key, o] as const));
  const freshByKey = new Map(fresh.map((o) => [o.key, o] as const));

  const cap = WINDOW_CAPPED_DAYS[fetcher.datasetId];
  const assessableFrom = cap ? new Date(Date.now() - cap.days * DAY_MS).toISOString() : undefined;
  if (cap) base.cappedToDays = cap.days;

  for (const [key, disk] of diskByKey) {
    const f = freshByKey.get(key);
    if (!f) {
      // Never requested, so its absence says nothing. See the header.
      const outcome = assessableFrom && disk.observedAt < assessableFrom ? "unassessable" : "absent";
      base.diffs.push({ key, outcome, onDisk: disk.value });
      continue;
    }
    // Only `value` is compared. `ingestedAt` moves every run by construction,
    // and `observedAt` is derived from the same source fields as the value for
    // every fetcher that dates a real event.
    if (stable(f.value) !== stable(disk.value)) {
      base.diffs.push({ key, outcome: "changed", onDisk: disk.value, fromSource: f.value });
    } else {
      base.same += 1;
    }
  }
  for (const [key, f] of freshByKey) {
    if (!diskByKey.has(key)) base.diffs.push({ key, outcome: "new", fromSource: f.value });
  }
  return base;
}

async function main(): Promise<void> {
  const outArg = process.argv.indexOf("--out");
  const out = outArg > -1 ? process.argv[outArg + 1] : "tmp/r47/revision-drift.json";

  const reports: DatasetReport[] = [];
  for (const entry of REGISTRY) {
    const r = await probeOne(entry);
    reports.push(r);
    const changed = r.diffs.filter((d) => d.outcome === "changed").length;
    const absent = r.diffs.filter((d) => d.outcome === "absent").length;
    const added = r.diffs.filter((d) => d.outcome === "new").length;
    const unassessable = r.diffs.filter((d) => d.outcome === "unassessable").length;
    const tail = r.skipped
      ? `skipped: ${r.skipped}`
      : r.error
        ? `ERROR: ${r.error.slice(0, 160)}`
        : `${r.same} same · ${changed} CHANGED · ${absent} absent · ${added} new` +
          (unassessable ? ` · ${unassessable} unassessable (capped to ${r.cappedToDays}d)` : "");
    console.log(`${r.datasetId}/${r.location}  [${r.expectation}]  ${r.rowsOnDisk} on disk → ${tail}`);
  }

  const changedTotal = reports.reduce((n, r) => n + r.diffs.filter((d) => d.outcome === "changed").length, 0);
  const revisableChanged = reports
    .filter((r) => r.expectation === "revisable")
    .reduce((n, r) => n + r.diffs.filter((d) => d.outcome === "changed").length, 0);

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ probedAt: new Date().toISOString(), reports }, null, 2));

  console.log(`\nwrote ${out}`);
  console.log(`DRIFT_PROBE_STATUS=ok changed=${changedTotal} changed_on_revisable=${revisableChanged}`);
  // Deliberately exits 0 whatever it finds. This is a measurement, not a gate:
  // a non-zero exit would make a drift look like a broken probe in the Actions
  // UI, and the number that matters is in the line above and in the report.
}

main().catch((e) => {
  console.log(`DRIFT_PROBE_STATUS=error ${e instanceof Error ? e.message : String(e)}`);
  process.exit(2);
});
