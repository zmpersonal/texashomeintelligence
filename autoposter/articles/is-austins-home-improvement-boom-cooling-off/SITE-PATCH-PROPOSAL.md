# 🔴 Site changes post #2 needs — PROPOSAL ONLY, NOT APPLIED

Article 2 is written, its ledger verifies, its card is built and previewed. Publishing it means
writing under `site/`, which is outside `autoposter/`. Nothing there has been created or staged.

## The five paths

| # | Path | Change |
|---|---|---|
| 1 | `site/src/data/analysis/is-austins-home-improvement-boom-cooling-off.md` | NEW — the article (in this folder as `article.md`) |
| 2 | `site/src/data/og-cards/is-austins-home-improvement-boom-cooling-off.json` | NEW — generated |
| 3 | `site/public/images/og/is-austins-home-improvement-boom-cooling-off.png` | NEW — generated |
| 4 | `site/scripts/generate-og-cards.mjs` | EDIT — two changes below |
| 5 | *(none)* | no layout, config, nav or dependency change |

## Change 4a — the source map gains the two city permit records

```diff
 const SOURCE_FULL = {
   EIA: "U.S. Energy Information Administration",
   NOAA: "NOAA National Centers for Environmental Information",
+  "City of Austin": "City of Austin Issued Construction Permits (Socrata)",
+  "City of San Antonio": "City of San Antonio Permits Open Data",
 };
```

The label names the CITY, not the dataset: Socrata is the platform the record is served on, not
an authority, and putting a vendor in the source slot credits the wrong party. `autoposter`'s
`card.SOURCE_SHORT` already carries the inverse, and a test fails if the two ever disagree.

## Change 4b — shrink-to-fit, because the template only ever held one article

The generator **refused to render this card**, correctly:

```
[x] is-austins-home-improvement-boom-cooling-off: content overflows the 1200x630 card
```

Two fixed sizes were tuned against one article. `"13.88¢/kWh"` fits at 150px; `"224 solar
permits"` does not, and wraps to two lines, which stops it reading as a single figure. The
question is longer too. Both now scale to fit:

```diff
-.question{...font-size:52px;...max-width:17ch;...}
-.hero{...font-size:150px;...}
+:root{--q:52px;--h:150px}
+.question{...font-size:var(--q);...max-width:20ch;...}
+.hero{...font-size:var(--h);...white-space:nowrap}
```

plus a fit pass before the screenshot: scale the hero to one line within the available width
(floor 84px), then step the question down through 52/48/44/40/36/32 until the card fits. The
overflow guard stays exactly as it is — it is what caught this, and it still fails anything the
fit pass cannot resolve.

**This is a template fix, not a one-article patch.** Every future article has a different
question and a different figure; without it the generator refuses roughly whenever the hero is
longer than a price.

## What was checked, not assumed

- **No `embed:` on this article, deliberately.** The site's permit dataset is
  `municipal-permits/austin` and its observations are individual permit records whose `value` is
  an object, not a monthly count. The embed template renders a two-column numeric table, so
  pointing it there would render an empty receipts table under a sourced article — the first
  article's exact failure (L9/L10). The three-trade table in the body carries the figures as real
  HTML, which is what the rule requires.
- **Austin against Austin only.** Every claim compares Austin to its own preceding eleven months.
  No cross-metro permit comparison, no cost figure anywhere — both asserted by tests.

## Order

1. Apply 4a and 4b.
2. Add the article with `published: false`.
3. Run `npm run og-cards` — it generates 2 and 3.
4. Read the built HTML for the article (render-side verification, not the build log).
5. Flip `published: true` when you want it live. Post #2 stages only after that, because the
   promo's card gate reads the sidecar the renderer wrote.
