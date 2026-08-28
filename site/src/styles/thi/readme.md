# Texas Home Intelligence — Design System

**Situational awareness for your home.** Texas Home Intelligence (THI) fuses live Texas data — weather and storms, permits, energy, air quality, drought, property and cost signals — into a plain-language, sourced read on a specific home or ZIP. Bloomberg-terminal rigor applied to your house: calm, sourced, specific, never alarmist.

The one idea every choice in this system serves: *THI knows what Texas homeowners need to know about their home right now — and can be trusted to say it plainly.*

- **Category to own:** Home Intelligence.
- **Locked H1:** *Know what your Texas home needs — before it gets expensive.*
- **Audience:** pragmatic Texas homeowners, 35–58, equity to protect, wary of contractors, want signal not sirens. Austin and San Antonio first, then Houston and DFW.
- **What it is not:** not a contractor directory, not a home-services marketplace, not a scare-tactics risk site, not a weather-app clone.

## Sources this system was built from

| Source | What it gave us |
|---|---|
| `uploads/THI-Brand-Kit.md` | Brand Kit v1.0 — the definitive system. §5 colour, §6 type, §7 logo, §8 visual language, §9 dashboard, §10 share cards, §12 iconography, §13 voice, §17 tokens, §18 rules. |
| `uploads/thi-tokens.css` | Implementation tokens. Copied into `tokens/` and `base/primitives.css` essentially verbatim. |
| `uploads/THI-brand-board.html` | Visual reference with the Meridian Mark rendered. **The logo SVGs in `assets/` are extracted from this file** — nothing was drawn or reconstructed. |
| `https://github.com/zmpersonal/texashomeintelligence` | The live product: Jekyll marketing site (`index.html`, `_layouts/`, `_includes/`, `_data/services/*.yml`), the Astro migration in `site/`, the QuoteReady intake (`start/`, `assets/js/intake.js`), the sample brief (`brief-sample/`), the data catalog and methodology pages, the ingestion layer (`site/src/ingest/`, 15 real fetchers), and `THI-round-homepage-nav.md` (the agreed nav + homepage-hero round spec). Worth exploring further — the per-service YAML and the fetcher registry are the best guide to real product copy and real data domains. |

**Important divergence:** the repo's shipped CSS (`assets/css/main.css`, `site/src/styles/global.css`) still runs the *pre-v1.0* look — `#0f3d5c` brand, `#d97b29` accent, Segoe UI, 10px radii, amber pill CTAs. The Brand Kit v1.0 supersedes it. This design system implements v1.0; the UI kits recreate the repo's information architecture and copy *in the new identity*. Treat any pre-v1.0 value you find upstream as legacy.

---

## Content fundamentals

**Voice:** the calm, precise, local expert who respects your time and never oversells. Plain modern English. Specific over clever. Sourced over asserted. Confident enough to say "we don't know yet."

**Person and address.** Second person for the homeowner ("your home", "your ZIP", "you"). First person plural for THI, and only when accountability matters ("we don't have flood-sensor coverage for this ZIP yet", "this is a THI estimate"). Never "our proprietary AI".

**Casing.** Sentence case everywhere — headlines, buttons, card titles, nav. Uppercase only for the 12px eyebrow/label token and the mono `SPONSORED` tag. No Title Case Headlines Like This.

**Punctuation.** No exclamation marks. No ALL CAPS for emphasis. Em dashes for asides, `·` as the separator in mono meta lines (`NOAA · as of 08/24 14:00`). Numbers written as numerals with units.

**Emoji: never.** Not in UI, not in alerts, not in social. Emoji reads as the scam-text register the brand exists to avoid.

**Urgency comes from specificity and sourcing, never from punctuation or fear.** The test: if it reads like a scam text, it's wrong.

| Context | Write this | Never this |
|---|---|---|
| Normal reading | "Air quality is good in 78704 today — AQI 38. No action needed." | "Breathe easy, friend! The air is gorgeous today! 🌤️" |
| Watch | "Hail is possible in your area this week. If your roof is 15+ years old, it's worth an inspection before the season peaks." | "⚠️ HAIL THREAT DETECTED — your roof could be at risk!" |
| Severe | "Severe storms are expected in 78704 tonight, with damaging hail likely. Secure loose outdoor items and stay in. Source: NWS, as of 3:10 PM." | "DANGER! Catastrophic hail incoming — protect your home NOW!!!" |
| Estimate | "Estimated roof replacement in Austin: **$14,000–$21,000** for asphalt shingle. This is a THI estimate from permit values and current material costs — not a quote." | "A new roof costs $17,500." |
| Uncertainty | "We don't have flood-sensor coverage for this ZIP yet, so this reading is limited. Here's what we do know." | *(silently showing a confident number)* |
| Commercial | "Want a second opinion from a local pro? We can connect you with roofers in Austin. This is optional — and it's how we keep the data free." | "You NEED to call a roofer today! Get quotes now!" |
| Methodology | "The Home Intelligence Score blends weather risk, property age signals, and local cost pressure. Here's exactly how, and where each input comes from." | "Our proprietary AI analyzes thousands of data points!" |

**Local specificity is the moat.** Name the ZIP, the neighborhood, the county, the soil ("Hill Country clay soils"), the utility ("Austin Water service area"). Generic Texas copy is off-brand.

**Every reading carries its provenance.** A number without `Source · as of` is a bug, not a style choice. A score without a methodology link is a gimmick.

---

## Visual foundations

**The feeling:** a well-made instrument panel. Dense but calm, precise but readable, authoritative but not intimidating. Density is handled by rhythm and alignment, never by shrinking or crowding. If a page looks *alarming*, it's wrong.

**Colour.** Navy (`#0C2340`) + mineral neutrals carry ~90% of every surface; Caliche Amber (`#C4772E`) is ~3%; status colour is a rounding error. Two backgrounds per page maximum — Paper `#F7F8FA` and white Surface, with Mist `#EEF1F5` for alternating bands and Depth Navy `#081A31` for the one dark panel. Amber Deep `#9E5E22` for any amber-coloured small text on white; amber small text on navy is banned outright.

**Type.** Newsreader 500 for editorial headlines (tight 1.05–1.15 leading, sentence case). IBM Plex Sans for all UI, body, labels, buttons — *and* for in-dashboard card titles at 600/18px, where a serif would read too literary. IBM Plex Mono 500 with `font-feature-settings:"tnum" 1` for every number, timestamp, ZIP, coordinate, and source line. Body never below 16px; measure never beyond ~68ch. Deliberately not Inter.

**Backgrounds and imagery.** No full-bleed decorative photography, no gradient meshes, no illustration mascots. Imagery is documentary Texas realism — real Austin/SA streets and roofs, aerial/oblique parcel views (a signature — use it often), big Texas skies, respectful system detail shots — graded cool-shadow / warm-highlight. Framed at the card radius (8px). Illustration, when used, is technical: line diagrams, cross-sections, topo motifs. Data-viz and the branded map count as primary imagery.

**Texture.** A survey-grid or topographic watermark at ≤4% opacity, on dark hero panels and share cards only. Never on content surfaces.

**Gradients.** Avoided as decoration. The single permitted gradient is Meridian Navy → Depth Navy, vertical, on dark hero and share panels.

**Transparency and blur.** Essentially unused. The only translucency in the system is `rgba(255,255,255,.06–.12)` for chips and hairlines *on* navy. No frosted glass, no backdrop blur, no protection gradients — text sits on solid fields, so it never needs one.

**Cards.** White surface, 1px `#D9DEE6` border, 8px radius, `shadow-sm` (`0 1px 2px rgba(14,23,38,.06)`), 20/24 padding. Elevation comes from the border and hairlines, not from shadow. Two shadow levels total; `shadow-md` (`0 4px 12px rgba(14,23,38,.08)`) exists only for hover. Dark panels use an inner hairline instead of a shadow. No inner shadows anywhere.

**Radii.** Cards 8 · buttons and inputs 6 · chips 4 · data cells 2 · status pills 999. Measured, engineered geometry — never bubbly.

**Borders and dividers.** 1px `Line` for structure, `Line Soft` `#E7EBF0` for inner rules and chart gridlines, `Line Strong` `#C3CAD4` for input and secondary-button edges. Status alerts add a 4px left border; actionable cards add a 2px amber *top* keyline on hover. A coloured left border plus rounded corners is a legitimate pattern *here* — it's the alert signature from §17 — but only ever in a status colour or navy, never as decoration.

**Spacing and layout.** 4px base: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80. 8px vertical rhythm. 1120px container, 20px gutters. Sibling groups are laid out with flex/grid + `gap`. The header is the only fixed element (sticky, white, 1px bottom border) — the logo is capped at 28px and the header height never grows. On scroll, the utility strip collapses and nav links fade; the header itself does not resize.

**Animation.** Purposeful and quick: 150–250ms, `cubic-bezier(.2,.6,.2,1)`. Numbers count up once on first load; sparklines draw once; status changes cross-fade. No ambient looping animation, no bounce, no parallax. `prefers-reduced-motion` is respected by a global rule in `base/primitives.css`.

**Hover.** Cards lift to `shadow-md` and gain the 2px amber top keyline. Links keep Signal Blue and gain an *amber* underline. Buttons darken one step (navy → `#0A1E38`; amber → Amber Deep); secondary buttons fill with Mist. **Press.** Colour only — one further step darker. Nothing scales, shrinks, or translates on press.

**Focus.** `0 0 0 3px rgba(42,111,176,.35)` on `:focus-visible`, never suppressed.

**Loading.** Skeleton blocks in Mist with a subtle shimmer, plus a small mono line — "Fetching latest readings…". Never a bare spinner.

**Charts.** Signal Blue primary series, navy and slate secondary, `Line Soft` gridlines, mono 12px labels, status colours only for threshold bands at ~12% opacity. Ranges drawn as bands, confidence stated explicitly, always an `as of · source` caption. Sparklines wherever a value trends.

**Maps.** Custom low-saturation mineral base — land `#EEF1F5`, water `#DDE6EE`, roads white, labels Slate 700. The home is an amber pin; overlays are status colours at low opacity. Never the default Google Maps look.

---

## Iconography

**Library: Phosphor Icons**, regular weight, ~1.5px stroke at 24px, 20/24px in UI. Loaded from CDN (`@phosphor-icons/web@2.1.1`) — the repo ships no icon font, sprite, or SVG icon set of its own, so there was nothing to copy in. This is the library the Brand Kit specifies (§12), not a substitution. Lucide is the sanctioned fallback if a lighter dependency is ever required.

Usage rules:
- **Outline by default. Fill is meaningful, not decorative** — reserved for active/selected states and Severe status. Status escalates by weight *and* colour together, never colour alone.
- Rounded-geometric shapes, consistent with the 6–8px UI radii. Low complexity; legible at 16px.
- Weather and risk glyphs stay Ink until the reading is elevated, then take the status colour.
- Home-system icons (roofing, HVAC, plumbing, electrical) share one line style.
- Custom icons only where Phosphor lacks a home-specific concept ("roof stress", "HVAC load"), drawn to Phosphor's grid and stroke.
- **Emoji is never used.** Unicode characters appear only as typographic furniture in mono meta lines: `·` separators, `›` breadcrumbs, `→` inline link arrows, `↗` on methodology links, `″` for inches.

The house glyph set used across the kits: `cloud-lightning` · `thermometer-simple` · `drop` · `wind` · `fire` · `tree` · `lightning` · `house-line` · `wrench` · `shield-check` · `map-pin` · `chart-line` · `clipboard-text` · `gauge` · `toolbox` · `warning-octagon` (fill, severe only).

**Logo assets** in `assets/` are extracted verbatim from the supplied brand board: `logo-mark.svg` (primary two-colour), `logo-mark-on-navy.svg`, `logo-mark-mono.svg`, `favicon-32.svg`, `favicon-16.svg` (roof detail drops out), `app-icon.svg`. `logo-raw-legacy.png` is the pre-v1.0 raster logo from the repo, kept for reference only — do not use it in new work. The wordmark is set live in Plex Sans SemiBold ("Texas Home" in Ink, "Intelligence" in Caliche Amber), so there is no wordmark image to ship.

---

## Index

**Root**
- `styles.css` — the single entry point consumers link. `@import` lines only.
- `readme.md` — this file.
- `SKILL.md` — Agent-Skills front matter for use outside this tool.
- `github.md` — source-repo association and screen map for one-click sync.
- `thumbnail.html` — the homepage tile.

**Foundations**
- `tokens/` — `fonts.css` (Newsreader + IBM Plex Sans/Mono from Google Fonts), `colors.css`, `typography.css`, `spacing.css`, `shape.css`, `motion.css`, `semantic.css` (aliases: `--text-body`, `--surface-card`, `--border-default`, `--font-serif-display`, …).
- `base/primitives.css` — the optional `.thi-*` starter classes carried over from the supplied tokens file.
- `guidelines/` — 21 specimen cards: colour (brand, neutrals, interactive, status ramp, status tints, commercial, on-dark), type (display, UI, data, scale), spacing (scale, rhythm, radii, borders & shadows), brand (Meridian Mark, lockups, information ladder, voice, share-card signature, iconography, imagery & maps).
- `assets/` — logo variants, favicons, app icon, legacy raster logo, `imagery/`.
- `reference/` — imported repo material: `llms.txt`, copywriter output, `data-sources.yaml`, Austin location YAML, roofing service YAML.

**Components** (24, `window.TexasHomeIntelligenceDesignSystem_f449f6`)
- `components/core/` — **Button**, **StatusChip**, **Badge**, **Label**, **SourceLine**, **FreshnessPill**, **Card**
- `components/data/` — **DataReading**, **Sparkline**, **ScorePanel**, **DomainCard**, **DataTable**
- `components/forms/` — **TextField**, **SelectField**, **ChoiceCard**, **ProgressTrack**
- `components/navigation/` — **Logo**, **SiteHeader**, **SiteFooter**, **Breadcrumbs**
- `components/feedback/` — **AlertCard**, **SponsoredBlock**, **FaqItem**, **CtaBand**

Each has a sibling `.d.ts` (props contract) and `.prompt.md` (what & when, usage, variants).

**Intentional additions.** The repo defines its component vocabulary in CSS classes, not in a component library, so the inventory above is a direct translation of those classes plus the Brand Kit's specified patterns. Three components have no direct upstream counterpart and exist because §9/§10 specify them in detail: **ScorePanel** (the Home Intelligence Score panel), **DomainCard** (the fixed per-domain card template), and **Logo** (the Meridian Mark, which replaces the legacy raster wordmark). **Sparkline** generalizes the "sparklines everywhere trends matter" rule.

**UI kits**
- `ui_kits/thi-website/` — marketing and authority site: homepage, Austin × Roofing service page, data catalog. Click-through.
- `ui_kits/home-dashboard/` — the flagship free tool: address gate → score panel → alerts → filterable domain readings → history, recommendations, sponsor block.
- `ui_kits/quoteready/` — six-step intake (service-specific questions) → generated Project Brief.
- `ui_kits/ahi-social/` — Austin Home Intelligence lite ZIP dashboard + the five-format share-card system.

Each kit has its own README naming the repo files it was built from.

---

## The rules that protect the brand

**Always**
1. Show source and freshness on every reading — the mono `Source · as of …` line is non-negotiable.
2. Label estimates as estimates: amber "Est." tag *and* a range.
3. Keep objective intelligence and commercial content visually quarantined — Sponsor Sand box, never status colours.
4. One primary action and one hero number per view.
5. Numbers in IBM Plex Mono with tabular figures, aligned in columns.
6. Urgency through specificity and sourcing, calmly.
7. Keep the interface cool and quiet; spend amber sparingly.
8. Status colour as small signal only, always paired with icon + label.
9. One entity family — same mark, palette, type, and status meanings across THI, AHI, and every metro edition.
10. Name places specifically.

**Never**
1. Never a number without its source, or a score without its methodology link.
2. Never a derived value presented as measured.
3. Never let commercial content borrow status colour, the score ring, Signal Blue, or amber.
4. Never make the UI look like a weather radar.
5. Never Texas kitsch — no cowboy hats, boots, longhorns, Alamo, tourist stars.
6. Never generic-SaaS or generic-AI defaults — no Inter, no "proprietary AI", no gradient-mesh hero.
7. Never fearmonger or over-punctuate.
8. Never Caliche Amber, Watch, or Elevated for small body text on white; never amber small text on navy.
9. Never let the header grow past its locked height, and never ship the mark without the crawlable wordmark beside it.
10. Never fork the visual system per city.

---

## Caveats

- **Fonts are CDN-linked, not vendored.** `tokens/fonts.css` pulls Newsreader, IBM Plex Sans, and IBM Plex Mono from Google Fonts, as the Brand Kit specifies. No binaries ship with this system; drop `.woff2` files into `assets/fonts/` and swap in `@font-face` rules if you need self-hosting.
- **Phosphor icons are CDN-linked** for the same reason — the repo contains no icon set to import.
- **Home Dashboard and AHI are spec realizations, not recreations.** Neither exists upstream yet; those kits follow Brand Kit §9/§10/§16 and `THI-round-homepage-nav.md`, so they are the place to expect divergence when the real builds land.
