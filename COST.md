# COST.md — Cost discipline

**Target: keep first-year run-rate in basic-hosting territory — tens of dollars a month, not
hundreds.** Basic hosting cost is fine; a large recurring bill is not. Governed by
`CLAUDE.md` Rule 1: if a change would meaningfully raise ongoing cost, **surface it with the
tradeoff and let the owner decide** — don't quietly introduce a per-request or metered cost.

The good news: the chosen architecture already points this way. These rules keep it there.

---

## The five cost surfaces and the rule for each

1. **Serving.** Static Astro on the Cloudflare Worker/CDN — pages are pre-built and served
   from the edge, so traffic doesn't cost per-request compute. **Do not** add a live database
   query, an external API call, or an LLM call **on the public serving path.** The public
   site renders from generated JSON/config.

2. **AI tokens (the biggest silent cost).** **No LLM in the runtime or ingestion path.** Data
   is computed deterministically, never model-generated. AI tokens are spent only at
   **authoring/build time** (writing content, planning), never per pageview or per data
   refresh. If a feature seems to need an LLM at runtime, that's a Rule 1 conversation.

3. **API calls.** Ingestion runs on a **cron 2–3×/week** on GitHub Actions' free minutes,
   hits **free public feeds**, and **appends to an archive** so history is never re-fetched.
   Stay inside provider free tiers; cache; don't poll. Any **paid** API is 🟡 Ask-first
   (`SECURITY.md`).

4. **Database.** For a public read-heavy site, querying a live DB per visit is *more*
   expensive and more exposed — so **the public site never touches the DB on the serving
   path.** The DB's only jobs are (a) captured **leads/PII** and (b) the **observations
   history** — low-volume writes/reads at ~90–300 leads/month scale. **Stay on the existing
   D1/KV**; the Postgres migration is deferred and shouldn't be taken on for cost reasons
   alone. When it eventually lands, use a cheap managed tier (Neon/Supabase free-to-low) sized
   to real scale, not imagined scale.

5. **Storage & build.** Generated datasets live in the repo as JSON (cheap). Keep the append
   archive reasonable; don't store giant blobs the site doesn't use. Builds are fast and
   free on the current setup — keep them that way (don't add heavy build-time services).

---

## Open item — the AI content poster (round 7) 🟡 needs an owner decision

**Unresolved. Recorded here so it is decided deliberately rather than discovered mid-build.**

The owner-approved sequence in `ROADMAP.md` includes an **AI content poster** running on a
**recurring cadence**. That pulls directly against rule (2) above: *AI tokens are spent at
authoring/build time only, never per pageview or per data refresh.* A poster that generates
copy on a schedule is, by construction, spending tokens on a recurring automated trigger —
which is what that rule exists to prevent.

It is not obviously a violation, and the distinction matters:

- **Per data refresh / per pageview** is what rule (2) forbids — cost that scales with
  traffic or with the ingestion cron, and output nobody reviewed.
- **A scheduled authoring job** could be closer to authoring-time spend: bounded volume, a
  human in the loop, output reviewed before it is published.

Which of those it is depends on decisions nobody has made yet — cadence, volume per run,
model, whether output publishes automatically or queues for review, and whether any of it
touches the serving or ingestion path (it must not).

**This resolves nothing.** Before round (7) is scoped, the owner decides whether the rule
bends, and if so exactly how far. Rounds (5) and (6) — the social and article posters — may
raise the same question depending on how they are built; the same decision covers them.

---

## Don't-over-build

- Target scale is **~90–300 leads/month**. Prefer **boring, cheap, reliable** over clever and
  metered. A static site + KV/D1 + a few server routes is plenty.
- Every new dependency, service, or binding is a potential recurring cost and a maintenance
  burden — justify it, and if it's paid or metered, **ask first**.

---

## The future subscription tier

It will add cost (auth provider, billing/Stripe fees, possibly more DB). That's expected and
acceptable **when it exists** — but it's out of scope now. Don't pre-provision paid infra for
it. Surface (Rule 1) if a current choice would force premature spend.
