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
  "noaa-climate": single({ normalHighF: 95, normalLowF: 73 }),
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

/** Skips any file that already exists — seeding is a one-time bootstrap,
 * never a way to reset real accumulated history. */
export function seedIfMissing(entry: RegistryEntry): "seeded" | "already-exists" {
  if (existsSync(entry.filePath)) return "already-exists";

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
