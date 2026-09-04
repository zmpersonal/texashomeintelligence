/**
 * A Node module hook that understands Vite's `?raw` import suffix.
 *
 * ── WHY THIS EXISTS (a Round 14b regression, found in Round 15) ───────────
 * `src/data/belowHero.ts` derives its dataset citation URLs from the FETCHERS
 * that request them, by importing the fetcher's source text with Vite's `?raw`
 * suffix. That is the right mechanism inside Astro: the source becomes a string
 * constant at build time, nothing reaches a bundle, and a citation cannot drift
 * from the code that fetches it.
 *
 * It is not a mechanism Node understands. `scripts/check-citations.ts` imports
 * the same module outside Vite, under `tsx`, and from the moment Round 14b
 * landed the first `?raw` import that script died on startup with
 *
 *   SyntaxError: The requested module '...sanAntonioPermits.ts?raw'
 *   does not provide an export named 'default'
 *
 * The weekly workflow treats a non-zero exit as "a citation is dead", so the
 * failure mode was not a silent one — it was a GitHub issue every Monday
 * containing a stack trace instead of a link report. Nothing on the site was
 * wrong; the check that guards the citations was.
 *
 * The hook is deliberately tiny and does exactly what Vite's does for this one
 * case: return the file's text as a default export. It is loaded only by the
 * citation script. The build does not use it — Vite already handles `?raw`.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const RAW = "?raw";

export async function resolve(specifier, context, next) {
  if (!specifier.endsWith(RAW)) return next(specifier, context);
  const resolved = await next(specifier.slice(0, -RAW.length), context);
  return { ...resolved, url: `${resolved.url}${RAW}`, shortCircuit: true };
}

export async function load(url, context, next) {
  if (!url.endsWith(RAW)) return next(url, context);
  const source = await readFile(fileURLToPath(url.slice(0, -RAW.length)), "utf8");
  return {
    format: "module",
    shortCircuit: true,
    source: `export default ${JSON.stringify(source)};\n`,
  };
}
