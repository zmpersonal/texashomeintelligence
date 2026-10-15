/**
 * The shared trade-category vocabulary, and each metro's mapping onto it.
 *
 * ── WHY THIS FILE IS THE ONLY PLACE ───────────────────────────────────────
 * Austin and San Antonio encode "what trade is this permit" at different
 * levels of their schemas, and Round 6 measured exactly how (see
 * `docs/audits/round-6-permit-measurement.md`):
 *
 *  - **San Antonio** combines trade AND work type into one `PERMIT TYPE`
 *    column with 68 values. `WORK TYPE` is blank on 80.4% of rows and
 *    otherwise only "New"/"Existing"/"Other" — a construction-status flag
 *    carrying no trade information at all. So SA maps from `PERMIT TYPE`
 *    alone, and that is a **permit-type match**: the city says what the
 *    trade is.
 *  - **Austin** splits them: `permit_type_desc` has five values (the trade),
 *    `work_class` has 29 (the kind of work). So Austin maps from the PAIR.
 *    Austin has no roofing permit type and no roofing work class worth the
 *    name — `work_class = "Roof"` is ONE row in 54,798 — so roofing in
 *    Austin can only ever be a **description-text match**, with everything
 *    that implies.
 *
 * The owner's decision for this round: the two metros do NOT need comparable
 * permit data. Each is read at the precision its own source supports, and
 * every number carries the mechanism that produced it so a page can say
 * honestly what it is. Hence `classifiedBy` on every aggregate.
 *
 * ── EVERY VALUE BELOW WAS OBSERVED, NONE INVENTED ─────────────────────────
 * The San Antonio table is the complete 68-value enumeration from runs
 * #32/#34; the counts in the comments are that run's. The Austin table is
 * the complete 5-value `permit_type_desc` and 29-value `work_class`
 * enumeration from runs #33/#34. A source value that does not map to a
 * category is left UNCLASSIFIED on purpose — never forced into the nearest
 * bucket — and `classify()` returns an empty list for it so the caller can
 * count and report it.
 */

/** The eight categories. Nothing outside this list is a category.
 *
 * `energy_storage` is Round 50's split. It is not a new data source — it is the
 * half of Austin's `Auxiliary Power` work class that was being published as
 * `solar` and is not solar. See `AUSTIN_STORAGE_TEXT`. */
export const TRADE_CATEGORIES = [
  "roofing",
  "hvac",
  "plumbing",
  "electrical",
  "foundation",
  "solar",
  "energy_storage",
  "trees",
] as const;
export type TradeCategory = (typeof TRADE_CATEGORIES)[number];

/**
 * Bump when any mapping below changes, or when the COUNTING BASIS changes.
 *
 * Round 45 bumped it to `trades-v2` for the second reason: `permitCount` was a
 * row count and is now a count of distinct permits. The mappings were untouched.
 *
 * Round 50 bumped it to `trades-v3` for the FIRST reason, and this one moves
 * published figures. Austin's `Auxiliary Power` work class mapped straight to
 * `solar`; measured over the full window it is the class Austin uses for
 * distributed energy generally, and from July 2026 battery storage came to
 * dominate it — 64.3% of August's published "solar" permits and 74.2% of
 * September's named no solar, photovoltaic or PV at all. So the class no longer
 * assigns a category by itself: the description decides, and storage is its own
 * category. Austin's solar series re-bases DOWNWARD and a live article's
 * headline figure is wrong under v2. See
 * `docs/audits/round-50-permit-overlap.md`.
 * A count computed under one basis must never be compared against one computed
 * under another, which is the same rule this constant already existed to
 * enforce — a trend line spanning the boundary would have compared two
 * different questions, and in San Antonio's electrical series that boundary
 * would have invented a 9% fall.
 *
 * `tradeActivity()` publishes only the newest version present. Older rows stay
 * on disk as history and stop being read.
 *
 * Recorded on every aggregate observation, for the same reason
 * `METHODOLOGY_VERSION` is recorded on derived indices: a count produced
 * under one mapping must never be silently compared against a count
 * produced under another. A page or a trend line that spans a version
 * boundary is comparing two different questions.
 */
export const CATEGORY_MAPPING_VERSION = "trades-v3";

/** How a row was assigned to a category — the provenance that lets a page
 * say what its number actually is. */
export type ClassificationMechanism =
  /** The city's own permit type says the trade. Highest precision. */
  | "permit-type"
  /** The city's work-class column says it, within a broader permit type. */
  | "work-class"
  /** Matched on free text. Broad by construction; see the roofing note. */
  | "description-text";

export interface Classification {
  category: TradeCategory;
  mechanism: ClassificationMechanism;
  /** The metro-native value this came from, verbatim. */
  sourceValue: string;
}

// ── SAN ANTONIO ───────────────────────────────────────────────────────────
/**
 * All 68 `PERMIT TYPE` values from the live file, with run #34's counts.
 * `null` means deliberately unclassified — not a home-service trade in this
 * vocabulary. Those rows are dropped at ingest and counted as dropped.
 *
 * Note what is NOT here: no residual/regex fallback. If San Antonio adds a
 * permit type, it lands as unclassified and gets reported, rather than being
 * silently swept into whichever bucket a pattern happened to match.
 */
export const SAN_ANTONIO_PERMIT_TYPE_MAP: Record<string, TradeCategory | null> = {
  // ── mapped ──
  "Mechanical Permit": "hvac", // 16,395
  "LSR Mechanical Permit": "hvac", // 1,766
  "Mechanical Completion Permit": "hvac", // 268
  "Plumbing General Permit": "plumbing", // 15,369
  "Plumbing Irrigation Permit": "plumbing", // 11,514
  "LSR Plumbing Permit": "plumbing", // 4,559
  "Plumbing Sewer Permit": "plumbing", // 4,299
  "Plumbing Gas Permit": "plumbing", // 4,209
  "Plumbing Backflow Permit": "plumbing", // 714
  "Plumbing Completion Permit": "plumbing", // 444
  "Plumbing Medical Gas Permit": "plumbing", // 168
  "Plumbing MRFPSS Permit": "plumbing", // 1
  "Electrical General Permit": "electrical", // 13,977
  "Electrical TOPS Permit": "electrical", // 2,106
  "Electrical TML Permit": "electrical", // 821
  "Electrical Reconnect Permit": "electrical", // 420
  "Electrical Completion Permit": "electrical", // 373
  "LSR Electrical Permit": "electrical", // 19
  "Re-Roof Permit": "roofing", // 10,161 — a real permit class, 100% roof
  "Foundation Repair Permit": "foundation", // 5,243
  "Comm Foundation Permit": "foundation", // 37
  "Solar - Photovoltaic Permit": "solar", // 1,631
  "Tree Affidavit Permit": "trees", // 3,575
  "Tree Permit": "trees", // 766

  // ── deliberately unclassified: not a home-service trade ──
  "Residential Repair Permit": null, // 9,373 — trade unspecified by the city
  "Res New Building Permit": null, // 6,543
  "Garage Sale": null, // 6,104
  "On Premise Sign": null, // 3,150
  "Residential Fence Permit": null, // 1,955
  "Comm Remodel Permit": null, // 1,427
  "Home Addition Permit": null, // 1,228
  "Minor Commercial Repair Permit": null, // 964
  "Sidewalk-Curb Permit": null, // 924
  "Comm New Building Permit": null, // 915
  "Comm Sitework Permit": null, // 796
  "Demolition Permit": null, // 768
  "Swimming Pool or Spa Permit": null, // 737
  "Across the Street Banner": null, // 726
  "Maintenance Permit": null, // 714
  "Covered Patio or Porch Permit": null, // 547
  "Carport Permit": null, // 463
  "Comm Fence Permit": null, // 314
  "Comm Finish Out Permit": null, // 258
  "Accessory Building Permit": null, // 245
  "Manufactured Home Permit": null, // 224
  "Res Accessory-Addition Permit": null, // 207
  "Deck Permit": null, // 187
  "Temporary Weekend Sign": null, // 185
  "Feather Sign": null, // 151
  "Res Accessory Dwelling Permit": null, // 138
  "Comm Shade Structure Permit": null, // 132
  "Comm Retaining Wall Permit": null, // 131
  "Comm Addition Permit": null, // 118
  "Comm Shell Permit": null, // 110
  "Comm Comm Equipment Permit": null, // 107
  "Comm Ice-Teller Machine Permit": null, // 93
  "Comm Street Improvement Permit": null, // 80
  "Comm Swimming Pool Permit": null, // 60
  "Avenue Sign": null, // 38
  "Billboard Demolition": null, // 35
  "Building Move Permit": null, // 34
  "Comm Monument Permit": null, // 34
  "Event Sign": null, // 31
  "Comm Drive-Thru_Aisles Permit": null, // 15
  "Inflatable Sign": null, // 15
  "Comm Pad Site Permit": null, // 6
  "Pedestrian Protection Permit": null, // 6
  "Off Premise Billboard": null, // 1
};

export function classifySanAntonio(permitType: string): Classification[] {
  const key = permitType.trim();
  const category = SAN_ANTONIO_PERMIT_TYPE_MAP[key];
  if (!category) return []; // unmapped OR explicitly null — both unclassified
  return [{ category, mechanism: "permit-type", sourceValue: key }];
}

/** A `PERMIT TYPE` value the map has never seen. Reported, never guessed at. */
export function isUnknownSanAntonioType(permitType: string): boolean {
  return !(permitType.trim() in SAN_ANTONIO_PERMIT_TYPE_MAP);
}

// ── AUSTIN ────────────────────────────────────────────────────────────────
/**
 * All five `permit_type_desc` values, with run #34's counts. Three name a
 * trade outright; two do not and are left to `work_class` and description.
 */
export const AUSTIN_PERMIT_TYPE_MAP: Record<string, TradeCategory | null> = {
  "Electrical Permit": "electrical", // 15,932
  "Plumbing Permit": "plumbing", // 14,801
  "Mechanical Permit": "hvac", // 10,703
  "Building Permit": null, // 12,197 — a container, not a trade
  "Driveway / Sidewalks": null, // 1,165 — not in this vocabulary
};

/**
 * `work_class` values that carry trade information on their own. Only two of
 * Austin's 29 do.
 *
 * "Auxiliary Power" is Austin's solar class in practice: of the 469
 * Auxiliary Power rows inside the roof-matched archive, 463 (98.7%) mention
 * solar. That measurement is on the roof-matched subset, not the full 808 in
 * the window, so it is strong evidence rather than proof — hence the
 * mechanism is recorded as `work-class` and the solar count also picks up
 * description matches independently.
 */
export const AUSTIN_WORK_CLASS_MAP: Record<string, TradeCategory> = {
  Roof: "roofing", // 1 row in 54,798. Austin has no roofing class worth the name.
};

/**
 * Work classes the DOWNLOAD must include, whether or not they assign a category
 * on their own.
 *
 * `Auxiliary Power` is here and deliberately absent from the map above. Round 50
 * is why. It used to map straight to `solar` on the strength of a measurement
 * taken "inside the roof-matched archive" — a population selected by the word
 * roof, which rooftop solar contains and a battery cabinet does not. The control
 * was shaped to confirm what it confirmed. Measured on all 1,093 Auxiliary Power
 * rows in the window instead, the class splits four ways: 491 say solar only,
 * 421 say a battery or storage only, 168 say BOTH, and 13 say neither.
 *
 * So the class is a FILTER, not a verdict: it tells the predicate which rows to
 * fetch, and `classifyAustin` reads the description to decide what they are. The
 * two lists are separate because conflating them is what let a download filter
 * masquerade as a classification for fourteen months.
 */
export const AUSTIN_WORK_CLASSES_IN_SCOPE: readonly string[] = [
  "Auxiliary Power",
  ...Object.keys(AUSTIN_WORK_CLASS_MAP),
];

/**
 * The roofing text test, byte-for-byte the predicate `austinPermits.ts` has
 * always used: lowercase `work_class + permit_type_desc + description`
 * joined by spaces, then `.includes("roof")`.
 *
 * It is preserved EXACTLY, not re-derived, because the roofing observation
 * set must not move: `/data/austin/roof-permits/` publishes 1,945 stored
 * rows and a derived 366 of them, and any drift here is a regression on a
 * live indexed page.
 *
 * What it sweeps in is measured and is the reason `classifiedBy` exists:
 * 32.54% of the 1,945 roof-matched rows mention solar, photovoltaic or PV
 * [archive denominator], and a hand-classified sample of 40 came out 35%
 * actually re-roofing, 32.5% roof-adjacent, 32.5% unrelated. Rows are NOT
 * reclassified out of roofing to tidy that up — they are classified by what
 * the source says, and the provenance carries the caveat.
 */
export function austinRoofHaystack(row: {
  work_class?: string;
  permit_type_desc?: string;
  description?: string;
}): string {
  return `${row.work_class ?? ""} ${row.permit_type_desc ?? ""} ${row.description ?? ""}`.toLowerCase();
}

/** Solar wording measured in Austin descriptions (633 of 1,945 roof-matched
 * rows). Kept narrow and literal — no inference beyond what was observed. */
// Exported so `lib/textMatchComposition.ts` can measure the solar share of the
// roof text match with THIS predicate rather than a copy of it.
export const AUSTIN_SOLAR_TEXT = /\bsolar\b|photovoltaic|\bpv\b/i;

/**
 * Storage wording, READ OFF the live descriptions rather than written from two
 * examples (`docs/audits/round-50-aux-vocabulary.json`).
 *
 * Word frequencies across the 434 `Auxiliary Power` descriptions in the window
 * that do NOT mention solar: battery 393, backup 391, meter 392, socket 383,
 * system 418, storage 20, energy 24. One string accounts for the bulk of it —
 * "BASE: Installing a backup battery system and additional meter socket."
 *
 * Narrow and literal, like `AUSTIN_SOLAR_TEXT`. `meter socket` and `backup`
 * alone are deliberately NOT here: a meter socket is electrical work that
 * happens to accompany storage, and "backup" without a battery could be a
 * generator. The predicate names the device, not its wiring.
 *
 * `ESS` and `BESS` are in because they are what the industry calls the thing —
 * (Battery) Energy Storage System. Omitting bare `ESS` first time round cost
 * exactly 8 rows across the 13-month window, every one of them storage, and
 * finding them is what made this predicate reconcile to ZERO against the
 * independent composition count in `round-50-aux-vocabulary.json`. That
 * reconciliation is now a control in the rebase report rather than an
 * observation, because "explained and tiny" is how the 98.7% started.
 *
 * KNOWN LIMIT, stated rather than discovered later: this is only consulted for
 * rows whose `work_class` is `Auxiliary Power`, because that is the population
 * it was measured on. A battery installed under a plain Electrical Permit with
 * a storage description is NOT counted, the same way Austin's missing roofing
 * class limits roofing. How large that population is has not been measured.
 */
export const AUSTIN_STORAGE_TEXT = /\bbatter\w*|\bstorage\b|powerwall|\bb?ess\b/i;

export function classifyAustin(row: {
  permit_type_desc?: string;
  work_class?: string;
  description?: string;
}): Classification[] {
  const out: Classification[] = [];
  const seen = new Set<TradeCategory>();
  const add = (category: TradeCategory, mechanism: ClassificationMechanism, sourceValue: string) => {
    if (seen.has(category)) return;
    seen.add(category);
    out.push({ category, mechanism, sourceValue });
  };

  // Most precise first, so `mechanism` reports the strongest evidence that
  // assigned each category rather than whichever test ran last.
  const wc = (row.work_class ?? "").trim();
  const wcCategory = AUSTIN_WORK_CLASS_MAP[wc];
  if (wcCategory) add(wcCategory, "work-class", wc);

  const ptd = (row.permit_type_desc ?? "").trim();
  const ptdCategory = AUSTIN_PERMIT_TYPE_MAP[ptd];
  if (ptdCategory) add(ptdCategory, "permit-type", ptd);

  // Text matches last. Austin rows are genuinely multi-category: a rooftop
  // solar install filed as an Electrical Permit is electrical by class AND
  // roofing by the city's own text. Both are true; both are recorded.
  if (austinRoofHaystack(row).includes("roof")) {
    add("roofing", "description-text", "description contains \"roof\"");
  }
  if (AUSTIN_SOLAR_TEXT.test(row.description ?? "")) {
    add("solar", "description-text", "description mentions solar/photovoltaic/PV");
  }
  // ── ROUND 50: `Auxiliary Power` IS A FILTER, NOT A VERDICT ───────────────
  // The class gates WHICH rows this test runs on; the description decides what
  // they are. A row saying both solar and storage lands in both categories, the
  // same way a rooftop solar install lands in solar and roofing — it is one job
  // that genuinely is both, and these counts have never been additive.
  // A row saying NEITHER is left unclassified and reported, per this file's rule
  // that an unmapped value is never forced into the nearest bucket: 13 rows in
  // the 14-month window, mostly solar wording this test does not know ("24
  // MODULES - SYSTEM SIZE STC") and vehicle-to-home chargers.
  if (wc === "Auxiliary Power" && AUSTIN_STORAGE_TEXT.test(row.description ?? "")) {
    add("energy_storage", "description-text",
        "work class Auxiliary Power, description mentions a battery or storage");
  }
  return out;
}

/** A `permit_type_desc` the map has never seen. Reported, never guessed at. */
export function isUnknownAustinType(permitTypeDesc: string): boolean {
  return !((permitTypeDesc ?? "").trim() in AUSTIN_PERMIT_TYPE_MAP);
}

/**
 * Categories with NO source in a given metro, stated rather than left to be
 * discovered as an empty chart.
 *
 * Austin's enumeration found no foundation and no tree permit type, and no
 * foundation or tree work class among its 29. They could in principle be
 * text-matched out of `description`, but Round 6 never measured that, and
 * this round classifies only from observed values. So they are absent, not
 * zero — a distinction a page must respect.
 */
export const CATEGORIES_WITHOUT_SOURCE: Record<string, TradeCategory[]> = {
  austin: ["foundation", "trees"],
  // Round 50: San Antonio's 68 permit types include no storage type. Its solar
  // is the explicit `Solar - Photovoltaic Permit` and is unaffected by the
  // Austin defect — absent, not zero.
  "san-antonio": ["energy_storage"],
};
