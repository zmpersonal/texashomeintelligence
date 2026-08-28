/**
 * Which published dataset, if any, genuinely bears on a given service — and
 * why, in one sentence.
 *
 * Deliberately incomplete. A service only appears here when there is a real,
 * defensible link between the service and something we actually measure;
 * inventing a connection so every page has a number would be exactly the kind
 * of false precision the brand rules out. Fire-damage restoration has no entry
 * because no fire-weather feed is connected, and the page says so plainly
 * rather than borrowing an unrelated reading.
 *
 * The `why` sentence is Analysis on the information ladder — it explains a
 * measured value, and is written to be true of the relationship in general,
 * never a claim about a specific property.
 */
export interface ServiceSignal {
  /** Topic slug of the data page, resolved per location. */
  topic: string;
  /** Fallback when a location has no page for `topic`. */
  fallbackTopic?: string;
  why: string;
}

export const SERVICE_SIGNALS: Record<string, ServiceSignal> = {
  roofing: {
    topic: "roofing",
    fallbackTopic: "storms",
    why: "Hail at roughly one inch or larger is the common trigger for insurance-eligible roof damage, so recent storm history is the clearest public signal of whether local roofs have taken a beating.",
  },
  "tree-trimming": {
    topic: "drought",
    why: "Sustained drought stresses mature trees, and drought-weakened limbs are a frequent cause of storm damage later — which makes the drought record a leading indicator for tree work.",
  },
  plumbing: {
    topic: "drought",
    why: "Central Texas clay soils shrink as they dry and swell as they rewet. That movement is a well-documented contributor to stress on buried supply and drain lines, so a long dry stretch is worth knowing about.",
  },
  hvac: {
    topic: "electricity-prices",
    why: "What a system costs to run depends on the rate as much as the equipment, so the statewide residential price is the context for any repair-or-replace decision.",
  },
  electrical: {
    topic: "electricity-prices",
    why: "The statewide residential rate is the benchmark to check your own effective rate against before assuming a high bill is a wiring or equipment problem.",
  },
  "mold-remediation": {
    topic: "storms",
    fallbackTopic: "roofing",
    why: "Mold follows water. Recorded flooding and storm activity is the public record of when water most recently got into buildings in the area.",
  },
};

/** Services with no defensible measured signal yet, and the honest reason. */
export const SERVICES_WITHOUT_SIGNAL: Record<string, string> = {
  "fire-damage-restoration":
    "We do not yet publish a fire-weather or fire-incident feed for Texas, so there is no measured local signal to show here. We would rather show nothing than attach an unrelated reading to this page.",
};
