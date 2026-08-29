/**
 * The Recommendation rung of the information ladder.
 *
 * ── THE HARD RULE ────────────────────────────────────────────────────────
 * Every action is something a homeowner can OBSERVE. Look, check, clear,
 * photograph, note, water, test. None of them asserts that anything is wrong,
 * and none sends anyone to buy something.
 *
 * That is not a stylistic preference. We measure conditions across a county;
 * we have never seen the house. "Get your roof repaired" would be a claim
 * about a specific property from data that cannot support one, and it would
 * turn an intelligence product into a lead funnel by implication. So the
 * vocabulary is deliberately narrow, and `BANNED_ACTION_PATTERNS` below is
 * asserted against the RENDERED text in the round's tests — if someone later
 * writes a friendly-sounding "have it replaced", the build's verification
 * catches it rather than a reader catching it in production.
 *
 * Normal-band signals get no action at all. Padding a calm reading with
 * busywork trains people to ignore the ones that matter.
 */
import type { BandId } from "./dashboardShared";

export type SignalId =
  | "roof-storm" | "foundation-soil" | "hvac" | "water-irrigation" | "trees-yard";

export interface ActionCode {
  code: string;
  /** Imperative and observational. See the rule above. */
  text: string;
  /** A Round 5 reminder task this action maps onto, where one genuinely does.
   * The logged-in dashboard offers to add it; the public page does not, since
   * there is no account to add it to. */
  taskKey?: string;
}

/**
 * Phrases that must never appear in a rendered action. Two families:
 * damage assertions ("damaged", "leak" as a statement) and commercial
 * handoffs ("contractor", "quote"). Matched case-insensitively on word
 * boundaries by the verification pass.
 */
export const BANNED_ACTION_PATTERNS = [
  "fix", "repair", "repairs", "replace", "replacement", "install", "installation",
  "contractor", "contractors", "roofer", "plumber", "technician", "professional",
  "quote", "quotes", "estimate", "estimates", "bid", "bids",
  "claim", "claims", "insurance", "adjuster", "warranty",
  "hire", "call a pro", "service call", "damaged", "damage",
] as const;

/** Keyed by signal, then band. `normal` is absent everywhere on purpose. */
export const SIGNAL_ACTIONS: Record<SignalId, Partial<Record<BandId, ActionCode>>> = {
  "roof-storm": {
    moderate: {
      code: "roof-perimeter-walk",
      text: "Walk the perimeter and look at gutters and downspouts for dents.",
      taskKey: "gutters",
    },
    elevated: {
      code: "roof-ground-check",
      text: "From the ground, look for lifted or missing shingles and photograph anything you notice, with the date.",
      taskKey: "gutters",
    },
    high: {
      code: "roof-ground-check-attic",
      text: "From the ground, look for lifted or missing shingles, and check the attic for daylight or staining after the next rain. Photograph what you find, with the date.",
      taskKey: "gutters",
    },
  },
  "foundation-soil": {
    moderate: {
      code: "foundation-gaps",
      text: "Look for new gaps around exterior door and window frames.",
    },
    elevated: {
      code: "foundation-water-even",
      text: "Water the soil evenly around the whole perimeter rather than in patches, and note any new cracks with the date.",
    },
    high: {
      code: "foundation-water-even-photo",
      text: "Keep the soil around the perimeter evenly damp, and photograph and date any crack wider than a credit card.",
    },
  },
  hvac: {
    moderate: {
      code: "hvac-filter-check",
      text: "Check the air filter and clear leaves away from the outdoor unit.",
      taskKey: "hvac-filter",
    },
    elevated: {
      code: "hvac-filter-drain",
      text: "Check the air filter, clear the outdoor unit, and look at the condensate drain line for backup.",
      taskKey: "hvac-filter",
    },
    high: {
      code: "hvac-filter-drain-watch",
      text: "Check the air filter, clear the outdoor unit, look at the condensate drain line, and note how long the system runs to reach the set temperature.",
      taskKey: "hvac-filter",
    },
  },
  "water-irrigation": {
    moderate: {
      code: "irrigation-check",
      text: "Check irrigation heads and valves for leaks, and review your run times.",
    },
    elevated: {
      code: "irrigation-deep-dawn",
      text: "Water deeply and less often, at dawn, and check heads and valves for leaks.",
    },
    high: {
      code: "irrigation-deep-dawn-meter",
      text: "Water deeply at dawn, check heads and valves for leaks, and read your meter with everything off to catch a hidden one.",
    },
  },
  "trees-yard": {
    moderate: {
      code: "trees-limb-look",
      text: "Look for dead limbs over the roof, driveway and walkways.",
    },
    elevated: {
      code: "trees-limb-water",
      text: "Look for dead or hanging limbs over the roof, and deep-water established trees at the drip line.",
    },
    high: {
      code: "trees-limb-water-clear",
      text: "Look for dead or hanging limbs over the roof and walkways, deep-water established trees at the drip line, and clear debris away from the foundation.",
    },
  },
};

export function actionFor(signalId: string, band: BandId): ActionCode | undefined {
  return SIGNAL_ACTIONS[signalId as SignalId]?.[band];
}

/** Used by the verification pass and by a unit-style guard at build time. */
export function findBannedPhrase(text: string): string | undefined {
  const lower = text.toLowerCase();
  return BANNED_ACTION_PATTERNS.find((p) => new RegExp(`\\b${p}\\b`, "i").test(lower));
}

/** Fails the build rather than shipping an action that breaks the rule. The
 * table is static, so this is cheap and runs every time it is imported. */
export function assertActionsAreObservational(): void {
  for (const [signal, bands] of Object.entries(SIGNAL_ACTIONS)) {
    for (const [band, action] of Object.entries(bands)) {
      const hit = findBannedPhrase(action.text);
      if (hit) {
        throw new Error(
          `SIGNAL_ACTIONS.${signal}.${band} contains the banned phrase "${hit}". ` +
            `Actions describe what to observe, never what to have done to the house.`,
        );
      }
    }
  }
}
assertActionsAreObservational();
