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
npx tsx scripts/verify-trade-mapping.ts      # unit
node scripts/replays/signinrender.mjs        # render
node scripts/replays/r9render.mjs            # render
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
  weekly-email toggle on; running it twice without a fresh `npm run fixture` fails
  "toggle persists across a reload" — replay-mutated state, not a regression.
- **Three `r7replay` assertions are data-dependent**, not fixture-dependent, and are
  recorded as open findings in `HANDOFF.md` rather than fixed.

## Safety

`local-fixture.ts` can only touch **local** state. Every wrangler invocation is built
in one place, always carries `--local`, never `--remote`, and is re-checked before it
runs against four refusal conditions: no `--local`, any remote-shaped argument, a
persist path outside the repo, a persist path inside `dist/`. State lives in
`site/.wrangler/state`, which `site/.gitignore` already matches — the test database
holds rows shaped like homeowner PII and must never be committed.
