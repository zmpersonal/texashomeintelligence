/**
 * Locations that are not metros.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Three rounds in a row hit the same wall. Round 41a scoped the drought pages
 * to a county and found the dataset files were keyed by METRO. Round 41c found
 * Census ACS publishes at `for=place:` — the city itself — and could not store
 * it, because `censusAcs.ts` writes `census-acs/{location}.json` keyed by
 * `AreaId`. Round 41e found a weather station 5.2 miles from New Braunfels that
 * clears the record-quality bar, and could not store that either.
 *
 * Each time the blocker was the same: `AreaId` is the only geography the
 * codebase has, and a city is not an area. Giving New Braunfels an `AreaId`
 * would make it a metro — it would grow service pages, a data hub, a ZIP
 * grouping and a place in the metro nav, none of which is true of it.
 *
 * So a LOCATION is the smaller thing: it belongs to a metro, it has its own
 * county, its own point, and it may have its own census place and its own
 * weather station. It is the unit a city page is about.
 *
 * ── THE RULE THIS FILE ENFORCES ──────────────────────────────────────────
 * A reading labelled with a location must be MEASURED at that location, or
 * labelled at the grain it was actually measured. That is Round 41a's finding
 * turned into a type: every field below says what grain it carries, and
 * anything a location does not have is `undefined` rather than inherited from
 * its metro. There is no fallback to the metro's value anywhere in this file,
 * deliberately — a missing station means no cooling-load reading, not San
 * Antonio's cooling-load reading under New Braunfels' name.
 */
import { ZIP_AREAS, type AreaId } from "./zip-areas";

export interface LocationCounty {
  name: string;
  fips: string;
}

export interface LocationDef {
  /** Matches the `locations` content-collection id, i.e. the URL segment. */
  slug: string;
  label: string;
  /** The metro this location sits inside. Its datasets are read from here. */
  areaId: AreaId;
  /**
   * The county this location is in — NOT its metro's primary county. Drought
   * and storm readings are filtered to this FIPS and labelled with this name.
   */
  county: LocationCounty;
  /**
   * U.S. Census Bureau 2023 Gazetteer internal point for the place
   * (`INTPTLAT`/`INTPTLONG`), fetched in Round 41c. Nothing here is a lat/lon
   * anybody typed from memory.
   */
  point: { lat: number; lon: number };
  /** Census place FIPS, for `for=place:` — city grain, not county. */
  censusPlaceFips: string;
  /**
   * A GHCND first-order station that clears the record-quality bar in
   * `noaaClimate.ts`, with the distance from `point` that qualified it.
   *
   * ⚠️ `undefined` MEANS NO COOLING-LOAD READING, not "use the metro's". San
   * Marcos is the case that proves the point: both stations bearing its name
   * publish no 1991-2020 normals at all, and the nearest that does is New
   * Braunfels' station 12.9 miles away, which would have shown San Marcos the
   * identical twelve numbers New Braunfels shows. One measurement under two
   * city names is the shape Round 41a existed to remove, so it is withheld.
   */
  climateStation?: { id: string; distanceMiles: number };
}

export const LOCATIONS = [
  {
    slug: "new-braunfels",
    label: "New Braunfels",
    areaId: "san-antonio",
    county: { name: "Comal", fips: "48091" },
    point: { lat: 29.699306, lon: -98.115127 },
    censusPlaceFips: "50820",
    // Round 41e: 12/12 usable months, 17-20 years of record, no month flagged
    // estimated. Nearer than San Antonio is to its own station (6.0 mi).
    climateStation: { id: "USW00012971", distanceMiles: 5.2 },
  },
  {
    slug: "san-marcos",
    label: "San Marcos",
    areaId: "austin",
    county: { name: "Hays", fips: "48209" },
    point: { lat: 29.872399, lon: -97.936022 },
    censusPlaceFips: "65600",
    // No climateStation, and that is the finding rather than an omission —
    // see the field's note above and docs/audits/round-41e-corridor-cooling-load.md.
  },
] as const satisfies readonly LocationDef[];

/** Derived, like `AreaId` — adding an entry widens this everywhere at once. */
export type LocationSlug = (typeof LOCATIONS)[number]["slug"];

/**
 * A location's definition, or a loud failure. Same rule as `areaLabel` in
 * `zip-areas.ts`: resolve from config or stop the build, never default.
 */
export function locationDef(slug: string): LocationDef {
  const loc = LOCATIONS.find((l) => l.slug === slug);
  if (!loc) {
    throw new Error(
      `locationDef("${slug}"): no entry in LOCATIONS. Known locations: ` +
        `${LOCATIONS.map((l) => l.slug).join(", ")}. Add it to ` +
        `src/data/locations.ts rather than defaulting to its metro.`,
    );
  }
  return loc;
}

/** Whether a content-collection slug is a sub-metro location rather than a metro. */
export function isLocation(slug: string): boolean {
  return LOCATIONS.some((l) => l.slug === slug);
}

/** The locations inside a given metro, in declared order. */
export function locationsInArea(areaId: string): readonly LocationDef[] {
  return LOCATIONS.filter((l) => l.areaId === areaId);
}

/**
 * Guard: every location must name a metro that exists. Checked at module load
 * so a typo cannot ship — `zip-areas.ts` throws the same way for a crosswalk
 * row naming an unknown area.
 */
for (const loc of LOCATIONS) {
  if (!ZIP_AREAS.some((a) => a.areaId === loc.areaId)) {
    throw new Error(
      `LOCATIONS: "${loc.slug}" names area "${loc.areaId}", which is not in ZIP_AREAS.`,
    );
  }
}
