# Round 48 — what the autoposter was about to publish, and why nothing caught it

Date: 2026-10-12 · Branch: `claude/thi-plan-review-m40n0x`, from `origin/main` at `45d58f6`.

The round began as "fix the eligible-vs-locked contradiction". That contradiction did not exist.
Running the cycle instead of reasoning about it found three wrong figures in the article the
machine would have published next, and the chain that kept them invisible.

---

## 1 · The brief was wrong, and the measurement is what said so

The design brief argued that `electricity-still-rising` is a **one-off** whose `title_for` makes
the refresh layer mistake it for a recurring builder. It is a recurring builder, by design, since
2026-09-19 (`run_article.py:949`). The "halts at `run_article.py:59`" evidence came from two
**test files** that pass the retired builder by hand, not from the cadence path.

The real block, measured: the topic is eligible (July's title was never published) and
unbuildable (July's data is 103 days old against a 90-day bound). The owner's chosen fix —
marking one-off topics non-recurring — would have encoded a distinction with **zero members**.
It was not built.

## 2 · Three wrong figures in the next article

Simulating past the blocker produced "Did Austin's AC rush follow the heat in September 2026?",
every gate green:

| | the claim said | its own derivation said | the truth |
|---|---|---|---|
| H2 | "up 0% month over month" | `1097 (Sep 2026) vs 1097 (Sep 2026)` | 1,037 → 1,097 = **+5.8%** |
| C2 | "the highest of the last 13 months" | `695 ranks **2** of 13` | August was 755 |
| C3 | "**up** 8% month over month" | `695 vs 755 = **−8%**` | cooling demand **fell** |
| verdict | "both moved the same way" | — | they moved **opposite** ways |

**The root cause of H2 is the reading half of a versioned key.** `permit-trade-activity` keys
every row `${mappingVersion}/${category}/${month}` so a methodology change writes new keys
instead of overwriting counts, and merging keeps both — correctly, because this project stores
history. The site built the reading half in Round 45 (`src/lib/tradeActivity.ts`: newest version
only); `autoposter/src/thi_source.py` never did. Round 45 **was** the first bump of that
constant, so on disk 66 of Austin's 70 (category, month) pairs and 91 of San Antonio's 98 carry
two rows, and every permit series came out with 26 points for 13 months. Sorting by period puts
a month's two rows side by side, so `points[-1]` and `points[-2]` — "latest" and "prior" to every
builder — were the same month. The site was never affected.

Every permit figure in all three builders was re-verified against a count computed straight from
the JSON rather than through the reader that had just been changed. One thing that check caught:
the "N-month average" claims are means over the **prior** twelve months, so duplicating every row
left the mean unchanged and only the label was wrong — "25-month average" of a 13-month series.

**C2 and C3 are frozen conclusions.** C2 computed the rank, printed it in its own derivation and
then asserted the superlative regardless. C3 hardcoded "up" and "rose" beside a derivation
reading `-8%`, while H2 four lines above it had always branched on the sign. The same superlative
was typed in **three** places — the claim, the article's opener, and the Facebook caption's hook
("Hottest month of the year") — and a superlative carries no numeral, so G1 had nothing to trace
and could not see any of them.

Two more frozen phrases went with them: `HX` said "why they moved **apart**" unconditionally, so
in any month the series agreed the humility paragraph contradicted the verdict; and the power
caption asserted "And no, it was not just a mild summer" while the body beneath it branches —
with San Antonio 5.6% below its July normal, the post would have ruled the explanation out while
the article it linked to called it "at least available this time".

## 3 · The chain that kept it invisible

`test_card.py` and `test_article_engine.py` caught only `AssertionError`, so a raised exception
**aborted the file**: 22 of 82 tests never ran and the `N/M passed` line never printed. Among the
unrun tests was `test_builder4_THE_VERDICT_FOLLOWS_THE_DATA_not_the_prose` — the flip test for
this exact verdict.

Sixteen of those raises came from one cause: the tests passed `build_claims_fn` by hand instead
of the registry the engine uses, and the builder they passed was the August-2026 one-off retired
on 2026-09-19, which Round 45's purge of the fabricated rows finally made unbuildable.

Underneath that, twelve assertions were pinned to whatever production said the day they were
written — a month name, an inequality that was a coincidence, a mutation that no-oped on a
different story, a caption length, and three L16 flip tests whose falling branch was the real
data. Those three went red for the one reason a flip test must never go red: Texas power started
rising (July 2026 15.88¢ against 15.36¢, **+3.4%**) and the builder answered correctly.

## 4 · Halt is not fault, and a halt no longer blocks the queue

`autopilot.evaluate` wrapped the engine in `except NothingDefensible` / `except Exception`, so a
gate refusing, a programming fault and a budget breach all arrived as "the article could not be
produced cleanly". Eighteen days of a staleness refusal that named its own numbers read as an
unexplained breakage.

`src/gates.py` is the common ancestor the six refusal types never had — a base class and not a
tuple of names, because the tuple is what rots when the seventh gate lands. `NothingDefensible`
and `ModelBudgetExceeded` stay outside it deliberately; anything unrecognised stays a fault,
classified on type and never on the message.

Then fall-through, and **never silently**: every skip carries its reason onto the result, the run
log and the notice, on every outcome including a successful publish. It **stops at the model
call** — a second candidate would need a second call — and a **missing builder** still halts,
because that is a gap in the registry rather than a statement about the data. The comment that
used to forbid all fall-through was written about that case; it now says so.

Measured before the change: `electricity-still-rising` ranked 0 of five eligible topics and
blocked four publishable articles.

## 5 · Two staleness bounds, and the question underneath them

`energy_price_cents_kwh` 90 → 120 days, and `cooling_degree_days` the same. The EIA runs ~3
months behind and a claim is dated the 1st of its month, so against 90 days the article was
buildable for a few days after each release. The comment being replaced said "1-2 month lag",
which the series on disk does not support — that is where the 90 came from.

Widening the price bound alone **did not unblock the article**: its cooling cross-check claims
carry the price series' month because that builder pins both series to one period on purpose, so
the piece is governed by its tightest metric rather than by its subject. That is a design
question, logged as **BACKLOG item 31** rather than settled by a one-line widening.

## 6 · The card generator: one failure, total blast radius

`generate-og-cards.mjs` called `process.exit(1)` on the first article that failed. Two
consequences, and the second was latent:

1. one article's card copy made the exit code non-zero **permanently**, and the card gate runs
   the generator with `check=True`, so a single overflowing card made every future article
   unpublishable, whichever article the cycle was publishing; and
2. everything sorting after the failure was never attempted.

Measured once it renders everything: **5 of the 6 articles that declared a card were rendering
all along, and one was refused.** The masking never bit, because the failing article sorts last
alphabetically. The exit code was the entire damage, and it was total.

It now renders everything it can, reports each failure with its reason, always prints a summary,
and fails only for a slug it was **asked for** — so `check=True` means "this article's card could
not be drawn". A slug that was asked for and is absent or unpublished also fails, rather than
"succeeding" having drawn nothing for the article the caller named.

Found while fixing it: the generator was re-creating the PNG and sidecar for the **withdrawn**
electricity article on every run — artifacts Round 43 deliberately deleted. Nothing referenced
them, but a generator that keeps resurrecting a deleted file makes "do not commit that" a
hand-step someone has to remember every cycle. It now skips `published: false`, matching the
site's own schema default.

## 7 · The card copy, and a divergence worth recording

`what-does-san-antonios-police-offence-data-cover` overflowed at a 59-character question. The
constraint is a rendered one, not a character count — "fits 1200×630 with the hero at ≥84px and
the question at ≥32px" — so it was measured by binary search: **54 characters** with the current
32-character subhead, and with the question at 59 **no subhead length fits at all**, down to 21.
The question was the binding constraint and shortening the subhead could not have helped.

Owner rewrite, 2026-10-12: the **card question** is now "What does San Antonio's police data
cover?" (42 characters) and renders at hero 149px / question 40px, comfortably off both floors.
The subhead is unchanged. **The article's headline is unchanged** — it is still "What does San
Antonio's police offence data actually cover?" — so for the first time the card asks a shorter
question than the page's H1.

That divergence is deliberate and it collides with a stated guarantee. `card.py` **C4** reads:
"the question is the article's H1, verbatim. A card that asks a different question than the page
answers is a bait card, however true both are." C4 only ever judges articles the **engine**
builds, so it never saw this hand-authored one — the divergence is permitted today by accident of
scope rather than by design.

The consequence worth knowing: **the autoposter cannot do what was just done here.** If a
generated article's title ever exceeds its card's capacity, C4 forbids shortening the card
question and the card gate refuses, so the cycle halts with no escape but a shorter title.
Measured headroom for the tightest machine-built card today — the power article, question 49
characters, rendering at 36px, one step off the 32px floor — is **15 characters**. Its title
length is stable across months, so this is headroom rather than a countdown. Either C4 should say
in its own comment that it governs machine-built articles only, or the divergence is a real
exception it should name. Not decided here.

## 8 · Two mistakes of mine, recorded because one was reported wrong

**I reported a defect that was not there.** The sweep's first run printed `no worker answered on
http://127.0.0.1:9400 within 60s` and the command reported exit 0, which I relayed to the owner
as a third instance of a step reporting success it had not earned. `run-sweep.mjs:141` exits 1
correctly. What returned 0 was my own invocation — `npm run sweep 2>&1 | tail -4` — because a
pipeline's status is its last command's. The sweep was loud and I piped it into silence, then
read the 0 as a pass. Recorded as a standing rule in the backlog: never read a pass off a command
whose output you piped.

**An over-broad restore reverted my own edit.** A probe script finished with
`git checkout -- site/src/data/analysis …` to clean up the article it had written, and took the
owner's card-copy change with it. Caught immediately because the next `git status` was emptier
than it should have been. A cleanup scoped to a directory rather than to the files it created is
a cleanup that can delete work it never made.

---

## Verification

| Check | Result |
|---|---|
| `npm run check` | 0 errors, 0 warnings, 0 hints |
| `npm run sweep` | **33/33 steps passed** |
| autoposter suite | **360/360** (from 325/352, with 22 tests that had never been attempted) |
| `og-cards` bare | 5 rendered, 0 refused, 1 skipped as unpublished |
| real dry run | `would_publish`, 11/11 gates, card drawn by the site's own generator |
| site tree after each run | restored; `git status` clean |

## What this round did not settle

- **BACKLOG 31** — an article governed by its primary metric rather than its tightest.
- **C4's scope** — whether a card may ask a shorter question than its page's H1, and what the
  autoposter does when a generated title will not fit.
- **AQI** — still withheld. Whether `nowcastAQI` is the same measurement as the retired `AQI`
  needs AirNow's retired-docs page, which is behind a login wall.
