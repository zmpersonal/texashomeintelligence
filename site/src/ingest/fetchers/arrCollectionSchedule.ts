/**
 * Austin Resource Recovery collection schedules — Socrata dataset `rfif-mmvg`.
 *
 * This feed is different in kind from every other one in the registry. The
 * others are *observation series*: a reading per county per week, appended
 * forever. This is a *lookup table*: ~185k address rows that are replaced
 * wholesale whenever the city republishes. Appending 185k rows per run to the
 * archive would be neither history nor useful.
 *
 * So it is split in two, and both halves are honest about what they are:
 *
 *  - The `DatasetFile` here records **one observation per ingest run** — row
 *    count, the city's publish date, and a fingerprint of the table's content.
 *    That is the real history: when the schedule changed, and by how much.
 *  - The addresses themselves are written by `emitArrShards` to
 *    `public/data/arr-schedule/<zip>.json`, one file per covered ZIP,
 *    overwritten each run. The Worker reads exactly one of those per request
 *    through ASSETS — never bundled, never all loaded at once, and never
 *    fetched from the city on the serving path.
 *
 * There is deliberately no seed for this feed. `seed.ts`'s placeholder rows are
 * right for a series — a clearly-labelled sample reading harms nobody — and
 * catastrophic for a lookup table, where a fabricated row is a confidently
 * wrong collection day for a real street address. No shard file means the
 * dashboard withholds, which is the correct answer.
 */
import type { FetcherModule, Observation } from "../types";
import { ARR_SOURCE, MUNICIPAL_METHODOLOGY_VERSION } from "../../lib/municipal/config";
import { keyFromArrRow } from "../../lib/municipal/addressKey";
import { AMBIGUOUS } from "../../lib/municipal/shardFormat";
import { coveredArrZips } from "../../lib/municipal/coverage";
import { emitArrShards } from "../../lib/municipal/emitShards";

const SODA_URL = "https://data.austintexas.gov/resource/rfif-mmvg.json";
/** Socrata's per-request ceiling; the fetch pages until the city stops sending. */
const PAGE = 50_000;

export interface ArrRunSummary {
  /** Address keys written across all shards. */
  rowCount: number;
  /** ZIPs that produced a shard file. */
  zipCount: number;
  /** Keys whose source rows disagreed and were stored as ambiguous. */
  ambiguousCount: number;
  /** Rows the city sent that we could not key (no house number or street). */
  unusableCount: number;
  /** Stable digest of the emitted table, so an unchanged republish is visible
   * as an unchanged fingerprint rather than a new mystery observation. */
  fingerprint: string;
}

interface SodaRow {
  house_no?: string;
  fraction?: string;
  hse_suff?: string;
  street_nam?: string;
  street_typ?: string;
  st_dir?: string;
  unit_no?: string;
  zip?: string;
  collection_day?: string;
  collection_week?: string;
}

/** FNV-1a — a content digest, not a security hash. Cheap and dependency-free. */
function fingerprint(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function normaliseDay(raw: string): string {
  return raw.trim().slice(0, 3).toUpperCase();
}

export const arrCollectionSchedule: FetcherModule<ArrRunSummary> = {
  datasetId: "arr-collection-schedule",
  location: "austin",
  source: ARR_SOURCE,
  requiredEnvVars: [],
  async fetchRaw(): Promise<Observation<ArrRunSummary>[]> {
    const covered = coveredArrZips();
    // ZIP → key → "DAY|WEEK" | AMBIGUOUS
    const byZip = new Map<string, Map<string, string>>();
    let unusable = 0;
    let ambiguous = 0;

    for (let offset = 0; ; offset += PAGE) {
      const url = new URL(SODA_URL);
      url.searchParams.set("$limit", String(PAGE));
      url.searchParams.set("$offset", String(offset));
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`Austin Resource Recovery fetch failed: HTTP ${res.status} at offset ${offset}`);
      }
      const rows = (await res.json()) as SodaRow[];
      if (rows.length === 0) break;

      for (const row of rows) {
        const zip = (row.zip ?? "").trim();
        // Owner's scope decision: only the ~100 Austin-metro ZIPs we cover.
        // A row outside them is not "dropped data" — it is a ZIP this product
        // has no dashboard for.
        if (!covered.has(zip)) continue;

        const day = normaliseDay(row.collection_day ?? "");
        const week = (row.collection_week ?? "").trim().toUpperCase();
        const key = keyFromArrRow({
          houseNo: row.house_no ?? "",
          fraction: row.fraction,
          houseSuffix: row.hse_suff,
          dir: row.st_dir,
          streetName: row.street_nam ?? "",
          streetType: row.street_typ,
        });
        if (!key || !day || !/^[AB]$/.test(week)) {
          unusable++;
          continue;
        }

        const value = `${day}|${week}`;
        let table = byZip.get(zip);
        if (!table) {
          table = new Map();
          byZip.set(zip, table);
        }
        const seen = table.get(key);
        if (seen === undefined) {
          table.set(key, value);
        } else if (seen !== value && seen !== AMBIGUOUS) {
          // Two rows for the same building disagree — units on different
          // schedules, or a stale duplicate. Resolve it here, once, so the
          // serving path is never in a position to choose.
          table.set(key, AMBIGUOUS);
          ambiguous++;
        }
      }

      if (rows.length < PAGE) break;
    }

    if (byZip.size === 0) {
      throw new Error("Austin Resource Recovery returned no rows for any covered ZIP");
    }

    const ingestedAt = new Date().toISOString();
    const summary = emitArrShards(byZip, { ingestedAt, fingerprint });
    const observation: Observation<ArrRunSummary> = {
      observedAt: ingestedAt,
      ingestedAt,
      // One row per run, keyed by the digest: a republish that changed nothing
      // updates in place instead of growing the archive with a duplicate.
      key: `arr-${summary.fingerprint}`,
      value: { ...summary, ambiguousCount: ambiguous, unusableCount: unusable },
    };
    return [observation];
  },
};

export const ARR_METHODOLOGY_VERSION = MUNICIPAL_METHODOLOGY_VERSION;
