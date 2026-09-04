# Motion, Effects & Imagery

---

## Part 1 — Motion

### The governing principle

This site's product is credibility. Motion that draws attention to itself reads as marketing, and marketing reads as *someone is selling me something*, which is precisely the position we're differentiating against. So: motion earns its place by explaining, never by delighting.

The test for any animation here — **does this help the user understand what just happened, or where something came from?** If not, cut it.

Practical defaults: fast (150–250ms for interface response), ease-out for things arriving, no bounce, no spring overshoot, nothing that draws the eye twice. Respect `prefers-reduced-motion` throughout, and make sure the reduced-motion path still communicates sequence — replace movement with instant state changes, not with nothing.

### The moments worth animating

**1. The scan reveal (Type A) — the one showpiece.**

This is the single persuasive moment in the product and the only place to spend real motion budget. Address submitted → the page transforms:

- Header and input compress upward, results region expands into the freed space. Continuous, ~300ms. No route change, no scroll jump.
- Satellite imagery fades in.
- **The footprint draws on** — stroke the roof polygon path over ~600–800ms. This is the "it found my actual house" moment and it's worth every millisecond.
- Fact chips stagger in behind it, ~60–80ms apart, in order of importance.

The staggering matters for a specific reason: it makes the process feel *sequential and investigative* rather than instantaneous and canned. The site is claiming to look things up. The motion should corroborate that.

**2. Loading that narrates.**

Multi-second joins are certain — parcel, permits, hazard, utility. Don't spin. Step through what's actually happening:

> Finding your property…
> Checking permit records…
> Pulling storm history for this location…

Each line replaces the last as the real call completes. This turns dead time into a demonstration of the data spine, and it sets up the sources block below. If a step returns nothing, say so in place ("No permits on record") rather than silently skipping it.

**3. Calculator recompute (Type B).**

The number must acknowledge every input change or the tool feels broken. Number transitions (count or crossfade), and the range band resizes to its new width — the band's animated width change is what makes the confidence concept legible without explanation.

Keep it fast, ~200ms. This fires constantly; anything slower becomes irritating by the fifth adjustment.

**4. Gate step transitions (Type A).**

Horizontal slide, short distance, ~200ms. Forward and back must be directionally opposite — that's what makes "back" feel safe. Accumulated chips stay put above; only the question area moves.

**5. Label change on edit.**

When a user overwrites a prefilled value, the label chip changes from records-sourced to homeowner-reported. That transition should be *visible* — a brief highlight on the chip. It's a small moment carrying a lot of the site's honesty, and if it happens silently nobody notices the distinction exists.

### Where motion is forbidden

- **Triage flows.** Someone in an emergency does not need transitions. Instant screen changes. The shutoff instruction appears immediately, does not animate in, does not fade.
- **Safety interrupts.** Appear instantly, full stop.
- **The `#answer` block and anything below the fold.** No scroll-triggered reveals on the citation layer — content that animates in on scroll is content a crawler may not see and a reader has to wait for. Static.
- **Numbers in the sources and dates.** Never animate provenance.

---

## Part 2 — Imagery

### The constraint that defines everything

No stock photography. No technicians, no trucks, no smiling homeowners, no roof close-ups from a photo library. Every such image says "contractor marketing" and undoes the positioning in one glance.

So the imagery has to come from the data itself. Fortunately there's a lot of it, and it's more interesting than stock.

### The five image types

**1. The user's own property, from above.**
Satellite/aerial with the roof footprint overlaid. Used in `roof-scan` and `storm-check`. This is the highest-impact image on the site because it's *about them* — it does the persuading before we ask for anything. Treat it as a hero object, not a thumbnail.

**2. Maps and geographic overlays.**
Hail swaths across a metro. Permit density by ZIP. The drought map already running on the homepage. Storm event locations. These are genuinely engaging, they're all sourced, and they double as citation-worthy assets — a good hail map gets linked to.

Style them to the design system rather than dropping in default provider tiles; a map that looks like everyone else's map looks like a widget, not a publication.

**3. Data visualization as primary imagery.**
The permit timeline for a property. The cost band. Runtime comparison against the national average. Age-versus-expected-life. In a data product, charts *are* the pictures — they should be treated with the care usually reserved for photography, not relegated to supporting figures.

**4. Instructional line diagrams.**
Where the main water shutoff typically sits. What a frozen evaporator coil looks like. Where the condensate drain runs. Simple, flat, high-contrast, drawn to the design system. These are the only "illustrations" on the site and they exist purely to be useful at 2am on a phone. Enormous trust value, and they're the natural companion to the triage flows.

**5. Nothing.**
Type C should carry essentially no imagery. Whitespace and typography. An emergency screen with a decorative image is a worse emergency screen.

### Handling the absent image

When satellite imagery is unavailable — outside coverage, failed fetch, or the San Antonio degraded path — the fallback must not be a broken-image state or a grey box. Fall back to the property dossier card: year built, size, permit timeline, rendered as a designed object. It should look like a deliberate alternative, not a failure, because in one of two launch metros it will be the common case.

### Effects

Restrained. This is a records product.

Reasonable: subtle elevation on interactive cards, a soft vignette or gradient over satellite imagery to keep overlaid text legible, focus states with real contrast, high-contrast treatment on safety screens.

Avoid: glassmorphism, animated gradient meshes, parallax, particles, glow, texture overlays, anything that would look at home on a startup landing page. If an effect would be described as "slick," it's wrong for this site.
