/**
 * Is this committed observation a fabricated row that `seed.ts` wrote?
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A FINGERPRINT TEST
 *
 * Until Round 43 three separate guards answered that question the same way:
 * `seed === true`, OR a `sample-` key prefix, OR the literal string `SAMPLE`
 * inside the value. `purge-seed-observations.mjs` called those "the two
 * fingerprints `seed.ts` has ALWAYS written."
 *
 * That was false, and provably so. The `sample-` prefix comes from exactly two
 * of the thirteen generators (`noaaStormEvents`, `municipalPermits`);
 * `eiaElectricityPrice` and the `single()` helper behind all ten stub feeds
 * write a bare `monthKey` like `"2026-07"`. And only three of those ten embed
 * the word SAMPLE in their value. **Eight of the thirteen generators carry
 * neither fingerprint**, so eight were invisible to all three guards.
 *
 * Nine such rows survived in production from 2026-08-23 to Round 43. One of
 * them — a fabricated 13.88¢/kWh — was the newest row in a `live` dataset, so
 * it was published on the homepage under a LIVE badge, on a data page, in a
 * downloadable CSV, and as the entire basis of an indexed analysis article.
 *
 * ── THE METHOD: REPRODUCTION, NOT RECOGNITION
 *
 * The prefix/marker test tried to RECOGNISE seed output by describing it. This
 * module REPRODUCES it instead. `seedObservationsFor()` is a pure function of
 * `(datasetId, location, now)`: `mulberry32` is seeded from
 * `${datasetId}/${location}` and nothing else, and every observed date comes
 * from `monthsAgo(n, now)`. So the exact rows seeding wrote on any given date
 * can be regenerated and compared.
 *
 * A row is seed output **iff some candidate run date reproduces its key AND
 * its value exactly.** That cannot be wrong in the way a description can: it
 * executes the generator rather than asserting what the generator does. If a
 * fourteenth generator is added tomorrow with a key format nobody anticipated,
 * this still catches it, because it never had an opinion about key formats.
 *
 * ── WHY THE DATE HAS TO BE SEARCHED
 *
 * The VALUES a generator emits do not depend on the date; the KEYS do. Matching
 * on value alone would risk deleting a real observation that happened to equal
 * a PRNG output. Matching on (key, value) together pins each value to its
 * position in the series, so a false positive would need a real feed to land on
 * one of a handful of specific PRNG floats *at the exact month that value
 * occupies*. Searching run dates month by month over `CANDIDATE_MONTHS` costs
 * nothing (thirteen generators × ≤12 rows × a few dozen months) and makes the
 * test exact rather than probabilistic.
 *
 * `ingestedAt` is deliberately NOT compared. It is the one field a generator
 * does not determine, and keying on it would reintroduce exactly the kind of
 * incidental assumption this module exists to remove.
 */
import type { Observation } from "./types";
import { GENERATORS, seedObservationsFor } from "./seed";

/**
 * How far back and forward to search for the run date that produced a row.
 *
 * The real bootstrap ran 2026-08-23. The window is deliberately much wider
 * than that: this guard runs on every sweep for the life of the repo, and a
 * window pinned to a known incident would stop catching the next one. 60 months
 * back covers anything this repo could plausibly hold; 6 forward covers a
 * machine with a skewed clock, which would otherwise write rows no guard
 * could later identify.
 */
const MONTHS_BACK = 60;
const MONTHS_FORWARD = 6;

/** Candidate run dates: the 1st of each month across the window, plus `now`
 * itself. `monthsAgo` normalises to the 1st anyway, so one date per month is
 * sufficient — a run on the 23rd and a run on the 2nd of the same month
 * produce identical keys. */
function candidateRunDates(now: Date): Date[] {
  const out: Date[] = [now];
  for (let i = -MONTHS_FORWARD; i <= MONTHS_BACK; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d);
  }
  return out;
}

const canonical = (v: unknown) => JSON.stringify(v ?? null);

export interface SeedMatch {
  /** The run date whose regenerated output contains this exact row. */
  runDate: string;
  key: string;
}

/**
 * Returns the match if `obs` is reproducible from `seed.ts`, else null.
 *
 * Compares `key` and `value` only — see the header on why `ingestedAt` is
 * excluded and why `seed === true` is not consulted at all. A row that carries
 * the flag is still checked the same way; the flag is corroboration, never the
 * test, because the whole failure this replaces was a missing flag.
 */
export function reproducibleFromSeed(
  datasetId: string,
  location: string,
  obs: Pick<Observation<unknown>, "key" | "value">,
  now: Date = new Date(),
): SeedMatch | null {
  if (!GENERATORS[datasetId]) return null;
  const target = canonical(obs.value);
  for (const runDate of candidateRunDates(now)) {
    const rows = seedObservationsFor(datasetId, location, runDate);
    if (!rows) return null;
    for (const row of rows) {
      if (row.key === obs.key && canonical(row.value) === target) {
        return { runDate: runDate.toISOString().slice(0, 10), key: obs.key };
      }
    }
  }
  return null;
}

export interface ContaminatedRow {
  filePath: string;
  datasetId: string;
  location: string;
  status: string;
  key: string;
  value: unknown;
  ingestedAt: string;
  flagged: boolean;
  match: SeedMatch;
}

/** Every reproducible row in one already-parsed dataset file. */
export function scanDatasetFile(
  filePath: string,
  data: {
    datasetId: string;
    location: string;
    status: string;
    observations: Observation<unknown>[];
  },
  now: Date = new Date(),
): ContaminatedRow[] {
  const out: ContaminatedRow[] = [];
  for (const obs of data.observations) {
    const match = reproducibleFromSeed(data.datasetId, data.location, obs, now);
    if (!match) continue;
    out.push({
      filePath,
      datasetId: data.datasetId,
      location: data.location,
      status: data.status,
      key: obs.key,
      value: obs.value,
      ingestedAt: obs.ingestedAt,
      flagged: obs.seed === true,
      match,
    });
  }
  return out;
}
