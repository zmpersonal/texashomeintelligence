# Round 21b — SWDI answered; the window was wrong, and so was my error handling

**Report only. Nothing built.** Output is observable only on a dispatch after merge.

---

## 1. What I got wrong

Round 21 concluded **"NEITHER SWDI BASE ANSWERED"** and stopped. Both answered, identically:

```
ERROR VALIDATING 'dateRange=startDate:endDate'. 'startDate' must be a date before
'endDate' and maximum date range currently allowed is 744 hours.
```

744 hours is **31 days**. The probe asked for **365**.

**The window was the surface error. The structural defect was in my `get()` helper**, and it is
the one worth keeping:

```python
except urllib.error.HTTPError as e:
    ...
    print(f"    body: {detail[:500]!r}")   # printed
    return e.code, None, host             # and discarded
```

With `body` always `None` on an HTTPError, the call site's `if body:` cannot tell a
500-carrying-a-validation-message from a refused connection. **A rejected parameter was read as
an unavailable source** — which is exactly the rounds 19–19e failure, one product over. The
evidence was in my own log; the control flow ignored it.

The rule "if a host is unreachable, stop rather than substituting a sibling" was correct. It was
applied to a host that was not unreachable.

### The fix, and it is structural

`get()` now returns a `Resp` carrying the error body, and reachability is classified in **three
states, never two**:

| State | Meaning |
|---|---|
| `OK` | 2xx with a body |
| `ANSWERED WITH AN ERROR` | any status — **the service is reachable and rejected the request** |
| `NO RESPONSE` | transport failure; the only state that means unreachable |
| `REFUSED BY ALLOWLIST` | this probe declined to ask |

Dry run, with the real 500 body in play:

```
[ncdc nx3hail, 31-day window] HTTP 500 Server Error — THE SERVER ANSWERED.
  body: ERROR VALIDATING 'dateRange=startDate:endDate'. … 744 hours.
  -> ANSWERED WITH AN ERROR
[ncei nx3hail, 31-day window] HTTP 200, 131 bytes, text/csv
  -> OK
```

---

## 2. What the corrected probe will report

**Part 1 — SWDI within its stated limit.** 31-day windows throughout.

| Item | How it answers |
|---|---|
| 1 · which base, columns, token, lat/lon | Three-state reachability on both bases; **COLUMNS AS RETURNED**; prints that no token was sent and says to read the body if one is demanded |
| 2 · lag | Newest record parsed from the response, differenced against the runner's date |
| 3 · size and units | Prints size/magnitude columns **with values**; detects a units column and prints its distinct values; emits the 25× inches-vs-millimetres caution **only when no units column exists** |
| 4 · county field | Reports county/FIPS columns per dataset, and notes that their absence means a rollup must be **derived from lat/lon, not read**. `nx3hail` and `plsr` are probed separately and never merged — radar signatures and human reports are different products |
| 5 · cost | Runs the real 12-window sweep and reports measured request count and elapsed time |
| 6 · Bexar vs Travis | Totals per county area per dataset over the same 12 windows |

**On cost, the honest framing the probe prints:** a 12-month **backfill** is 12 requests per
metro per dataset — **48 once**. An **incremental** run needs one window per metro per dataset —
**4, and that is the number that recurs**. SWDI is free and unauthenticated, so against COST.md
this is Actions minutes, not spend. Judge the recurring number.

**On Bexar, and this is context the probe states in its own output:** Texas hail frequency rises
sharply north toward Dallas–Fort Worth; Austin sits at the southern edge of that gradient and
San Antonio largely outside it, so **few or zero records is the expected result, not a fault**.
The owner has approved an honest "no hail recorded in this window" state, so zero is a usable
finding for Roof Scan. And a non-zero `nx3hail` count over Bexar would **not** refute Round 12's
Storm Events finding — it would mean radar saw a signature nobody reported.

**Part 2 — hardness.**

- **§6 asks what USGS is actually sampling.** It prints `ActivityMediaName`,
  `MonitoringLocationTypeName`, and the distinct `MonitoringLocationIdentifier` /
  `MonitoringLocationName` values with row counts, then states plainly that these are **ambient**
  samples — untreated water in streams, springs and wells. A utility blends and treats sources
  before delivery, so this series **can describe a watershed but cannot answer "how hard is my
  water"**.
- **§7 opens the pages Round 21 listed and never followed** — including the two SAWS pages named
  in the brief — and **prints the text window around every "hardness" mention verbatim**.

### Why Round 21's matcher missed Austin's figure — two separate causes

1. **It never fetched the page.** Candidate selection was `(pdfs or seen)[:3]`, so the moment a
   landing page linked any PDF, **every HTML candidate was discarded**. Austin Water publishes
   its treated hardness *in page text*.
2. **Even on the page, the pattern could not match it.** The matcher wanted
   *number-then-unit*; Austin's layout is a **table header followed by values** —
   `Total Hardness (as CaCO3) (ppm) [gpg] Not applicable 70 [4.1] 126 [7.4] 93 [5.4]` — so the
   unit precedes the numbers. It would have reported **zero mentions with a figure** on a page
   plainly carrying one.

The fix is to stop trusting the regex's verdict: the probe now prints the **verbatim window**,
the units named in it, and every number in order. Dry run:

```
WINDOW 1: ...Total Hardness (as CaCO3) (ppm) [gpg] Not applicable 70 [4.1] 126 [7.4] 93 [5.4]...
  value+unit pairs: []
  units named in the window: ['gpg', 'ppm']
  every number in the window, in order: ['3', '70', '4.1', '126', '7.4', '93', '5.4']
  (a chemical formula contributes digits — the 3 of CaCO3 lands in that list; read the
   window, not the list)
```

A human reading that window cannot be fooled. A regex reporting a count can.

---

## 3. Dry-run defects caught this round

**Defect 1 — WQP's Result profile is not its Station profile.** The location columns are read by
exact name, and `resultPhysChem` may not carry them at all. Keying on blanks would have printed
a table of empty names that reads as "we found nothing". Now reported explicitly:

```
LOCATION COLUMNS ABSENT from this profile:
  ['MonitoringLocationIdentifier', 'MonitoringLocationName']
They are published by WQP's STATION profile (/data/Station/search), a different request.
Round 21b does not assume its columns — it says they were not in what was read.
```

That is the same trap as rounds 19–19e — two products of one service with different columns —
caught this time before the dispatch rather than after.

**Defect 2 — a chemical formula contributes digits.** `CaCO3` puts a spurious `3` at the head of
the number list. Noted in the output rather than filtered, because filtering digits out of
formulas is how a real value gets dropped too.

**Four scenarios, all reaching a sentinel:**

| Scenario | Result |
|---|---|
| Every host denied (this sandbox) | `R21B_PROBE_STATUS=complete requests=9 ok=0 http_error=0 no_response=9` |
| Full fixtures, incl. the real 500 body | `R21B_PROBE_STATUS=complete requests=61 ok=60 http_error=1 no_response=0` |
| Result profile without location columns | absent columns reported, no blank table |
| Injected crash | `R21B_PROBE_STATUS=error … crash=RuntimeError: injected` |

---

## 4. Recommendation for Pipe Report — recommend, do not implement

**Use the utility's treated figure as the reading. Use USGS ambient only as context, if at
all, and never without the distinction on the page.**

- A homeowner asking about hardness is asking what comes out of their tap — which is treated,
  blended, delivered water. **Only the utility publishes that.**
- USGS ambient samples answer a different question. Bexar's 84.6–324 mg/L spread is not
  measurement error; it is **different water bodies**. Publishing a range that wide as "your
  water" would be wrong in a way a reader cannot detect.
- Austin Water's figure is already a usable shape: **low 70 ppm / 4.1 gpg, high 126 / 7.4,
  average 93 / 5.4** — a range with an average, which is honest about seasonal and zonal
  variation. SAWS's equivalent is what §7 goes looking for.
- **A once-a-year human read is the right cadence** and is not a compromise. A CCR is published
  annually; a fetcher polling it weekly would be re-reading an unchanged document. The site
  already carries notices with `checkedByHumanOn` review dates — that is the mechanism, and it
  fits this exactly.

If both are ever shown together, the ambient series must be labelled as untreated source water
and never averaged with the treated figure.

---

## 5. Verification

- YAML parses; all embedded scripts compile.
- **Nothing under `site/src/` changed**; generated data byte-identical to HEAD.
- `npm run check` 187 files, **0/0/0** · `build` clean · `verify-content` passes.
- All build artefacts byte-identical to the `260c25f` build.
- Full cold-start replay suite green.

## 6. Open items

1. **Dispatch the Round 21b step.** The fixtures prove the probe's behaviour, not the sources'
   contents.
2. Decide the hardness cadence (§4) — a once-a-year human read with a `checkedByHumanOn` date.
3. Roof Scan's empty-state decision is already approved; the counts tell you which metro needs it.
4. Four TEMP probe steps now sit in one workflow. One `git rm` removes them all once both
   questions are settled.
