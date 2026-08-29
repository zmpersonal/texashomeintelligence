// @ts-check
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

/**
 * The newest successful fetch across every generated dataset. Data pages are
 * the only routes whose content changes without a code change, so they are the
 * only ones given a sitemap `lastmod` — a build-time date on every page would
 * claim the whole site changed whenever anything did.
 *
 * @returns {string | undefined} ISO timestamp of the newest successful fetch.
 */
function newestDataUpdate() {
  const generated = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "src/data/generated",
  );
  /** @type {string | undefined} */
  let newest;
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".json")) {
        const { lastSuccessAt } = JSON.parse(readFileSync(full, "utf8"));
        if (lastSuccessAt && (!newest || lastSuccessAt > newest)) newest = lastSuccessAt;
      }
    }
  };
  try {
    walk(generated);
  } catch {
    // No generated data yet — omit lastmod rather than invent one.
  }
  return newest;
}

const dataLastUpdated = newestDataUpdate();

export default defineConfig({
  site: "https://texashomeintelligence.com",
  // Every internal link in the codebase is written with a trailing slash, and
  // canonicals are emitted that way. Enforcing it here means the non-slash
  // form redirects instead of quietly serving a duplicate.
  trailingSlash: "always",
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
      //
      // /dashboard/ was excluded while it was a noindexed placeholder. It is
      // now 225 real per-ZIP pages carrying local data, which is exactly what
      // should be in the sitemap, so the exclusion is gone.
      filter: (page) =>
        !page.includes("/lp/") &&
        !page.includes("/start/") &&
        !page.includes("/tools/quickconnect/") &&
        !page.includes("/tools/home-risk-report/") &&
        !page.includes("/tools/cost-calculators/"),
      serialize: (item) =>
        dataLastUpdated && item.url.includes("/data/")
          ? { ...item, lastmod: dataLastUpdated }
          : item,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
