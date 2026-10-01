/**
 * One-time, idempotent seeding of `src/data/generated/**` with SAMPLE
 * data — distinct from `runIngestion`, which only ever *merges in* what a
 * real fetch returns. Without this, every dataset would start life empty
 * (and thus "error") since every `fetchRaw` in this repo is a TODO stub;
 * CLAUDE.md requires sample data to exist and be visibly marked SAMPLE,
 * not for pages to show nothing until Seam 1 is wired up.
 *
 * Deterministic (seeded PRNG, not `Math.random()`) so re-running this
 * against a file that doesn't exist yet always produces the same shape —
 * a real re-seed only ever happens if a generated file is deleted, not on
 * every CI run (see `seedIfMissing`).
 */
import { existsSync } from "node:fs";
import type { DatasetFile, Observation } from "./types";
import { writeDatasetFile, METHODOLOGY_VERSION } from "./runIngestion";
import { REGISTRY, type RegistryEntry } from "./registry";

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

function monthsAgo(n: number, now: Date): Date {
  const d = new Date(now.getTime());
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/**
 * A generator is a PURE function of `(rand, ingestedAt, now)`. Round 43 made
 * `now` explicit rather than reading the wall clock inside `monthsAgo`, so the
 * exact rows a generator wrote on some past date can be regenerated and matched
 * — which is what `seedDetection.ts` does, and the only way to identify a seed
 * row that was written before the `seed: true` stamp existed. Nothing here may
 * read `new Date()`, `Math.random()` or any other ambient state.
 */
type Generator = (rand: () => number, ingestedAt: string, now: Date) => Observation<unknown>[];

// --- deep feeds: 12-month sample history ---

const noaaStormEvents: Generator = (rand, ingestedAt, now) => {
  const types = ["Hail", "Wind", "Hail", "Wind", "Tornado"] as const;
  const out: Observation<unknown>[] = [];
  for (let i = 11; i >= 0; i--) {
    if (rand() < 0.4) continue; // not every month has a reportable event
    const date = monthsAgo(i, now);
    const type = types[Math.floor(rand() * types.length)];
    out.push({
      observedAt: date.toISOString(),
      ingestedAt,
      key: `sample-${monthKey(date)}-${type}`,
      value: {
        eventType: type,
        magnitude:
          type === "Hail"
            ? `${(0.75 + rand() * 1.25).toFixed(2)}"`
            : type === "Wind"
              ? `${Math.round(45 + rand() * 35)} mph gust`
              : "EF0",
        county: "SAMPLE COUNTY",
        narrative: "SAMPLE — illustrative event, not a live NOAA record.",
      },
    });
  }
  return out;
};

const municipalPermits: Generator = (rand, ingestedAt, now) => {
  const types = ["Mechanical (HVAC)", "Plumbing", "Electrical", "Roofing", "Building"];
  const out: Observation<unknown>[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = monthsAgo(i, now);
    const count = 20 + Math.floor(rand() * 40);
    out.push({
      observedAt: date.toISOString(),
      ingestedAt,
      key: `sample-${monthKey(date)}`,
      value: {
        permitType: types[Math.floor(rand() * types.length)],
        workDescription: "SAMPLE — aggregate illustrative monthly permit count.",
        status: `${count} issued (SAMPLE)`,
      },
    });
  }
  return out;
};

const eiaElectricityPrice: Generator = (rand, ingestedAt, now) => {
  const out: Observation<unknown>[] = [];
  let price = 14.5;
  for (let i = 11; i >= 0; i--) {
    price += (rand() - 0.5) * 0.6;
    const date = monthsAgo(i, now);
    out.push({
      observedAt: date.toISOString(),
      ingestedAt,
      key: monthKey(date),
      value: { pricePerKwhCents: Math.round(price * 100) / 100 },
    });
  }
  return out;
};

// --- stub feeds: one illustrative row each ---

const single =
  (value: unknown): Generator =>
  (_rand, ingestedAt, now) => {
    const date = monthsAgo(1, now);
    return [{ observedAt: date.toISOString(), ingestedAt, key: monthKey(date), value }];
  };

export const GENERATORS: Record<string, Generator> = {
  "noaa-storm-events": noaaStormEvents,
  "municipal-permits": municipalPermits,
  "eia-electricity": eiaElectricityPrice,
  "nws-api": single({ forecastHighF: 96, forecastLowF: 74, activeAlert: undefined }),
  "fema-nfhl": single({ floodZone: "X (SAMPLE)", note: "SAMPLE — illustrative, not a real parcel lookup." }),
  "tdi-losses": single({ lossType: "Wind/Hail", claimsPaidUsd: 482_000 }),
  "usdm-drought": single({ droughtIndex: "D1 — Moderate Drought (SAMPLE)", rainfallInches: 1.8 }),
  "usda-soil": single({ soilType: "SAMPLE clay loam", drainageClass: "Moderately well drained", shrinkSwellPotential: "Moderate" }),
  airnow: single({ aqi: 42, category: "Good" }),
  "census-acs": single({ medianHomeAgeYears: 34, ownerOccupiedPct: 58 }),
  bls: single({ trade: "SAMPLE — Plumbers, Pipefitters, and Steamfitters", medianHourlyWageUsd: 28.75 }),
  ercot: single({ conditionLabel: "Normal", demandMw: 61_500 }),
  "tx-forest-service": single({ fireDangerLevel: "Moderate" }),
};

/**
 * Feeds that must NEVER be seeded, and why.
 *
 * A seeded row is a labelled placeholder, which is harmless for a series — a
 * sample AQI reading tells nobody to do anything. These two are different in
 * kind, and a placeholder would be actively wrong rather than merely unhelpful:
 *
 *  - `arr-collection-schedule` is a lookup table keyed by real street
 *    addresses. A fabricated row is a confidently wrong collection day for a
 *    real home, and the reader misses their pickup.
 *  - `austin-water-stage` drives a watering day through the published
 *    stage-to-parity rule. A fabricated drought stage produces a real-looking
 *    watering day off invented drought conditions.
 *
 * Both withhold honestly with no file at all, so absence is the correct
 * bootstrap state rather than a gap to paper over.
 */
// Round 8 adds permit-trade-activity for the same reason: a fabricated permit
// count is an invented fact about a real city, and the honest bootstrap state
// is no file at all until a real fetch succeeds.
//
// Round 19 adds noaa-climate for the same reason again. Until this round it
// was seeded with `{ normalHighF: 95, normalLowF: 73 }`, which is an invented
// climate reading for a real city — and, because it carried neither a
// `sample-` key nor the word SAMPLE in its value, one that predates the
// `seed: true` stamp below and that neither `runIngestion`'s retirement filter
// nor `verify-content`'s `looksSeeded` could recognise. A cooling-degree-day
// count is a number a homeowner would act on; the honest bootstrap state is no
// file at all.
//
// Round 19d: noaa-climate now has a WORKING fetcher returning real data, and it
// STAYS in this set anyway. The two facts are unrelated. This list is not about
// whether a fetch works — `permit-trade-activity` has been a working deep
// fetcher for many rounds and is still here. It is about what the file should
// contain in the window BEFORE the first successful run, and the answer for a
// figure a homeowner would act on is nothing at all. A seeded cooling-degree-day
// row would be an invented climate fact about a real city sitting on disk until
// ingestion happens to run.
const NEVER_SEED = new Set([
  "arr-collection-schedule",
  "austin-water-stage",
  "permit-trade-activity",
  // Round 44. `municipal-permits` belonged here from Round 8 and was missed:
  // the reason given for `permit-trade-activity` — "a fabricated permit count is
  // an invented fact about a real city, and the honest bootstrap state is no
  // file at all until a real fetch succeeds" — is the same reason, about the
  // same permits, from the same cities. Nothing distinguishes the two.
  //
  // Round 43 is why it is no longer merely untidy. Ten fabricated rows survived
  // in production because the retirement filter could not recognise them, and
  // one reached the homepage. Launching a metro by writing a fabricated permit
  // file to disk first is the worst available way to start, even though
  // `publishable()` would refuse it while the status stayed "sample" — that
  // refusal is the second line of defence, not a licence to fabricate behind it.
  //
  // Safe for Austin and San Antonio: `seedIfMissing` skips any file that exists,
  // and both of theirs have been live for many rounds, so nothing is re-seeded
  // and nothing on disk changes.
  "municipal-permits",
  "noaa-climate",
  // Round 22. A seeded hail signature is the worst kind of placeholder this
  // list guards against: it carries a LATITUDE AND LONGITUDE, so it does not
  // merely state something untrue, it points at a place near a real city and
  // says a storm was probably there. There is also no generator for it, and
  // writing one would be writing that fabrication down.
  "swdi-nx3hail",
]);

/**
 * Regenerate exactly what `seed.ts` would write for one dataset at one moment.
 *
 * This is the whole basis of seed detection (`seedDetection.ts`) and it is why
 * `Generator` had to become a pure function of `now`. Given a datasetId, a
 * location and a date, the output is fully determined: `mulberry32` is seeded
 * from `${datasetId}/${location}` and nothing else, and every observed date
 * comes from `monthsAgo(n, now)`. So a row on disk is seed output if and only
 * if some run date reproduces its key AND its value exactly.
 *
 * Returns null for a datasetId with no generator (a NEVER_SEED feed, or one
 * that has never been seeded) — which is not an error, just "nothing to
 * compare against."
 *
 * `ingestedAt` is accepted so `seedIfMissing` can stamp the real time; a
 * detector passes anything, because `ingestedAt` is the one field that is NOT
 * reproducible and is therefore never matched on.
 */
export function seedObservationsFor(
  datasetId: string,
  location: string,
  now: Date,
  ingestedAt = "",
): Observation<unknown>[] | null {
  const generator = GENERATORS[datasetId];
  if (!generator) return null;
  const rand = mulberry32(seedFromString(`${datasetId}/${location}`));
  return generator(rand, ingestedAt, now).map((o) => ({ ...o, seed: true as const }));
}

/** Skips any file that already exists — seeding is a one-time bootstrap,
 * never a way to reset real accumulated history. */
export function seedIfMissing(entry: RegistryEntry): "seeded" | "already-exists" {
  if (existsSync(entry.filePath)) return "already-exists";

  if (NEVER_SEED.has(entry.fetcher.datasetId)) return "already-exists";

  const now = new Date();
  // Tag every generated row so it stays identifiable as fabricated once it's
  // on disk — `runIngestion` drops these the moment a real fetch succeeds.
  //
  // Round 43: this goes through `seedObservationsFor` rather than calling the
  // generator directly, so the rows written here and the rows
  // `seedDetection.ts` regenerates come out of ONE code path. The previous
  // arrangement had the writer call the generator and the guards describe what
  // the generator "always" wrote; the description was wrong for eight of the
  // thirteen generators and nine fabricated rows survived in production for
  // six weeks because of it. A guard that executes the generator cannot drift
  // from it; a guard that describes it can.
  const observations = seedObservationsFor(entry.fetcher.datasetId, entry.fetcher.location, now, now.toISOString());
  if (!observations) {
    throw new Error(`seed.ts: no sample generator registered for datasetId "${entry.fetcher.datasetId}"`);
  }

  const file: DatasetFile<unknown> = {
    datasetId: entry.fetcher.datasetId,
    location: entry.fetcher.location,
    methodologyVersion: METHODOLOGY_VERSION,
    status: "sample",
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    source: entry.fetcher.source,
    observations,
  };
  writeDatasetFile(entry.filePath, file);
  return "seeded";
}

export function seedAll(registry: RegistryEntry[] = REGISTRY): { filePath: string; result: string }[] {
  return registry.map((entry) => ({ filePath: entry.filePath, result: seedIfMissing(entry) }));
}
