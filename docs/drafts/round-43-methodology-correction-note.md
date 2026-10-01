# Draft copy — the public correction note · Round 43

**Status: SHIPPED.** Approved by the owner with two changes, both applied, and now live in
`site/src/pages/methodology/index.astro`. Kept as the drafting record.

**The two changes:**

1. **The window was wrong.** This draft said *"23 August to 1 October 2026"* — the date the row
   was written. It did not render that day: the dataset was `status: sample`, and both
   `publishable()` and `latest()` withhold a sample dataset, so the data page did not exist and
   no page carried a reading. Verified window: **28 August to 1 October 2026**, first surface
   `/data/texas/electricity-prices/` and its CSV, on the day that page shipped (commit
   `af8b62f4`). The published note names both. Derivation in §9 of
   `docs/audits/round-43-seed-contamination.md`.
2. **The closing paragraph is cut**, with no replacement. The owner's reasoning, which is right:
   it reached for effect and it overclaimed — this was not found by the source-and-date
   discipline, it was found by a vintage probe noticing an odd row. The section ends on the test
   paragraph.

---

## Where it goes, and why there

`/methodology/` already has the question, and it is currently answered in a way the incident
disproves. The existing section reads:

> **Do you ever publish placeholder numbers?**
>
> No. Sources we have not connected yet are listed above as **Not yet connected** and carry no
> figures at all. Published data pages contain no placeholder rows: a page is only built once its
> feed has returned real records, and the fabricated rows used to bootstrap a dataset during
> development **are retired from it automatically the first time a real fetch succeeds.**

That last clause was not true for ten rows between 23 August and 1 October 2026. The retirement
ran on a flag those rows did not carry.

So this is **two changes, not one**: the existing answer needs its "automatically" qualified, and
the correction needs its own entry. Putting the record anywhere else would leave a page on the
site still making the claim the record retracts.

---

## Draft 1 · revision to the existing section

Replace the final clause of the existing paragraph and add one sentence. Changed text in bold.

> **Do you ever publish placeholder numbers?**
>
> No. Sources we have not connected yet are listed above as **Not yet connected** and carry no
> figures at all. Published data pages contain no placeholder rows: a page is only built once its
> feed has returned real records, and the fabricated rows used to bootstrap a dataset during
> development are retired from it the first time a real fetch succeeds. **That retirement failed
> once, in August 2026, and we published a figure that had never been measured — see below.**

---

## Draft 2 · the new section

Placed immediately after it, in the same question-shaped idiom as the rest of the page.

> **Have you ever published a number that was wrong?**
>
> Yes. Once, and this is the record of it.
>
> From 23 August to 1 October 2026, the Texas residential electricity price shown on this site —
> 13.88&cent; per kilowatt-hour, labelled August 2026 and sourced to the U.S. Energy Information
> Administration — was not a measured figure. It was a placeholder written while the dataset was
> being set up, which should have been discarded the first time the real feed succeeded and was
> not. The real series had stopped at 16.44&cent; in May 2026, and the placeholder sat on top of
> it, so the page also showed a LIVE badge over a feed that was four months stale.
>
> The figure reached the homepage, the Texas electricity price page and its downloadable CSV, both
> HVAC pages, the AC lifespan tool, and one analysis article. Because the placeholder values ran
> about 2.5&cent; below the real ones, the published series read as a sharp recent fall in prices.
> It was not one. **Texas residential electricity prices rose 6.3% over the ten months the real
> data covers, from 15.46&cent; in August 2025 to 16.44&cent; in May 2026.**
>
> What we have done about it:
>
> - **The placeholder rows are gone** — ten of them, across seven datasets. Every page listed above
>   now shows the real figure, and the electricity feed carries an **Out of date** badge, because
>   that is what it is.
> - **The article built on the figure has been withdrawn**, not corrected. Its central claim could
>   not be restated: the month it reported on does not exist in the data, and a ten-month series
>   cannot support the year-over-year comparison it led with. Its URL returns 410 Gone.
> - **The detection is now a test that runs on every build.** The old check tried to recognise a
>   placeholder by what it looked like, and these rows did not look like one. The new one
>   regenerates what the placeholder generator would have written and matches it exactly, so a
>   placeholder cannot reach a published page without failing the build. The test also proves
>   itself each run, by re-running the old check and confirming it still misses rows the new one
>   catches.
>
> The point of publishing a source and a date beside every reading is that a wrong number can be
> found and named. This one was found that way, and this is it named.

---

## Notes on the drafting choices

- **"Yes. Once, and this is the record of it."** The page's register is flat and factual
  throughout; an apology would be the only emotional sentence on it. The brand kit's instrument
  panel reads conditions, it does not express regret about them.
- **The corrected figure is in bold and stated positively** — "rose 6.3%" — rather than only as a
  negation of the wrong one. A reader who takes one sentence away should take the true number,
  not the false one.
- **The three bullets are what was done, not what was felt**, and each is checkable on the site:
  the badge, the 410, the test.
- **It names the figure, the dates, the surfaces and the real series.** A correction that says
  "an error occurred" is not a correction. This is also the most citable form — the page states a
  specific superseded value and its replacement.
- **It does not name the article in the body.** The withdrawal notice at the article's own URL
  carries its title and its reason; repeating it here would make the section read as being about
  one article rather than about the data error underneath it.
- **Length.** Longer than anything else on the page, and deliberately. It is the only section that
  has to survive someone arriving at it from outside, having seen the wrong number somewhere else.

---

## Still open, and not covered by this note

- **The Facebook post of 11 September 2026** carries the same figure on its card image and is
  still live. Outward-facing; not Claude's to remove.
- **`/images/og/are-texas-electricity-prices-still-going-up.png`** is a static asset and still
  returns **200** after the withdrawal — it is the card showing "13.88&cent;/kWh, down 10.2% year
  over year, Source: U.S. Energy Information Administration". Deleting it is a one-line change,
  but it is also the image the live Facebook post embeds, so the two decisions are the same
  decision.
- **The 410 page's own copy** (`src/pages/analysis/[...withdrawn].astro` and the `reason` string
  in `src/data/withdrawnArticles.ts`) is also copy, also drafted rather than approved, and is
  shipped only because the status code needs a body. Replace it in the same pass if the wording
  should differ.
