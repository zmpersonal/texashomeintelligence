/*
 * Round 32 — every /data/ link on the site, fetched.
 *
 * `scripts/check-links.mjs` answers the same question over the build output
 * and gates on it. This answers it over the SERVED site, which is a different
 * question in two ways worth the extra minute: it goes through the worker's
 * routing rather than a directory listing, so a route that exists as a file
 * and 404s in front of a reader fails here; and it reads the rendered DOM, so
 * a link injected after hydration is in scope where a file scan cannot see it.
 *
 * It also pins the specific finding this round fixed. Austin's NOAA storm
 * records are published — as /data/austin/roofing/, a roofing-framed page over
 * the same dataset — so the storms reading on an Austin page has a source and
 * a date and no data page under the topic its link text names. The rule the
 * round set is that such a reading withholds the LINK and keeps the
 * PROVENANCE, and that is what the last section asserts.
 *
 * Needs `npm run build` and `npm run worker` (port 9400).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = join(SITE, 'dist', 'client');
const B = 'http://127.0.0.1:9400';
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === 'index.html') out.push(full);
  }
  return out;
}
const urlOf = (full) => {
  const rel = relative(ROOT, dirname(full)).split(sep).filter(Boolean).join('/');
  return rel ? `/${rel}/` : '/';
};

// ══ 1. EVERY /data/ HREF ON EVERY BUILT PAGE ══════════════════════════════
console.log('\n══ EVERY /data/ HREF ON EVERY BUILT PAGE RESOLVES ══');
const pages = walk(ROOT);
const targets = new Map();          // /data/… -> Set of pages linking it
for (const full of pages) {
  const from = urlOf(full);
  // <script> contents stripped: a path inside client-side JS is not a link.
  const html = readFileSync(full, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  for (const m of html.matchAll(/href="(\/data\/[^"#?]*)"/g)) {
    if (!targets.has(m[1])) targets.set(m[1], new Set());
    targets.get(m[1]).add(from);
  }
}
console.log(`  ${pages.length} built pages · ${targets.size} distinct /data/ targets`);

try {
  await fetch(B);
} catch {
  console.error(`no worker on ${B} — start one with 'npm run worker'`);
  process.exit(2);
}

const statuses = new Map();
for (const target of [...targets.keys()].sort()) {
  const res = await fetch(B + target, { redirect: 'manual' });
  statuses.set(target, res.status);
  A(`${target}`, res.status === 200,
    `${res.status} · linked from ${targets.get(target).size} page${targets.get(target).size === 1 ? '' : 's'}`);
}
A('no /data/ href anywhere returns anything but 200',
  [...statuses.values()].every((s) => s === 200),
  [...statuses.entries()].filter(([, s]) => s !== 200).map(([t, s]) => `${t} ${s}`).join(', ') || 'all 200');

// ══ 2. THE ROUTE THIS ROUND FOUND ═════════════════════════════════════════
console.log('\n══ THE ROUTE THIS ROUND FOUND ══');
A('nothing links /data/austin/storms/', !targets.has('/data/austin/storms/'),
  targets.has('/data/austin/storms/')
    ? `still linked from ${[...targets.get('/data/austin/storms/')].join(', ')}`
    : 'no page carries the href');
A('and it is still not a route', (await fetch(`${B}/data/austin/storms/`)).status === 404,
  'the href was removed because the page does not exist, not the other way round');
A('/data/san-antonio/storms/ still resolves', statuses.get('/data/san-antonio/storms/') === 200,
  `linked from ${[...(targets.get('/data/san-antonio/storms/') ?? [])].join(', ')}`);

// ══ 3. THE LINK IS WITHHELD, THE PROVENANCE IS NOT ════════════════════════
console.log('\n══ A READING THAT LOST ITS LINK KEPT ITS SOURCE AND AS-OF ══');
const b = await launchChromium();
const c = await b.newContext({ viewport: { width: 1366, height: 1000 } });
const p = await c.newPage();

// Matched case-insensitively throughout: `.metric-label` carries a shouting
// text-transform, so innerText hands back "NOAA STORM EVENTS RECORDED IN
// TRAVIS COUNTY" where the source says "NOAA storm events recorded in".
for (const [route, find] of [
  ['/austin/roofing/', 'storm events recorded in'],
  ['/tools/roof-scan/', 'confirmed'],
]) {
  await p.goto(B + route, { waitUntil: 'networkidle' });
  const card = await p.evaluate((needle) => {
    const el = [...document.querySelectorAll('.card')]
      .find((e) => e.innerText.toLowerCase().includes(needle) && /NOAA Storm Events/i.test(e.innerText));
    if (!el) return null;
    return {
      text: el.innerText,
      hrefs: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    };
  }, find);
  A(`${route} renders a NOAA storm-events reading`, card !== null);
  if (!card) continue;
  A(`${route} names its source`, /NOAA Storm Events Database/i.test(card.text));
  // Compared case-insensitively: the status ramp's own styling shouts, and the
  // assertion is about the label being present, not about its casing.
  A(`${route} carries an as-of date`, /updated:/i.test(card.text) && /\b20\d\d\b/.test(card.text),
    card.text.split('\n').find((l) => /updated:/i.test(l))?.trim());
  A(`${route} carries a data-through date`, /data through/i.test(card.text),
    card.text.split('\n').find((l) => /data through/i.test(l))?.trim());
  A(`${route} links no Austin storms page`, !card.hrefs.includes('/data/austin/storms/'),
    `hrefs in the card: ${JSON.stringify(card.hrefs)}`);
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
