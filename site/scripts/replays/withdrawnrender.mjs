/*
 * Round 43 — a withdrawn article answers 410, and nothing else moved.
 *
 * `published: false` alone gives the retracted URL a 404, which is the same
 * answer a slug that never existed gets. The page WAS published and indexed, so
 * the honest status is 410 Gone. That is a response header, which a prerendered
 * file cannot set, so the fix is an SSR rest-route under /analysis/ — and a
 * rest-route is exactly the kind of thing that can quietly swallow its
 * siblings.
 *
 * So this asserts three things that have to hold together, and the middle one
 * is the one that would be a silent catastrophe:
 *
 *   1. the withdrawn slug returns 410, and the body says what happened;
 *   2. every PUBLISHED article and the hub still return 200 — the rest-route
 *      must not shadow the five prerendered pages or the index;
 *   3. an unknown slug still returns 404, because a typo is not a retraction.
 *
 * The published list and the withdrawal registry are both READ from source, not
 * typed here, so adding or withdrawing an article updates this test's coverage
 * without anyone remembering to.
 *
 * Needs `npm run build` and `npm run worker` (port 9400).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = 'http://127.0.0.1:9400';
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

/** Articles by publish state, read out of the collection's frontmatter. */
function articles() {
  const dir = join(SITE, 'src', 'data', 'analysis');
  const published = [], unpublished = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const src = readFileSync(join(dir, name), 'utf8');
    const slug = name.replace(/\.md$/, '');
    (/^published:\s*true\s*$/m.test(src) ? published : unpublished).push(slug);
  }
  return { published, unpublished };
}

/** The withdrawal registry, read out of the module rather than restated. */
function withdrawnSlugs() {
  const src = readFileSync(join(SITE, 'src', 'data', 'withdrawnArticles.ts'), 'utf8');
  const block = src.match(/export const WITHDRAWN_ARTICLES = \[([\s\S]*?)\] as const/);
  if (!block) throw new Error('withdrawnrender: could not read WITHDRAWN_ARTICLES');
  return [...block[1].matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
}

const get = async (path) => {
  const r = await fetch(B + path, { redirect: 'manual' });
  return { status: r.status, body: await r.text() };
};

const { published, unpublished } = articles();
const withdrawn = withdrawnSlugs();

console.log('\n══ 1 · THE WITHDRAWN URL ══\n');
A(`the registry is non-empty (${withdrawn.length})`, withdrawn.length > 0);
for (const slug of withdrawn) {
  const r = await get(`/analysis/${slug}/`);
  A(`/analysis/${slug}/ returns 410`, r.status === 410, `got ${r.status}`);
  A(`  …and names itself as withdrawn`, /WITHDRAWN ARTICLE/i.test(r.body));
  A(`  …and states both dates`, /published on/i.test(r.body) && /withdrawn on/i.test(r.body));
  A(`  …and gives the reason rather than only the status`,
    /placeholder rows/i.test(r.body), r.body.length + ' bytes');
  A(`  …and is noindex`, /noindex/i.test(r.body));
  A(`  …and carries no figure from the retracted article`,
    !/13\.88|13\.73|13\.58|10\.2%|18\.3%|17\.4%/.test(r.body));
  // A withdrawn slug must also be unpublished: a 410 on a page that still
  // renders elsewhere would be two answers to the same question.
  A(`  …and is not in the published set`, !published.includes(slug));
  A(`  …and its source file exists but is unpublished`, unpublished.includes(slug));
}

console.log('\n══ 2 · NOTHING ELSE WAS SHADOWED ══\n');
A(`there are published articles to check (${published.length})`, published.length > 0);
for (const slug of published) {
  const r = await get(`/analysis/${slug}/`);
  A(`/analysis/${slug}/ still 200`, r.status === 200, `got ${r.status}`);
}
for (const path of ['/analysis/', '/', '/data/texas/electricity-prices/', '/methodology/']) {
  const r = await get(path);
  A(`${path} still 200`, r.status === 200, `got ${r.status}`);
}

console.log('\n══ 3 · A TYPO IS NOT A RETRACTION ══\n');
for (const slug of ['this-never-existed', 'are-texas-electricity-prices', 'índex']) {
  const r = await get(`/analysis/${encodeURIComponent(slug)}/`);
  A(`/analysis/${slug}/ returns 404, not 410`, r.status === 404, `got ${r.status}`);
}

console.log('\n══ 4 · THE HUB NO LONGER LINKS OR CITES IT ══\n');
{
  const r = await get('/analysis/');
  for (const slug of withdrawn) {
    A(`hub does not link /analysis/${slug}/`, !r.body.includes(`/analysis/${slug}/`));
  }
  A('hub carries none of the retracted figures',
    !/13\.88|down 10\.2%/.test(r.body));
}

console.log('\n══ 5 · THE FIGURE SURVIVES ONLY AS A RETRACTION ══\n');
/*
 * Round 43's verification was "the fabricated values appear nowhere in the
 * built site." The correction note deliberately breaks that, because a
 * correction that will not name the number it is retracting is not a
 * correction. So the invariant is narrower and has to be asserted as such,
 * or a later round reads a bare grep hit as a regression and deletes the
 * record — or, worse, restores 13.88¢ somewhere as fact and nothing notices.
 */
{
  const DIST = join(SITE, 'dist', 'client');
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(html|csv|json|xml|txt)$/.test(name)) out.push(full);
    }
    return out;
  };
  const carriers = walk(DIST).filter((f) => /13\.88/.test(readFileSync(f, 'utf8')));
  const rel = carriers.map((f) => f.slice(DIST.length + 1));
  A('13.88¢ appears in exactly one built file', carriers.length === 1, rel.join(', '));
  A('…and that file is /methodology/', rel[0] === 'methodology/index.html', rel[0]);

  const meth = readFileSync(join(DIST, 'methodology', 'index.html'), 'utf8');
  A('the correction names the retraction, not a reading',
    /was not a measured figure/.test(meth));
  A('…and states the corrected figure beside it',
    /16\.44/.test(meth) && /rose 6\.3%/.test(meth));
  A('…and names the window that ends, not an open one',
    /28 August to 1 October 2026/.test(meth));
  // The two derived percentages must NOT come back even as quotation: they are
  // not needed to state what was wrong, and each is a second wrong figure.
  A('the retracted derived percentages are not restated anywhere',
    !walk(DIST).some((f) => /down 10\.2%|18\.3% from the peak|17\.4% fall/.test(readFileSync(f, 'utf8'))));
  // The card asset is gone, and a text grep cannot see a PNG — so assert the file.
  A('the OG card carrying the figure is not in the build',
    !walk(DIST).concat(
      readdirSync(join(DIST, 'images', 'og')).map((n) => join(DIST, 'images', 'og', n)),
    ).some((f) => f.includes('are-texas-electricity-prices-still-going-up')));
}

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
