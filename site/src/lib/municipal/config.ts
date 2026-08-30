/**
 * Round 5b — municipal configuration. The single tunable file, same role
 * `stressIndex/config.ts` plays for the score: every rule a reviewer might
 * want to check or change lives here, not scattered through the renderers.
 *
 * Nothing here is modelled or inferred. The watering table is Austin Water's
 * published rule, transcribed; the collection policy sentences are Austin
 * Resource Recovery's published service model. Both carry the source we took
 * them from so the page can cite it.
 */

export const MUNICIPAL_METHODOLOGY_VERSION = "muni-v1";

/** The only municipal-data area this round covers. Everything else withholds. */
export const MUNICIPAL_AREA = "austin";

// ── Austin Water: drought stage → watering rule ──────────────────────────────

/**
 * The stages Austin Water publishes. The scrape must land on exactly one of
 * these strings or the attempt fails — see `austinWaterStage.ts`. Listing them
 * here (rather than pattern-matching "Stage \d") is deliberate: an unrecognised
 * stage must fail closed, not be guessed at.
 */
export const WATER_STAGES = [
  "Conservation Stage",
  "Stage 1",
  "Stage 2",
  "Stage 3",
  "Stage 4",
] as const;

export type WaterStage = (typeof WATER_STAGES)[number];

export interface WateringRule {
  /** Day for automatic in-ground irrigation, by street-number parity. */
  automatic: { odd: string; even: string };
  /** Hose-end sprinkler / drip rule. Some stages allow two unassigned days,
   * in which case there is no per-parity day and `note` carries the rule. */
  hoseEnd: { odd: string; even: string } | null;
  hoseEndNote: string;
  hours: string;
}

/**
 * Transcribed from Austin Water's published restrictions. Only the two stages
 * we have verified wording for are filled in. A stage with no entry renders as
 * "we don't have the rule for this stage on file" rather than a guess — which
 * is why this is a partial record and not a `Record<WaterStage, …>`.
 */
export const WATERING_RULES: Partial<Record<WaterStage, WateringRule>> = {
  "Conservation Stage": {
    automatic: { odd: "Friday", even: "Tuesday" },
    hoseEnd: null,
    hoseEndNote: "Hose-end sprinklers and drip irrigation: 2 days per week.",
    hours: "Midnight to 10 a.m., or 7 p.m. to midnight.",
  },
  "Stage 2": {
    automatic: { odd: "Wednesday", even: "Thursday" },
    hoseEnd: { odd: "Saturday", even: "Sunday" },
    hoseEndNote: "Hose-end sprinklers: one assigned day per week.",
    hours: "Midnight to 5 a.m., or 7 p.m. to midnight.",
  },
};

/**
 * How long a scraped stage stays trustworthy. Past this the card keeps showing
 * the last known stage — clearly marked stale, with its as-of date, the same
 * way every other feed degrades — but stops publishing a watering day, because
 * the day-to-parity mapping changes with the stage.
 */
export const WATER_STAGE_STALE_AFTER_DAYS = 14;

export const AUSTIN_WATER_SOURCE = {
  name: "Austin Water",
  url: "https://www.austintexas.gov/water/austin-water-drought-response",
} as const;

export const AUSTIN_WATER_FIND_DAY_URL =
  "https://www.austintexas.gov/water/find-your-watering-day";

// ── Austin Resource Recovery ────────────────────────────────────────────────

export const ARR_SOURCE = {
  name: "Austin Resource Recovery",
  url: "https://data.austintexas.gov/Utilities-and-City-Services/Recycling-Schedules/rfif-mmvg",
} as const;

/** The city's own address lookup — every withheld state links here rather than
 * leaving the reader with nothing. */
export const ARR_MY_SCHEDULE_URL = "https://www.austintexas.gov/MySchedule";

/**
 * Bulk / brush. Austin replaced its predetermined twice-yearly bulk schedule
 * with on-demand appointments in January 2025, so there is no "next bulk
 * pickup" date to publish for anyone — the entitlement is the fact, and a date
 * would be an invention. `asOf` is when the policy took effect, not a reading.
 */
export const BULK_POLICY = {
  collectionsPerYear: 3,
  asOf: "2025-01-01",
  source: {
    name: "Austin Resource Recovery",
    url: "https://www.austintexas.gov/resource-recovery/programs/demand-bulk-brush-and-household-hazardous-waste-collection",
  },
} as const;
