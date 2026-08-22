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
      // /lp/* pages are noindex (per-page <meta robots> in PPCPage.astro)
      // to avoid duplicate-content collision with the equivalent SEO
      // page — keep them out of the sitemap too, not just noindexed.
      filter: (page) => !page.includes("/lp/"),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
