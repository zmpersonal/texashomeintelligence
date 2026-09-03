# Texas Home Intelligence

Source for [texashomeintelligence.com](https://texashomeintelligence.com) — Texas-specific
public data (weather and storms, permits, energy, air quality, drought, property and cost
signals) turned into plain-language, sourced intelligence about a home or ZIP. The flagship
surface is the Home Dashboard.

## Where the site lives

**`site/` is the app.** Astro 7 + TypeScript + Tailwind 4, deployed as a **Cloudflare
Worker** via `@astrojs/cloudflare` and Wrangler. Cloudflare **Workers Builds** builds and
deploys it automatically **on push to `main`** — a merge to `main` is a production deploy.

- **D1** (`DB`) — accounts, home profiles, reminders, consent, captured email. Schema in
  `site/migrations/`.
- **KV** (`PROJECTS_KV`, `SESSION`) — intake state and sessions.
- **Resend** — sign-in links, condition alerts, the weekly email. One recipient per message.
- Public pages never query the database on the serving path; they render from generated
  JSON committed under `site/src/data/generated/`, refreshed by a scheduled GitHub Action.

## Scripts (from `site/`)

```
npm run dev              # local dev server
npm run build            # production build
npm run preview          # preview the build
npm run check            # astro check (typecheck)
npm run verify-content   # content collection integrity
npm run ingest           # run the data-ingestion pipeline
```

## Legacy

The Jekyll files at the repo root (`_data/`, `_layouts/`, `_includes/`, `CNAME`) are the
**previous GitHub Pages site**. DNS is cut over to the Worker and they no longer serve.
They are kept as history — don't edit them, and don't treat them as current.

## Governance

`CLAUDE.md` is the hub: KPIs, scope, and Rule 1 (surface conflicts, don't silently comply
or refuse). See also `ROADMAP.md` (scope), `SECURITY.md` (permissions, secrets, PII),
`COST.md`, `BRAND.md`, `REVIEW.md` (pre-ship checklist), and `HANDOFF.md` (owner seams).
