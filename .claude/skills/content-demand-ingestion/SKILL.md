---
name: content-demand-ingestion
description: RESERVED / DESIGN-AHEAD — do not build until the owner greenlights it. The SEMrush (and Ubersuggest / Ahrefs / Keyword Tool) content-demand and AI-visibility system for Texas Home Intelligence: ingest AI-phrase data per niche×location, normalize, cluster, score content opportunities, map to URLs/gaps, feed an editorial queue, and recheck AI visibility over time. Consult this skill whenever anyone proposes wiring SEO/keyword MCPs, building the phrase/keyword database, ranking content opportunities, or setting up the AI-visibility closed loop — so the two-domain data separation and the schema are honored from the start. It defines the architecture; it does not authorize building it.
---

# Content-Demand Ingestion (SEMrush → clusters → opportunity → editorial → visibility recheck)

**Status: RESERVED.** The architecture is fixed now so nothing gets built in a way that
would have to be undone. **Do not implement any of it until the owner explicitly greenlights
the round.** If asked to build it, confirm the greenlight first (Rule 1). Scope is **THI
only** (never AHI).

## Why it exists
Turn keyword research into a **closed loop** that actually moves KPI #1 (AI citations):
> ingest AI-phrase data → normalize → cluster → map to service/location → **score
> opportunity** → map to an existing URL or a content gap → editorial queue → publish →
> **recheck AI visibility later.**
The final recheck is the whole point — it tells us which content increased THI's mentions
and citations over time, rather than just listing keywords.

## Non-negotiable architectural constraint (honor this even before building)
Keep the **market/query-intelligence** data **conceptually separate** from the
**home/location-intelligence** warehouse and the **leads/PII** store. Same infrastructure is
fine; **one undifferentiated schema is not.** This is an **internal/editorial ops** datastore:
it never serves public pages and never holds homeowner PII.

## Data sources
Owner has these MCPs connected: **SEMrush, Ubersuggest, Ahrefs, Keyword Tool (free SEO)**.
Prefer real MCP calls over scraping. Any paid/metered call is 🟡 Ask-first (`SECURITY.md`,
`COST.md`) — batch and cache; don't poll.

## Phrase record schema (each phrase retains)
`phrase/query · location · service/niche · intent · estimated_volume/demand_signal ·
ai_visibility/citation_data · brands_mentioned · domains_cited · ranking/visibility_position ·
source_platform · date_collected · cluster/topic_id · content_status · target_url ·
last_reviewed_date`.

## Clustering
Roll phrases up into clusters (e.g. `Austin → HVAC → replacement cost` with 30–50 prompts
under it) so the content team builds **one authoritative page per cluster**, not thin pages
per phrase. Clusters map onto THI's existing config-driven **location × service** grid.

## Opportunity scoring
Rank clusters automatically on:
`AI demand × commercial value × topical fit × current THI weakness × competitor weakness`.
Archetype high-value target: a cluster where AI engines keep citing Angi/HomeAdvisor,
homeowner intent is strong, and THI has no page yet → ranks very high.

## Workflow to implement (when greenlit)
1. **Ingest** AI-phrase data per niche×location from the MCPs.
2. **Normalize** into the phrase schema above.
3. **Cluster** into topic/cluster IDs.
4. **Map** each cluster to service + location on the existing grid.
5. **Score** the opportunity.
6. **Map** to an existing URL or flag a content gap.
7. **Editorial queue** — content_status lifecycle (gap → queued → drafting → published →
   monitoring).
8. **Publish** — authored per `ROADMAP.md` AI-optimization rules + brand voice (AI-phrase
   content pages are the one place Claude may author copy at scale).
9. **Recheck AI visibility** on a schedule; write results back to `ai_visibility` so the loop
   closes and we can see what moved citations.

## What NOT to do
- Don't build any of the above before greenlight.
- Don't co-mingle this schema with the home-intelligence or PII schema.
- Don't put a live query to this store on the public serving path.
- Don't add a runtime LLM dependency — scoring is deterministic where possible; any authoring
  LLM use is build-time only.
