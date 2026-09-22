/**
 * The analysis layer's shared reads: the published list, the date line, and
 * the link from an article to the data page behind its series.
 *
 * ── WHY A MODULE RATHER THAN TWO COPIES ───────────────────────────────────
 * The hub and the article route both need "the published articles, newest
 * first". They had that filter written out twice already; adding the key
 * figure, the date line and the related-reading block to both would have made
 * it four copies of one rule. The `published === true` filter in particular is
 * the deploy-on-command gate, and a gate implemented twice is a gate that can
 * disagree with itself.
 *
 * ── NOTHING HERE COMPUTES A FIGURE ────────────────────────────────────────
 * Every value this module returns is a string the article already stores —
 * frontmatter, or the `card` block the autoposter writes and the ledger
 * verifies. There is no arithmetic in this file on purpose: a percentage
 * re-derived at render time would be a second implementation of the article's
 * own arithmetic, and the first disagreement would put a figure on the page
 * that contradicts the sentence beside it.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { formatDate, isIsoLike, machineDate } from "./format";
import { dataPageLink } from "./dataPages";

export type Article = CollectionEntry<"analysis">;

/**
 * Published articles, newest first.
 *
 * The `published === true` filter is the deploy-on-command gate: an
 * unpublished article has no route, so it must not appear in a hub list, a
 * related-reading block, or a schema item list either.
 */
export async function publishedArticles(): Promise<Article[]> {
  const articles = await getCollection("analysis", ({ data }) => data.published === true);
  return articles.sort((a, b) => b.data.publishedAt.localeCompare(a.data.publishedAt));
}

/** Other published articles, newest first — the "More analysis" block. */
export async function otherArticles(currentId: string, limit = 3): Promise<Article[]> {
  return (await publishedArticles()).filter((a) => a.id !== currentId).slice(0, limit);
}

/**
 * An `asOf` value rendered for a reader, honestly.
 *
 * The collection stores two different kinds of thing in this one field, and
 * they must not be shown the same way. `"2026-08-01"` is a date and reads
 * better as "Aug 1, 2026". `"1991-2020"` is a NORMALS PERIOD — the thirty
 * years NOAA averages to define "normal" — and is not a date at all. Passing
 * it through a date formatter would either fail or, worse, silently render
 * some single day in 1991 as though the figure were measured then.
 *
 * So: format what is a date, pass through what is not, and never guess.
 */
export function asOfDisplay(value: string): string {
  return isIsoLike(value) ? formatDate(value) : value;
}

/** `datetime` for an `asOf`, or undefined when the value is not a date. */
export function asOfDatetime(value: string): string | undefined {
  return isIsoLike(value) ? articleDatetime(value) : undefined;
}

/**
 * The `datetime` attribute for a date the collection stores date-only.
 *
 * `machineDate()` normalises through `Date.toISOString()`, which turns
 * "2026-09-18" into "2026-09-18T00:00:00.000Z". That is a valid timestamp and
 * the wrong fact: it asserts midnight UTC, which a consumer rendering in local
 * time shows as September 17 across the Americas — a published date one day
 * earlier than the one the article states. The thirteen other callers of
 * `machineDate` pass real timestamps (`lastSuccessAt`, `observedAt`) where the
 * time component is genuine, so this stays local rather than changing that
 * helper underneath them.
 *
 * A date-only value in, the same date-only value out. Anything carrying an
 * actual time falls through to the shared helper.
 */
export function articleDatetime(value: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return machineDate(value);
}

/**
 * The data page behind an article's `embed.series`, when one is published.
 *
 * `series` is "<datasetId>/<location>" — the two arguments `findDataset()`
 * takes. The data pages are registered with those same two fields, so the link
 * is a lookup in that registry rather than a URL assembled from the slug.
 *
 * Round 31 wrote that lookup here; Round 32 moved it to `dataPageLink()` in
 * the registry, where the readings layer and this one share it. The rule it
 * enforces is unchanged: a spec whose dataset is not publishable builds no
 * route, and a link to a page that does not exist is worse than no link.
 */
export function dataPageFor(series: string | undefined):
  | { href: string; label: string }
  | undefined {
  if (!series) return undefined;
  const [datasetId, location] = series.split("/");
  if (!datasetId || !location) return undefined;
  return dataPageLink(datasetId, location);
}
