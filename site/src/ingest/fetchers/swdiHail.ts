import type { FetcherModule, Observation } from "../types";
import { parseCsv } from "../csv";
import { ZIP_AREAS } from "../../data/zip-areas";

/**
 * One NEXRAD hail signature.
 *
 * ── THE DISTINCTION THAT MUST SURVIVE INTO THE DATA ───────────────────────
 * `observationType` is on EVERY row and its value reads
 * `"radar-derived-hail-signature"`. That is deliberate and it is not
 * decoration: SWDI's nx3hail product is storm-cell signatures NEXRAD flagged
 * as PROBABLE hail. It is not a record that hail fell, and nobody stood
 * outside and measured one.
 *
 * NCEI Storm Events — the `noaa-storm-events` dataset, a different feed in
 * this same repo — is human reports of hail that was actually observed. Round
 * 12 measured that Bexar County recorded NO confirmed hail in its window.
 * Both things can be true at once: radar can flag a probable-hail cell over a
 * county where nobody reported hail on the ground.
 *
 * A comment cannot protect a reader from that, because a reader sees JSON and
 * a rendered page, not this file. So the discriminant travels in the row. Any
 * consumer that prints `observationType` verbatim cannot make a signature read
 * as hail that fell.
 */
export interface RadarHailSignatureValue {
  /** Never anything else. The value is the warning. */
  observationType: "radar-derived-hail-signature";
  /** SWDI product this came from, named so a row is traceable to a request. */
  sourceProduct: "SWDI nx3hail";
  /** NEXRAD radar station that produced the signature (SWDI `WSR_ID`). */
  radarStationId: string;
  /** SWDI `CELL_ID` — the storm cell within that radar's volume scan. */
  cellId: string;
  lat: number;
  lon: number;
  /** SWDI `PROB` — probability of hail, as returned. */
  probabilityOfHail: number;
  /** SWDI `SEVPROB` — probability of severe hail, as returned. */
  probabilityOfSevereHail: number;
  /** SWDI `MAXSIZE`, as returned. See `maxSizeUnit`. */
  maxSize: number;
  /**
   * ⚠️ NULL, AND IT STAYS NULL UNTIL SOMEONE READS THE DOCUMENTATION.
   *
   * The nx3hail response carries NO units column — measured, both metros,
   * twelve windows. Observed MAXSIZE values are 0.75, 1, 1.25, 1.5, 2.
   * Inches and millimetres differ by 25x and both look entirely plausible for
   * hail at those magnitudes.
   *
   * SWDI's own documentation is the only thing that settles it, and it could
   * not be read: `www.ncdc.noaa.gov` and `www.ncei.noaa.gov` are refused at
   * CONNECT from the environment this was written in. So this is NOT "the
   * documentation does not state it" — it is "the documentation has not been
   * read", which is a different claim and the honest one.
   *
   * UNTIL IT IS READ: the COUNT of signatures is publishable and the SIZE is
   * not. A number with no unit is not a measurement.
   */
  maxSizeUnit: null;
  /**
   * What the query area is. NOT a county — see `BOX_PAD_DEGREES`. Carried per
   * row so that a count can never be captioned as a county figure by someone
   * reading only the data.
   */
  areaBasis: "box-around-metro-reference-point-not-a-county";
  /**
   * Round 23. Whether SWDI's OWN `stat=count` for the identical query agreed
   * with the number of data rows this fetcher parsed from it.
   *
   * It rides on the row rather than living only in a log line because a log
   * scrolls away and a stored record does not: anyone reading one observation
   * can see whether the fetch that produced it was checked, and against what.
   *
   * "unavailable" means the count query failed or could not be parsed — which
   * is not the same as disagreeing, and is not treated as one.
   */
  countCheck: "agrees" | "disagrees" | "unavailable";
  /** What SWDI's `stat=count` reported, verbatim, or null if it did not answer. */
  countCheckReported: number | null;
}

/**
 * NOAA **Severe Weather Data Inventory**, `nx3hail`, via the SWDI web service.
 * No token: measured, not assumed — the probe sent none and was answered.
 *
 * ── WHAT ROUNDS 21 AND 21b ESTABLISHED, AND WHAT THEY COST ────────────────
 * Round 21 asked for a 365-day window, received HTTP 500 carrying
 * `ERROR VALIDATING 'dateRange=startDate:endDate' … maximum date range
 * currently allowed is 744 hours`, and concluded the service was unreachable.
 * It was reachable and had just named its constraint. **744 hours is 31 days
 * and `MAX_WINDOW_DAYS` below exists because of it.**
 *
 * `plsr` DOES NOT EXIST on SWDI. The server enumerated its products:
 * nx3structure, nx3hail, nx3meso, nx3mda, nx3tvs, nldn. There is no
 * storm-reports product here and nothing should look for one again.
 *
 * ── WHY THIS IS ITS OWN DATASET AND NOT PART OF noaa-storm-events ─────────
 * They measure different things — radar signatures versus human reports — and
 * folding one into the other is the sibling-product error that cost rounds 19
 * through 19e. Separate `datasetId`, separate files, no shared rows.
 */
type Metro = "austin" | "san-antonio";

const SWDI_BASE = "https://www.ncdc.noaa.gov/swdiws";
const PRODUCT = "nx3hail";

/**
 * ⚠️ THIS NUMBER IS PROVISIONAL AND THE EVIDENCE FOR IT CONFLICTS.
 *
 *   MEASURED: a Round 21 request for 365 days returned HTTP 500 carrying
 *     "maximum date range currently allowed is 744 hours" — 31 days.
 *   DOCUMENTED: SWDI's REST usage page states "The current limit of the date
 *     range size is one year."
 *
 * Both cannot describe the same request. The 744-hour error may be specific to
 * `nx3hail`, or to the query shape Round 21 used — that request also carried a
 * `limit=5` parameter, which the working Round 21b request did not.
 *
 * 31 days is kept because it is the only ceiling anything has actually
 * OBSERVED, and a clamp that is too tight costs requests while a clamp that is
 * too loose costs a failed run. The Round 23 probe step in
 * `.github/workflows/noaa-climate-probe.yml` tries 31, 90, 180 and 365 days
 * with and without `limit` and prints every error body. **Raise this only
 * against that log, never against the documentation alone** — the
 * documentation is what the 744-hour error already contradicted.
 */
const MAX_WINDOW_DAYS = 31;

/**
 * Half-width of the query box around each metro's representative point from
 * `src/data/zip-areas.ts`.
 *
 * THIS IS NOT A COUNTY BOUNDARY and must never be described as one. No county
 * polygon has been measured anywhere in this repo. A box around a point
 * includes area outside the county and excludes area inside it, so a count
 * from this feed is "signatures near the city", never "signatures in Travis
 * County". `areaBasis` on every row says so.
 */
const BOX_PAD_DEGREES = 0.5;

function pointFor(location: Metro): { lat: number; lon: number } {
  const area = ZIP_AREAS.find((a) => a.areaId === location);
  if (!area) throw new Error(`swdi-nx3hail: no area "${location}" in src/data/zip-areas.ts.`);
  return area.point;
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function numberOrNull(raw: string | undefined): number | null {
  const v = (raw ?? "").trim();
  if (v === "" || v === "-9999") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * SWDI's CSV carries `#` comment lines AND A TRAILING METADATA ROW.
 *
 * Round 21b's probe reported the newest timestamp as the literal string
 * `totalTimeInSeconds` for both metros — that trailer sorted last and was read
 * as a date. Filtering `#` alone is not enough.
 *
 * The guard is deliberately not "drop the last line": a trailer whose position
 * or name changes would walk straight back in. A row is kept only if its
 * column count matches the header AND its ZTIME parses as a real timestamp.
 * Anything else is counted and reported, never silently dropped.
 */
interface ParsedCsv {
  header: string[];
  rows: string[][];
  rejected: number;
}

const ZTIME_SHAPE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function parseSwdiCsv(text: string): ParsedCsv | null {
  const lines = text.split("\n").filter((l) => l.trim() !== "" && !l.startsWith("#"));
  if (lines.length === 0) return null;
  const all = parseCsv(lines.join("\n"));
  if (all.length === 0) return null;
  const header = all[0].map((h) => h.trim());
  const timeIdx = header.findIndex((h) => h.toUpperCase() === "ZTIME");
  const rows: string[][] = [];
  let rejected = 0;
  for (const r of all.slice(1)) {
    if (r.length !== header.length || timeIdx < 0 || !ZTIME_SHAPE.test((r[timeIdx] ?? "").trim())) {
      rejected += 1;
      continue;
    }
    rows.push(r);
  }
  return { header, rows, rejected };
}

function makeFetcher(location: Metro): FetcherModule<RadarHailSignatureValue> {
  return {
    datasetId: "swdi-nx3hail",
    location,
    source: {
      name:
        "NOAA Severe Weather Data Inventory — nx3hail (NEXRAD radar-derived hail signatures, " +
        "not confirmed hail reports)",
      url: "https://www.ncdc.noaa.gov/swdiws/",
    },
    requiredEnvVars: [],
    async fetchRaw(ctx): Promise<Observation<RadarHailSignatureValue>[]> {
      const { lat, lon } = pointFor(location);
      const bbox = [
        (lon - BOX_PAD_DEGREES).toFixed(4),
        (lat - BOX_PAD_DEGREES).toFixed(4),
        (lon + BOX_PAD_DEGREES).toFixed(4),
        (lat + BOX_PAD_DEGREES).toFixed(4),
      ].join(",");

      // ── ONE 31-DAY WINDOW PER RUN. NO BACKFILL, AND THAT IS A DECISION.
      //
      // `computeFetchWindow` hands a full backfill window on a first run, which
      // SWDI answers with a 500. Rather than loop twelve requests to fill a
      // year, the window is CLAMPED to the service's own ceiling and the series
      // accumulates: `mergeObservations` is append-only and keyed per signature,
      // so weekly runs build the history a backfill would have bought, without
      // carrying loop logic that runs its guard every day forever to do nothing.
      // The measured cost of that choice is 2 requests per run, one per metro.
      const until = new Date(ctx.window.until);
      const requestedSince = new Date(ctx.window.since);
      const earliest = new Date(until.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const since = requestedSince > earliest ? requestedSince : earliest;

      const url =
        `${SWDI_BASE}/csv/${PRODUCT}/${yyyymmdd(since)}:${yyyymmdd(until)}` +
        `?bbox=${encodeURIComponent(bbox)}`;
      const res = await fetch(url);
      if (!res.ok) {
        // An HTTP error from SWDI carries a body explaining what it disliked,
        // and Round 21 lost a round by printing that body and discarding it.
        // It goes in the throw.
        const detail = (await res.text().catch(() => "")).trim().split("\n")[0] ?? "";
        throw new Error(
          `SWDI ${PRODUCT} fetch failed: HTTP ${res.status} from ${url}` +
            (detail ? ` — server said: ${detail.slice(0, 300)}` : ""),
        );
      }

      const parsed = parseSwdiCsv(await res.text());
      if (parsed === null) {
        // A window with no signatures is a REAL FINDING about the weather, not
        // a failure — central Texas sits at the southern edge of the hail
        // gradient and quiet months are expected. Returning [] lets
        // `runIngestion` decide: it keeps prior data and refuses to flip a
        // never-live dataset to live on an empty result.
        return [];
      }
      const idx = new Map(parsed.header.map((h, i) => [h.toUpperCase(), i]));
      const need = ["ZTIME", "LON", "LAT", "WSR_ID", "CELL_ID", "PROB", "SEVPROB", "MAXSIZE"];
      const missing = need.filter((n) => !idx.has(n));
      if (missing.length > 0) {
        throw new Error(
          `SWDI ${PRODUCT} response is missing expected column(s) ${missing.join(", ")}. ` +
            `Columns returned: ${parsed.header.join(", ")}. The product's shape has changed — ` +
            "read the response before changing this fetcher.",
        );
      }
      // ── ROUND 23: SWDI'S OWN COUNT, AS A CROSS-CHECK ONLY.
      //
      // This does NOT replace the per-record fetch and must not. `stat=count`
      // returns a number and nothing else — no coordinates, no timestamps, no
      // MAXSIZE — and a future per-address reading needs all three. It is
      // cheaper, not more accurate: it is the same number SWDI would produce by
      // counting the rows it would otherwise send.
      //
      // WHAT IT IS FOR: the `totalTimeInSeconds` trailer silently became a
      // record until Round 22 caught it. A parser that loses or invents rows
      // fails in exactly that shape — quietly, with plausible output. Asking
      // the server how many rows it thinks it sent is the one cheap check that
      // catches that class, and it is worth its request for that alone.
      //
      // COMPARED AGAINST THE PARSED ROW COUNT, NOT THE EMITTED OBSERVATIONS.
      // This fetcher deliberately drops positionless rows and de-duplicates on
      // key, so emitted < parsed is expected and correct; only parsed vs SWDI
      // isolates the parser.
      const countUrl = `${url}&stat=count`;
      let reportedCount: number | null = null;
      try {
        const countRes = await fetch(countUrl);
        if (countRes.ok) {
          const raw = (await countRes.text()).trim();
          // Shape unverified — the response format for stat=count has not been
          // seen from this environment. So: take the first integer that is not
          // part of the timing trailer, and record null rather than guessing if
          // there isn't one.
          const cleaned = raw
            .split("\n")
            .filter((l) => !l.startsWith("#") && !/totalTimeInSeconds/i.test(l))
            .join(" ");
          const m = cleaned.match(/\d+/);
          reportedCount = m ? Number(m[0]) : null;
        }
      } catch {
        reportedCount = null;
      }

      const countCheck: RadarHailSignatureValue["countCheck"] =
        reportedCount === null
          ? "unavailable"
          : reportedCount === parsed.rows.length
            ? "agrees"
            : "disagrees";

      // Reported in the ingest log on every run, agreeing or not — a check
      // that only speaks up when it fails cannot be distinguished from a check
      // that is not running.
      console.log(
        `swdi-nx3hail/${location}: count cross-check ${countCheck} — ` +
          `SWDI stat=count reported ${reportedCount ?? "nothing usable"}, ` +
          `parser kept ${parsed.rows.length} data row(s) ` +
          `(${parsed.rejected} non-data row(s) rejected).`,
      );

      // ── WHY A MISMATCH WARNS AND RECORDS RATHER THAN FAILING.
      //
      // Failing is the right END STATE and the wrong first move. `stat=count`'s
      // exact semantics have not been observed from here: if it counts before
      // the bbox filter, or includes the trailer, a CORRECT parser would
      // mismatch on every run and a throw would keep the feed permanently dark
      // over a difference in definition. Shipping a hard failure on an
      // unverified assumption is the mistake rounds 19-19e cost five rounds.
      //
      // A race is NOT the reason: this product publishes days behind real time,
      // so nothing is being written into the window between two back-to-back
      // requests.
      //
      // RECOMMENDATION, recorded here so the next round does not have to
      // re-derive it: once ONE live run reports "agrees", promote this to a
      // throw. Until then the discrepancy is loud in the log and durable on
      // every row, which is what the trailer bug lacked.
      if (countCheck === "disagrees") {
        console.log(
          `swdi-nx3hail/${location}: WARNING — SWDI's count and the parsed row ` +
            "count differ. Either the parser is losing or inventing rows, or " +
            "stat=count counts something other than the rows it returns. Read " +
            "the response before trusting either number.",
        );
      }

      if (parsed.rejected > 0) {
        // Expected: SWDI appends a `totalTimeInSeconds` trailer. Reported rather
        // than hidden, so a rise in this number is visible as a shape change.
        console.log(
          `swdi-nx3hail/${location}: dropped ${parsed.rejected} non-data row(s) ` +
            "(SWDI appends a timing trailer after the records).",
        );
      }

      const cell = (r: string[], name: string) => r[idx.get(name)!];
      const ingestedAt = new Date().toISOString();
      const observations: Observation<RadarHailSignatureValue>[] = [];
      const seen = new Set<string>();

      for (const r of parsed.rows) {
        const ztime = cell(r, "ZTIME").trim();
        const rowLat = numberOrNull(cell(r, "LAT"));
        const rowLon = numberOrNull(cell(r, "LON"));
        const maxSize = numberOrNull(cell(r, "MAXSIZE"));
        const prob = numberOrNull(cell(r, "PROB"));
        const sevProb = numberOrNull(cell(r, "SEVPROB"));
        const radar = cell(r, "WSR_ID").trim();
        const cellId = cell(r, "CELL_ID").trim();
        // A signature with no position is not usable by anything this feed
        // exists for, and a size with no position cannot be placed on a map.
        if (rowLat === null || rowLon === null || !radar) continue;

        // Stable and unique within the file: one radar's one cell at one scan
        // time. Re-fetching an overlapping window updates in place rather than
        // duplicating, which is what makes the no-backfill design safe.
        const key = `${ztime}-${radar}-${cellId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        observations.push({
          observedAt: new Date(ztime).toISOString(),
          ingestedAt,
          key,
          value: {
            observationType: "radar-derived-hail-signature",
            sourceProduct: "SWDI nx3hail",
            radarStationId: radar,
            cellId,
            lat: rowLat,
            lon: rowLon,
            probabilityOfHail: prob ?? 0,
            probabilityOfSevereHail: sevProb ?? 0,
            maxSize: maxSize ?? 0,
            maxSizeUnit: null,
            areaBasis: "box-around-metro-reference-point-not-a-county",
            countCheck,
            countCheckReported: reportedCount,
          },
        });
      }
      return observations;
    },
  };
}

export const swdiHailAustin = makeFetcher("austin");
export const swdiHailSanAntonio = makeFetcher("san-antonio");
