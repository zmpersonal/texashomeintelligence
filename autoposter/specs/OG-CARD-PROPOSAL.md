# 🔴 Per-article OG card — PROPOSAL ONLY, NOTHING BUILT

Post #1's link preview pulled the sitewide logo card. Not broken, not a placeholder — the
article simply has no card of its own, so the default filled in. For a brand whose pitch is
"we show the receipts," a logo in the one slot that decides the click is the wrong artifact.

This is the exact approach and the exact diff. **No `site/` file has been created, edited or
staged.** Nothing here is applied until you say so.

---

## 1. The approach, in this repo's terms

### What already exists (checked, not assumed)

| Thing | Where | Why it decides the design |
|---|---|---|
| Generated images are **committed**, not built | `site/scripts/generate-icons.mjs` → `public/` | Its own comment: outputs are committed "so the build itself stays free of an image-processing step." The drought map does the same into `public/images/drought/`. |
| Chromium is **already wired** | `site/scripts/replays/browser.mjs`, `playwright` pinned at 1.62.1 | Resolution order, the sandbox path, and the "browser binary isn't in `npm ci`" message already exist. A card renderer reuses `launchChromium()` and adds no new browser logic. |
| Site output is **static** | `astro.config.mjs`, `output: "static"` | No SSR route needed and none wanted: an on-demand `/og.png` endpoint would put image rendering on the serving path, which COST.md rules out. |
| Fonts are **self-hosted woff2** | `site/public/fonts/*.woff2` | Chromium can load the real brand faces from disk. A librsvg/sharp path cannot — it goes through fontconfig and would silently substitute. |
| `imageService: "compile"` | `astro.config.mjs` | Only touches `src/` assets. Cards in `public/` bypass it entirely, which is what the icons script's comment says to do. |

### The decision

**A generator script, run at authoring time, output committed. Chromium renders an HTML
template to a 1200×630 PNG.** Not a dedicated route, not a runtime library, not satori/resvg.

Three reasons, in order: it is the convention the repo already states for generated images;
it adds **zero dependencies** (ask-first under SECURITY.md — nothing to ask for); and it is the
only option that renders the actual brand faces rather than a fontconfig guess.

### Where the numbers come from

The article's own frontmatter, emitted by the article engine from the claim ledger. The site
renders figures it is given; it never re-derives them. Re-computing "down 10.2% YoY" in the
renderer would be a second implementation of the same arithmetic, and the first time the two
disagreed the card would contradict the article it links to.

```
claim ledger (C1, C2)  ->  frontmatter `card:`  ->  renderer  ->  PNG + sidecar  ->  og:image
        ^                                                                              |
        +-------------- gate: every numeral on the card is ledger-backed --------------+
```

### Two generated artifacts per article

* `site/public/images/og/<slug>.png` — the card. Served verbatim, stable URL.
* `site/src/data/og-cards/<slug>.json` — the exact strings rendered, plus dimensions.

The sidecar exists so the page can know a card exists **without `node:fs` in a route** (one
`import.meta.glob`, works the same if the route ever goes SSR), and so a gate can verify what
is on the card's face without parsing a PNG.

---

## 2. The exact 🔴 scope

Eight files under `site/`. **Nothing else outside `autoposter/`.** No `global.css`, no nav, no
`astro.config.mjs`, no dependency, no `.github/`.

| # | File | Change |
|---|---|---|
| 1 | `site/src/layouts/Base.astro` | +1 optional prop, 4 lines changed |
| 2 | `site/src/pages/analysis/[slug].astro` | +3 lines |
| 3 | `site/src/content.config.ts` | +1 optional `card` object on the `analysis` schema |
| 4 | `site/package.json` | +1 script line |
| 5 | `site/scripts/generate-og-cards.mjs` | NEW, ~150 lines |
| 6 | `site/public/images/og/<slug>.png` | NEW, generated |
| 7 | `site/src/data/og-cards/<slug>.json` | NEW, generated |
| 8 | `site/src/data/analysis/<slug>.md` | +6 frontmatter lines |

### 1. `Base.astro`

```diff
   article?: { ... };
+  /** Per-page social card. Omit and the sitewide card is used: a page must never
+   * fail to render, or render worse, because its card is missing. */
+  ogImage?: { path: string; width: number; height: number; alt: string };
 }

-const { title, description, noindex = false, article } = Astro.props;
+const { title, description, noindex = false, article, ogImage } = Astro.props;
```

```diff
-// TODO(round: share cards): replace with a purpose-built card from the
-// share-card system (brand kit §10), which can carry a live reading.
+// The sitewide DEFAULT. Pages that have a purpose-built card (brand kit §10)
+// pass one as `ogImage`; this is the fallback, and the only card most pages need.
 const OG_IMAGE = { path: "/images/og-card.jpg", width: 1200, height: 630 };
-const ogImageUrl = absolute(OG_IMAGE.path, Astro.site);
+const card = ogImage ?? OG_IMAGE;
+const ogImageUrl = absolute(card.path, Astro.site);
+const ogImageAlt = ogImage?.alt ?? `${siteName} — live, sourced local data for Texas homeowners`;
```

```diff
-    <meta property="og:image:width" content={String(OG_IMAGE.width)} />
-    <meta property="og:image:height" content={String(OG_IMAGE.height)} />
-    <meta property="og:image:alt" content={`${siteName} — live, sourced local data for Texas homeowners`} />
+    <meta property="og:image:width" content={String(card.width)} />
+    <meta property="og:image:height" content={String(card.height)} />
+    <meta property="og:image:alt" content={ogImageAlt} />
```

The constant keeps the name `OG_IMAGE` deliberately: `autoposter/tests/test_hardening.py`
reads it to detect drift between the site's declared path and the autoposter's config. Renaming
it is fine, but it is a two-file change, not a one-file change.

### 2. `analysis/[slug].astro`

```diff
 const { entry } = Astro.props as { entry: CollectionEntry<"analysis"> };

+// The per-article card, if one has been generated. A missing sidecar is normal
+// and silent: Base falls back to the sitewide card. `import.meta.glob` rather
+// than node:fs so the route stays free of build-only APIs.
+const OG_CARDS = import.meta.glob<{ default: { path: string; width: number; height: number; alt: string } }>(
+  "../../data/og-cards/*.json", { eager: true });
+const ogImage = OG_CARDS[`../../data/og-cards/${entry.id}.json`]?.default;
```

```diff
-<Base title={title} description={description} article={{ ... }}>
+<Base title={title} description={description} ogImage={ogImage} article={{ ... }}>
```

### 3. `content.config.ts` — add to the `analysis` schema

```diff
     embed: z.object({ series: z.string(), caption: z.string() }).optional(),
+    // The social card's face. Optional: an article without one falls back to
+    // the sitewide card. Every figure here traces to a ledger claim — the card
+    // states the article's numbers, it does not compute its own.
+    card: z.object({
+      question: z.string(),   // the H1, verbatim
+      headline: z.string(),   // the hero figure, e.g. "13.88¢/kWh"
+      subhead: z.string(),    // the movement, e.g. "down 10.2% year over year"
+      source: z.string(),     // short label, e.g. "EIA"
+      asOf: z.string(),       // e.g. "Aug 2026"
+    }).optional(),
```

### 4. `package.json`

```diff
     "icons": "node scripts/generate-icons.mjs",
+    "og-cards": "node scripts/generate-og-cards.mjs",
```

### 5. `scripts/generate-og-cards.mjs` — shape

```js
import { launchChromium } from "./replays/browser.mjs";   // the repo's own resolver

// For each src/data/analysis/*.md with a `card:` block:
//   1. build the HTML template (below), fonts via file:// @font-face
//   2. await document.fonts.ready AND assert each face actually loaded —
//      a card silently set in a fallback face is the L9 failure again
//   3. page.screenshot({ clip: 1200x630 }) -> public/images/og/<slug>.png
//   4. write src/data/og-cards/<slug>.json with the exact strings rendered
// A missing required field is a hard exit(1) with nothing written. No partial card.
```

Card face, on Depth Navy `#081A31` (brand kit §5, "dark intelligence surface"):

```
┌──────────────────────────────────────────────────────────┐
│  ▪ TEXAS HOME INTELLIGENCE            (mark + wordmark)  │
│                                                          │
│  Are Texas electricity prices          Newsreader 500,   │
│  still going up?                       #E8EDF4, ~56px    │
│                                                          │
│  13.88¢/kWh                            Plex Mono 500,    │
│  ──                                    ~132px, tnum      │
│  down 10.2% year over year             amber rule        │
│                                                          │
│  EIA · Aug 2026                        Plex Mono, #9FB0C4│
└──────────────────────────────────────────────────────────┘
```

Type and colour per brand kit §5–6: Newsreader for the editorial headline, Plex Mono for the
numeral (`tnum`, leading 1.0), amber as a rule rather than as text, `#9FB0C4` for the source
line. One accent element, per the palette's 3% rule.

### 6–8. Generated + frontmatter

```diff
 embed:
   series: "eia-electricity/texas"
   caption: "Texas residential electricity price, cents per kilowatt-hour, by month"
+card:
+  question: "Are Texas electricity prices still going up?"
+  headline: "13.88¢/kWh"
+  subhead: "down 10.2% year over year"
+  source: "EIA"
+  asOf: "Aug 2026"
```

Every value traces: `13.88¢/kWh` is C1, `down 10.2% year over year` is C2, and the source and
date are C1's. `EIA` is an abbreviation of a declared `sources[]` entry — handled by a code-held
map, never by the model, with a test that every abbreviation resolves to a declared source.

---

## 3. Minimum vs. full

### Minimum — one card, this article, see it render

Everything in §2, with the renderer knowing exactly one card layout and the `card:` block
hand-written this once from the ledger. Roughly 150 lines of new code plus the eight files.

You get a real PNG to look at before any of it generalizes. What it does **not** do: teach the
article engine to emit `card:`, gate on the card, or handle a second layout. Those stay manual
for one article, which is survivable precisely because it is one article.

### Full — the templated system

1. **Engine emits `card:`** from the claim ledger: hero = the lead claim's figure, subhead =
   the movement claim, source and `asOf` from the same claim. Zero hand-work per article.
2. **A gate.** Publishing refuses an article whose sidecar is missing, whose strings don't match
   the frontmatter, or whose card numerals aren't ledger-backed. The last one is not new logic —
   it is `claim_ledger.verify_prose` pointed at the card's face, the same check the prose gets.
3. **`build_facebook_promo` derives the card** per article (`/images/og/<slug>.png`) instead of
   the sitewide default, falling back when there is none. The existing media gate then resolves
   the real card, so a broken card blocks the post.
4. **A second layout** when an article needs one. `card_kind` is already vocabulary the
   validator speaks (`reveal`, comparison, ranking).

**Recommended order: minimum first.** The card's typography is the part most likely to need a
second look, and it is cheaper to judge from a rendered PNG than from a spec. Steps 1–3 are
where the L14 lesson applies, and they are worth doing deliberately rather than in the same
round as a visual decision.

---

## 4. How it degrades

The card is one optional prop on a layout. Nothing in the article route reads it, computes from
it, or fails without it.

| Failure | What happens | Acceptable? |
|---|---|---|
| Renderer crashes / Chromium missing | Exits non-zero, writes nothing. No sidecar, no partial PNG. Site build never ran it. | Yes — build and page unaffected |
| Sidecar absent (never generated) | `ogImage` is `undefined`, Base uses the sitewide logo card | Yes — today's behaviour, exactly |
| Fonts fail to load in the renderer | Renderer **aborts** rather than screenshotting a card set in Arial | Yes — the whole point of asserting `document.fonts` |
| Card frontmatter malformed | Zod rejects at build with a named error | Yes — loud, at authoring time |
| PNG deleted, sidecar kept | `og:image` 404s; the **page still renders**. The autoposter's media gate resolves that exact URL and refuses to post. | Tolerable — surfaces as a blocked post, never a bad post |

**The page cannot break.** The worst reachable state is the logo card we have today.

One thing that does not degrade gracefully and is worth knowing: **Facebook caches an OG image
hard per URL.** Regenerating a card after a post is live will not update that post's preview.
The card has to be right before the post goes out, which is the gate's job in the full version.

---

## Open questions for you

1. **Minimum first, or straight to the full system?** Recommendation: minimum, then the engine
   and the gate in a following round.
2. **`EIA · Aug 2026` vs the full source name on the card.** The full name is
   "U.S. Energy Information Administration" — accurate, and roughly unreadable at card scale.
   Recommendation: short label on the face, full name in the `og:image:alt` text and in the
   article, abbreviation map held in code.
3. **The mark on the card.** Brand kit §8 specifies a stacked lockup for share cards; the repo
   has a horizontal one. Recommendation: horizontal, small, top-left — a card whose job is to
   show a number should not spend its top third on a logo.
