/**
 * Austin Water drought stage.
 *
 * Every other fetcher in the registry reads a JSON API. This one reads an HTML
 * page, because Austin Water does not publish the current stage in any
 * queryable form — it exists as prose on the drought-response page and in press
 * releases. That was surfaced and approved as the only available source, on the
 * condition that it fails closed.
 *
 * So the parse is deliberately narrow rather than clever. It looks only for the
 * exact stage names in `WATER_STAGES`, and it requires the page to be
 * unambiguous: zero matches, or two different stages both present, throws.
 * A throw is a failed attempt, which preserves the prior reading and marks the
 * dataset stale — and a stale stage makes the dashboard withhold the watering
 * day while still showing the last known stage with its date. There is no
 * regex for "Stage \d+" and no fallback to the most recent value, because both
 * would let an unrecognised page state through as a confident answer.
 *
 * If the city restructures the page this feed goes stale and stays stale, loudly,
 * until someone updates the parse. That is the intended failure mode — see the
 * scrape-fragility seam in HANDOFF.md.
 */
import type { FetcherModule, Observation } from "../types";
import { AUSTIN_WATER_SOURCE, WATER_STAGES, type WaterStage } from "../../lib/municipal/config";

export interface WaterStageValue {
  stage: WaterStage;
  /** The page we read it off, recorded per observation so a later change of
   * source is visible in the archive rather than silent. */
  sourceUrl: string;
}

/** Strips tags and collapses whitespace. We match against text, not markup, so
 * a class rename or a re-nesting does not by itself break the read. */
function pageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exported for the unit-level checks: given page text, return the single stage
 * it unambiguously states, or throw. Kept pure so the failure modes are
 * testable without a network call.
 */
export function extractStage(text: string): WaterStage {
  // Longest first, so "Stage 2" inside a longer name can't shadow it and
  // "Conservation Stage" is preferred over a bare "Stage" fragment.
  const found = WATER_STAGES.filter((stage) =>
    new RegExp(`\\b${stage.replace(/\s+/g, "\\s+")}\\b`, "i").test(text),
  );

  if (found.length === 0) {
    throw new Error(
      "Austin Water page did not state any recognised drought stage — parse needs updating",
    );
  }
  if (found.length > 1) {
    // The page mentions more than one stage (often "we are leaving Stage 2 for
    // Conservation Stage"). We cannot tell which is current from text alone,
    // so we decline rather than pick.
    throw new Error(
      `Austin Water page mentions multiple stages (${found.join(", ")}) — cannot determine current stage`,
    );
  }
  return found[0];
}

export const austinWaterStage: FetcherModule<WaterStageValue> = {
  datasetId: "austin-water-stage",
  location: "austin",
  source: AUSTIN_WATER_SOURCE,
  requiredEnvVars: [],
  async fetchRaw(): Promise<Observation<WaterStageValue>[]> {
    const res = await fetch(AUSTIN_WATER_SOURCE.url, {
      headers: { Accept: "text/html", "User-Agent": "TexasHomeIntelligence/1.0 (+https://texashomeintelligence.com)" },
    });
    if (!res.ok) {
      throw new Error(`Austin Water fetch failed: HTTP ${res.status}`);
    }
    const stage = extractStage(pageText(await res.text()));
    const now = new Date();
    // Date-only key, matching the other fetchers' convention: re-reading the
    // same day updates in place, and the archive gets one row per day the stage
    // was observed rather than one per run.
    const day = now.toISOString().slice(0, 10);
    return [
      {
        observedAt: `${day}T00:00:00.000Z`,
        ingestedAt: now.toISOString(),
        key: `austin-water-${day}`,
        value: { stage, sourceUrl: AUSTIN_WATER_SOURCE.url },
      },
    ];
  },
};
