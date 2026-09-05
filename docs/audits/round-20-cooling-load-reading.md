# Round 20 — The cooling-load reading on the two HVAC pages

---

## 1. What actually landed, before anything was built on it

The live 2026-09-05 ingestion, read from `origin/main`:

| | Austin | San Antonio |
|---|---|---|
| status / lastError | `live` / none | `live` / none |
| observations | **23** = 12 normals + **11 actuals** | **23** = 12 normals + **11 actuals** |
| station | USW00013958 **AUSTIN-CAMP MABRY**, 3.8 mi | USW00012970 **SAN ANTONIO STINSON MUNI AP**, 6 mi |
| years of record | **29–30** | **19–20** |
| completeness flag | **S** | **R** |
| **annual normal total** | **3,289.8** | **3,474.0** |

**Both annual totals match the Round 19d replay exactly.** Nothing to reconcile there.

**Four differences from the replay, reported rather than smoothed over:**

1. **11 actuals, not 35.** `2025-09` through `2026-07`. The replay fabricated a 36-month
   series; the real first run backfilled a one-year window. **The series is short but not
   empty**, and the reading below does not depend on it for its figure — only for its
   currency. Monthly values, Austin: 530, 389, 136, 47, 23, 64, 233, 261, 324, 560, 644.
   San Antonio: 565, 427, 152, 63, 24, 73, 243, 303, 336, 549, 607.
2. **August 2026 is absent.** The newest complete month is **July 2026**, on a run dated
   September 5. That is GSOM's publication lag, now **measured** rather than bounded: roughly
   a month beyond month-end. The 120-day freshness window absorbs it comfortably — the badge
   unit reports both metros at 66 days against a 120-day window, reading `current`.
3. **San Antonio's record is 19–20 years, not the 19–22 the brief carried.** The page states
   what the data says.
4. **Completeness flags are `S` (Austin) and `R` (San Antonio)**, not the `C`/`S` the replay
   assumed. Neither is `E`, so the quality gate passed both correctly. I have not read NOAA's
   definitions of `S` and `R`, so the pages do not interpret them — the gate rejects `E` and
   that is the only flag semantics this code relies on.

---

## 2. Which form of the reading, and why

**The local figure alone. No ratio.** Three reasons, in order of weight:

1. **The national baseline is not in `src/data/generated/**`.** This round's own rule is that
   every figure comes from generated data at build time. Climate at a Glance's contiguous-U.S.
   series is reachable and period-aligned, but it is not ingested.
2. **Ingesting it is a new feed, and this round says no new feed.**
3. **The alternative is a hard-coded national constant in a lib file** — which is precisely
   what `belowHero.ts`'s own header forbids ("NUMBERS DO NOT [live here]") and what
   `blsWages.ts`'s CBSA warning exists to prevent.

The owner-approved label is unchanged and recorded in HANDOFF: if a ratio is ever published it
is **THI analysis, not a sourced claim**, citing both NOAA sources with the point-versus-area
caveat in the reading itself. This round simply does not reach that question, and the reader
asserts in its own comment that it must not.

---

## 3. The reading as rendered

Both pages, verbatim from the built HTML:

```
How much cooling a typical Austin year asks for
  Cooling degree days measure how much cooling a period demanded, not how hot it felt and
  not what anything cost. This is the 30-year normal for one weather station near the city,
  summed across the year. It describes the climate a system here works in. It says nothing
  about any particular system — not its size, not its age, and not what it will need next.

  Cooling demand in a typical year, Austin
  3,289.8 cooling degree days, base 65°F
  This is NOAA's 1991-2020 normal for AUSTIN-CAMP MABRY (USW00013958), 3.8 miles from our
  reference point for Austin, built on 29-30 years of record. It describes a typical year,
  not this one — the 30-year period it covers ended in 2020. The date on the badge above is
  newer than that because the same station also reports month by month, and its newest
  complete month is July 2026; that is what keeps this feed current, and it is not the
  figure shown here.
  LIVE · Data through Jul 1, 2026 · Updated: Sep 5, 2026
  Source: NOAA NCEI U.S. Climate Normals 1991-2020 (station CSV) and Global Summary of the Month
```

San Antonio renders identically in shape: **3,474 cooling degree days, base 65°F**, SAN ANTONIO
STINSON MUNI AP (USW00012970), 6 miles, 19-20 years of record.

### The dual date, which is the thing a reader would misread

The badge's *data through* is **Jul 1, 2026** — it comes from the newest observation in the
file, and that is a monthly **actual**. The figure beside it is a **1991–2020 normal**. Left
unexplained, a current date sitting next to the number invites reading 3,289.8 as a 2026
measurement.

Note the direction: the brief anticipated a 2020 date under a live badge. It is the mirror
image — the badge is current *because of the actuals*, and it is the **figure** that is
historical. The note says which is which, in the reading itself rather than a footnote.

### Station names are rendered exactly as NOAA publishes them

`AUSTIN-CAMP MABRY` and `SAN ANTONIO STINSON MUNI AP` are shouty in prose, and title-casing was
considered and rejected: "Muni AP" has no unambiguous title case, and altering a published
identifier to look calmer is the wrong trade when the station id sits right beside it.

---

## 4. What was retired

Both `omitted` entries are gone — the statements telling readers this reading was looked for
and could not be published. The San Antonio one ("the noaa-climate feed has no San Antonio file
at all, and its Austin file is a one-observation SAMPLE") and the Austin one ("there is nothing
to accumulate") were both false as of the live run.

`data-sources.yaml` flips `noaa-climate` from `stub` to **`live`**, with its name, `primaryUse`
and `thiOutput` updated to describe what is actually published. `/methodology/` renders from it
and now reads **"We track 17 public sources; 13 are currently connected and live"**, with the
row showing **LIVE · Data through Jul 1, 2026**.

**One consequential-copy fix:** Austin's forecast block opened "Every other figure here covers a
twelve-month window", which my own addition made false — a 30-year normal is not twelve months.
Changed to "covers a window — twelve months of permits, or a thirty-year climate normal."

---

## 5. No lifespan framing

Item 3 is enforced three ways: the body copy says outright that the reading "says nothing about
any particular system — not its size, not its age, and not what it will need next"; the reader's
doc comment records why the step from degree days to equipment life needs age, size, efficiency
and duty cycle that this site does not hold; and `saservicerender` asserts the rendered card
matches no lifespan or replacement-timing pattern.

Scanning both whole pages finds three pre-existing matches, none from this round and none a
timing claim: the *omitted*-reading label "Typical HVAC replacement cost" (which names what is
**not** published) and a permit FAQ, "Do I need a permit to replace an HVAC system", twice —
once in prose, once in its JSON-LD. Both are about permitting, not about when to replace
anything.

---

## 6. Verification

**Byte-identical, proven by building at `a0a327c` and diffing the full manifest — 8 files:**
`/austin/roofing/`, `/austin/plumbing/`, `/san-antonio/roofing/`, `/san-antonio/plumbing/`,
`/data/austin/roofing/`, `/tools/plumbing-triage/`, and **both `stress-index/*.json`** — the
Home Stress Index is untouched for both metros, as `noaa-climate` is not in `INDEX_DATASETS`.

**Everything that changed, and nothing else:**

```
./austin/hvac/index.html      ./san-antonio/hvac/index.html
./methodology/index.html      ./sitemap-0.xml   ./sitemap-index.xml
```

The sitemaps follow `/methodology/`'s `dateModified`.

- `npm run check` — 187 files, **0 errors, 0 warnings, 0 hints**.
- `npm run build` clean · `npm run verify-content` passes (17 sources, 4 priority).
- Badge resolver on real data: both metros `live`, **66 days** against a **120-day** window,
  reading `current`.
- `saservicerender` extended — the two HVAC pages go from 4→5 and 5→6 readings, plus a new
  Round 20 section that recomputes the annual total from the committed data rather than pinning
  a literal, and checks the station id, name, distance, years of record, the 1991-2020 period,
  the LIVE badge, the dual-date disclaimer, the retired statements, and the no-lifespan /
  no-ratio / no-cost guards.

---

## 7. Open items

1. **The actuals series is 11 months and will lengthen** as the weekly ingestion appends. Worth
   revisiting once it spans a full cycle, if a month-versus-normal reading is ever wanted — that
   is a comparison, and comparisons invite trend claims off single months (Round 12's lesson),
   so it is deliberately not built here.
2. **AC Lifespan is still blocked** on address + CAD year-built. The multiplier label stands as
   recorded.
3. **All three TEMP probe steps remain deletable** in one `git rm` of
   `.github/workflows/noaa-climate-probe.yml`. Their question is settled.
4. Four unflagged legacy seed rows remain in other stub datasets (Round 19 §4a).
