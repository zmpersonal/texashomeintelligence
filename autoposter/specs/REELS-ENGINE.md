# REELS-ENGINE.md — the reach stream (for people, not citation)

A parallel, lightweight stream that runs on its own clock. These are **for people** — shareable
ranking reels that drive feed reach and follower growth. They do NOT carry the #1 KPI (the article
does), which frees them to be light, fast, and disposable-by-design. Runs independently of the
article engine; neither blocks the other.

## Cadence & production
- **Once every 2 weeks.** Batch **one video generation** of 10–15 ranking segments, then splice
  into ~15 reels (one ranking each). Same atomization path as the hub: Descript/Blotato cut, each
  reel self-contained. One production → two weeks of reels.
- Distribution: FB + IG Reels + YouTube Shorts (same as the shorts in `ROTATION.md`).
- Format: Top 3 / Top 5 monthly rankings. Fast hook, the ranking, one line of context, a "which
  surprised you? / where's yours?" ask, and a link to the relevant article or network page when one
  fits (reuse the article as the destination when the topic overlaps — reels promote articles too).

## The rankings (need 10–15 per batch — examples)
Anchor EVERY ranking to a **specific measured metric**, stated on screen. Good candidates:
- Top 3 Texas ZIPs at highest risk of HVAC failure this summer
- ZIPs with the biggest drop in estimated energy cost this month
- Top 5 counties by fastest drought-stage increase
- ZIPs with the lowest hail exposure heading into storm season
- Top 3 metros by grid-stress / brownout-risk change
- Fastest-rising permit activity by ZIP (building boom signal)
- Biggest month-over-month appraisal movers (once CAD data lands)
- Lowest / highest estimated insurance-premium-pressure ZIPs

Source these from the movers engine's ranked output where possible — it already computes and ranks
by metric, so the reels engine largely *reads* its rankings rather than recomputing.

## Fair-Housing guard (MANDATORY — this is the one that bites here)
"Best ZIPs to live in" is a **steering trap** — desirability framing about where people choose to
live. NEVER frame a ranking as "best/worst place to live," "good/bad area," "safest," or anything
about who lives somewhere. **Always anchor to a specific, measured, non-desirability metric and name
it:** not "best Austin ZIPs" but "Austin ZIPs with the biggest energy-cost drop this month."
- VALIDATOR **G8** applies to reel copy AND on-screen text AND the title — reject any ranking whose
  framing is desirability/steering rather than a named measured metric.
- Crime-based rankings: NOT here (see `ARTICLE-ENGINE.md` brand-safety gate). Off-limits for the
  reach stream entirely.

## Content-quality (reuses VALIDATOR)
- Every number in a ranking traces to source data (G1); each reel carries source + `as_of` on the
  card and survives the splice (G3).
- No fabricated or model-estimated positions — the ranking is the data's, not the model's.
- Quiet-data metrics still work here (a ranking exists even when nothing "moved"), so reels are less
  subject to the quiet-week fallback than the movers/article streams — but a ranking built on stale
  data is still rejected (G5).

## Why keep reels at all (given the article is the spine)
Reels are the **top of funnel for people**: they recruit followers and drive the reach that the
article alone can't, because a deep article is not natively shareable in-feed. Reels bring the
audience; the article converts attention into authority and citations. Two jobs, two streams — the
reels don't need to be citable because the article is.
