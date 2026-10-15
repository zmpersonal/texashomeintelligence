# Round 50 — two drafts for review. Nothing here has shipped.

The article copy is yours. Both drafts below are proposals with their figures locked to the
re-based data; the prose is for you to accept, rewrite or reject.

---

## 0 · First, the thing you told me not to assume: **the finding does not survive**

You asked me to recompute the section and say so if it doesn't carry. It doesn't — and it fails
in two places, not one.

**The solar section's claim inverts.** Published, for August 2026:

> "Solar. 224 solar permits in a single month, up 138% month over month — the largest month in the
> twelve we hold." · "Austin issued 224 solar permits in August 2026 — up 138% month over month,
> and 159% above its 11-month average. That is not a market cooling off."

Recomputed from permits that name solar, at the time of this correction:

| | published | recomputed |
|---|--:|--:|
| August 2026 solar permits | 224 | **80** |
| month over month | +138% | **+11.1%** |
| against its own 11-month average | **159% above** | **1.9% below** |
| rank in the window | "largest month in the twelve we hold" | **not the largest** — October 2025 had 156 |

Three figures change and the fourth reverses direction. "That is not a market cooling off" was
the section's whole point, and the recomputed month is marginally *below* its own pace.

> **A footnote, so the small discrepancies don't distract.** The article says "up 138%" and
> "1,037 HVAC permits"; recomputing August under v2 today gives +140.9% and 1,035. The article was
> published 11 September 2026, when August's filings were still arriving, and Austin's feed has
> since settled. Nothing material turns on it — the whole article, its table included, is a frozen
> snapshot in a content file rather than a live embed, so the re-base did not silently change
> anything a reader sees and will not until the copy is edited.

**The article's own verdict also inverts.** The piece answers its title — *Is Austin's
home-improvement boom actually cooling off?* — with a tally of how many trades are below their own
average. For August: published **1 of 3** (roofing only) → *"Mostly no"*. Recomputed **2 of 3**
(solar and roofing) → the builder's own next branch, *"More than you might think"*.

So this is not a section with a wrong number in it. The number was load-bearing for the section,
and the section was load-bearing for the article's answer. **My recommendation is to withdraw this
article rather than correct it**, on the same reasoning the electricity article was withdrawn:
its central claim cannot be restated, because the thing it reported as the surprise did not
happen. Two framings are drafted in §2 so you can take the other road if you'd rather.

**And the real story is better, which is the part worth not losing.** Austin battery-storage
permits, now their own category:

| 25-09 | 25-10 | 25-11 | 25-12 | 26-01 | 26-02 | 26-03 | 26-04 | 26-05 | 26-06 | 26-07 | 26-08 | 26-09 |
|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 34 | 36 | 32 | 18 | 6 | 9 | 5 | 10 | **4** | 13 | 29 | **146** | **188** |

Four in May, 188 in September. There is no builder for `energy_storage` yet, so the machine ranks
it third this week and cannot write it — that is the next round, not this one.

---

## 1 · Draft A — the `/methodology/` entry

Shorter than the electricity entry, in the shape of the permit-count one. Says plainly that this
is a classification error. Every figure anchored to the time of the correction.

Two edits to the surrounding page come with it: **"Yes. Twice, and these are the records of
them."** becomes **"Yes. Three times, and these are the records of them."**, and the heading above
it stays as it is.

```html
<h3>11 September &ndash; 15 October 2026 &mdash; Austin "solar" permits counted battery storage</h3>
<p>
  Until 15 October 2026, the Austin solar permit counts on this site included battery-storage
  installations. Austin files both under one work class, <em>Auxiliary Power</em>, which we read as
  solar; through June 2026 that was true of about 95% of them, and from July it was not. The
  figures were real and sourced, and every one of them was a permit the city issued. We put them
  in the wrong category.
</p>
<p>
  It mattered on one page: the analysis article
  <em>Is Austin's home-improvement boom actually cooling off?</em>, published 11 September 2026,
  which reported <strong>224 solar permits in August 2026, up 138% month over month and 159% above
  that trade's 11-month average</strong>, and called it the largest solar month in the twelve we
  held. Counting only permits that describe solar, photovoltaic or PV work, August 2026 had
  <strong>80</strong>, up <strong>11.1%</strong> month over month and <strong>1.9% below</strong>
  its own 11-month average &mdash; and it was not the largest month in the window, which at the
  time of this correction was October 2025 at 156. <strong>There was no solar surge in Austin in
  August 2026.</strong> What rose was battery storage: 4 permits in May 2026, 29 in July, 146 in
  August and 188 in September, at the time of this correction.
</p>
<p>What we have done about it:</p>
<ul class="key-findings">
  <li>
    <strong>Storage is its own category now</strong>, and the work class alone no longer decides a
    trade &mdash; the permit's own description does. Austin's solar series was recounted for every
    month we hold and is lower throughout: 2.2% to 8.9% lower before July 2026, 22.6% lower in
    July, 64.3% in August and 74.2% in September.
  </li>
  <li>
    <strong>The article has been withdrawn</strong> rather than corrected. Its central claim could
    not be restated: the surprise it reported did not happen, and recounting the month reverses the
    article's own answer to its own question. Its URL returns 410 Gone.
  </li>
  <li>
    <strong>San Antonio is unaffected.</strong> That city files solar under a permit type that
    names photovoltaic work explicitly, so its solar counts never contained storage.
  </li>
</ul>
```

> **One decision inside the draft.** The third bullet's "withdrawn ... 410 Gone" is written for the
> withdrawal road. If you take the rewrite road instead, it becomes *"The article has been
> corrected"* and the sentence after it has to change too. I have not written both into the HTML
> because the two are mutually exclusive and the choice is yours.

---

## 2 · Draft B — the article

### B1 · The withdrawal road (my recommendation)

Nothing to write for the section. The piece comes down, its URL returns 410 Gone like the
electricity article's, and the methodology entry above is the public record. The storage story
gets told properly when it has a builder.

### B2 · The rewrite road, if you'd rather keep the piece

Then it is a different article with the same title, because the answer changes. The two sections
that carry the reversal, drafted:

**The verdict, replacing "Mostly no":**

> **More than you might think** — 2 of 3 trades below their own average.

**Replacing the section currently headed "The one nobody expected":**

> ### The one that was never there
>
> Austin issued 80 solar permits in August 2026, up 11.1% from July and 1.9% below the trade's own
> 11-month average (City of Austin Issued Construction Permits (Socrata), as of August 2026). That
> is an ordinary month.
>
> We previously reported 224, and a 138% jump. That figure counted battery-storage installations as
> solar: Austin files both under one work class, and from July 2026 storage came to dominate it.
> The correction is recorded on our [methodology page](/methodology/).
>
> The thing that did move is storage itself. Austin issued 146 battery-storage permits in August
> 2026 against 4 in May (City of Austin Issued Construction Permits (Socrata), as of August 2026)
> — and that is a different question from whether the remodel boom is cooling, so this article
> does not answer it.

> **Why I'd still not take this road.** The article's title asks whether the boom is cooling and
> its recomputed answer is closer to *yes* than the published *mostly no*. Rewriting the spine of
> a live, indexed piece to the opposite conclusion while keeping its URL and title is a harder
> thing to defend than withdrawing it, and the citation value of a corrected-but-reversed article
> is not obviously positive.

---

## 3 · What I have not done

- **Not shipped either draft.** No article file touched, no methodology edit applied.
- **Not withdrawn the article.** A 410 is a live-domain change and it needs your word.
- **Not built an `energy_storage` builder.** The category exists and ranks third in the feed;
  nothing can write it yet, which means the machine cannot publish a storage claim by accident.
- **Not touched the San Antonio article**, whose solar figure was never wrong. Its seven-row trade
  table still invites a sum nothing supports — that is the additivity item, separate from this.
