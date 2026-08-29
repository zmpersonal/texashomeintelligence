/**
 * Parses `src/data/zip-area-crosswalk.csv` at build time.
 *
 * The CSV is imported raw and parsed here rather than being converted into a
 * TypeScript literal, so the file in the repo stays byte-identical to the one
 * derived from the Census relationship file. A generated `.ts` copy would be a
 * second version of the same facts, and the first hand-edit to either would
 * put them out of step silently.
 */
import raw from "../data/zip-area-crosswalk.csv?raw";
import { CROSS_METRO_ZIPS } from "../data/zip-areas";

export interface CrosswalkRow {
  zip: string;
  /** Normalised to the dataset `location` form: `san_antonio` → `san-antonio`. */
  areaId: string;
  primaryCountyFips: string;
  primaryCountyName: string;
  /** Every in-metro county the ZCTA touches, for this metro. */
  metroCountyFips: string[];
  /** True when we ingest a drought series for the ZIP's own primary county. */
  droughtCountyGranular: boolean;
}

const EXPECTED_HEADER =
  "zip,area,primary_county_fips,primary_county,all_metro_county_fips,drought_county_granular";

function parse(): CrosswalkRow[] {
  const lines = raw.trim().split(/\r?\n/);
  const header = lines[0].trim();
  if (header !== EXPECTED_HEADER) {
    // A silently reshaped source file would produce a subtly wrong map rather
    // than an error, so the column contract is asserted rather than assumed.
    throw new Error(
      `zip-area-crosswalk.csv header changed.\n  expected: ${EXPECTED_HEADER}\n  found:    ${header}`,
    );
  }
  const rows: CrosswalkRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [zip, area, fips, county, allFips, granular] = line.split(",");
    if (!/^\d{5}$/.test(zip)) throw new Error(`zip-area-crosswalk.csv: bad ZIP "${zip}"`);
    rows.push({
      zip,
      areaId: area.trim().replace(/_/g, "-"),
      primaryCountyFips: fips.trim(),
      primaryCountyName: county.trim(),
      metroCountyFips: allFips.trim().split("|").filter(Boolean),
      droughtCountyGranular: granular.trim().toLowerCase() === "yes",
    });
  }
  return rows;
}

export const CROSSWALK_ROWS: CrosswalkRow[] = parse();

/**
 * ZIP → the single row we resolve it to.
 *
 * Six ZIPs straddle the MSA boundary and appear once per metro; `CROSS_METRO_ZIPS`
 * picks which row wins (see the comment there — that choice is editorial, not
 * derived from the file). Any other duplicate would be a defect in the source
 * data, so it throws rather than letting last-write-wins decide quietly.
 */
function index(): Map<string, CrosswalkRow> {
  const byZip = new Map<string, CrosswalkRow>();
  for (const row of CROSSWALK_ROWS) {
    const existing = byZip.get(row.zip);
    if (!existing) {
      byZip.set(row.zip, row);
      continue;
    }
    const decision = CROSS_METRO_ZIPS[row.zip];
    if (!decision) {
      throw new Error(
        `zip-area-crosswalk.csv lists ${row.zip} in both "${existing.areaId}" and "${row.areaId}" ` +
          `with no entry in CROSS_METRO_ZIPS to say which should win.`,
      );
    }
    byZip.set(row.zip, decision.area === row.areaId ? row : existing);
  }
  return byZip;
}

export const CROSSWALK: Map<string, CrosswalkRow> = index();

/** ZIPs the source file places in both metros, with the row we resolved them to. */
export function crossMetroZips(): { zip: string; resolvedTo: string; note: string }[] {
  return Object.entries(CROSS_METRO_ZIPS)
    .map(([zip, d]) => ({ zip, resolvedTo: d.area, note: d.note }))
    .sort((a, b) => a.zip.localeCompare(b.zip));
}
