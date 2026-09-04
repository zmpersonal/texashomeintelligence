# Round 16 — Travis CAD parcel data + Microsoft Building Footprints: probe

**No fetcher, dataset, registry entry, or `dataFreshness.ts` window was written.** The round's
own rule decides this: *"Before writing a fetcher, probe both sources and report what you
actually find… If either host is denied, say so and stop rather than building against an
assumption."* Both are denied. A third finding — the footprint licence — would have stopped the
round independently.

Date: 2026-09-04 · Branch: `claude/thi-governance-post-launch`

---

## 1. The brief's network premise is incorrect for this container

The brief states: *"Both traviscad.org and github.com are in this container's network
allowlist, so unlike every recent round these fetches may actually succeed here. Test before
assuming."* Tested. They are not.

| Host | What lives there | Result |
|---|---|---|
| `traviscad.org` | the parcel roll | **DENIED** — `connect_rejected` |
| `www.traviscad.org` | same | **DENIED** — `connect_rejected` |
| `tcadseoprod.blob.core.windows.net` | TCAD's own blob host (guessed; unconfirmed) | **DENIED** — `connect_rejected` |
| `minedbuildings.z5.web.core.windows.net` | **every footprint `.zip`, including Texas** | **DENIED** — `connect_rejected` |
| `github.com` | the footprint repo's HTML page | HTTP 403 |
| `raw.githubusercontent.com` | the repo's README | **HTTP 200 — the only thing that worked** |
| `api.github.com` | repo metadata | HTTP 200 |

`connect_rejected` is the proxy refusing the CONNECT with a 403 — an organization policy
denial, recorded by the proxy's own status endpoint, not a transient network error. It does not
retry into success.

**The wider finding, which matters more than this round: every data host this project ingests
from is denied from this container.**

| Host | Ingested by | Result |
|---|---|---|
| `data.austintexas.gov` | `austinPermits`, `permitTradeActivity` (**daily, successfully, in CI**) | **DENIED** |
| `data.sanantonio.gov` | `sanAntonioPermits` | **DENIED** |
| `api.weather.gov` | `nws` | **DENIED** |
| `www.eia.gov` | `eiaElectricityPrice` | **DENIED** |
| `droughtmonitor.unl.edu` | `usdm` | **DENIED** |

Reachable: `raw.githubusercontent.com`, `api.github.com`, `registry.npmjs.org`. That is
developer infrastructure, not data. **The allowlist here is narrower than the GitHub Actions
runner's**, which is why the six fetchers above run green in CI and none of them can run here.
Nothing about this is new to Round 16 — Round 4 recorded the same wall, and Round 13b found the
egress proxy denies every citation host — but the brief's premise made it worth re-measuring
rather than assuming.

**Consequence: the Travis CAD file was never opened.** Its real download URL, byte size, format,
record layout, field dictionary and update cadence are all unverified. The brief names
`improvement_detail_2026.zip`, ~69MB, carrying year built, improvement area, class and stories.
That is the brief's description, and the brief also says *"Do not infer a URL from this brief —
find it."* It could not be found. Everything downstream of opening that file is therefore
unanswered, and is marked so below rather than estimated.

---

## 2. What the reachable source does say (Microsoft Building Footprints)

Read from `raw.githubusercontent.com/microsoft/USBuildingFootprints/master/README.md`,
HTTP 200, 13,784 bytes. This is the repository's own README — a primary source for the
*description* of the data, though not for the data itself.

- **Texas:** 10,678,921 footprints, **2.83 GiB compressed**, one statewide
  `Texas.geojson.zip`. There is no county-level download; a Travis-only subset means fetching
  the whole state and clipping.
- **Vintage:** derived from Bing imagery of mixed capture dates. Footprints in the focal
  region are 2019–2020; the rest average approximately 2012. Per-footprint capture-date tags
  exist "if we were able to deduce the vintage" — i.e. not universally.
- **Contents:** polygons. The README documents no year-built, class, or stories attribute.
  It is roof *outlines*, not building characteristics.

### ✏️ CORRECTED IN ROUND 16b — this was overstated

> **The heading below originally read "a stop on its own". That was wrong in the direction of
> caution.** ODbL permits commercial use outright; share-alike attaches to a *Derivative
> Database that is publicly used*, not to a Produced Work such as a rendered roof-area figure.
> The genuinely unsettled question is narrower — whether serving numbers out of a stored
> polygon table crosses that line. **Deferred, not rejected**, with two alternatives worth
> pricing first (Overture Maps; CAD improvement area, which yields roof area with no polygon
> and no licensing question at all). See HANDOFF for the correction in full. The section below
> is kept as written, minus its verdict, because the measurements in it stand.

### The licence question, which must be answered before any footprint ingestion

> "This data is licensed by Microsoft under the **Open Data Commons Open Database License
> (ODbL)**."

ODbL is a **share-alike** licence. It obliges anyone publishing a Derivative Database to
license that database under ODbL, and to carry attribution on Produced Works. The round brief
says: *"if licensing terms restrict republication, report it and stop."* This does.

This is not a "cite the source" formality of the kind every other feed on this site satisfies
with a `SourceRef`. Every other ingested source here is US federal or municipal public data
with no share-alike obligation. ODbL is the first that would attach a continuing condition to
what THI publishes and stores, on a commercial site, and the boundary between a Produced Work
(a rendered roof-area figure — attribution) and a Derivative Database (a stored, queryable
table of Travis County roof polygons — share-alike) is exactly where this project would sit.

**This is an owner decision, and it is a question to answer rather than a door that is
closed** — see the Round 16b correction above. It should be resolved before any footprint
ingestion is written. It does **not** affect Travis CAD, which is Texas public record.

---

## 3. The storage decision — reported, not implemented

The brief asks for this to be decided the way Round 8's monthly-aggregate question was. The
honest answer is the escape hatch the brief itself names: *"If the honest answer is that this
data needs a different storage mechanism than the existing datasets, say so and stop for a
decision."* It does.

### Why per-parcel records cannot enter `src/data/generated/`

Measured in this repository, today:

| | |
|---|---|
| whole generated archive | **2.5 MB**, 25 files |
| largest single dataset | `municipal-permits/san-antonio.json`, **1.4 MB** for 5,148 observations |
| cost per stored observation, with envelope | **~272 bytes** |
| `dist/server` | 1,002,699 bytes |
| `.git` | 23 MB |

And the mechanism, from `src/lib/datasets.ts`:

```ts
const generatedFiles = import.meta.glob<{ default: DatasetFile<unknown> }>(
  "../data/generated/*/*.json",
  { eager: true },
);
```

**`eager: true` means every generated JSON is loaded into the build, in full, whether or not a
page reads it.** There is no lazy path and no per-dataset opt-out. A file placed in that
directory is a file the build parses.

Travis County's parcel count is **unverified** (the file could not be opened), so the
arithmetic is given per 100,000 records rather than as a total:

| shape | per 100k records | at a plausible few hundred thousand residential parcels |
|---|---:|---|
| full observation envelope (as permits are stored) | ~27 MB | **10–40× the entire current archive**, in one eagerly-imported file |
| trimmed to 4 fields, no envelope (~100 B) | ~10 MB | 4–16× the archive |

Either shape is decisively out. The trimmed variant also forfeits the provenance the round's
own item 3 requires — `source`, `dataThrough`, `lastSuccessAt`, per-observation `observedAt` —
which is not an acceptable trade for a dataset the tools would present to homeowners.

### What the two data shapes actually are

They have different answers and conflating them is what makes this look like one decision:

**(a) Aggregate/derived statistics — fits the existing mechanism today.**
Per-ZIP or per-area rollups: median year built, count of homes by decade band, median
improvement area, distribution of stories. For ~225 ZIPs across a handful of fields this is
**single-digit KB**, carries full provenance naturally, and is exactly the shape the archive
was built for. It is also what two of the three named tools mostly need: "your 1978 home is
older than 68% of homes in 78704" is an aggregate question, and the comparison is the product.

**(b) Per-parcel lookup — needs a keyed store, not a bundled JSON.**
"What year was *this* house built" is a point lookup on an address. That belongs in **D1**
(already bound, already the home for the observations history per CLAUDE.md's two-domain
split) or KV — not in a file the build parses on every page. This is also the only shape the
ODbL question bites on, since a stored queryable table is the Derivative Database case.

**The useful observation: (b) is already blocked on something the brief defers anyway.** A
per-parcel store is only reachable through an address→parcel join, and the brief says: *"no
address input, no autocomplete, no address-to-parcel join — that is a later round and it needs
a provider decision."* The storage question and the join question are the same question. They
should be decided together, in that later round, rather than half-answered now by a fetcher
that writes into the wrong place.

**Round 15c has since settled the provider half of that** — Google Places, Essentials
Autocomplete, free tier, with a mandatory KV spend ceiling and an edge rate limit
(`HANDOFF.md`, and the COST.md rule-1 conflict recorded there). So the address-field round now
has its provider and is waiting on this one for parcel data; this round is waiting on egress.
Neither blocks the other, and the storage decision above belongs to whichever lands second.

### Recommendation

1. **Do not add per-parcel records to `src/data/generated/`.** Not at any granularity — the
   eager glob makes it a build-wide cost.
2. **When the network is fixed, ingest into a raw staging path outside the glob** (e.g.
   `site/data-raw/`, gitignored, produced on the Actions runner), and commit only aggregate
   (a) into `src/data/generated/`. That gives the tools their comparison layer at KB scale
   with real provenance.
3. **Defer (b) to the address-join round**, where the provider decision, the D1 schema, and the
   ODbL answer can be taken together.
4. **Resolve ODbL before any footprint work.** Travis CAD is unaffected and can proceed first.

---

## 4. Field coverage — NOT MEASURED, and not estimable

The brief asks for year-built coverage and null rate, improvement-area coverage, class and
stories fields, residential parcel count, and footprint coverage against parcel count.

**None of it was measured, because neither file could be opened.** No figure is offered.

This is stated plainly because the brief's own instruction — *"If a field the tools need is
absent or largely null, say so plainly now rather than after a tool is built on it"* — is
precisely the risk that Round 6 already proved real on this project: both cities publish a
field called "valuation" and in neither does it mean what a homeowner would assume, which is
only knowable by reading the actual distribution. **Assuming `year built` is well-populated
because a field dictionary lists it would repeat exactly that mistake.** Round 6's own
conclusion applies: the shape of this data actively invites the wrong assumption.

The measurement must happen on a runner with egress, before a tool is designed against it.

---

## 5. The annual refresh check — recommended, not built

Travis CAD certifies a roll annually (typically midsummer) and issues supplements through the
year, so the interesting event is "a new file was published", not "a value changed".

**Recommended shape**, following the citation-check posture exactly — open an issue, never fail
a build:

- A `workflow_dispatch` + `schedule` job on the **1st of each month**. Monthly, not weekly: an
  annual roll with occasional supplements does not reward a weekly poll, and 12 requests a year
  is not a poll under COST.md rule 3.
- **One `HEAD` request** against the published file. Compare `Last-Modified`, `ETag` and
  `Content-Length` against a small committed fingerprint file. No body is read; nothing is
  downloaded.
- On change → open a GitHub issue naming the old and new fingerprint. On no change → exit
  silently.
- **Reuse Round 15b's sentinel discipline verbatim.** The job must print a status sentinel and
  the workflow must classify on it, so "TCAD published a new roll" and "the checker crashed"
  are different issues with different titles. Round 15b established why: a dead-link run and a
  startup crash both exit 1, and reading the exit code alone reports a crash as a finding.
- **Cost: 12 HEAD requests a year on free Action minutes.** No egress cost, no storage, no
  build impact.

Not built this round because there is no URL to point it at — finding that URL is the same
blocked step as everything else here.

---

## 6. What a future round needs, in order

1. **Egress for `traviscad.org` and `minedbuildings.z5.web.core.windows.net`** — or run the
   probe as a `workflow_dispatch` job on the Actions runner, which already reaches every other
   data host. *(This is the cheapest unblock and needs no infrastructure change: the runner
   works today.)*
2. **An ODbL answer from the owner** before any footprint ingestion.
3. **Then** the measurement in §4, on the runner, reported before any tool is designed.
4. **Then** the storage decision in §3, taken together with the address-join provider decision.

Bexar CAD is unchanged: no bulk export, PIA request outstanding, San Antonio stays without
parcel data. Nothing in this round alters that.
