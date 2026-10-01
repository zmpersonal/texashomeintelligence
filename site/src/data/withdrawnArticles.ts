/**
 * Articles that were published and have been taken down.
 *
 * ── WHY A REGISTRY RATHER THAN JUST DELETING THE PAGE
 *
 * Setting `published: false` in an article's frontmatter removes its route, its
 * sitemap entry and every internal link to it — `getStaticPaths` filters on that
 * field, so an unpublished article cannot be reached or indexed by accident.
 * What it does NOT do is say anything about the URL. Measured on the built
 * worker, the withdrawn URL returns **404**, byte-for-byte the same answer as a
 * slug that never existed.
 *
 * That is not what happened. The page existed, it was indexed, it was linked,
 * and we removed it. **410 Gone** is the status for exactly that, and the
 * difference is not pedantry: a 404 tells a crawler "try again later, this may
 * come back", while a 410 tells it the resource is deliberately and permanently
 * gone, which is what we mean and what gets the URL dropped from an index
 * fastest.
 *
 * For a site whose whole proposition is that every reading shows its source,
 * answering "never existed" about a page we retracted would be the small
 * dishonesty version of the thing being retracted.
 *
 * ── WHAT BELONGS HERE
 *
 * Only a slug that was genuinely published and is genuinely gone for good. Not
 * a draft that never shipped (it has no URL to be gone from), and not a page
 * that moved — that is a 301, and `CLAUDE.md`'s "301 anything that must move"
 * rule still governs. A withdrawal is a retraction, not a relocation.
 *
 * Entries are permanent. Removing one silently turns a 410 back into a 404 and
 * loses the public record of the correction.
 */

export interface WithdrawnArticle {
  /** The article's slug, matching the file in `src/data/analysis/`. */
  slug: string;
  /** The title it carried while it was published, so the notice can name it. */
  title: string;
  /** ISO date it was first published. */
  publishedAt: string;
  /** ISO date it was withdrawn. */
  withdrawnAt: string;
  /** One sentence, in plain language, on why. This is what a reader gets. */
  reason: string;
}

export const WITHDRAWN_ARTICLES = [
  {
    slug: "are-texas-electricity-prices-still-going-up",
    title: "Are Texas electricity prices still going up?",
    publishedAt: "2026-09-11",
    withdrawnAt: "2026-10-01",
    reason:
      "Its figures were computed from placeholder rows that had been mistaken for a " +
      "real feed, so the price it reported was never measured. The underlying error is " +
      "fixed and the article is not being corrected, because the real series does not " +
      "support the question it asked.",
  },
] as const satisfies readonly WithdrawnArticle[];

/** The slugs, as a type — so a typo in a lookup is a compile error. */
export type WithdrawnSlug = (typeof WITHDRAWN_ARTICLES)[number]["slug"];

/** The registry entry for a slug, or undefined when it is not a withdrawal. */
export function withdrawnArticle(slug: string): WithdrawnArticle | undefined {
  return WITHDRAWN_ARTICLES.find((a) => a.slug === slug);
}
