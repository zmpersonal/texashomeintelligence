/*
 * Round 28 — the /tools/ hub, verified in a browser.
 *
 * A hub is the easiest page on a site to overstate, because it describes pages
 * a reader has not opened yet. This file's job is to keep the hub honest about
 * three separate things a green build cannot check:
 *
 *  1. EVERY LISTED ROUTE RESOLVES — asserted by fetching each one, not by
 *     eyeballing the href. A hub linking a page a round deleted is the failure
 *     mode this round exists to fix, in reverse.
 *  2. NO DESCRIPTION CLAIMS A CAPABILITY THE TOOL LACKS — each tool's own
 *     refusal is READ OFF THE TOOL PAGE and checked against the hub card, so
 *     the hub cannot drift ahead of the page it advertises.
 *  3. NOTHING SURVIVES OF THE DELETED PLACEHOLDERS — no link, no route.
 */
import { launchChromium } from './browser.mjs';

const B = 'http://127.0.0.1:9400';
const HUB = '/tools/';
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

/** Routes this round deleted. Nothing may link them and nothing may serve them. */
const DELETED = ['/tools/quickconnect/', '/tools/home-risk-report/', '/tools/cost-calculators/'];

/**
 * The refusal each tool makes ON ITS OWN PAGE. The hub's "what it will not do"
 * has to be consistent with these, so they are read from the tool pages rather
 * than pinned here — a tool that dropped its refusal would fail this file even
 * though the hub still carried one.
 */
const REFUSALS = {
  '/tools/plumbing-triage/': /isn't an inspection and it can't see your house/i,
  '/tools/ac-lifespan/': /will not tell you when to replace your system/i,
  '/tools/roof-scan/': /has not seen your roof/i,
  // Verified against a ZIP page rather than /dashboard/ itself: the hub's CTA
  // opens the selector, which publishes no reading and therefore carries no
  // caveat. The reading and its qualification both live one route further in,
  // and that is the page the hub's sentence is about.
  '/dashboard/': { on: '/dashboard/78704/', re: /not damage to a home/i },
};

const b = await launchChromium();

// ══ 1. WHAT THE HUB LISTS ═════════════════════════════════════════════════
console.log('\n══ THE HUB LISTS WHAT EXISTS ══');
const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
const p = await c.newPage();
await p.goto(B + HUB, { waitUntil: 'networkidle' });

const hub = await p.evaluate(() => ({
  h1: document.querySelector('h1')?.innerText.trim(),
  sections: [...document.querySelectorAll('section[id]')].map((s) => s.id),
  main: document.querySelector('main').innerText,
  cards: [...document.querySelectorAll('.tool-card')].map((e) => ({
    name: e.querySelector('.tool-name')?.innerText.trim(),
    route: e.querySelector('.tool-route code')?.innerText.trim(),
    cta: e.querySelector('.tool-cta a')?.getAttribute('href'),
    wont: e.querySelector('.tool-wont')?.innerText.trim(),
    text: e.innerText,
  })),
  hrefs: [...document.querySelectorAll('main a')].map((a) => a.getAttribute('href')),
  robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
}));

A('the hub renders', !!hub.h1, hub.h1);
A('the hub is still indexed', hub.robots === null, hub.robots ?? 'no robots meta');
for (const id of ['working', 'not-published', 'elsewhere'])
  A(`#${id} is present`, hub.sections.includes(id));
A('four working things are listed', hub.cards.length === 4,
  hub.cards.map((x) => x.name).join(', '));

for (const card of hub.cards) {
  A(`${card.name}: the card shows its route`, card.route === card.cta,
    `${card.route} / cta ${card.cta}`);
  A(`${card.name}: the card carries a refusal, not just a description`,
    !!card.wont && /^What it will not do\./.test(card.wont), card.wont?.slice(0, 60));
}

// ══ 2. EVERY LISTED ROUTE RESOLVES ════════════════════════════════════════
console.log('\n══ EVERY LISTED ROUTE RESOLVES ══');
for (const href of [...new Set(hub.hrefs)]) {
  if (!href || !href.startsWith('/')) continue;
  const res = await p.request.get(B + href);
  A(`${href} resolves`, res.status() === 200, `HTTP ${res.status()}`);
}

// ══ 3. THE HUB DOES NOT OUTRUN THE PAGES IT ADVERTISES ════════════════════
console.log('\n══ NO DESCRIPTION CLAIMS WHAT THE TOOL LACKS ══');
for (const card of hub.cards) {
  const spec = REFUSALS[card.cta];
  const target = spec instanceof RegExp ? { on: card.cta, re: spec } : spec;
  if (!target) { A(`${card.name}: has a refusal to verify`, false, 'NO PATTERN FOR THIS ROUTE'); continue; }
  const tp = await c.newPage();
  await tp.goto(B + target.on, { waitUntil: 'networkidle' });
  const toolText = await tp.evaluate(() => document.querySelector('main').innerText);
  A(`${card.name}: ${target.on} still makes the refusal the hub reports`,
    target.re.test(toolText), target.re.test(toolText) ? 'found on the page' : 'NOT ON THE PAGE');
  await tp.close();
}

// Capability words the hub must not use, because no tool on it does these.
const OVERCLAIM = /\b(we'?ll tell you (when|whether) to replace|replacement window|cost range|price range|estimated cost|hail size|inches of hail|your roof (is|was) damaged|we'?ll connect you|match(ed)? (you )?with|get quotes|free quote)\b/i;
A('the hub claims no capability any tool lacks', !OVERCLAIM.test(hub.main),
  hub.main.match(OVERCLAIM)?.[0] ?? 'clean');
A('and it says no cost figure is published, with the measurement',
  /0\.00% populated/.test(hub.main) && /median of 1/.test(hub.main));
A('Roof Scan is described as counts, not sizes',
  /Counts only, no hail sizes/.test(hub.main));
A('AC Lifespan is not described as a replacement planner',
  /will not tell you when to replace your system/.test(hub.main));
A('Plumbing Triage is described as ending at a verdict',
  /It ends at what to check/.test(hub.main));
A('the QuoteReady intake is named for what it collects rather than promoted',
  /collects a name, an email and a property address/.test(hub.main)
  && !/build my brief/i.test(hub.main));

// ══ 4. THE DELETED PLACEHOLDERS ARE GONE ══════════════════════════════════
console.log('\n══ THE PLACEHOLDERS ARE GONE ══');
for (const route of DELETED) {
  A(`nothing on the hub links ${route}`, !hub.hrefs.includes(route));
  const res = await p.request.get(B + route);
  A(`${route} no longer serves a page`, res.status() === 404, `HTTP ${res.status()}`);
}
// The hub uses the phrase once, in quotation marks, naming it as the thing it
// refuses to do. An unquoted occurrence is the promise; the quoted one is the
// rejection of it. Narrow the pattern, never the copy.
const UNQUOTED_SOON = /(?<!")\b(coming soon|planned for later|in active development)\b(?!")/i;
A('no unquoted "coming soon" anywhere on the hub', !UNQUOTED_SOON.test(hub.main),
  hub.main.match(UNQUOTED_SOON)?.[0] ?? 'clean');
A('and where the phrase does appear, it is named as the thing being refused',
  /a page that says "coming soon"/.test(hub.main));
await c.close();

// ══ 5. PHONE WIDTHS ═══════════════════════════════════════════════════════
console.log('\n══ PHONE WIDTHS ══');
for (const width of [320, 360, 390]) {
  const cc = await b.newContext({ viewport: { width, height: 800 } });
  const pp = await cc.newPage();
  await pp.goto(B + HUB, { waitUntil: 'networkidle' });
  const r = await pp.evaluate(() => {
    const de = document.documentElement;
    return {
      sw: de.scrollWidth, cw: de.clientWidth,
      over: [...document.querySelectorAll('body *')].filter((e) => {
        const b2 = e.getBoundingClientRect();
        return (b2.width || b2.height) && (b2.right > de.clientWidth + 0.5 || b2.left < -0.5);
      }).map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().split(/\s+/).join('.')}`),
      links: [...document.querySelectorAll('main a')].map((a) => ({
        t: a.innerText.trim().slice(0, 34),
        zone: a.closest('nav,.breadcrumbs,[aria-label="Breadcrumb"]') ? 'breadcrumb'
          : a.closest('.tool-cta') ? 'card cta' : 'in-sentence',
        h: Math.round(a.getBoundingClientRect().height),
      })),
    };
  });
  A(`no horizontal scroll at ${width}px`, r.sw === r.cw && r.over.length === 0,
    `scrollWidth ${r.sw}${r.over.length ? ' — ' + r.over.slice(0, 4).join(', ') : ''}`);
  if (width === 320) {
    console.log('  tap targets at 320px:');
    for (const l of r.links) console.log(`    ${String(l.h).padStart(3)}px  ${l.zone.padEnd(12)} ${l.t}`);
    const cta = r.links.filter((l) => l.zone === 'card cta');
    A('every card CTA is at least 24px tall', cta.length === 4 && cta.every((l) => l.h >= 24),
      cta.map((l) => `${l.h}px`).join(', '));
  }
  await cc.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
