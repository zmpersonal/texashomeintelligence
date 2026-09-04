# Local verification replays

These run the **built worker** in a browser and assert on what it actually renders.
A green `npm run build` does not catch a dropped source line, a withheld day shown
anyway, or an action that says "fix" instead of "check" — these do.

## The order matters

The worker keeps local D1 **in memory** and flushes its own state back over anything
written underneath it, so the fixture must be applied while the worker is **stopped**.

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
npx tsx scripts/verify-trade-mapping.ts      # unit
node scripts/replays/signinrender.mjs        # render
node scripts/replays/r9render.mjs            # render
node scripts/replays/saservicerender.mjs     # render — the SA service pages (Round 10)
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
