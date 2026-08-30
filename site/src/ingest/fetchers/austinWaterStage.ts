/**
 * Austin Water drought stage.
 *
 * Every other fetcher in the registry reads a JSON API. This one reads an HTML
 * page, because Austin Water does not publish the stage in any queryable form —
 * it exists as prose on the drought-response page. That was approved as the
 * only available source, on the condition that it fails closed.
 *
 * The first live run proved the original whole-document rule too blunt: the
 * page describes *every* stage (its triggers, its restrictions), so scanning
 * the whole document found both "Conservation Stage" and "Stage 1" and the
 * fail-closed guard correctly declined. Declining forever is still wrong, so
 * this now looks for the page's statement of the *current* stage rather than
 * for stage names anywhere on it.
 *
 * Three strategies, most specific first, each of which must resolve to exactly
 * one stage or hand off to the next:
 *
 *   1. A present-tense cue next to a stage name ("is currently in Conservation
 *      Stage"). Deliberately excludes departure and conditional phrasings —
 *      "moved out of Stage 2", "if we enter Stage 2" — which name a stage that
 *      is precisely not the current one.
 *   2. A "Current stage:" style label followed by a stage name.
 *   3. The original rule: exactly one stage named in the whole document. Sound
 *      when true, and the right last resort for a page that has been simplified
 *      down to a single announcement.
 *
 * If none of them resolves to exactly one stage, this throws — the prior
 * reading is preserved, the feed goes stale, and the dashboard shows the last
 * known stage marked stale while withholding the watering day. There is still
 * no "probably still Conservation Stage" path anywhere in this file.
 *
 * On failure it logs a bounded `[water-stage-diag]` excerpt of what it actually
 * saw, so a future structural change to the page is diagnosable from the
 * Actions log instead of by guessing — the same pattern the NOAA, USDM and
 * permits fetchers used to find their real response shapes.
 */
import type { FetcherModule, Observation } from "../types";
import { AUSTIN_WATER_SOURCE, WATER_STAGES, type WaterStage } from "../../lib/municipal/config";

export interface WaterStageValue {
  stage: WaterStage;
  /** Which rule below established it, so a reading can be audited later. */
  strategy: string;
  /** The page we read it off, recorded per observation so a later change of
   * source is visible in the archive rather than silent. */
  sourceUrl: string;
}

/** Strips tags and collapses whitespace. We match against text, not markup, so
 * a class rename or a re-nesting does not by itself break the read. */
export function pageText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stage names as an alternation, longest first so "Conservation Stage" wins
 * over a bare "Stage" fragment and "Stage 1" cannot shadow it. */
const STAGE_ALT = [...WATER_STAGES]
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/\s+/g, "\\s+"))
  .join("|");

/**
 * Phrasings that name a stage the page is explicitly NOT in. Checked against
 * the text immediately before a match, and the single most important guard
 * here: "Austin moved out of Stage 2 on September 2" names Stage 2 in a
 * present-tense-looking sentence while meaning the opposite.
 */
const DEPARTURE = /(?:out of|exited?|exiting|leaving|left|lifted|ended|no longer in|dropped from|moved from)\s*(?:the\s+)?$/i;

/** Conditional or future phrasings — a stage that might apply later, not now. */
const HYPOTHETICAL = /(?:if|when|should|would|could|may|might|before|until|enters?|reaching|reach|trigger(?:s|ed)?\s+(?:by|at)?)\s*(?:we\s+|the\s+|austin\s+)?(?:water\s+)?$/i;

function canonical(raw: string): WaterStage | null {
  const flat = raw.replace(/\s+/g, " ").trim().toLowerCase();
  return WATER_STAGES.find((s) => s.toLowerCase() === flat) ?? null;
}

/** Distinct stages found by one regex, ignoring departure/hypothetical hits. */
function collect(text: string, pattern: RegExp): WaterStage[] {
  const out = new Set<WaterStage>();
  for (const m of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (DEPARTURE.test(before) || HYPOTHETICAL.test(before)) continue;
    const stage = canonical(m[1] ?? m[0]);
    if (stage) out.add(stage);
  }
  return [...out];
}

/** Strategy 1 — a present-tense cue within a short window of a stage name. */
const CUE_NEAR_STAGE = new RegExp(
  `(?:is|are|remains?|stays?|continues? in|currently|now|presently|returned to|back (?:in|to))` +
    `[^.;]{0,40}?\\b(${STAGE_ALT})\\b`,
  "gi",
);

/** Strategy 2 — an explicit "current stage" label. */
const CURRENT_LABEL = new RegExp(
  `current\\s+(?:drought\\s+|water\\s+use\\s+|watering\\s+)?(?:restriction\\s+)?stage` +
    `\\s*(?:is|:|-|–|—)?\\s*(${STAGE_ALT})\\b`,
  "gi",
);

/** Strategy 3 — the whole document names exactly one stage. */
const ANY_STAGE = new RegExp(`\\b(${STAGE_ALT})\\b`, "gi");

export interface StageExtraction {
  stage: WaterStage;
  strategy: string;
}

/**
 * Exported for the unit checks: given page text, return the single stage the
 * page states as current, or throw. Pure, so every failure mode is testable
 * without a network call.
 */
export function extractStage(text: string, diagnose = true): StageExtraction {
  const attempts: { name: string; pattern: RegExp }[] = [
    { name: "cue-near-stage", pattern: CUE_NEAR_STAGE },
    { name: "current-stage-label", pattern: CURRENT_LABEL },
    { name: "sole-stage-on-page", pattern: ANY_STAGE },
  ];

  const tried: string[] = [];
  for (const { name, pattern } of attempts) {
    const found = collect(text, pattern);
    tried.push(`${name}=${found.length === 0 ? "none" : found.join("/")}`);
    if (found.length === 1) return { stage: found[0], strategy: name };
    // More than one distinct stage from this rule means the rule cannot tell
    // them apart on this page. Fall through rather than pick.
  }

  if (diagnose) {
    // Bounded, so a failure is diagnosable from the Actions log without
    // dumping the page. Shows where each stage name actually appears.
    console.log(`[water-stage-diag] strategies: ${tried.join(" | ")}`);
    console.log(`[water-stage-diag] first 500 chars: ${text.slice(0, 500)}`);
    for (const stage of WATER_STAGES) {
      const at = text.toLowerCase().indexOf(stage.toLowerCase());
      if (at >= 0) {
        const ctx = text.slice(Math.max(0, at - 70), at + stage.length + 70);
        console.log(`[water-stage-diag] "${stage}" @${at}: …${ctx}…`);
      }
    }
  }

  throw new Error(
    `Austin Water page: could not isolate one current stage (${tried.join("; ")}) — see [water-stage-diag] lines`,
  );
}

export const austinWaterStage: FetcherModule<WaterStageValue> = {
  datasetId: "austin-water-stage",
  location: "austin",
  source: AUSTIN_WATER_SOURCE,
  requiredEnvVars: [],
  async fetchRaw(): Promise<Observation<WaterStageValue>[]> {
    const res = await fetch(AUSTIN_WATER_SOURCE.url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "TexasHomeIntelligence/1.0 (+https://texashomeintelligence.com)",
      },
    });
    if (!res.ok) {
      throw new Error(`Austin Water fetch failed: HTTP ${res.status}`);
    }
    const { stage, strategy } = extractStage(pageText(await res.text()));
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
        value: { stage, strategy, sourceUrl: AUSTIN_WATER_SOURCE.url },
      },
    ];
  },
};
