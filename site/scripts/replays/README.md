# Local verification replays

These run the **built worker** in a browser and assert on what it actually renders.
A green `npm run build` does not catch a dropped source line, a withheld day shown
anyway, or an action that says "fix" instead of "check" — these do.

## The order matters

The worker keeps local D1 **in memory** and flushes its own state back over anything
written underneath it, so the fixture must be applied while the worker is **stopped**.

> ⚠️ **`npm run fixture:check` can say PRESENT while the render fixture is gone.** It tests one
> D1 row, and D1 state survives in `.wrangler/state` across builds — but `npm run build`
> **deletes** `dist/client/data/stress-index/fixture-condition.json`, which is what r7replay's
> four condition-card assertions actually read. So after any rebuild you must re-run
> `npm run fixture` even when the check reports PRESENT; skipping it fails those four
> assertions with "no card rendered", which looks exactly like a product regression and is not
> one. (Cost an investigation in Round 16.) The reliable check is the file:
> `ls dist/client/data/stress-index/fixture-condition.json`.

```bash
npm ci
npx playwright install chromium     # browser binary — npm ci does NOT do this
npm run build
npm run fixture                     # worker must be stopped
npm run worker                      # leave running, separate terminal
```

Then, in another terminal:

```bash
npx tsx scripts/replays/weeklyunit.ts        # unit — no browser, no worker
npx tsx scripts/replays/r10unit.ts           # unit
npx tsx scripts/replays/badgeunit.ts         # unit
npx tsx scripts/replays/alertcopyunit.ts     # unit — alert-copy honesty, no data dependency
npx tsx scripts/replays/noticefreshunit.ts   # unit — the dated-claim review gate (Round 10b)
npx tsx scripts/replays/hailunit.ts           # unit — the SWDI nx3hail fetcher (Round 22),
                                             #   against replayed responses. The column set, the
                                             #   missing units column, the MAXSIZE domain, the
                                             #   totalTimeInSeconds trailer and the 744-hour
                                             #   ceiling are MEASURED; coordinates and timestamps
                                             #   in its fixtures are synthetic and no assertion
                                             #   treats them as real storms. Pins the trailer
                                             #   filter, the radar-vs-confirmed discriminant, the
                                             #   refusal to name a unit, and the not-a-county guard.
npx tsx scripts/replays/privacyunit.ts        # unit — /privacy/ says what the code does
                                             #   (Round 24). Asserts against the RENDERED page,
                                             #   not the .astro: source is line-wrapped and the
                                             #   file's header comment quotes the stale wording it
                                             #   replaced, so a source-based check reports "still
                                             #   says X" about the note explaining it no longer
                                             #   does. Needs `npm run build` first.
npx tsx scripts/verify-trade-mapping.ts      # unit
npx tsx scripts/replays/climateunit.ts        # unit — the cooling-degree-day fetcher (Round
                                             #   19d), against REPLAYED NOAA payloads. Every
                                             #   normals value in it was read from a live response
                                             #   on 2026-09-05; the GSOM actual magnitudes are
                                             #   synthetic and no assertion treats them as facts.
                                             #   Pins the measured normals round-tripping value for
                                             #   value, normals vs actuals staying distinguishable,
                                             #   the partial current month being dropped, Kelly AFB
                                             #   (nearer, 2-year estimated record) being rejected
                                             #   in favour of Stinson, USC/US1 never queried, and
                                             #   NO BBOX PARAMETER ON ANY REQUEST — the one that
                                             #   cost three rounds.
npx tsx scripts/replays/citationcheckunit.ts # unit — the CITATION CHECKER itself (Round 15b).
                                             #   Runs check-citations.ts both ways and proves a
                                             #   startup crash is told apart from a dead link.
                                             #   Green in this sandbox even though every host is
                                             #   proxy-denied: it asks whether the checker works,
                                             #   not whether the URLs resolve.
npx tsx --import ./scripts/register-raw.mjs \
  scripts/check-citations.ts                 # network — cited URLs resolve. The --import is
                                             #   NOT optional: belowHero.ts derives its dataset
                                             #   citations with Vite's ?raw, which Node alone
                                             #   cannot load (broken from Round 14b to 15).
                                             #   Runs weekly in CI, not in the build.
                                             #   Reports 10/10 dead in this sandbox: every host
                                             #   is proxied. That is the environment, not a bug —
                                             #   citationcheckunit.ts is the one to trust locally.
node scripts/replays/triagerender.mjs        # render — Plumbing Triage (Round 18). Every
                                             #   screen, the focus/terminal proofs, tap
                                             #   targets, and the no-cost / no-referral guards.
node scripts/replays/signinrender.mjs        # render
node scripts/replays/r9render.mjs            # render
node scripts/replays/saservicerender.mjs     # render — the six below-hero service pages,
                                             #   both metros (Round 10 SA, Round 15 Austin)
node scripts/replays/footerchrome.mjs        # render — sitewide footer chrome (Round 10b)
node scripts/replays/r7replay.mjs            # render — the big one
```

## The browser binary

`playwright` is a pinned devDependency, so `npm ci` installs the **driver**. It does
not install a **browser**. `npx playwright install chromium` does that, once per
machine. If a render replay cannot find one it exits `2` and says so; it never fails
opaquely inside a page call.

`scripts/replays/browser.mjs` resolves the executable in this order:

1. `$THI_CHROMIUM_PATH` — an explicit override, used verbatim.
2. `/opt/pw-browsers/chromium` — present in the CI sandbox image. Its revision (1194)
   is older than the one playwright 1.62.1 looks for (1234), so the path has to be
   passed directly; playwright's own lookup would miss it.
3. playwright's own browser directory — what a clean checkout gets after
   `npx playwright install chromium`.

## What the replays do not cover

- **Generated data.** The fixture rebuilds accounts, home profiles, reminders and
  sessions. It does not rebuild the per-ZIP address shards or the generated dataset
  files — those come from `npm run ingest` or from what is committed.
- **`r9render`'s unsubscribe section** calls `/api/email/weekly-run/`, which needs
  `EMAIL_LINK_SIGNING_KEY` and `WEEKLY_RUN_TOKEN` in a gitignored `site/.dev.vars`.
  Local test values, not secrets:

  ```
  EMAIL_LINK_SIGNING_KEY=local-test-signing-key
  WEEKLY_RUN_TOKEN=local-test-run-token
  ```

  `WEEKLY_RUN_TOKEN` must equal the Bearer token `r9render` sends. The endpoint
  returns **404**, not 401, when the secret is missing — it does not reveal itself to
  an unauthenticated caller — so a missing file used to look like a broken route.
  `npm run worker` passes the file explicitly (`--env-file`); wrangler's own lookup is
  relative to its cwd, which is `dist/server`, so `site/.dev.vars` was never read
  before Round 9b.
- **Re-apply the fixture between runs of the same replay.** `r9render` flips the
  weekly-email toggle on, and its unsubscribe section writes an explicit off-row for
  POP. The reset lives in the fixture — `local-fixture.ts` deletes
  `account_email_prefs`, `weekly_email_sends` and `email_suppressions` every run —
  not in a restore step inside the replay, because a restore only runs when the
  replay finishes. Both affected assertions now say `STALE FIXTURE?` when they fail,
  so the wrong diagnosis is harder to reach.
- **Three `r7replay` assertions are data-dependent**, not fixture-dependent, and are
  recorded as open findings in `HANDOFF.md` rather than fixed.

## The synthetic condition

`r7replay`'s two event-card assertions need a condition to be active. Austin's weather
does not cooperate on demand, so the fixture supplies one.

- A fifth account, **FIRED**, whose home carries the area `fixture-condition`. That
  area is in no ZIP crosswalk and in no `areaDefinitions()` entry, so no real home can
  ever hold it.
- `npm run fixture` writes `dist/client/data/stress-index/fixture-condition.json`,
  which the Worker serves through its `ASSETS` binding exactly as it serves the real
  area artifacts. `dist/` is gitignored, so the file **cannot be committed**; the
  generator runs `git check-ignore` and refuses to write if that ever stops being true.
- The condition itself is **a real committed NWS observation** — Austin's
  2026-09-03T12:00Z reading of 102°F, which really did cross the ≥100°F heat
  threshold. It is simply not the *latest* reading (the current one is 99°F), which is
  why the product does not fire on it. The recency is the only synthetic part.
- The alert **copy is extracted from `src/lib/account/alerts.ts`**, not restated. If
  the fixture wrote its own sentences, `r7replay` asserting "the card says area" would
  only prove the fixture says it. `alertcopyunit.ts` proves the extraction is faithful
  and separately checks every alert template in the product — firing or not.

See `scripts/fixture-condition.ts` for the four independent isolation guarantees.

## Safety

`local-fixture.ts` can only touch **local** state. Every wrangler invocation is built
in one place, always carries `--local`, never `--remote`, and is re-checked before it
runs against four refusal conditions: no `--local`, any remote-shaped argument, a
persist path outside the repo, a persist path inside `dist/`. State lives in
`site/.wrangler/state`, which `site/.gitignore` already matches — the test database
holds rows shaped like homeowner PII and must never be committed.
