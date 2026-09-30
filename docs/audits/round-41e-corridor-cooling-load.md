# Round 41e — cooling load for New Braunfels and San Marcos

Date: 2026-09-30 · Branch: `claude/thi-v3-round41e-corridor-cdd`, from `origin/main` at
`a3af8ea` — the Round 41d merge, with 41a, 41c and 41d confirmed in base by `git merge-base`.

Added: this file. **Nothing was implemented** — §5 says why, and it is the instruction, not an
omission.

19 requests, all to `www.ncei.noaa.gov`, **none refused by the robots guard**. That is itself a
result: every one of them would have been refused before Round 41d.

---

## 1 · The bar, as it exists

Copied out of `src/ingest/fetchers/noaaClimate.ts`, not restated:

| Constant | Value | Effect |
|---|---|---|
| `BOX_PAD_DEGREES` | 0.35 | candidate must be within ±0.35° of the point |
| — | `USW` prefix | first-order stations only |
| — | `years_MLY-CLDD-NORMAL` present | absent ⇒ record length uncheckable ⇒ reject |
| — | 12/12 months usable | fewer ⇒ reject |
| `ESTIMATED_FLAG` | `"E"` | **any** month flagged E ⇒ reject |
| `MIN_YEARS_OF_RECORD` | 10 | **any** month under 10 years ⇒ reject |

Round 19c is the precedent: Kelly AFB is 6.1 mi from San Antonio — nearer than the station
actually shipped — and was rejected because every row read `years=2, comp_flag=E`.

**The controls confirm the probe applies that bar and not a new one.** Run against Austin's and
San Antonio's own points it reproduces what the site ships today, including the Kelly rejection:

| Point | Selected | Distance | Years | Flags |
|---|---|---|---|---|
| Austin | **USW00013958** Camp Mabry | 3.8 mi | 29–30 | S ×12 |
| San Antonio | **USW00012970** Stinson Muni | 6.0 mi | 19–20 | R ×12 |
| — | *rejected:* USW00012909 Kelly AFB | 6.1 mi | **2** | **E ×12** |

---

## 2 · New Braunfels

Five USW stations inside the box:

| Verdict | Distance | Station | Result |
|---|---|---|---|
| **PASS** | **5.2 mi** | **USW00012971** `AUSTIN SAN ANTONIO` | 12/12 months, years **17–20**, flags R ×12, no estimated months |
| FAIL | 14.5 mi | USW00012911 Randolph AFB | **12/12 flagged E**, years 2 — the Kelly signature exactly |
| FAIL | 19.6 mi | USW00012910 San Marcos Gary AFB | no 1991-2020 monthly normals published |
| FAIL | 20.0 mi | USW00012979 San Marcos Muni AP | no 1991-2020 monthly normals published |
| FAIL | 31.4 mi | USW00012931 San Antonio Brooks AFB | no 1991-2020 monthly normals published |

**New Braunfels passes cleanly, and the station is genuinely local** — 5.2 miles, nearer than
San Antonio's own shipped station at 6.0 miles. Its record is shorter than Austin's (17–20 years
against 29–30) but well clear of the 10-year floor, and no month is estimated.

**GSOM actuals:** 141 monthly rows, 2015-01 → 2026-09 — the same depth as both controls, so the
normal has actuals to sit beside and Round 19d's "normals without actuals must throw" does not
bite.

---

## 3 · San Marcos

Five USW stations inside the box:

| Verdict | Distance | Station | Result |
|---|---|---|---|
| FAIL | **4.2 mi** | USW00012910 San Marcos Gary AFB | **no 1991-2020 monthly normals published** |
| FAIL | **4.5 mi** | USW00012979 San Marcos Muni AP | **no 1991-2020 monthly normals published** |
| PASS | 12.9 mi | **USW00012971** `AUSTIN SAN ANTONIO` | 12/12 months, years 17–20, flags R ×12 |
| PASS | 26.4 mi | USW00013904 Austin Bergstrom | 12/12 months, years 24–26 |
| FAIL | 30.6 mi | USW00012911 Randolph AFB | 12/12 flagged E, years 2 |

**Both stations named San Marcos publish no normals at all.** The city's own airport and Gary
Field are in the GHCND station table — they report daily observations — but neither has a
1991–2020 monthly normal. So San Marcos falls through to a station **12.9 miles away**, and that
station is New Braunfels'.

**Against the rule as coded, San Marcos passes.** 12.9 mi is inside the 0.35° box and
USW00012971 clears every quality test. I am reporting a pass because that is what the existing
bar returns, and §2B said not to invent a new one.

**Against the rule as written, it is weaker than that, and this is the judgement you asked for.**
41c's governing sentence is *"a reading labelled with a location must be measured at that
location."* A San Marcos cooling-load figure would be:

- measured **12.9 miles away** — more than twice the distance of any station the site ships
  (3.8 mi, 6.0 mi), and outside the city by any reading of it;
- **the same measurement New Braunfels would show** — one station, one set of twelve numbers,
  appearing under two city names.

That last point is the one I would not wave through. Two "local" readings that are byte-identical
because they are the same station is very close in shape to what Round 41a just fixed, where one
county's numbers appeared under another county's name. It is not the same offence — the station
really is within range of both, and nothing would be mislabelled if the page named the station —
but a reader comparing a New Braunfels page with a San Marcos page would see identical figures
and reasonably conclude they were two measurements agreeing, rather than one measurement shown
twice.

---

## 4 · What a reading would say

USW00012971, 1991–2020 monthly cooling degree days (base 65°F), against the two the site ships:

| | Jan | Apr | Jul | Aug | Oct | **Annual** |
|---|---|---|---|---|---|---|
| **USW00012971** *(corridor)* | 10.0 | 176.4 | 604.5 | 622.9 | 225.5 | **3,144** |
| USW00013958 Camp Mabry *(Austin)* | 9.6 | 171.7 | 644.8 | 664.8 | 238.3 | **3,290** |
| USW00012970 Stinson *(San Antonio)* | 11.0 | 206.6 | 643.3 | 667.9 | 263.9 | **3,474** |

The corridor station is **4% below Austin's and 9% below San Antonio's** on the annual total, and
the gap widens in the peak months — roughly 40 degree-days per month lower in July and August
than either metro. **So this is a genuinely different reading, not a relabelled metro figure.**
That was the thing worth establishing: a station that merely echoed the metro would not be worth
the work.

**One rendering hazard.** The station's published name is `AUSTIN SAN ANTONIO`. On a New
Braunfels page, a source line reading *"NOAA NCEI, station USW00012971 (AUSTIN SAN ANTONIO),
5.2 mi"* would look like an error or a mislabel to a reader in New Braunfels. The name is NOAA's
and cannot be changed; whatever renders it has to handle that, either by leading with the
distance or by carrying the station id without the name. Flagged now because it is the kind of
thing that gets noticed after publication.

---

## 5 · Nothing was implemented, per §2C

There is nowhere to store a per-location reading. `noaaClimate.ts` writes
`noaa-climate/{location}.json` keyed by `AreaId`, and New Braunfels is not an area — giving it
one would make it a metro. This is the same wall Round 41c hit with Census ACS, and it is 41b's
to remove.

**No existing reading changed**, and none could have: nothing was touched. `dist/client` is
byte-identical to `main` across all 355 files.

---

## 6 · The answer

| City | Verdict | Station | Distance | Record |
|---|---|---|---|---|
| **New Braunfels** | **PASS — ship it when 41b allows** | USW00012971 | 5.2 mi | 17–20 yrs, no estimated months, 141 monthly actuals |
| **San Marcos** | **PASS by the rule; I recommend withholding** | USW00012971 | 12.9 mi | same station, same numbers as New Braunfels |

**New Braunfels gets a real cooling-load reading** — closer to its station than San Antonio is to
its own, measurably different from both metros, with a full actuals history behind it.

**San Marcos is the honest no.** Its two local stations publish no normals, and what the rule
returns instead is New Braunfels' station a dozen miles off. My recommendation is to withhold it
and say why on the page, in the same way the permit gap will be stated: *San Marcos has no
weather station publishing a 30-year normal, so no local cooling-load figure is published.* That
is a true sentence, and it is better than two pages quietly sharing one number.

If you would rather show it, the defensible version is to label the reading by its **station and
distance** rather than by the city — which is the same discipline the drought pages now follow
after 41a.

---

## 7 · Cleanup

`.github/workflows/tmp-cdd-probe.yml` — **deleted**; `.github/workflows/` holds only the eight
pre-existing files. `tmp/cdd/` — **deleted**. 19 requests, all metadata and normals lookups; no
bulk rows landed. Every figure here is recorded above; nothing is cited to `tmp/`.
