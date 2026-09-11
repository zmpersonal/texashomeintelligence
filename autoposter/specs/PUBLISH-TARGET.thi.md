# PUBLISH-TARGET.thi.md — publish target for TexasHomeIntelligence.com

Loaded by `ARTICLE-ENGINE.md` ONLY when `site="thi"` — named by the THI editorial spec
`ARTICLE-ENGINE.thi.md`. This file is the single place THI's publishing MECHANICS live (the
editorial identity lives in `ARTICLE-ENGINE.thi.md`; the shared process in `ARTICLE-ENGINE.md`).
Other network sites get their own `ARTICLE-ENGINE.<site>.md` + `PUBLISH-TARGET.<site>.md` pair; the
shared engine never contains site details itself.

## Self-identification guard (assert BEFORE publishing — HALT on mismatch)
```
site_domain: texashomeintelligence.com
site_name:   Texas Home Intelligence
```
Before writing anything live, the engine MUST assert that the resolved publish destination (repo,
deploy target, and final URL host) matches `site_domain` above. **Any mismatch → HALT + 🔴 to
Slack.** This is the guard that makes "published THI content to the wrong site" impossible, however
the engine is reused in future. Do not skip it even when it seems obvious.

## Publish mechanism (CONFIRM against the live THI repo — do not assume)
> Claude Code fills these in from the actual THI site repo on first run; the strategy chat did not
> have live repo access. Placeholders below are the expected shape, not confirmed fact.

- **Repo:** `zmpersonal/texashomeintelligence` (confirm) — Astro site under `site/`.
- **Content location / format:** confirm where articles live (e.g. `site/src/content/…` as
  Markdown/MDX with frontmatter). Match the existing content collection schema exactly — read an
  existing post first, mirror its frontmatter fields (title, description, date, slug, tags, etc.).
- **URL structure:** confirm the route pattern (e.g. `/analysis/<slug>` or `/reports/<slug>`).
  The engine needs the final canonical URL to hand back to the social layer.
- **Live-data embed method:** THI already renders live data on-site — confirm the component/pattern
  (an Astro component, a chart include, a data-fetch island) and embed the topic's live series that
  way, not as a static screenshot. This is the citability + differentiation booster.
- **Deploy:** Cloudflare (Worker + Pages/Astro). **Deploy is DEPLOY-ON-COMMAND (🔴)** per THI's
  SECURITY.md — the engine prepares the article on a branch/PR; a human triggers the go-live. The
  engine does NOT auto-deploy to production.
- **SEO/AEO requirements:** question-shaped `<h1>`, meta description, structured data/JSON-LD if the
  site uses it (confirm), canonical URL, and the direct answer surfaced high on the page for AI
  extraction. Mirror whatever `verify-content` / existing posts already do.

## Handoff back to social
On successful publish (branch/PR ready + eventual live URL confirmed), return the **canonical
article URL** to `ARTICLE-ENGINE.md` Stage 6. Every social piece for this article links to that URL.
Until the URL is live, social scheduling for that article is HELD (don't promote a dead link —
reuses VALIDATOR: linked pieces require a resolvable destination).

## THI-specific content rules (in addition to global VALIDATOR + VOICE-GUIDE)
- Every stat inline-sourced with `source` + `as_of` (THI house rule; also the citability asset).
- Fair-Housing guard (VALIDATOR G8) applies to article prose, not just social captions — no
  desirability/steering framing about who lives where.
- Calm-insider voice; poppy in framing, sober in claims (VOICE-GUIDE).
