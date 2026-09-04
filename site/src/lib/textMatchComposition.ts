/**
 * What a TEXT-MATCHED permit count actually contains.
 *
 * ── WHY THIS IS A MODULE AND NOT A SENTENCE IN THE CONTENT CONFIG ─────────
 * Austin publishes no roofing permit class. Its roofing count is therefore
 * assembled by matching the word "roof" against the permit description, and
 * a text match picks up whatever happens to share a word: rooftop solar,
 * rooftop HVAC change-outs, an electrical mast passing through a roof, and —
 * measured, not hypothesised — a sign permit for a business called Hargrove
 * Roofing. A page that published the total without saying that would be
 * publishing roof-related construction activity under the name of roof
 * replacement volume.
 *
 * So the page says it, in #answer, where the figure is. And it says it with
 * COUNTED shares rather than adjectives: "mostly solar" is an impression,
 * "633 of 1,945 descriptions mention solar" is a measurement. Every number
 * below is computed at build time from `src/data/generated/**`; nothing here
 * or in `data/belowHero.ts` states one.
 *
 * ── WHY THE SECOND MEASUREMENT USES A DIFFERENT DENOMINATOR ───────────────
 * The composition is measured on `municipal-permits/austin` — the per-permit
 * archive behind `/data/austin/roof-permits/` — because that file is the only
 * one carrying description text. `permit-trade-activity` stores monthly
 * aggregates, which is what the count is, and aggregates cannot be re-read for
 * wording. The two windows differ, so the sentence names the archive rather
 * than implying the shares were measured on the count itself.
 *
 * The two regexes are IMPORTED, never re-typed. `RE_ROOF_TEXT` is the same
 * predicate `/data/austin/roof-permits/` publishes its "explicitly describes
 * replacing a roof covering" share from, and `AUSTIN_SOLAR_TEXT` is the same
 * one the trade classifier uses to build the solar category. Two of our own
 * pages disagreeing about one fact is the citation liability this whole layer
 * exists to avoid, and copying a regex is how that starts.
 */
import { findDataset } from "./datasets";
import { AUSTIN_SOLAR_TEXT } from "../ingest/tradeCategories";
import { RE_ROOF_TEXT } from "./dataPages/permits";
import type { TradeActivity } from "./tradeActivity";

interface PermitRow {
  workDescription?: string;
}

type Composer = (a: TradeActivity) => string[] | undefined;

const COMPOSERS: Record<string, Composer> = {
  "austin-roof-text-match": () => {
    const dataset = findDataset<PermitRow>("municipal-permits", "austin");
    if (!dataset || dataset.status === "sample") return undefined;
    const rows = dataset.observations.filter((o) => !o.seed);
    if (rows.length === 0) return undefined;

    const solar = rows.filter((o) => AUSTIN_SOLAR_TEXT.test(o.value.workDescription ?? "")).length;
    const explicit = rows.filter((o) => RE_ROOF_TEXT.test(o.value.workDescription ?? "")).length;
    const n = rows.length;
    const share = (x: number) => `${Math.round((x / n) * 100)}%`;

    return [
      `What that sweeps in is measured, not guessed at. Across the ${n.toLocaleString()} ` +
        `roof-matched permits in the archive behind our own Austin roof-permit page, ` +
        `${solar.toLocaleString()} descriptions — ${share(solar)} — mention solar, photovoltaic ` +
        `or PV, and ${explicit.toLocaleString()} — ${share(explicit)} — use wording that ` +
        `explicitly describes replacing a roof covering. Rooftop solar is the single largest ` +
        `contributor to the total.`,
      `Read this as roof-related construction activity, which is what it measures, rather than ` +
        `as roof replacement volume, which it is broader than. Treat the replacement share as a ` +
        `floor: some jobs describe a replacement in phrasing the match does not catch. And do not ` +
        `set this total against another Texas city's roofing count. A city that publishes a ` +
        `dedicated re-roof permit type is measuring something narrower by a different mechanism, ` +
        `so the difference between the two numbers would be a fact about permit vocabularies ` +
        `rather than about roofs.`,
    ];
  },
};

export function textMatchComposition(topic: string, a: TradeActivity): string[] | undefined {
  return COMPOSERS[topic]?.(a);
}
