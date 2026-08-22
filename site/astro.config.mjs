// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// Phase 0: scaffold only. Site content, real routes, and Cloudflare
// bindings (KV/D1) land in later phases per BUILD_PLAN.md.
export default defineConfig({
  site: "https://texashomeintelligence.com",
  // Static by default — this is a content-heavy site and facts must render
  // as plain HTML. Only the Phase 3 /api/* intake endpoints opt into SSR
  // individually via `export const prerender = false`.
  output: "static",
  adapter: cloudflare({
    imageService: "compile",
  }),
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
