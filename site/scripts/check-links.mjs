/*
 * Link check — internal links that point at a page which does not exist.
 *
 * Round 32 found `/data/austin/storms/` on two indexed pages. It had been
 * there since the readings layer was written: both callers assembled the href
 * from a location slug, every metro got one, and only San Antonio has a storms
 * data page. Nothing caught it. `npm run build` is green either way — a link
 * is a string, and a string to a missing route builds fine. `check-orphans`
 * asks the opposite question (what links IN to a page), so a href to a route
 * that was never built is invisible to it: no page, nothing to report on.
 *
 * So this walks the built site and asks, of every internal href, whether the
 * thing at the other end was built. It EXITS 1 when one was not, which is the
 * point — the fix belongs at the source (links resolve through a registry that
 * knows what builds), and this is what stops the next one silently shipping.
 *
 * ── WHAT COUNTS AS EXISTING ───────────────────────────────────────────────
 *  1. Anything in dist/client: a page (its index.html), a CSV, an icon, a font.
 *  2. Any route that opts into SSR with `export const prerender = false`.
 *     Those are served by the worker and have no file in dist/client, so a
 *     file-only check would report /home/ and the /api/ endpoints as broken.
 *     They are read out of src/pages rather than listed here, so adding one
 *     needs no edit to this file.
 *
 * Hrefs are read from the served HTML with <script> contents removed first: a
 * path inside client-side JS is not a link, and matching one would make this
 * fail on a string it cannot verify.
 *
 * Usage: node scripts/check-links.mjs [--quiet]
 * Exits 1 if any internal link does not resolve. Needs `npm run build` first.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, 'dist', 'client');
const PAGES_DIR = join(SITE, 'src', 'pages');
const ORIGIN = 'https://texashomeintelligence.com';
const QUIET = process.argv.includes('--quiet');

if (!existsSync(ROOT)) {
  console.error('no dist/client — run `npm run build` first');
  process.exit(2);
}

/** Every file in dist/client, as the path it is served at. */
function walkDist(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkDist(full, out);
    else out.push(full);
  }
  return out;
}

const servedPaths = new Set();
const htmlFiles = [];
for (const full of walkDist(ROOT)) {
  const rel = relative(ROOT, full).split(sep).join('/');
  if (rel.endsWith('index.html')) {
    const dir = rel.slice(0, -'index.html'.length);
    servedPaths.add(`/${dir}`);
    htmlFiles.push(full);
  } else {
    servedPaths.add(`/${rel}`);
    if (rel.endsWith('.html')) htmlFiles.push(full);
  }
}

/** Route patterns for the pages that opt into SSR. */
function walkPages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkPages(full, out);
    else if (/\.(astro|ts|js)$/.test(name)) out.push(full);
  }
  return out;
}

const ssrPatterns = [];
for (const full of walkPages(PAGES_DIR)) {
  if (!/export\s+const\s+prerender\s*=\s*false/.test(readFileSync(full, 'utf8'))) continue;
  let route = relative(PAGES_DIR, full).split(sep).join('/').replace(/\.(astro|ts|js)$/, '');
  route = route.replace(/(^|\/)index$/, '$1');
  const source = `/${route}${route.endsWith('/') || route === '' ? '' : '/'}`;
  const pattern = source
    .split('/')
    .map((seg) =>
      /^\[\.\.\..+\]$/.test(seg) ? '.*' : /^\[.+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  ssrPatterns.push({ source, re: new RegExp(`^${pattern}$`) });
}

const isServerRoute = (path) => ssrPatterns.some((p) => p.re.test(path));

/** dist path -> the URL it is served at, always with a trailing slash. */
const urlOf = (full) => {
  const rel = relative(ROOT, dirname(full)).split(sep).filter(Boolean).join('/');
  return rel ? `/${rel}/` : '/';
};

/**
 * Same normalization the site's own links use: drop the fragment and query,
 * and add the trailing slash `trailingSlash: "always"` requires on anything
 * that is not a file.
 */
function normalize(href) {
  if (href.startsWith(`${ORIGIN}/`)) href = href.slice(ORIGIN.length);
  if (!href.startsWith('/')) return undefined;          // external or relative
  const path = href.split('#')[0].split('?')[0];
  if (path === '') return undefined;                     // bare fragment
  const last = path.split('/').pop();
  return path.endsWith('/') || last.includes('.') ? path : `${path}/`;
}

const targets = new Map();  // resolved path -> Set of pages linking it
for (const full of htmlFiles) {
  const from = urlOf(full);
  const html = readFileSync(full, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const path = normalize(m[1]);
    if (!path) continue;
    if (!targets.has(path)) targets.set(path, new Set());
    targets.get(path).add(from);
  }
}

const broken = [...targets.keys()]
  .filter((path) => !servedPaths.has(path) && !isServerRoute(path))
  .sort();

if (!QUIET) {
  const dataLinks = [...targets.keys()].filter((p) => p.startsWith('/data/')).length;
  console.log(
    `${htmlFiles.length} built pages · ${targets.size} distinct internal link targets ` +
      `(${dataLinks} under /data/) · ${servedPaths.size} served paths · ` +
      `${ssrPatterns.length} server routes`,
  );
}

console.log(`\nBROKEN INTERNAL LINKS (href to a path nothing serves): ${broken.length}`);
for (const path of broken) {
  console.log(`  ${path}`);
  console.log(`     linked from: ${[...targets.get(path)].sort().join(', ')}`);
}
if (broken.length === 0) console.log('  none');
process.exit(broken.length === 0 ? 0 : 1);
