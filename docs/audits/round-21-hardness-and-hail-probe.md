# Round 21 — Probing water hardness and point-level hail

> ## ⛔ CORRECTED BY ROUND 21b — "NEITHER SWDI BASE ANSWERED" WAS WRONG
>
> **Both bases answered.** Both returned, in a body this probe's own `get()` printed:
> `ERROR VALIDATING 'dateRange=startDate:endDate'. … maximum date range currently allowed is
> 744 hours.` 744 hours is 31 days; the probe asked for 365. The service was reachable, parsed
> the request, and named its constraint.
>
> The window was the surface error. **The structural defect is that `get()` returns
> `(status, None, host)` on an HTTPError** — it prints the body and discards it — so at the call
> site `if body:` is False for a 500-with-a-validation-message exactly as for a refused
> connection. A rejected *parameter* was read as an unavailable *source*: the rounds 19–19e
> failure, one product over.
>
> §2's "if neither answers it stops" and the Part 2 findings below are superseded. See
> `round-21b-swdi-window-and-hardness.md`. §3's four dry-run defects and Part 1's design stand.

**A probe, not a fetcher.** Two hero tools are blocked on one feed each; this round measures
whether either is reachable and prints what it contains. Nothing was built, nothing entered
`src/data/generated/`, and the probe's output is **observable only on a dispatch after merge**.

---

## 1. What was added

One step in the existing `.github/workflows/noaa-climate-probe.yml` — no new file — following
the Round 16b pattern: `workflow_dispatch` only, explicit `permissions: contents: read`, no
checkout, no commit step, no token on any request, `$RUNNER_TEMP` only, `continue-on-error`, an
`excepthook` that guarantees a status line, and a `TEMP` header marking it for deletion.

### The lesson it is built around

Rounds 19–19e cost five attempts because each fetcher was built on column names measured from a
**sibling product** — the NOAA normals API and the NOAA normals static CSV carry different
columns, and reading one list as though it were the other is what failed, repeatedly. So every
section here prints **the columns the queried endpoint returned**, and no finding about one
product is written up as a finding about another. Part 2 enforces that structurally by probing
`nx3hail` and `plsr` separately and refusing to merge their counts.

### The aggregator problem is handled structurally, not by care

Searching for "San Antonio water hardness" returns softener-vendor pages quoting several
different numbers. This probe **cannot reach them**: `ALLOWED_HOSTS` is a hard allowlist of the
two utilities and the federal services, `get()` refuses anything else before the request is
made, every printed figure is labelled with the host that served it, and discovered off-host
links are **printed as SKIPPED** rather than dropped silently.

---

## 2. What the probe will report

**Part 1 — water hardness**

| § | Question | How it answers |
|---|---|---|
| 1 | What SAWS and Austin Water publish | Fetches four landing pages, reports hardness mentions **in the page text itself**, then lists on-host candidate documents **discovered from the links** — no filename is guessed (Round 19b guessed one and got a 404) |
| 2 | PDF or machine-readable; extractable or a human read | Downloads up to four discovered documents, runs the stdlib FlateDecode extractor, and prints value **with units** for every hit. Recovering nothing prints **INCONCLUSIVE**, explicitly *not* "the report has no hardness figure", and names a once-a-year human read as an acceptable answer |
| 3 | USGS / EPA in machine-readable form | Queries the USGS **Water Quality Portal** per county with `characteristicName=Hardness, Ca, Mg` and prints **COLUMNS AS RETURNED** plus value/units/date/organisation; queries **EPA Envirofacts SDWIS** and prints its real keys |
| 4 | The aggregator problem | The allowlist, plus a printed SKIPPED line per off-host link |

The probe carries one standing caution in its own output: **SDWIS is a compliance inventory**
— systems, violations, regulated contaminants — and hardness is not a regulated contaminant, so
its presence there must be shown rather than assumed.

**Part 2 — point-level hail**

| § | Question | How it answers |
|---|---|---|
| 4 | Endpoint and token | Tries `swdiws` on both `ncdc` and `ncei` hosts, prints the first 600 bytes, and reports whether anything demanded a token. **If neither answers it stops** — no sibling source is substituted |
| 5 | What a real query returns | Per metro, per dataset: **COLUMNS AS RETURNED**, whether per-record lat/lon are present, size/magnitude columns with their values, a **units column if one exists** (and the 25× inches-vs-millimetres caution only when one does not), county/geography columns, and two rows verbatim |
| 6 | Publication lag | Newest record parsed from the response, differenced against the runner's own date |
| 7 | Round 12's Bexar finding | Both counties over one stated window, with the semantic warning below |

**On geography, stated in the log:** the bounding boxes are ±0.5° around each metro's
**representative point** from `zip-areas.ts`. They are **not county boundaries** and are not
claimed to be — no county polygon has been measured.

**On Round 12:** it measured *no hail in Bexar* from NCEI **Storm Events** — county-level human
reports. `nx3hail` is **radar-derived signatures**; `plsr` is human reports; the windows differ.
A non-zero `nx3hail` count over Bexar would **not refute** Round 12 — it would mean radar saw a
signature nobody reported. The probe says so in its own output so the write-up cannot quietly
merge them.

---

## 3. The offline dry run, and the four defects it caught

Run against fixtures modelling a CCR landing page linking both its own PDF **and a softener
vendor**, a FlateDecode PDF carrying a hardness figure, a scanned PDF that yields nothing
useful, a WQP CSV, an EPA JSON row, and SWDI responses including an **empty** one for Bexar.

**Defect 1 — the aggregator guard was invisible.** Off-host links were filtered out silently.
The allowlist worked and no request was made, but the log could never *show* the guard firing —
which is half of what item 4 asks for. Now printed:
`SKIPPED https://bestsoftener.example.com/san-antonio-water-hardness`.

**Defect 2 — the same document downloaded twice.** Two SAWS landing pages discovered the same
PDF, so section 2 fetched and reported it twice, and Austin's likewise. Deduped by URL:
**4 document fetches → 2**.

**Defect 3, and the worst of them — the probe asserted an absence its own response
contradicted.** A hardcoded line read *"UNITS ARE NOT PRINTED BY THE CSV"* while the `plsr`
response carried a `UNITS` column reading `INCHES`. That is precisely the failure this round
exists to avoid, committed in my own prose rather than in a fetcher. Now the probe **detects a
units column and prints its distinct values**, and only emits the 25× caution when no such
column exists. Post-fix, the two products report differently and correctly:

```
plsr    : UNITS COLUMN PRESENT — UNITS: ['INCHES']
nx3hail : NO UNITS COLUMN IN THIS RESPONSE. … must be read from SWDI's
          documentation before anything is published
```

**Defect 4 — in my fixture, not the probe, and it had hidden a whole code path.** The fixture
routed on the substring `"-98."`, which also matches Austin's western bbox edge `-98.2431`, so
Austin's `nx3hail` query was served San Antonio's empty response and **the nx3hail parsing path
was never exercised**. Routing on the bbox centre instead exposed it — and the run then produced
a genuinely useful finding: `nx3hail` returns
`['ZTIME','LON','LAT','WSR_ID','CELL_ID','RANGE','AZIMUTH','SEVPROB','PROB','MAXSIZE']`, so
**coordinates YES, county/geography columns NONE** — a county rollup from `nx3hail` would have
to be derived from lat/lon rather than read.

**Three scenarios, all reaching a sentinel:**

| Scenario | Result |
|---|---|
| Every host denied (this sandbox) | `R21_PROBE_STATUS=complete requests=10 ok=0 failed=10 refused=0 pdfs=0` |
| Realistic fixtures | `R21_PROBE_STATUS=complete requests=16 ok=15 failed=1 refused=0 pdfs=2` |
| Injected crash after the hook | `R21_PROBE_STATUS=error … crash=RuntimeError: injected after hook` |

---

## 4. Verification

- YAML parses; both embedded scripts compile (`py_compile`).
- **Nothing under `site/src/` changed** and generated data is **byte-identical to HEAD** —
  the diff is the workflow and this document.
- `npm run check` — 187 files, **0 errors, 0 warnings, 0 hints**.
- `npm run build` clean · `npm run verify-content` passes.
- All build artefacts byte-identical to the `9176d7c` build.
- Full cold-start replay suite green.

---

## 5. Open items

1. **Dispatch the Round 21 step.** Nothing here is a finding about the real world yet — the
   fixtures prove the probe's *behaviour*, not the sources' contents.
2. **A once-a-year human read of a CCR is an acceptable outcome** for hardness and is worth
   deciding on before a fetcher is scoped; the site already carries notices with review
   cadences, which is the shape that would fit.
3. **If SWDI shows nothing for Bexar**, Roof Scan renders an honest empty state in one launch
   metro. That is a product decision to take before building, not a bug to discover after.
4. The three earlier TEMP probe steps remain deletable; this one joins them. One `git rm`
   removes all four once both questions are settled.
