# 🔴 Site-side changes this article needs — PROPOSAL ONLY, NOT APPLIED

**Rule 0 boundary reached.** Publishing a THI article means writing files under `site/`, which is
outside `autoposter/`. The engine produced the article, verified its ledger, and asserted the
domain guard — then **stopped**, exactly as the boundary requires. Nothing under `site/` has been
created, edited, or staged. This file is the exact diff for you to approve.

## The finding that makes this bigger than one file

`PUBLISH-TARGET.thi.md` says *"confirm where articles live (e.g. `site/src/content/…`)"*. Confirmed
against the live repo: **THI has no article, blog, or analysis collection at all.**
`site/src/content.config.ts` defines five collections — `locations`, `services`,
`intakeQuestions`, `dataSources`, `faq` — and none of them holds long-form content. There is also
no `/analysis/` route.

So this is not "add a markdown file". It is a new content type on the live site, and it needs your
decision on three things before any of it is written.

## Three decisions for you

**1. URL shape.** The engine assumed `/analysis/<slug>/`. THI already uses `/data/<location>/<topic>/`
for data pages and `/methodology/` for method. `/analysis/` reads as the natural sibling and is
question-shaped content, but it is permanent once indexed — CLAUDE.md's "preserve URLs, 301 anything
that must move" makes this expensive to change later. Alternatives: `/reports/`, `/answers/`.
**Recommendation: `/analysis/`.**

**2. Where the file lives.** The repo's own convention is `site/src/data/<collection>/`, not
`site/src/content/` — every existing collection globs from `./src/data/…`. Mirroring the repo beats
mirroring the spec's example, so the proposal below uses **`site/src/data/analysis/*.md`**.

**3. Nav and sitemap.** An analysis hub is a new nav entry, and CLAUDE.md froze this build's nav at
`Data · Locations · My Dashboard`. **Recommendation: no nav change this round** — the article is
reachable from `/data/` and from social, and nav is a separate owner decision. It should be in the
sitemap (it is indexable, citable content), which needs no change since only noindexed routes are
excluded.

## The exact changes

Applied in this order. `article.md` in this folder is the finished article body; the frontmatter
below is what the collection schema would require.

1. **`site/src/content.config.ts`** — add an `analysis` collection whose schema mirrors the
   existing style (zod, one file per article, glob from `./src/data/analysis`):

```ts
const analysis = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/data/analysis" }),
  schema: z.object({
    title: z.string(),              // question-shaped H1 (ARTICLE-ENGINE.thi.md)
    description: z.string(),        // meta description; also the AI-extractable answer
    publishedAt: z.string(),        // ISO date
    updatedAt: z.string().optional(),
    metrics: z.array(z.string()),   // feed metrics the article's claims rest on
    sources: z.array(z.object({ name: z.string(), asOf: z.string() })),
    embed: z.object({ series: z.string(), caption: z.string() }).optional(),
  }),
});
// ... and add `analysis` to the exported `collections` object.
```

2. **`site/src/data/analysis/are-texas-electricity-prices-still-going-up.md`** — the article body
   from `article.md`, with the frontmatter above filled from `claim-ledger.md`.

3. **`site/src/pages/analysis/[slug].astro`** and **`site/src/pages/analysis/index.astro`** — the
   route and hub. The article page should reuse what already exists rather than inventing a layout:
   `Base.astro`, `Breadcrumbs.astro`, and `DataStatus.astro` for provenance, with the live-data
   embed rendered as a native `<table class="data-table">` inside `.table-scroll`, mirroring
   `layouts/DataSetPage.astro`. That keeps facts in served HTML (CLAUDE.md) and reuses the
   provenance component the rest of the site already uses.

4. **JSON-LD.** `DataSetPage.astro` already emits `isBasedOn` pointing at the dataset. The analysis
   page should do the same for each source in the frontmatter, which is what makes the page
   citable rather than merely readable.

## What is NOT in this proposal

- No nav change. No sitemap change (none needed). No `robots.txt` / `llms.txt` change (both already
  allow citation crawlers).
- No deploy. `main` auto-deploys to the live domain, so merging IS publishing — that stays your
  explicit command (THI `SECURITY.md`, and decision 4 of this round).
- No Facebook post. The promo draft is validated and **HELD**; it also cannot post until the article
  URL resolves, which the linked-piece gate enforces on its own.
