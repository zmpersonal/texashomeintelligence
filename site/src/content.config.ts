import { defineCollection } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";

const copySection = z.object({
  heading: z.string(),
  body: z.string(), // raw HTML, same convention as the Jekyll build
});

const faqItem = z.object({
  q: z.string(),
  a: z.string(),
});

// ---------------------------------------------------------------------
// locations — one file per city. Adding a city = adding a file here.
// ---------------------------------------------------------------------
const locations = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/data/locations" }),
  schema: z.object({
    name: z.string(),
    region: z.string(),
    counties: z.string(),
    hubIntro: z.string(),
  }),
});

// ---------------------------------------------------------------------
// services — one file per service. Adding a service = adding a file here.
//
// Body `sections`/`faq`/closing copy is shared between the SEO
// location×service page and the PPC landing page — the copywriter doc
// only supplies one body-copy block per service (labeled "PPC LANDING
// PAGE" in the source, but CLAUDE.md's own instruction is to use that
// supplied copy for the /lp/ pages). What differs between the two page
// families is the *hero*: the SEO page uses the wireframe's city-specific
// hero (`heroTagline` etc., below); the PPC page uses the copywriter's
// generic hero (`ppcHero`, present only for roofing/hvac/plumbing — the
// three services with supplied PPC copy). PPC pages are also
// "conversion-pure, minimal or no data modules" per CLAUDE.md, which the
// Phase 2 template enforces, not this schema.
// ---------------------------------------------------------------------
const ppcHero = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  body: z.string(),
  microcopy: z.string(),
});

const services = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/data/services" }),
  schema: z.object({
    name: z.string(),
    copyStatus: z.enum(["supplied", "draft"]),
    eyebrow: z.string(),
    heroTagline: z.string(), // may contain a {CITY} placeholder
    heroBody: z.string(),
    heroMicrocopy: z.string(),
    intakeFocus: z.string(),
    dataNote: z.string(),
    safetyNote: z.string().optional(),
    licensingNote: z.string().optional(),
    permitNote: z.string().optional(),
    // Phase 3: drives the deterministic generated-brief sections
    // "Items a Professional Should Evaluate" and "Questions the Written
    // Estimate Should Answer" — config-driven, not hardcoded in the brief
    // generator, so adding/editing a service's brief content stays a
    // data change, not a code change.
    evaluationItems: z.array(z.string()).min(1),
    estimateQuestions: z.array(z.string()).min(1),
    sections: z.array(copySection),
    closingHeading: z.string(),
    closingBody: z.string(),
    faq: z.array(faqItem),
    ppcHero: ppcHero.optional(),
  }),
});

// ---------------------------------------------------------------------
// intake-questions — per-service field list (handoff §10). Phase 1 is
// the data model only; the actual intake UI is built in Phase 3.
// ---------------------------------------------------------------------
const intakeQuestions = defineCollection({
  loader: glob({ pattern: "**/*.yaml", base: "./src/data/intake-questions" }),
  schema: z.object({
    service: z.string(), // must match a services collection id
    fields: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          kind: z.enum(["text", "textarea", "select", "boolean", "photo"]),
          options: z.array(z.string()).optional(),
        }),
      )
      .min(1),
  }),
});

// ---------------------------------------------------------------------
// data-sources — the full registry from handoff §11. `status` is
// "stub" or "sample" everywhere in this phase; "live" doesn't happen
// until a real fetcher + credentials exist (Phase 5 / Seam 1).
// ---------------------------------------------------------------------
const dataSources = defineCollection({
  loader: file("./src/data/data-sources.yaml"),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    org: z.string(),
    primaryUse: z.string(),
    thiOutput: z.string(),
    status: z.enum(["stub", "sample", "live"]),
    priority: z.boolean(), // true for the 3 "go deep" V1 feeds
  }),
});

// ---------------------------------------------------------------------
// faq — the single consolidated homepage FAQ, tagged product vs.
// authority per CLAUDE.md (no separate FAQ sections sitewide).
// ---------------------------------------------------------------------
const faq = defineCollection({
  loader: file("./src/data/faq.yaml"),
  schema: z.object({
    id: z.string(),
    q: z.string(),
    a: z.string(),
    tag: z.enum(["product", "authority"]),
  }),
});

export const collections = {
  locations,
  services,
  intakeQuestions,
  dataSources,
  faq,
};
