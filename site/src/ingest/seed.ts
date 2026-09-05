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

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

type Generator = (rand: () => number, ingestedAt: string) => Observation<unknown>[];

// --- deep feeds: 12-month sample history ---

const noaaStormEvents: Generator = (rand, ingestedAt) => {
  const types = ["Hail", "Wind", "Hail", "Wind", "Tornado"] as const;
  const out: Observation<unknown>[] = [];
  for (let i = 11; i >= 0; i--) {
    if (rand() < 0.4) continue; // not every month has a reportable event
    const date = monthsAgo(i);
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

const municipalPermits: Generator = (rand, ingestedAt) => {
  const types = ["Mechanical (HVAC)", "Plumbing", "Electrical", "Roofing", "Building"];
  const out: Observation<unknown>[] = [];
  for (let i = 11; i >= 0; i--) {
    const date = monthsAgo(i);
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

const eiaElectricityPrice: Generator = (rand, ingestedAt) => {
  const out: Observation<unknown>[] = [];
  let price = 14.5;
  for (let i = 11; i >= 0; i--) {
    price += (rand() - 0.5) * 0.6;
    const date = monthsAgo(i);
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
  (_rand, ingestedAt) => {
    const date = monthsAgo(1);
    return [{ observedAt: date.toISOString(), ingestedAt, key: monthKey(date), value }];
  };

const GENERATORS: Record<string, Generator> = {
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
  "noaa-climate",
  // Round 22. A seeded hail signature is the worst kind of placeholder this
  // list guards against: it carries a LATITUDE AND LONGITUDE, so it does not
  // merely state something untrue, it points at a place near a real city and
  // says a storm was probably there. There is also no generator for it, and
  // writing one would be writing that fabrication down.
  "swdi-nx3hail",
]);

/** Skips any file that already exists — seeding is a one-time bootstrap,
 * never a way to reset real accumulated history. */
export function seedIfMissing(entry: RegistryEntry): "seeded" | "already-exists" {
  if (existsSync(entry.filePath)) return "already-exists";

  if (NEVER_SEED.has(entry.fetcher.datasetId)) return "already-exists";

  const generator = GENERATORS[entry.fetcher.datasetId];
  if (!generator) {
    throw new Error(`seed.ts: no sample generator registered for datasetId "${entry.fetcher.datasetId}"`);
  }

  const rand = mulberry32(seedFromString(`${entry.fetcher.datasetId}/${entry.fetcher.location}`));
  const ingestedAt = new Date().toISOString();
  // Tag every generated row so it stays identifiable as fabricated once it's
  // on disk — `runIngestion` drops these the moment a real fetch succeeds.
  const observations = generator(rand, ingestedAt).map((o) => ({ ...o, seed: true as const }));

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
