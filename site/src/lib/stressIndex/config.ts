/**
 * Home Stress Index — the single tunable file.
 *
 * Every weight, threshold, band edge and decay constant the index uses lives
 * here. Nothing in `signals.ts` or `compute.ts` hardcodes a number that a
 * reviewer would want to argue with; if you disagree with the index, you
 * disagree with something on this page.
 *
 * ── What the index is, and is not ────────────────────────────────────────
 * It is an index of CONDITIONS: how hard the recent environment has been on a
 * house in this area. It is NOT a probability of damage, not an inspection,
 * and not a statement about any individual property. Two identical houses one
 * street apart get the same score, because every input is measured at county
 * or metro granularity. The explanation templates in `explain.ts` are written
 * to keep that framing; see `CONDITIONS_NOT_DAMAGE` there.
 *
 * ── Evidence quality ─────────────────────────────────────────────────────
 * These are DEFAULTS PROPOSED FOR TUNING, not measured coefficients. We have
 * no outcome data (claims, repair spend) to fit against, so nothing here is
 * calibrated in the statistical sense. Each entry carries an `evidence` note
 * saying how firm it is. Anything marked `low` is a judgement call that the
 * owner should expect to move.
 */

export const METHODOLOGY_VERSION = "hsi-v1";

/** How the five signals roll into the composite. Must sum to 1. */
export const SIGNAL_WEIGHTS = {
  /** Highest weight: the best-evidenced signal we have (dated, county-tagged,
   * magnitude-bearing NOAA events) and the most financially consequential
   * failure mode for a Texas homeowner. evidence: medium */
  "roof-storm": 0.3,
  /** Central Texas expansive clay makes drought-driven soil movement the
   * second most expensive thing that happens to houses here, and it is the
   * classic "you should have watered your foundation" story. Weighted below
   * roof because our only input is drought, with no soil-specific data (see
   * EXCLUDED_INPUTS). evidence: medium */
  "foundation-soil": 0.25,
  /** The highest-FREQUENCY Texas concern — most homeowners think about the
   * AC before anything else — but our inputs (forecast heat, air quality) are
   * thinner than the storm record, so frequency does not buy it the top
   * weight. evidence: low */
  hvac: 0.2,
  /** Real and actionable (restrictions, irrigation timing) but rarely a
   * capital expense, so it sits below the three structural signals.
   * evidence: low */
  "water-irrigation": 0.15,
  /** Lowest: slow-moving, largely discretionary maintenance, and the least
   * direct data. evidence: low */
  "trees-yard": 0.1,
} as const satisfies Record<string, number>;

/**
 * Storm decay — how fast a past storm stops counting as a current condition.
 *
 * Exponential: weight = 0.5 ^ (ageDays / STORM_DECAY_HALF_LIFE_DAYS).
 *
 * 180 days means a storm from six months ago counts half as much as one from
 * this week, and a year-old storm still carries a quarter. That is deliberately
 * slower than "how long ago did it hail" instinct suggests, because unrepaired
 * hail damage does not heal — it keeps mattering until someone looks at the
 * roof. It is also roughly the window in which most Texas carriers still
 * expect a storm-damage claim to be filed.
 *
 * evidence: low. This is the single number most worth the owner's attention:
 * it moves the roof signal, which carries the largest weight. Shorten it to
 * ~90 to make the index twitchier and more "what just happened"; lengthen it
 * to ~365 to make it read more like a cumulative exposure record.
 */
export const STORM_DECAY_HALF_LIFE_DAYS = 180;

/** Below this weight, a decayed event is dropped rather than carried as noise. */
export const STORM_DECAY_FLOOR = 0.05;

/**
 * Severity points per storm event, before decay. Points are additive across
 * events and then squashed by SATURATION (below), so a busy season compounds
 * without any single event pinning the score.
 *
 * Hail thresholds follow the sizes the trade actually uses: under 1" rarely
 * marks asphalt shingle, 1"–1.75" is the common "get it inspected" band, and
 * 1.75"+ (golf ball and up) is where functional damage is expected.
 * evidence: medium — these cut points are industry convention, not fitted.
 */
export const STORM_SEVERITY = {
  hail: [
    { minInches: 1.75, points: 34, code: "hail-large" },
    { minInches: 1.0, points: 20, code: "hail-moderate" },
    { minInches: 0, points: 9, code: "hail-small" },
  ],
  /** NWS logs severe-thunderstorm wind at 50 kt / ~58 mph and up, so almost
   * every recorded gust is already "severe"; the split marks where roof-cover
   * and tree damage become common rather than possible. evidence: low */
  wind: [
    { minMph: 70, points: 22, code: "wind-extreme" },
    { minMph: 58, points: 13, code: "wind-severe" },
    { minMph: 0, points: 7, code: "wind-strong" },
  ],
  /** A tornado in the county is a real roof-stress signal but is far more
   * localized than hail — most of the county is unaffected. Scored present
   * but modest for that reason. evidence: low */
  tornadoPoints: 18,
  /** Magnitude is frequently "unknown" in the NOAA record (every flood and
   * tornado row, some wind rows). An unknown-magnitude wind event still
   * happened, so it scores the lowest band rather than zero — but it never
   * scores as if it were severe. evidence: medium (this is a data-honesty
   * rule, not a judgement about weather) */
  unknownMagnitudeCode: "magnitude-unknown",
} as const;

/**
 * Saturation: raw points → 0–100. score = 100 * (1 - exp(-points / k)).
 *
 * Without it, an active spring pegs the scale and the signal stops telling
 * two bad years apart. With it, points accumulate but the score approaches
 * 100 asymptotically.
 *
 * ⚠️ This is the least-evidenced number in the file, and it was tuned
 * empirically rather than derived. k = 90 was chosen by computing the real
 * decayed point totals for the two counties we hold — Travis at ~110 points
 * across 18 events (an active hail year, including one 2" event) and Bexar at
 * ~59 across 11 — and picking the constant that puts the harder of the two in
 * upper Elevated (71) and the quieter in upper Moderate (48), leaving headroom
 * above both for a genuinely exceptional season.
 *
 * Two things the owner should know about that. First, it is a calibration
 * against a sample of two counties over roughly eight months of NOAA record —
 * that is not enough to claim the scale is right, only that it is not obviously
 * wrong. Second, it is circular in the way any unsupervised scale is: we chose
 * the constant so that today's conditions land mid-scale, because we have no
 * outcome data to anchor against. An earlier value of 45, picked a priori from
 * how a single hail event "should" score, put Travis at 100 and Bexar at 73 —
 * i.e. it pegged, which is how the tuning came to be done at all.
 *
 * Raise k to compress the scale (fewer areas reach High); lower it to spread
 * scores upward. Re-check it whenever a third metro is added, since two points
 * cannot describe a distribution.
 */
export const STORM_SATURATION_K = 90;

/**
 * Drought scoring. USDM publishes, per county per week, the % of county area
 * at-or-worse-than each D-level. We score the worst level present WEIGHTED BY
 * the share of the county it covers — a county 10% in D2 is not a county in
 * D2, and treating it as one would be exactly the false precision this project
 * exists to avoid.
 *
 * levelPoints are the score a county would carry if 100% of it were at that
 * level; actual contribution is levelPoints * areaFraction.
 * evidence: medium — the D-scale is ordinal and published, the point spacing
 * is ours.
 */
export const DROUGHT_LEVEL_POINTS: Record<string, number> = {
  D0: 20,
  D1: 40,
  D2: 62,
  D3: 82,
  D4: 100,
};

/**
 * Foundation looks at PERSISTENCE, not this week: clay soil moves on a
 * seasonal timescale, so a single dry week is meaningless and a dry year is
 * the whole story. Water & Irrigation looks at the CURRENT week. Both read the
 * same USDM feed — that overlap is disclosed on the methodology page rather
 * than hidden, because a reader deserves to know the two signals are not
 * independent evidence.
 */
export const DROUGHT_WINDOWS = {
  /** ~1 year. Matches the seasonal wet/dry cycle that drives soil movement,
   * and is as far back as our USDM history currently runs. evidence: medium */
  foundationWeeks: 52,
  /** ~6 months. Trees respond faster than foundations and slower than lawns.
   * evidence: low */
  treesWeeks: 26,
  /** The current reading only. */
  waterWeeks: 1,
} as const;

/**
 * HVAC. Two live inputs, both metro-level.
 *  - Heat load: share of recent forecast days at or above HOT_DAY_F, plus a
 *    bonus for days at or above EXTREME_DAY_F. Days over 100°F are when
 *    marginal AC systems actually fail in Central Texas.
 *  - Air quality: AQI drives filter load and is the honest reason to think
 *    about the system when it isn't hot. Scored well below heat.
 * evidence: low for the weighting between them; the thresholds themselves are
 * conventional (100°F, and the AQI 51/101 category edges are EPA's).
 */
export const HVAC = {
  hotDayF: 100,
  extremeDayF: 105,
  hotDayPoints: 55,
  extremeDayPoints: 30,
  /** AQI contribution: linear from the "Moderate" edge to the "Unhealthy"
   * edge, capped. EPA category boundaries. evidence: medium */
  aqiFloor: 50,
  aqiCeiling: 150,
  aqiMaxPoints: 15,
} as const;

/** Score → band. Edges are inclusive lower bounds. */
export const BANDS = [
  { id: "high", label: "High", min: 75 },
  { id: "elevated", label: "Elevated", min: 50 },
  { id: "moderate", label: "Moderate", min: 25 },
  { id: "normal", label: "Normal", min: 0 },
] as const;

/**
 * Inputs deliberately NOT used, and why. Kept in code because "why isn't soil
 * type in the soil signal" is the first question any reviewer asks, and the
 * answer should not live only in a commit message.
 */
export const EXCLUDED_INPUTS = [
  {
    datasetId: "usda-soil",
    reason:
      "One sample at the metro centroid, currently 'Urban land, 0 to 6 percent slopes', " +
      "which says nothing about shrink-swell potential. A single point cannot characterise " +
      "a county's soils, and using it would imply a per-property soil read we do not have.",
  },
  {
    datasetId: "census-acs",
    reason:
      "Median home age is a genuine foundation-risk factor, but it is a metro median and " +
      "we only hold it for Austin. Including it would shift one metro by a constant and " +
      "leave the other without it, making the two composites non-comparable.",
  },
  {
    datasetId: "eia-electricity",
    reason:
      "Statewide residential price. It cannot vary between Austin and San Antonio, so it " +
      "would move every area's HVAC score by the same amount — adding cost anxiety to the " +
      "number without adding any information about local conditions.",
  },
  {
    datasetId: "ercot",
    reason: "Still a sample feed. Sample data never reaches an indexed page or a score.",
  },
  {
    datasetId: "tx-forest-service",
    reason:
      "Still a sample feed. Fire danger would be a real Trees & Yard input once the fetcher " +
      "is implemented.",
  },
] as const;

/**
 * Trees & Yard blends slow drought stress with recent wind. Drought carries
 * the larger share because a drought-weakened tree is the precondition — wind
 * is what finally brings the limb down, but it brings down weakened limbs
 * first. evidence: low; a defensible alternative is an even split.
 */
export const TREES_BLEND = { droughtShare: 0.6, stormShare: 0.4 } as const;

/**
 * Event types excluded from the roof signal, with the reason. Flood is a real
 * and serious hazard, but it is not roof stress, and folding it in would let a
 * flood-heavy season inflate a number a homeowner reads as "my roof".
 * Flood exposure belongs in its own signal once FEMA NFHL is a live feed.
 */
export const STORM_EXCLUDED_EVENT_TYPES = ["Flood"] as const;
