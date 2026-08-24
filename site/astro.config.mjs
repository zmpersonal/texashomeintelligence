// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://texashomeintelligence.com",
  // Static by default — this is a content-heavy site and facts must render
  // as plain HTML. Only the Phase 3 /api/* intake endpoints opt into SSR
  // individually via `export const prerender = false`.
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),
  integrations: [
    sitemap({
      // Every noindexed route needs to be excluded here too — a <meta
      // robots noindex> tag alone doesn't keep a page out of the
      // sitemap. /lp/* (PPCPage.astro) and the not-yet-built tool
      // placeholders (ToolPlaceholder.astro, THI-round-homepage-nav.md
      // §6) are the two noindexed families right now.
      filter: (page) =>
        !page.includes("/lp/") &&
        !page.includes("/dashboard/") &&
        !page.includes("/tools/quickconnect/") &&
        !page.includes("/tools/home-risk-report/") &&
        !page.includes("/tools/cost-calculators/"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
