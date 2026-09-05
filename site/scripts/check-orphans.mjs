/*
 * Orphan check — indexed pages nothing outside their own subtree links to.
 *
 * Round 28 found /tools/ this way and only this way: it was indexed, in the
 * sitemap, carried three working tools, and the only links to it were the
 * breadcrumbs of its own children. A build is green when that happens, every
 * page renders, every link resolves, and a reader still cannot get there.
 *
 * It lost its inbound links in pieces rather than at once — the nav item went
 * with one round, the hero CTA and the below-hero cards with another — which is
 * exactly the shape a per-round diff does not show. So this runs over the whole
 * built site rather than over a change.
 *
 * ── ONE DELIBERATE EXCLUSION ──────────────────────────────────────────────
 * The homepage. Every path on the site begins with "/", so "outside its own
 * subtree" excludes the entire site for the root, and it reports as an orphan
 * on any site. It is excluded by rule, not by a special case that could hide a
 * real finding: the root is reachable by definition from the domain itself.
 *
 * Usage: node scripts/check-orphans.mjs [--quiet]
 * Exits 1 if an orphan is found. Needs `npm run build` first.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, 'dist', 'client');
const QUIET = process.argv.includes('--quiet');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === 'index.html') out.push(full);
  }
  return out;
}

/** dist path -> the URL it is served at, always with a trailing slash. */
function urlOf(full) {
  const rel = relative(ROOT, dirname(full)).split(sep).filter(Boolean).join('/');
  return rel ? `/${rel}/` : '/';
}

let files;
try { files = walk(ROOT); } catch {
  console.error('no dist/client — run `npm run build` first'); process.exit(2);
}

const robots = new Map();
const inbound = new Map();   // url -> Set of pages linking it
const add = (u, from) => { if (!inbound.has(u)) inbound.set(u, new Set()); inbound.get(u).add(from); };

for (const full of files) {
  const url = urlOf(full);
  const html = readFileSync(full, 'utf8');
  const m = /<meta name="robots" content="([^"]*)"/.exec(html);
  robots.set(url, m ? m[1] : null);
  // Whole document, not just <main>: a crawler does not care which region a
  // link sits in, and the fix for the orphan this check exists for is chrome.
  for (const href of new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((x) => x[1]))) {
    const last = href.split('/').pop();
    add(href.endsWith('/') || last.includes('.') ? href : `${href}/`, url);
  }
}

const sitemapPath = join(ROOT, 'sitemap-0.xml');
const sitemap = new Set(
  [...readFileSync(sitemapPath, 'utf8')
    .matchAll(/<loc>https:\/\/texashomeintelligence\.com([^<]*)<\/loc>/g)].map((x) => x[1]),
);

const indexed = (u) => !(robots.get(u) ?? '').includes('noindex') && sitemap.has(u);
const outsideSubtree = (u) =>
  [...(inbound.get(u) ?? [])].filter((s) => s !== u && !s.startsWith(u)).sort();

const orphans = [];
const thin = [];
for (const url of [...robots.keys()].sort()) {
  if (url === '/') continue;               // see header
  if (!indexed(url)) continue;
  const out = outsideSubtree(url);
  if (out.length === 0) orphans.push(url);
  else if (out.length === 1) thin.push([url, out[0]]);
}

// Noindexed pages linked from indexed ones — not an orphan, the inverse: a
// reader is routed somewhere search engines are told to ignore.
const noindexLinked = [...robots.keys()].sort()
  .filter((u) => (robots.get(u) ?? '').includes('noindex'))
  .map((u) => [u, [...(inbound.get(u) ?? [])].filter((s) => s !== u && !(robots.get(s) ?? '').includes('noindex')).sort()])
  .filter(([, s]) => s.length);

if (!QUIET) {
  console.log(`${files.length} built pages · ${sitemap.size} sitemap entries\n`);
  console.log(`indexed pages with only ONE inbound source outside their subtree: ${thin.length}`);
  // The 226 ZIP dashboards each hang off /dashboard/ by design; printing them
  // every run would bury anything that is not by design.
  const notable = thin.filter(([u]) => !u.startsWith('/dashboard/'));
  for (const [u, s] of notable) console.log(`  ${u}  <- ${s}`);
  if (thin.length !== notable.length)
    console.log(`  (+${thin.length - notable.length} /dashboard/<zip>/ pages, all <- /dashboard/, by design)`);
  if (noindexLinked.length) {
    console.log('\nnoindexed pages linked from an indexed one:');
    for (const [u, s] of noindexLinked) console.log(`  ${u}  <- ${s.join(', ')}`);
  }
}

console.log(`\nORPHANS (indexed, in the sitemap, nothing outside the subtree links them): ${orphans.length}`);
for (const u of orphans) {
  const inside = [...(inbound.get(u) ?? [])].filter((s) => s !== u).sort();
  console.log(`  ${u}`);
  console.log(`     inbound, all from inside its own subtree: ${inside.join(', ') || 'NONE AT ALL'}`);
}
if (orphans.length === 0) console.log('  none');
process.exit(orphans.length === 0 ? 0 : 1);
