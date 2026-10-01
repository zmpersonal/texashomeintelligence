# Round 45 — San Antonio permit counts were row counts

Date: 2026-10-01 · Branch: `claude/thi-v3-round45-permit-counts`, from `origin/main` at `b901a96`.

**One sentence.** `permitTradeActivity.ts` incremented a counter once per row and published the
result as `permitCount`; San Antonio's feed lists a permit on several rows when it covers more
than one type or stage, so every San Antonio permit figure was a row count wearing the word
"permits". Both metro loops now resolve a permit identifier and count distinct permits, every
figure has been recomputed, and the three San Antonio pages that render have moved — plumbing by
−7.3%.

**What this round corrects about its own framing.** Round 44 handed this over as "seven published
figures". It is not seven. Seven San Antonio categories are ingested, but only **three** render a
page (plumbing, roofing, HVAC), and of those only **plumbing** moves materially. The largest
counting error of all — electrical, −9.17% — is in a category with no page, so no reader ever saw
it. The headline number in the brief was mine and it was too big.

---

## 1 · The defect, measured

The San Antonio loop never read its identifier column at all, so it could not have deduplicated.
Austin's loop never asked Socrata for `permit_number`, so the identifier was not even on the wire.

| | San Antonio | Austin |
|---|--:|--:|
| Rows in the 13-month window | 87,998 | 59,811 |
| Rows that classify into a trade | 62,685 | 46,156 |
| Distinct permits among those | **56,508** | **46,156** |
| Duplication, classified rows | **9.85%** | **0.00%** |
| Rows with no identifier | 0 | 0 |
| Permits spanning more than one month | **0** | 0 |
| Permits spanning more than one type | **1,810** | 0 |
| Identifier column | `PERMIT #` | `permit_number` |

Across the whole unclassified feed San Antonio's duplication is 11.56% (87,998 rows → 77,825
permits), and one commercial site permit occupies 105 rows by itself. That 11.56% is why the
per-category error had to be measured rather than apportioned: it ranges from **−9.17%** to
**0.00%** by category, and the overall figure describes none of them.

**Austin's figures were right by the shape of someone else's feed.** That is not the same as being
right, which is why its loop now counts distinctly too and a test asserts the property directly.

---

## 2 · Two corrections landed together, and they are separable

This matters for reading every table below.

**(a) The counting basis.** Rows → distinct permits. Pushes San Antonio **down**. Zero effect on
Austin.

**(b) The window.** `computeFetchWindow` returns an incremental window — correct for an
append-only event log, wrong for a monthly aggregate recomputed from a whole file. A month ingested
once was never revisited, so permits the city added to it later were never counted. The fix
(`recountWindow()`, 13 months, both metros) pushes **up**, in both metros.

**Austin is the control that isolates them**, because Austin has no duplication at all. Every
Austin delta is therefore pure window effect — and every one of them sits in a single month:

| Austin category | 2025-09 before | after | delta | every other month |
|---|--:|--:|--:|---|
| **hvac** | **812** | **926** | **+114 (+14.0%)** | ±0 to −2 |
| plumbing | 1,080 | 1,192 | +112 | ±0 to −5 |
| electrical | 1,075 | 1,190 | +115 | ±0 to −11 |
| solar | 131 | 144 | +13 | ±0 to −5 |
| roofing | 201 | 210 | +9 | ±0 to −1 |

`hvac 2025-09: 812 → 926` is the worked example to keep: **zero counting effect, +114 from the
window alone.** September 2025 was first ingested while it was still the current month, so it was
stored partial and never recomputed. The small negative deltas in later months are the mirror
image — rows the city has since withdrawn or re-dated.

Because the two effects point in opposite directions, the net on-disk delta understates the
counting error. San Antonio electrical is **−9.17% on counting alone** but **−8.18% on disk**;
plumbing is **−7.90%** against **−7.27%**. Both are real corrections. Neither is the other.

### The counting effect alone, per category

Measured in **one read of each feed**, tallying rows and distinct permits simultaneously, so no
delta here can be feed drift (`scripts/audits/permit-count-bases.ts`).

| metro | category | rows | permits | counting effect | rows verdict | permits verdict | renders? |
|---|---|--:|--:|--:|---|---|---|
| san-antonio | electrical | 11,284 | 10,249 | **−9.17%** | fell −6.2% (±3.39%) | flat −0.9% (±3.56%) ⟵ **verdict changes** | no |
| san-antonio | plumbing | 26,697 | 24,587 | **−7.90%** | flat −1.4% (±2.21%) | flat +1.6% (±2.30%) | **yes** |
| san-antonio | roofing | 5,301 | 5,293 | −0.15% | flat −4.4% | flat −4.5% | **yes** |
| san-antonio | foundation | 3,457 | 3,455 | −0.06% | flat −1.5% | flat −1.4% | no |
| san-antonio | hvac | 11,829 | 11,823 | −0.05% | rose +32.2% | rose +32.3% | **yes** |
| san-antonio | solar | 726 | 726 | 0.00% | fell −43.5% | fell −43.5% | no |
| san-antonio | trees | 3,391 | 3,391 | 0.00% | rose +115.7% | rose +115.7% | no |
| austin | all five | — | — | **0.00%** | unchanged | unchanged | — |

---

## 3 · Every figure a reader could have seen, before and after

On disk: `trades-v1` (what was published) against `trades-v2` (what is published now), both with
the Round 15 current-month drop applied, so these are page figures and not file figures.

| page | months | total | per month | half-over-half | noise floor | verdict | busiest month |
|---|--:|--:|--:|--:|--:|---|---|
| **/san-antonio/plumbing/** before | 13 | 26,515 | 2,040 | +0.5% | ±2.21% | flat | 2025-10 · 2,338 |
| **/san-antonio/plumbing/** after | 13 | **24,587** | **1,891** | **+1.6%** | ±2.30% | flat | 2025-10 · **2,175** |
| /san-antonio/roofing/ before | 13 | 5,219 | 401 | −1.3% | ±4.99% | flat | 2025-09 · 634 |
| /san-antonio/roofing/ after | 13 | 5,293 | 407 | −4.5% | ±4.96% | flat | 2025-09 · 715 |
| /san-antonio/hvac/ before | 13 | 11,714 | 901 | +35.7% | ±3.33% | rose | 2026-06 · 1,195 |
| /san-antonio/hvac/ after | 13 | 11,823 | 909 | +32.3% | ±3.32% | rose | 2026-06 · 1,193 |
| /austin/plumbing/ before | 13 | 15,974 | 1,229 | +18.5% | ±2.85% | rose | 2026-04 · 1,404 |
| /austin/plumbing/ after | 13 | 16,070 | 1,236 | +16.4% | ±2.84% | rose | 2026-04 · 1,403 |
| /austin/hvac/ before | 13 | 11,689 | 899 | +44.4% | ±3.33% | rose | 2026-07 · 1,226 |
| /austin/hvac/ after | 13 | 11,796 | 907 | +40.7% | ±3.32% | rose | 2026-07 · 1,225 |
| /austin/roofing/ before | 13 | 2,027 | 156 | −7.0% | ±8.01% | flat | 2025-09 · 201 |
| /austin/roofing/ after | 13 | 2,037 | 157 | −7.9% | ±7.99% | flat | 2025-09 · 210 |

Categories with no page — San Antonio electrical, foundation, solar, trees; Austin electrical,
solar — are in the per-month appendix at the end, recomputed on the same basis. **§7 of the brief
asked for Austin to be byte-identical and it is not.** That is the window fix, not the dedupe, and
it is the right outcome: the old Austin figures were missing permits.

### Trend claims

| claim | before | after | changed? |
|---|---|---|---|
| /san-antonio/plumbing/ | "held roughly flat … differ by +0.5% … does not clear ±2.2%" | "flat … +1.6% … does not clear ±2.3%" | magnitude only |
| /san-antonio/roofing/ | "flat … −1.3% … ±5.0%" | "flat … −4.5% … ±5.0%" | magnitude only |
| /san-antonio/hvac/ | "rose about 35.7% … clears ±3.3%" | "rose about 32.3% … clears ±3.3%" | magnitude only |
| /austin/plumbing/ | "rose about 18.5%" | "rose about 16.4%" | magnitude only |
| /austin/hvac/ | "rose about 44.4%" | "rose about 40.7%" | magnitude only |
| /austin/roofing/ | "flat … −7.0% … ±8.0%" | "flat … −7.9% … ±8.0%" | magnitude only |
| *(san-antonio electrical)* | *fell about 3.8%, clears ±3.4%* | *flat, −0.9%* | **verdict reverses — renders on no page** |

**No published trend verdict changed, and no published direction reversed.** The reversal is
electrical's, and electrical has no `belowHero` entry and no data page.

**I had this wrong when I drafted the correction note, and the note shipped with the error before
I caught it.** The draft said plumbing "read as a 0.5% fall … and is in fact a 1.6% rise". Both
figures are rises: on disk `trades-v1` plumbing ran 12,122 → 12,186 half over half, i.e. +0.53%.
The *fall* is what the row basis gives on a fresh read (12,333 → 12,166, −1.4%) — true of the
counting basis, not of anything a reader saw. The note now says what is actually the case: the
error was *capable* of reversing a published direction, and did reverse a verdict in a category we
publish no page for, but no page's claim flipped. **The owner's second stated reason for the entry
("a published trend's direction reversed") does not hold as stated.** The other two — a figure 7%
wrong for 27 days, and numbers nobody outside could verify — do.

---

## 4 · Is `permitCount` correctly named now, and what else miscounts?

**`permitCount` is now correctly named.** It is `b.permits.size`, the cardinality of a `Set` of
permit identifiers. The type change is what made this provable rather than asserted: `Bucket.permits`
is a `Set<string>`, there is no `++` anywhere in the loop, and `bump()` takes `permitId: string`
as a **required** parameter — so the compiler named both call sites with TS2554 rather than letting
one be missed.

**`sourceValues[].count` is correctly named and is not a partition.** Each entry is the number of
distinct permits carrying that value, so a permit with two types in one category is one permit in
the total and one in each of two rows: the rows sum to **more** than the total. Measured: San
Antonio plumbing +2,007 records over 24,587 permits, electrical +968 over 10,249, everything else
and all of Austin +0. The table is re-captioned accordingly, its `Share` column is divided by the
record sum rather than the permit total, and a footer row states that sum. Dividing by the permit
total would have printed a column summing to 108% on the plumbing page with no row for the
difference.

One thing the arithmetic does **not** support: the excess is not a count of permits carrying more
than one type. A permit with three types contributes two extra records, and the feed says that is
common — 2,975 extra records within categories against at most 1,810 permits spanning types in the
whole city. The rendered sentence therefore puts the number on the records and says "some of these
permits" for the permits.

### What else called a count something it wasn't — found by running this round

**The mapping-version mechanism was decorative, on the reading side, in three places.**
`toObservations` keys every row `${mappingVersion}/${category}/${month}`, so bumping `trades-v1` →
`trades-v2` *adds* a basis beside the old one — by design, because the old readings are history.
Every reader therefore has to select a version. None did:

| reader | what it did | what it would have published |
|---|---|---|
| `src/lib/tradeActivity.ts` | summed the file; reported `rows[0].mappingVersion` | both bases added together |
| `scripts/replays/saservicerender.mjs` | same | expected 51,003 SA plumbing permits against a page saying 24,587 |
| `scripts/replays/roofscanrender.mjs` | same | expected 10,512 SA re-roofs against a page saying 5,293 |

A `CATEGORY_MAPPING_VERSION` bump — the documented way to change the method — would have doubled
every figure on the site. All three now select the newest version from the data rather than a
pinned literal, and §8 of `permitcountunit.ts` asserts the property on disk and reads both replay
sources for the selection.

`permit-trade-activity` is the only dataset whose observation **keys** embed a version, so it is
the only one with this exposure; the stress index, municipal shards and brief carry a version as a
field on a single computed artifact.

**Nothing else on the site reads the trade archive.** `permitCount` appears in exactly three
places outside the fetcher — `tradeActivity.ts` and the two replays above — and all three are
fixed.

---

## 5 · Austin's free-text address exposure (brief §3)

`austinPermits.ts` ingests no address field. It does ingest the city's free-text `description`,
and **nine of 2,089 committed descriptions carried a street address; one carried a phone number.**
Three had reached the published CSV at `/data/austin/roof-permits/roof-permits.csv`. These are
already-public municipal records, so republishing them disclosed nothing new — what it did was
make a statement the site relies on untrue.

Option B as instructed: redact at ingest, narrow pattern, log every hit.

- `src/ingest/redactPersonalShapes.ts` — house number **and** a street-type token required, plus a
  North-American phone shape. Returns every removal to the caller; nothing is redacted silently.
- Wired in **before the value is built**, and `isRoofingRelated(row)` is still evaluated on the
  **raw** row, so redaction cannot change which permits are counted.
- **Hit count, so over-redaction is visible: 9 addresses + 1 phone in 2,089 descriptions (0.48%),
  and one false positive.** "Finish-Outs for Units on Level 55 with Roof Terrace" matched as an
  address and lost "55 with Roof Terrace" — including the word *Roof*. That is not cosmetic:
  `dataPages/permits.ts` and `textMatchComposition.ts` compute published composition figures by
  testing this very text. The pattern now rejects function words inside a street name
  (`with|and|of|the|at|…`), which removes that match and keeps all nine real ones.
- **The fetcher fix did not cover rows already on disk.** `municipal-permits` has an incremental
  window, so an observation ingested before the redaction existed was merged forward untouched —
  the committed tree still held all ten shapes after the pipeline had run, and §7 of
  `permitcountunit.ts` caught it. `scripts/redact-committed-descriptions.ts` applies the same
  function to the committed tree: offline, idempotent, and it **refuses to write if any classifier
  verdict would change**. Nine descriptions rewritten; `/data/austin/roof-permits/` rebuilt
  **byte-identical**, so no published figure moved.
- 52 published data files scanned for either shape afterwards: clean. The one remaining match in
  the Austin Resource Recovery schedule is `"3509|||N|INTERSTATE 35 FRONTAGE RD NB|"` — a segment
  id and a public street name in adjacent pipe-delimited fields, not an address, in a dataset whose
  subject *is* street segments.

---

## 6 · Copy that changed, and why

| file | change |
|---|---|
| `src/data/belowHero.ts` (SA permit source) | "…by permit type and issue date … **no other field is read**" → reads the permit number, counts each permit once, and names the ~7% overstatement. The old sentence was true and was the defect. |
| `src/data/belowHero.ts` (Austin permit source) | field list completed with the permit number. Austin's counting basis did not move; its sentence would still have been incomplete. |
| `src/data/belowHero.ts` (4 `methodBody` strings) | "these **rows** are identified by…" → "these **permits**". SA plumbing's also states the count-once rule. |
| `src/components/BelowHero.astro` | table re-captioned "permit records by …"; `Share of records` divided by the record sum; footer row for the sum; the overlap sentence rendered only where overlap exists. |
| `src/pages/methodology/index.astro` | "Yes. **Once**" → "Yes. **Twice**, and these are the records of them", a heading per entry so two records are legible, and the new entry. |

Two deviations from approved copy, both flagged above and repeated here so they are not buried:
the plumbing trend sentence in the note (§3), and the note's claim that **"Austin's figures were
not affected"** — Austin's *counting* was never wrong, but its figures moved by under 1% in the
same deploy from the window fix, so the note now says so.

---

## 7 · Tests

`scripts/replays/permitcountunit.ts`, 37 checks, in the sweep. **Every assertion fails against the
pre-Round-45 code**, demonstrated by running it against the old logic with only module-shape
differences neutralised.

| § | asserts |
|---|---|
| 1 | one permit on 105 rows counts 1 |
| 2 | 7 rows / 4 permits counts 4 |
| 3 | the breakdown sums to the total in the non-spanning case |
| 4 | a multi-category permit is not deduped away across categories |
| 5 | source reads: `bump()` requires `permitId`; `Bucket.permits` is a `Set`; no `++`; SA **throws** rather than counting rows if no identifier column resolves; Austin's `$select` asks for `permit_number` |
| 6 | a permit with two types counts once, appears under both, and the breakdown therefore exceeds the total |
| 7 | redaction both directions, plus a scan of the committed tree |
| 8 | one mapping version at a time: summing all versions would overstate; one row per category-month within the newest; both replays select a version and pin none |

**Sweep repairs made on the way, both pre-existing:**

- `weeklyunit` read `/tmp/austin.bak.json`, a snapshot dropped there by hand in Round 9. Any fresh
  container died at that line, taking **eleven assertions** with it — they had not run in this
  environment at all. It now reads the artifact the build emits, and the one pinned figure
  ("50 of 100, Elevated") is read off that artifact instead.
- `r9render`'s eight unsubscribe assertions need `site/.dev.vars`, which is gitignored and so
  absent from a fresh clone. Documented in `scripts/replays/README.md` with the two local test
  values; neither is a secret.

---

## 8 · Not done, and open

- **Fort Worth stays stopped**, per the Round 44 ruling.
- **The per-type breakdown cannot be a partition** while permits are counted distinctly. It is
  labelled honestly rather than forced to add up. If a partition is wanted, it needs a primary-type
  rule, which is a decision about the data and not a bug fix.
- **The San Antonio CSV still 403s any plain script** while the repo's own fetch path reads it
  daily. That is the reason this round's numbers were not externally checkable, and it is
  unresolved; it is the deciding reason for the `/methodology/` entry.
- `CATEGORY_MAPPING_VERSION` is now `trades-v2`. The doc comment says a counting-basis change
  warrants a bump, which it did not say before.

---

## Appendix · per-month deltas, every category

`trades-v1` → `trades-v2` on disk, with the counting-only column measured in a single read of each
feed. A blank counting column means the month is outside the audit read's window.

## san-antonio — on disk: trades-v1 (before) vs trades-v2 (after)

### electrical  (11162 -> 10249, -8.18%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 880 | 867 | -13 | 998 -> 867 (-131) |
| 2025-10 | 940 | 856 | -84 | 941 -> 856 (-85) |
| 2025-11 | 827 | 724 | -103 | 822 -> 724 (-98) |
| 2025-12 | 768 | 676 | -92 | 769 -> 676 (-93) |
| 2026-01 | 881 | 760 | -121 | 896 -> 760 (-136) |
| 2026-02 | 867 | 800 | -67 | 868 -> 800 (-68) |
| 2026-03 | 1030 | 925 | -105 | 1026 -> 925 (-101) |
| 2026-04 | 832 | 782 | -50 | 830 -> 782 (-48) |
| 2026-05 | 848 | 768 | -80 | 844 -> 768 (-76) |
| 2026-06 | 777 | 727 | -50 | 778 -> 727 (-51) |
| 2026-07 | 944 | 899 | -45 | 949 -> 899 (-50) |
| 2026-08 | 845 | 789 | -56 | 840 -> 789 (-51) |
| 2026-09 | 723 | 676 | -47 | 723 -> 676 (-47) |

### foundation  (3445 -> 3455, +0.29%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 211 | 227 | +16 | 227 -> 227 (+0) |
| 2025-10 | 314 | 313 | -1 | 313 -> 313 (+0) |
| 2025-11 | 248 | 248 | +0 | 248 -> 248 (+0) |
| 2025-12 | 257 | 257 | +0 | 257 -> 257 (+0) |
| 2026-01 | 255 | 255 | +0 | 255 -> 255 (+0) |
| 2026-02 | 304 | 301 | -3 | 303 -> 301 (-2) |
| 2026-03 | 275 | 275 | +0 | 275 -> 275 (+0) |
| 2026-04 | 296 | 296 | +0 | 296 -> 296 (+0) |
| 2026-05 | 256 | 256 | +0 | 256 -> 256 (+0) |
| 2026-06 | 250 | 250 | +0 | 250 -> 250 (+0) |
| 2026-07 | 292 | 291 | -1 | 291 -> 291 (+0) |
| 2026-08 | 282 | 281 | -1 | 281 -> 281 (+0) |
| 2026-09 | 205 | 205 | +0 | 205 -> 205 (+0) |

### hvac  (11714 -> 11823, +0.93%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 947 | 1066 | +119 | 1067 -> 1066 (-1) |
| 2025-10 | 882 | 880 | -2 | 882 -> 880 (-2) |
| 2025-11 | 664 | 663 | -1 | 664 -> 663 (-1) |
| 2025-12 | 639 | 639 | +0 | 639 -> 639 (+0) |
| 2026-01 | 731 | 731 | +0 | 731 -> 731 (+0) |
| 2026-02 | 660 | 659 | -1 | 660 -> 659 (-1) |
| 2026-03 | 1052 | 1049 | -3 | 1049 -> 1049 (+0) |
| 2026-04 | 807 | 807 | +0 | 807 -> 807 (+0) |
| 2026-05 | 902 | 900 | -2 | 900 -> 900 (+0) |
| 2026-06 | 1195 | 1193 | -2 | 1194 -> 1193 (-1) |
| 2026-07 | 1188 | 1193 | +5 | 1193 -> 1193 (+0) |
| 2026-08 | 1137 | 1133 | -4 | 1133 -> 1133 (+0) |
| 2026-09 | 910 | 910 | +0 | 910 -> 910 (+0) |

### plumbing  (26515 -> 24587, -7.27%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 2140 | 2103 | -37 | 2343 -> 2103 (-240) |
| 2025-10 | 2338 | 2175 | -163 | 2339 -> 2175 (-164) |
| 2025-11 | 1923 | 1725 | -198 | 1926 -> 1725 (-201) |
| 2025-12 | 1739 | 1581 | -158 | 1736 -> 1581 (-155) |
| 2026-01 | 2035 | 1812 | -223 | 2042 -> 1812 (-230) |
| 2026-02 | 1947 | 1791 | -156 | 1947 -> 1791 (-156) |
| 2026-03 | 2207 | 2033 | -174 | 2198 -> 2033 (-165) |
| 2026-04 | 2082 | 1948 | -134 | 2082 -> 1948 (-134) |
| 2026-05 | 2082 | 1894 | -188 | 2080 -> 1894 (-186) |
| 2026-06 | 2087 | 1954 | -133 | 2088 -> 1954 (-134) |
| 2026-07 | 2230 | 2098 | -132 | 2223 -> 2098 (-125) |
| 2026-08 | 2120 | 1987 | -133 | 2108 -> 1987 (-121) |
| 2026-09 | 1585 | 1486 | -99 | 1585 -> 1486 (-99) |

### roofing  (5219 -> 5293, +1.42%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 634 | 715 | +81 | 715 -> 715 (+0) |
| 2025-10 | 587 | 587 | +0 | 587 -> 587 (+0) |
| 2025-11 | 345 | 343 | -2 | 345 -> 343 (-2) |
| 2025-12 | 270 | 269 | -1 | 270 -> 269 (-1) |
| 2026-01 | 270 | 270 | +0 | 270 -> 270 (+0) |
| 2026-02 | 328 | 328 | +0 | 328 -> 328 (+0) |
| 2026-03 | 382 | 382 | +0 | 382 -> 382 (+0) |
| 2026-04 | 424 | 420 | -4 | 424 -> 420 (-4) |
| 2026-05 | 424 | 424 | +0 | 424 -> 424 (+0) |
| 2026-06 | 456 | 456 | +0 | 456 -> 456 (+0) |
| 2026-07 | 382 | 382 | +0 | 383 -> 382 (-1) |
| 2026-08 | 394 | 394 | +0 | 394 -> 394 (+0) |
| 2026-09 | 323 | 323 | +0 | 323 -> 323 (+0) |

### solar  (723 -> 726, +0.41%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 111 | 114 | +3 | 114 -> 114 (+0) |
| 2025-10 | 107 | 107 | +0 | 107 -> 107 (+0) |
| 2025-11 | 86 | 86 | +0 | 86 -> 86 (+0) |
| 2025-12 | 50 | 50 | +0 | 50 -> 50 (+0) |
| 2026-01 | 43 | 43 | +0 | 43 -> 43 (+0) |
| 2026-02 | 34 | 34 | +0 | 34 -> 34 (+0) |
| 2026-03 | 47 | 47 | +0 | 47 -> 47 (+0) |
| 2026-04 | 53 | 53 | +0 | 53 -> 53 (+0) |
| 2026-05 | 32 | 32 | +0 | 32 -> 32 (+0) |
| 2026-06 | 43 | 43 | +0 | 43 -> 43 (+0) |
| 2026-07 | 41 | 41 | +0 | 41 -> 41 (+0) |
| 2026-08 | 33 | 33 | +0 | 33 -> 33 (+0) |
| 2026-09 | 43 | 43 | +0 | 43 -> 43 (+0) |

### trees  (3371 -> 3391, +0.59%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 176 | 196 | +20 | 196 -> 196 (+0) |
| 2025-10 | 188 | 188 | +0 | 188 -> 188 (+0) |
| 2025-11 | 130 | 130 | +0 | 130 -> 130 (+0) |
| 2025-12 | 116 | 116 | +0 | 116 -> 116 (+0) |
| 2026-01 | 164 | 164 | +0 | 164 -> 164 (+0) |
| 2026-02 | 195 | 195 | +0 | 195 -> 195 (+0) |
| 2026-03 | 269 | 269 | +0 | 269 -> 269 (+0) |
| 2026-04 | 236 | 236 | +0 | 236 -> 236 (+0) |
| 2026-05 | 299 | 299 | +0 | 299 -> 299 (+0) |
| 2026-06 | 289 | 289 | +0 | 289 -> 289 (+0) |
| 2026-07 | 376 | 376 | +0 | 376 -> 376 (+0) |
| 2026-08 | 451 | 451 | +0 | 451 -> 451 (+0) |
| 2026-09 | 482 | 482 | +0 | 482 -> 482 (+0) |


## austin — on disk: trades-v1 (before) vs trades-v2 (after)

### electrical  (17421 -> 17512, +0.52%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 1075 | 1190 | +115 | 1190 -> 1190 (+0) |
| 2025-10 | 1288 | 1288 | +0 | 1288 -> 1288 (+0) |
| 2025-11 | 1106 | 1106 | +0 | 1106 -> 1106 (+0) |
| 2025-12 | 1248 | 1247 | -1 | 1247 -> 1247 (+0) |
| 2026-01 | 1277 | 1273 | -4 | 1273 -> 1273 (+0) |
| 2026-02 | 1306 | 1304 | -2 | 1304 -> 1304 (+0) |
| 2026-03 | 1357 | 1355 | -2 | 1355 -> 1355 (+0) |
| 2026-04 | 1392 | 1381 | -11 | 1381 -> 1381 (+0) |
| 2026-05 | 1329 | 1328 | -1 | 1328 -> 1328 (+0) |
| 2026-06 | 1516 | 1516 | +0 | 1516 -> 1516 (+0) |
| 2026-07 | 1377 | 1377 | +0 | 1377 -> 1377 (+0) |
| 2026-08 | 1515 | 1512 | -3 | 1512 -> 1512 (+0) |
| 2026-09 | 1635 | 1635 | +0 | 1635 -> 1635 (+0) |

### hvac  (11689 -> 11796, +0.92%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 812 | 926 | +114 | 926 -> 926 (+0) |
| 2025-10 | 841 | 841 | +0 | 841 -> 841 (+0) |
| 2025-11 | 683 | 683 | +0 | 683 -> 683 (+0) |
| 2025-12 | 712 | 710 | -2 | 710 -> 710 (+0) |
| 2026-01 | 714 | 714 | +0 | 714 -> 714 (+0) |
| 2026-02 | 638 | 638 | +0 | 638 -> 638 (+0) |
| 2026-03 | 934 | 934 | +0 | 934 -> 934 (+0) |
| 2026-04 | 929 | 929 | +0 | 929 -> 929 (+0) |
| 2026-05 | 950 | 950 | +0 | 950 -> 950 (+0) |
| 2026-06 | 1116 | 1114 | -2 | 1114 -> 1114 (+0) |
| 2026-07 | 1226 | 1225 | -1 | 1225 -> 1225 (+0) |
| 2026-08 | 1037 | 1035 | -2 | 1035 -> 1035 (+0) |
| 2026-09 | 1097 | 1097 | +0 | 1097 -> 1097 (+0) |

### plumbing  (15975 -> 16071, +0.60%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 1080 | 1192 | +112 | 1192 -> 1192 (+0) |
| 2025-10 | 1041 | 1039 | -2 | 1039 -> 1039 (+0) |
| 2025-11 | 1026 | 1026 | +0 | 1026 -> 1026 (+0) |
| 2025-12 | 1085 | 1085 | +0 | 1085 -> 1085 (+0) |
| 2026-01 | 1159 | 1158 | -1 | 1158 -> 1158 (+0) |
| 2026-02 | 1306 | 1306 | +0 | 1306 -> 1306 (+0) |
| 2026-03 | 1342 | 1341 | -1 | 1341 -> 1341 (+0) |
| 2026-04 | 1404 | 1403 | -1 | 1403 -> 1403 (+0) |
| 2026-05 | 1230 | 1228 | -2 | 1228 -> 1228 (+0) |
| 2026-06 | 1383 | 1382 | -1 | 1382 -> 1382 (+0) |
| 2026-07 | 1277 | 1272 | -5 | 1272 -> 1272 (+0) |
| 2026-08 | 1344 | 1341 | -3 | 1341 -> 1341 (+0) |
| 2026-09 | 1297 | 1297 | +0 | 1297 -> 1297 (+0) |
| 2026-10 | 1 | 1 | +0 |  |

### roofing  (2027 -> 2037, +0.49%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 201 | 210 | +9 | 210 -> 210 (+0) |
| 2025-10 | 199 | 199 | +0 | 199 -> 199 (+0) |
| 2025-11 | 168 | 168 | +0 | 168 -> 168 (+0) |
| 2025-12 | 159 | 158 | -1 | 158 -> 158 (+0) |
| 2026-01 | 120 | 121 | +1 | 121 -> 121 (+0) |
| 2026-02 | 137 | 137 | +0 | 137 -> 137 (+0) |
| 2026-03 | 128 | 129 | +1 | 129 -> 129 (+0) |
| 2026-04 | 149 | 148 | -1 | 148 -> 148 (+0) |
| 2026-05 | 114 | 114 | +0 | 114 -> 114 (+0) |
| 2026-06 | 190 | 192 | +2 | 192 -> 192 (+0) |
| 2026-07 | 151 | 150 | -1 | 150 -> 150 (+0) |
| 2026-08 | 144 | 144 | +0 | 144 -> 144 (+0) |
| 2026-09 | 167 | 167 | +0 | 167 -> 167 (+0) |

### solar  (1414 -> 1418, +0.28%)

| month | v1 | v2 | delta | counting-only (rows->permits) |
|---|---:|---:|---:|---:|
| 2025-09 | 131 | 144 | +13 | 144 -> 144 (+0) |
| 2025-10 | 160 | 160 | +0 | 160 -> 160 (+0) |
| 2025-11 | 128 | 128 | +0 | 128 -> 128 (+0) |
| 2025-12 | 90 | 90 | +0 | 90 -> 90 (+0) |
| 2026-01 | 48 | 46 | -2 | 46 -> 46 (+0) |
| 2026-02 | 55 | 54 | -1 | 54 -> 54 (+0) |
| 2026-03 | 33 | 33 | +0 | 33 -> 33 (+0) |
| 2026-04 | 84 | 79 | -5 | 79 -> 79 (+0) |
| 2026-05 | 48 | 48 | +0 | 48 -> 48 (+0) |
| 2026-06 | 79 | 79 | +0 | 79 -> 79 (+0) |
| 2026-07 | 94 | 93 | -1 | 93 -> 93 (+0) |
| 2026-08 | 224 | 224 | +0 | 224 -> 224 (+0) |
| 2026-09 | 240 | 240 | +0 | 240 -> 240 (+0) |


---

## Verification

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints (223 files) |
| `npm run build` | complete |
| `npm run sweep` | **32/32 steps** — the first green sweep in this environment; `weeklyunit` and `r9render` were red in Round 43 and are repaired here |
| `permitcountunit` | 37 checks, 0 failures; every assertion fails against the pre-round code |
| `saservicerender` | 315 passed, 0 failed (was 289/26 — all 26 were the version double-count plus one re-captioned table) |
| `roofscanrender` | 105 passed, 0 failed (was 103/2, same cause) |
| `check-links` | none broken |
| `check-orphans` | none |
| Build determinism | `dist/client` byte-identical across **355 files**; the server bundle differs on one line only — Astro's serialised route manifest reorders, same length, same 47 routes and 13 assets as a set |
| Redaction idempotence | re-running `redact-committed-descriptions.ts` rewrites 0 files |
| `/data/austin/roof-permits/` after redaction | byte-identical — no published figure moved |
| Published data files scanned for a personal shape | 52 files, 0 hits (one dismissed, §5) |
