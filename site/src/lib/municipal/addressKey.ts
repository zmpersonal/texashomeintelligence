/**
 * Address normalisation — the one function both sides of the match go through.
 *
 * Austin Resource Recovery publishes pre-parsed components (HOUSE_NO, FRACTION,
 * HSE_SUFF, ST_DIR, STREET_NAM, STREET_TYP, UNIT_NO, ZIP). We store a single
 * free-text `address_line`. This module parses ours into the same components and
 * emits an identical key from either side, so a match is a string equality and
 * nothing softer.
 *
 * The rule this file exists to enforce: **a wrong collection day is worse than
 * no collection day.** Every ambiguity resolves to `null` — a withheld read —
 * never to a best guess. There is deliberately no fuzzy matching here: no edit
 * distance, no phonetic matching, no "nearest street". A typo withholds.
 *
 * UNIT_NO is deliberately excluded from the key. ARR collects for the building
 * across single-family through fourplex, and the city's own lookup tells
 * residents to search without the unit designator.
 */

/** USPS Publication 28 street-suffix abbreviations, long form → the standard
 * abbreviation ARR publishes. Only entries we are confident about: an unknown
 * suffix is passed through unchanged and simply fails to match, which is the
 * safe direction. */
const SUFFIX: Record<string, string> = {
  ALLEY: "ALY", ANEX: "ANX", ARCADE: "ARC", AVENUE: "AVE", AVENU: "AVE", AV: "AVE",
  BAYOU: "BYU", BEACH: "BCH", BEND: "BND", BLUFF: "BLF", BOTTOM: "BTM",
  BOULEVARD: "BLVD", BOUL: "BLVD", BLVD: "BLVD", BRANCH: "BR", BRIDGE: "BRG",
  BROOK: "BRK", BURG: "BG", BYPASS: "BYP", CAMP: "CP", CANYON: "CYN", CAPE: "CPE",
  CAUSEWAY: "CSWY", CENTER: "CTR", CENTRE: "CTR", CIRCLE: "CIR", CLIFF: "CLF",
  CLUB: "CLB", COMMON: "CMN", CORNER: "COR", COURSE: "CRSE", COURT: "CT",
  COVE: "CV", CREEK: "CRK", CRESCENT: "CRES", CREST: "CRST", CROSSING: "XING",
  CURVE: "CURV", DALE: "DL", DAM: "DM", DIVIDE: "DV", DRIVE: "DR", ESTATE: "EST",
  EXPRESSWAY: "EXPY", EXTENSION: "EXT", FALL: "FALL", FALLS: "FLS", FERRY: "FRY",
  FIELD: "FLD", FIELDS: "FLDS", FLAT: "FLT", FORD: "FRD", FOREST: "FRST",
  FORGE: "FRG", FORK: "FRK", FORT: "FT", FREEWAY: "FWY", GARDEN: "GDN",
  GARDENS: "GDNS", GATEWAY: "GTWY", GLEN: "GLN", GREEN: "GRN", GROVE: "GRV",
  HARBOR: "HBR", HAVEN: "HVN", HEIGHTS: "HTS", HIGHWAY: "HWY", HILL: "HL",
  HILLS: "HLS", HOLLOW: "HOLW", INLET: "INLT", ISLAND: "IS", JUNCTION: "JCT",
  KEY: "KY", KNOLL: "KNL", KNOLLS: "KNLS", LAKE: "LK", LAKES: "LKS", LANDING: "LNDG",
  LANE: "LN", LIGHT: "LGT", LOAF: "LF", LOCK: "LCK", LODGE: "LDG", LOOP: "LOOP",
  MALL: "MALL", MANOR: "MNR", MEADOW: "MDW", MEADOWS: "MDWS", MEWS: "MEWS",
  MILL: "ML", MISSION: "MSN", MOTORWAY: "MTWY", MOUNT: "MT", MOUNTAIN: "MTN",
  NECK: "NCK", ORCHARD: "ORCH", OVAL: "OVAL", OVERPASS: "OPAS", PARK: "PARK",
  PARKWAY: "PKWY", PASS: "PASS", PASSAGE: "PSGE", PATH: "PATH", PIKE: "PIKE",
  PINE: "PNE", PINES: "PNES", PLACE: "PL", PLAIN: "PLN", PLAZA: "PLZ",
  POINT: "PT", POINTE: "PT", PORT: "PRT", PRAIRIE: "PR", RADIAL: "RADL",
  RANCH: "RNCH", RAPID: "RPD", REST: "RST", RIDGE: "RDG", RIVER: "RIV",
  ROAD: "RD", ROUTE: "RTE", ROW: "ROW", RUN: "RUN", SHOAL: "SHL", SHORE: "SHR",
  SPRING: "SPG", SPRINGS: "SPGS", SPUR: "SPUR", SQUARE: "SQ", STATION: "STA",
  STRAVENUE: "STRA", STREAM: "STRM", STREET: "ST", SUMMIT: "SMT", TERRACE: "TER",
  THROUGHWAY: "TRWY", TRACE: "TRCE", TRACK: "TRAK", TRAIL: "TRL", TRAILER: "TRLR",
  TUNNEL: "TUNL", TURNPIKE: "TPKE", UNDERPASS: "UPAS", UNION: "UN", VALLEY: "VLY",
  VIADUCT: "VIA", VIEW: "VW", VILLAGE: "VLG", VILLE: "VL", VISTA: "VIS",
  WALK: "WALK", WALL: "WALL", WAY: "WAY", WELL: "WL", WELLS: "WLS",
};

/** Values that are already the standard abbreviation — used to recognise a
 * trailing token as a street type without rewriting it. */
const SUFFIX_CODES = new Set(Object.values(SUFFIX));

const DIRECTIONAL: Record<string, string> = {
  NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W",
  NORTHEAST: "NE", NORTHWEST: "NW", SOUTHEAST: "SE", SOUTHWEST: "SW",
  N: "N", S: "S", E: "E", W: "W", NE: "NE", NW: "NW", SE: "SE", SW: "SW",
};

/** Secondary-unit designators. Everything from the first one onward is dropped:
 * the key is deliberately building-level. */
const UNIT_WORDS = new Set([
  "APT", "APARTMENT", "UNIT", "STE", "SUITE", "BLDG", "BUILDING", "FL", "FLOOR",
  "RM", "ROOM", "DEPT", "TRLR", "LOT", "SPC", "SPACE", "HANGAR", "SLIP", "PIER",
  "BSMT", "FRNT", "LBBY", "LOWR", "OFC", "PH", "REAR", "SIDE", "UPPR", "#",
]);

export interface AddressParts {
  houseNo: string;
  fraction: string;
  houseSuffix: string;
  dir: string;
  streetName: string;
  streetType: string;
}

function scrub(value: string): string {
  return value
    .toUpperCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds the lookup key. ZIP is not part of it — a shard already *is* one ZIP,
 * so folding it in would only repeat the shard's own identity in every key.
 */
export function addressKey(parts: AddressParts): string {
  return [
    parts.houseNo,
    parts.fraction,
    parts.houseSuffix,
    parts.dir,
    parts.streetName,
    parts.streetType,
  ].join("|");
}

/**
 * Normalises ARR's already-parsed components. Their split is authoritative, so
 * this only cases and abbreviates — it never re-parses their street name.
 */
export function keyFromArrRow(row: {
  houseNo: string; fraction?: string; houseSuffix?: string;
  dir?: string; streetName: string; streetType?: string;
}): string | null {
  const houseNo = scrub(row.houseNo ?? "");
  const streetName = scrub(row.streetName ?? "");
  // A row with no house number or no street name cannot be matched against and
  // must not become a key that some address accidentally collides with.
  if (!houseNo || !streetName) return null;

  const rawType = scrub(row.streetType ?? "");
  return addressKey({
    houseNo,
    fraction: scrub(row.fraction ?? ""),
    houseSuffix: scrub(row.houseSuffix ?? ""),
    dir: DIRECTIONAL[scrub(row.dir ?? "")] ?? scrub(row.dir ?? ""),
    streetName,
    streetType: SUFFIX[rawType] ?? rawType,
  });
}

export interface ParseFailure {
  ok: false;
  /** Why we withheld — surfaced in logs and tests, never shown as a schedule. */
  reason: "empty" | "no-house-number" | "no-street-name" | "zip-conflict";
}
export interface ParseSuccess {
  ok: true;
  parts: AddressParts;
  key: string;
  /** A unit designator we found and deliberately dropped, kept for explaining. */
  droppedUnit: string | null;
}
export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Parses our stored free-text `address_line` into ARR's component model.
 *
 * `expectedZip` is the ZIP on the home profile — the one that resolved the
 * area and county. If the typed address carries a *different* 5-digit ZIP we
 * refuse rather than pick a side: the two disagree about which shard should
 * answer, and guessing is exactly what this round forbids.
 */
export function parseAddressLine(line: string, expectedZip: string): ParseResult {
  const cleaned = scrub(line ?? "");
  if (!cleaned) return { ok: false, reason: "empty" };

  // A ZIP anywhere in the typed line must agree with the profile's ZIP.
  const zipInLine = cleaned.match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/);
  if (zipInLine && zipInLine[1] !== expectedZip) {
    return { ok: false, reason: "zip-conflict" };
  }

  let tokens = cleaned.split(" ").filter(Boolean);

  // Drop a trailing "AUSTIN TX 78704" tail if present, plus anything after a
  // unit designator. Order matters: unit first, since "APT 5" can precede city.
  const unitAt = tokens.findIndex((t) => UNIT_WORDS.has(t) || /^#/.test(t));
  let droppedUnit: string | null = null;
  if (unitAt > 0) {
    droppedUnit = tokens.slice(unitAt).join(" ");
    tokens = tokens.slice(0, unitAt);
  }
  // Trailing state/ZIP and city name are not part of the key.
  tokens = tokens.filter((t) => !/^\d{5}(-\d{4})?$/.test(t));
  const txAt = tokens.lastIndexOf("TX");
  if (txAt > 0) tokens = tokens.slice(0, txAt);
  if (tokens.length > 2 && tokens[tokens.length - 1] === "AUSTIN") tokens = tokens.slice(0, -1);

  if (tokens.length === 0) return { ok: false, reason: "empty" };

  // House number: the leading numeric token. ARR keys on it, so without one
  // there is nothing to match.
  const houseNo = tokens[0];
  if (!/^\d+[A-Z]?$/.test(houseNo)) return { ok: false, reason: "no-house-number" };
  tokens = tokens.slice(1);

  // A half-address ("1600 1/2 S CONGRESS") — ARR carries this as FRACTION.
  let fraction = "";
  if (tokens[0] && /^\d+\/\d+$/.test(tokens[0])) {
    fraction = tokens[0];
    tokens = tokens.slice(1);
  }
  // A house suffix is a bare letter directly after the number ("1600 A ELM ST").
  // A single letter that is also a directional is treated as a directional
  // instead, which is the far more common reading.
  let houseSuffix = "";
  if (tokens.length > 1 && /^[A-Z]$/.test(tokens[0]) && !DIRECTIONAL[tokens[0]]) {
    houseSuffix = tokens[0];
    tokens = tokens.slice(1);
  }

  // Leading directional, so "1600 S CONGRESS AVE" lines up with ARR's
  // ST_DIR=S / STREET_NAM=CONGRESS split rather than becoming part of the name.
  let dir = "";
  if (tokens.length > 1 && DIRECTIONAL[tokens[0]]) {
    dir = DIRECTIONAL[tokens[0]];
    tokens = tokens.slice(1);
  }

  if (tokens.length === 0) return { ok: false, reason: "no-street-name" };

  // Street type is the trailing token, but only when something remains to be
  // the name. "1600 PARK" keeps PARK as the street name; "1600 PARK ST" makes
  // ST the type. Streets genuinely named for a suffix word survive because the
  // check requires at least one other token.
  let streetType = "";
  if (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    const mapped = SUFFIX[last] ?? (SUFFIX_CODES.has(last) ? last : null);
    if (mapped) {
      streetType = mapped;
      tokens = tokens.slice(0, -1);
    }
  }

  const streetName = tokens.join(" ");
  if (!streetName) return { ok: false, reason: "no-street-name" };

  const parts: AddressParts = { houseNo, fraction, houseSuffix, dir, streetName, streetType };
  return { ok: true, parts, key: addressKey(parts), droppedUnit };
}
