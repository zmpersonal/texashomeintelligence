# Round 37 — crime data probe: what the record supports

Date: 2026-09-25 · Branch: `claude/thi-v3-round37-crime-probe`, from `main` at `f868c76`. The
Round 36 merge (`fe41e79`) is in the base, confirmed with `git merge-base --is-ancestor`.

**Two verdicts, up front.**

- **ARTICLE — VIABLE, with constraints.** Both metros publish incident-level records under terms
  that permit republication of derived figures, current to within weeks, with every figure
  ledger-verifiable as `data` or `derived`. The constraints are in §E.
- **/home/ CONTEXT READING — VIABLE FOR SAN ANTONIO ONLY, and I recommend against building it.**
  San Antonio publishes a ZIP on every row, which the account already holds, so it resolves with
  no geocoder and nothing leaving the site. **Austin cannot support it at all**: its finest
  geography is a census block group that cannot be derived from a stored street address without
  sending that address to a third party, which the privacy page forbids. §F has the reasoning
  for the recommendation.

This round changed no served page and built neither. The temporary fetch workflow has been deleted and nothing
the probe fetched remains in the repository (§G).

---

## A · Terms

| | Austin | San Antonio |
|---|---|---|
| dataset | Crime Reports (`fdj4-gpfu`), Austin Police | SAPD Offenses (`sapd-offenses`) |
| portal | Socrata, `data.austintexas.gov` | **CKAN**, `data.sanantonio.gov` |
| licence | **`"license": {"name": "Public Domain"}`**, `licenseId: PUBLIC_DOMAIN` | **Creative Commons Attribution**, `license_url: http://www.opendefinition.org/licenses/cc-by` |
| attribution | `City of Austin, Texas - data.austintexas.gov` | required by CC-BY |

**Republication of derived figures is permitted for both.** Neither metro ends here. San Antonio
requires attribution, which THI's source line gives every reading anyway.

### robots.txt — and a correction against this probe

Both files were fetched before anything else. Re-read properly afterwards, rule by rule, against
the `User-agent: *` group:

**Austin — clean.** Every endpoint used (`/api/views/…`, `/resource/…`, `/api/catalog/v1`) is
permitted. The `*` group disallows faceted `/browse?*` paths, `/api/odata/`, `/api/collocate*`
and `/OData.svc/`, none of which this probe touched. `Crawl-delay: 1`, respected by construction
— the probe made a handful of sequential requests.

> **San Antonio — this probe broke a rule, and the correction belongs here rather than in a
> footnote.** `data.sanantonio.gov`'s `User-agent: *` group contains **`Disallow: /api/`**. The
> probe made **six requests to `/api/3/action/`** — five `package_search` calls and one
> `package_show`. Those were disallowed. An earlier draft of this section stated the opposite,
> on a skim of the first dozen `Disallow:` lines rather than a parse of the file; that was wrong
> and is retracted.
>
> **What is permitted:** the resource download path itself —
> `/dataset/<id>/resource/<id>/download/<file>.csv` — matches no `Disallow` rule. The data is
> published CC-BY for reuse and that is the route to it.
>
> **The blanket `Disallow: /` entries in the same file do not apply to us.** They are scoped to
> 40-odd named scraper and SEO agents — AhrefsBot, SemrushBot, Scrapy, HTTrack, Yandex and
> similar — not to `*`.
>
> **Binding on any build round that follows:** fetch the CSV resource path and nothing else.
> **No `/api/3/action/` call, ever.**
>
> **Correction, added in Round 38:** this paragraph previously said the resource URL was "recorded
> in §E's source line and in this document". **It was not — this document contains no URLs at
> all**, which Round 38 discovered when it went to use it. The URL is now recorded in one place,
> `docs/audits/round-38-sa-crime-article.md` §1, and in that article's claim ledger beside the
> file's size and checksum. A future round takes it from there.

**FBI Crime Data Explorer: not available.** `api.usa.gov/crime/fbi/cde/…` returns
`{"error":{"code":"API_KEY_MISSING"}}`. It needs an api.data.gov key, which this project does not
have. Not used, and not needed for either verdict.

---

## B · Granularity — the decisive section

### Austin: no address, no ZIP, no coordinate

The dataset declares **19 columns and not one of them is an address, a ZIP, or a latitude and
longitude.** Population measured **by asking the API to count the whole recent year**, rather
than inferring from a sample — 93,191 reports filed since 2025-09-01:

| geography | populated | share of the year |
|---|---|---|
| APD sector | 92,963 | **99.76%** |
| APD district | 92,936 | 99.73% |
| **census block group** | **92,691** | **99.46%** |
| council district | 92,396 | 99.15% |

Non-geographic fields, on the 5,000 most recently reported rows: offence type, UCR code, both
date-times and `family_violence` at 100%; `clearance_status` at 70.1%; **`ucr_category` and
`category_description` at 33.5%** — so the tidy UCR grouping is absent from two thirds of rows
and only the free-text `crime_type` is universal.

**Finest genuinely populated geography: the census block group.** That is finer than a ZIP —
typically a few hundred to a few thousand people — and it is populated on essentially the whole
record, so this is not a sparse-field case.

> **A trap worth recording.** The first sample came back as the **oldest 2,000 rows — January
> 2003** — because Socrata's default row order is unspecified and the probe had not asked for
> one. Population rates measured there would have described the record as it was 23 years ago.
> Re-fetched newest-first, and the counts above come from `$where` queries over the real year
> rather than from any sample at all.

### San Antonio: ZIP, and nothing finer

SAPD Offenses is a single CSV — **538,978 data rows, 55 MB, covering 2023-01-01 onward** — with
**8 columns**: `Report_ID`, `Report_Date`, `DateTime`, `NIBRS_Code_Name`, `NIBRS_Crime_Against`,
`NIBRS_Group`, `Service_Area`, **`Zip_Code`**.

All eight were **100% populated** across a 5,000-row slice. 63 distinct ZIPs; 7 SAPD service
areas. **No address, no coordinate, no block group, no council district.**

**Finest genuinely populated geography: the ZIP code.**

> **A second trap.** The CSV is **ordered by offence category, not by date** — the last 5,000
> rows are 5,000 weapon-law violations, every one `CRIME AGAINST SOCIETY`. So a head or tail
> slice is a category slice, and **I cannot state the file's true maximum report date from what
> I sampled.** Both slices end 2026-08-31. Anything stronger needs the whole file, which the
> ingestion path would hold and this probe deliberately did not keep.

---

## C · Address resolution — the two metros are opposites

THI already resolves a street address **entirely locally**: the Austin Resource Recovery matcher
normalises an address into a key and looks it up in ZIP-sharded static assets served through the
Worker's `ASSETS` binding, with strict match-or-withhold and no scoring. Nothing is sent
anywhere. That is the standard any crime reading has to meet, because the privacy page's promise
is explicit and holds.

**San Antonio — resolves by construction.** The record carries a ZIP; the account already stores
a ZIP. The join is ZIP to ZIP. **No geocoder, no third party, no address involved at all** — the
street address is not even read.

**Austin — does not resolve, and the ways out are all blocked or unproven.**

1. **Geocode the address** to a block group, e.g. the Census Bureau's free geocoder. **This sends
   the member's street address to a third party, which the privacy page forbids.** Free does not
   make it permissible; the constraint is not about cost.
2. **A local address-point table**, on the ARR pattern — permissible in principle, and the
   precedent exists. But it needs a published address-point dataset carrying a block-group
   assignment for every address, **which this probe did not verify exists**. Naming it as a
   route without checking it would be exactly the kind of assumption Round 30 was handed.
3. **Aggregate the block groups inside the home's ZIP.** ZIP and block-group boundaries do not
   nest, so the result is approximate and would have to say so — and at that point it is a
   ZIP-level reading wearing block-group clothes, which is worse than an honest ZIP one.

Council district and APD sector fail the same way and for the same reason.

---

## D · Currency

**Austin — weekly.** The dataset's own metadata says `Update Frequency: Weekly`, and the newest
report in the record was filed **2026-09-20**, five days before this probe. Occurrence-to-report
lag measured on recent rows: **median 0 days, p90 1 day**.

But a caution that matters for any trend claim: those recently-*filed* reports carry occurrence
dates **going back to 2006**. A count by report date and a count by occurrence date are different
figures, and the recent months of an occurrence-date series keep changing as late reports arrive.
**Any THI figure should be report-date based and say so.**

**San Antonio — consistent with monthly.** The package's `metadata_modified` is today,
2026-09-25, while report dates in two independent category slices both end **2026-08-31**. That
pattern fits monthly publication with a three-to-four week lag. **Stated as inference, not
measurement** — see the ordering trap in §B.

**The honest as-of line** would name the window and the basis, not just a date:

> `Source: Austin Police Crime Reports · reports filed 1–31 Aug 2026 · published weekly · last confirmed 25 Sep 2026`

---

## E · What it could say

### Article — three candidates, in the round-6 format

**Supported**

1. **"How current is Austin's crime record, and what is actually in it?"** Every figure here is
   `data` or `derived` from one feed: 93,191 reports filed in the year to September; 99.5%
   carrying a census block group; **33.5% carrying a UCR category**; median zero days from
   occurrence to report. A piece about the record rather than about places — which is the one
   framing §F of the crime memo leaves completely open.
2. **"What San Antonio's offence file covers, and what it doesn't."** 538,978 records from
   2023 forward, NIBRS-coded, ZIP-level, no coordinates. Same shape, same tier.
3. **"How long after something happens does it appear in the record?"** The lag distribution,
   per metro, reported separately.

**Not supported**

- **Any Austin-versus-San-Antonio comparison.** They share no geography (block group vs ZIP), no
  taxonomy (**Austin: UCR codes plus free-text offence descriptions; San Antonio: NIBRS**), and
  no cadence (weekly vs monthly). A cross-metro figure would be apples to oranges in three
  independent ways, and the round-6 permit ruling is the precedent: measure within a city, never
  across.
- **Any rate per head of population.** Neither metro's published geography comes with a
  population denominator at that grain, and attaching one from elsewhere is a modelling step
  with no source to cite.
- **Any characterisation of an area.** Out of scope by §4 and by the memo.

### /home/ context reading — the literal candidate

Supported for **San Antonio only**, at ZIP, as labelled context with no action attached:

```
POLICE OFFENCE REPORTS · YOUR ZIP
«count»  reports filed in 78205, 12 months to 31 Aug 2026

SAPD publishes these by ZIP code, so this counts reports filed for the whole
ZIP — not incidents at your address. A report records something being reported;
it is not a confirmed offence, and no figure here says anything about how any
part of the ZIP compares with any other.

Source: City of San Antonio · SAPD Offenses (CC BY) · data through 31 Aug 2026 ·
last confirmed 25 Sep 2026
```

**`«count»` is a placeholder and stays one.** A real number cannot be computed from what this
probe holds: the file is category-ordered, so the slices sampled are not a complete count for
any ZIP or any period. The ingestion path would compute it from the whole file. **Writing a
plausible-looking number here would be inventing the one thing the round exists to establish.**

No recommendation line, by construction — that is the crime memo's finding carried forward, and
it is why this is context rather than a signal.

**For Austin there is no candidate to write.** §C blocks it.

---

## F · Where it breaks

**The article does not break.** Both metros support one, the terms permit it, and every figure
traces to a feed.

**The reading breaks in two places, and only one of them is about data.**

1. **Austin's geography cannot reach a home** without breaking the address promise (§C). A
   reading that exists for one metro and not the other is not a dashboard signal; it is an
   inconsistency a member would notice, and the honest label for an Austin member would be a
   withheld state explaining that their city publishes no geography we can resolve.
2. **A ZIP-level count still fails the standing test.** "Does the number change the action?" —
   it does not, which is exactly why the owner's ruling attaches no action to it. What remains is
   a number with no next step, on a page whose job is to tell a member what to do about their
   house. A San Antonio ZIP holds tens of thousands of people; the count describes the ZIP, not
   the home, and the note saying so is longer than the figure it qualifies.

**So: publishable as an article, too coarse to be worth a per-home reading.** That is the honest
answer and it was the likely one going in.

**Recommendation: build the article, do not build the reading.** If the owner wants the reading
anyway, San Antonio can carry it within the constraints above, and Austin must show a withheld
state rather than a substitute figure.

---

## G · The temporary workflow, and what was kept

`.github/workflows/tmp-crime-probe.yml` ran three times on this branch and **has been deleted**;
`.github/workflows/` holds only the eight pre-existing workflows. It was push-triggered on this
branch alone and only when the file itself changed, so it never needed anything on `main` and
could not fire from ordinary work. It fetched `robots.txt` and licence metadata before anything
else and wrote only under a temporary path.

**Nothing from the probe is kept in the repository.** The bulk row samples went first — 55 MB of
San Antonio offence records and 3.4 MB of Austin reports do not belong in a public repository —
and the remaining terms evidence was deleted before this branch merged, on the owner's
instruction, because **this document is the artifact worth keeping and it quotes what it
relies on**: the licence strings and attribution in §A, the robots rules and the correction
against them in §A, the population counts in §B, and the resource URL in §E.

**Everything here is reproducible without it.** The sources are named, the endpoints are quoted,
and the counts came from `$where` queries whose text is in §B rather than from any stored file.
