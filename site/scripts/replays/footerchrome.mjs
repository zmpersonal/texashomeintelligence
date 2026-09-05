/**
 * Round 10b — the sitewide footer, after the QuoteReady links were retired.
 *
 * The footer is on all 29 static routes, so a change to it is a change to every
 * page. This checks the chrome on a spread of them — an editorial page, a
 * location hub, a data page, the homepage, and one of the rebuilt San Antonio
 * pages — rather than trusting that one page's footer speaks for the rest.
 *
 * It also checks what the round did NOT do: /services/ and /start/ still
 * render, and the fourteen location x service pages are still reachable from
 * the footer. Retiring a link is only safe if it does not orphan the page it
 * pointed at, and the fourteen service links are a third of the indexed site's
 * internal linking.
 */
import { launchChromium } from './browser.mjs';

const B = 'http://127.0.0.1:9400';
let pass = 0, fail = 0;
const A = (label, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : '**FAIL**'}  ${label}${note ? '  — ' + note : ''}`);
};

const b = await launchChromium();
const SAMPLE = [
  '/', '/austin/', '/austin/roofing/', '/san-antonio/hvac/',
  '/data/', '/data/austin/roof-permits/', '/methodology/', '/privacy/',
];

console.log('══ FOOTER CHROME ACROSS THE SITE ══');
const shapes = new Set();
for (const path of SAMPLE) {
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  const res = await p.goto(B + path, { waitUntil: 'networkidle' });
  const f = await p.evaluate(() => {
    const footer = document.querySelector('footer');
    if (!footer) return null;
    return {
      hrefs: [...footer.querySelectorAll('a')].map(a => a.getAttribute('href')),
      text: footer.innerText.replace(/\s+/g, ' ').trim(),
      headings: [...footer.querySelectorAll('h4')].map(h => h.textContent.trim()),
    };
  });
  const ok = res.status() === 200 && f;
  A(`${path} renders with a footer`, ok, String(res.status()));
  if (!f) { await c.close(); continue; }
  A(`${path} — no /services/ link`, !f.hrefs.includes('/services/'));
  A(`${path} — no /start/ link`, !f.hrefs.some(h => h && h.startsWith('/start/')));
  A(`${path} — no "Project Brief" or "All services" text`,
    !/Project Brief|All services/i.test(f.text));
  A(`${path} — all 7 Austin service pages still linked`,
    ['roofing','hvac','plumbing','fire-damage-restoration','mold-remediation','electrical','tree-trimming']
      .every(s => f.hrefs.includes(`/austin/${s}/`)),
    `${f.hrefs.filter(h => h && h.startsWith('/austin/')).length} austin links`);
  // ROUND 29 — the assertion this file was missing, and the reason it could
  // not have caught what it should have. It checked what the footer must NOT
  // link and never what it MUST, so a hub could go unlinked sitewide without a
  // single assertion moving. /tools/ did exactly that: indexed, three working
  // tools behind it, and nothing outside its own subtree pointing at it.
  A(`${path} — the footer links /tools/`, f.hrefs.includes('/tools/'));
  A(`${path} — and it is the hub, not a tool page`,
    !f.hrefs.some(h => h && h.startsWith('/tools/') && h !== '/tools/'),
    f.hrefs.filter(h => h && h.startsWith('/tools/')).join(', '));
  shapes.add(f.hrefs.join('|'));
  await c.close();
}
A('the footer is identical on every page sampled', shapes.size === 1, `${shapes.size} distinct footers`);

console.log('\n══ NOTHING WAS ORPHANED ══');
// The two pages that lost their footer link must still render, and must still
// be reachable from somewhere real.
for (const [path, expect] of [['/services/', 200], ['/start/', 200], ['/tools/', 200]]) {
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  const res = await p.goto(B + path, { waitUntil: 'networkidle' });
  const info = await p.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText.trim(),
    robots: document.querySelector('meta[name="robots"]')?.content ?? '(none)',
  }));
  A(`${path} still renders ${expect}`, res.status() === expect, `${res.status()} · "${info.h1}"`);
  console.log(`          robots: ${info.robots}`);
  await c.close();
}
// /services/ keeps inbound links from the location hubs and from every service
// page that does not carry a below-hero layer.
//
// ROUND 15 CHANGED THIS SAMPLE, and the change is the finding rather than a
// workaround. `/austin/roofing/` used to be one of the two pages sampled here.
// It now carries a below-hero layer, and ServicePage deliberately suppresses
// the "All services" link on any page that does, because ROADMAP retires
// /services/ from navigation — the same removal Round 10 made on the three San
// Antonio pages. So that page no longer links /services/, correctly, and this
// assertion was pinned to the one route the round was supposed to remove.
//
// What actually matters is the PROPERTY: /services/ must not be orphaned. It
// is reachable from both location hubs and from the eight service pages with
// no layer, so the sample tests one of each instead of a page that is now
// expected to have dropped the link.
for (const from of ['/austin/', '/austin/electrical/', '/san-antonio/tree-trimming/']) {
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + from, { waitUntil: 'networkidle' });
  const links = await p.evaluate(() => [...document.querySelectorAll('main a, .block a, .wrap a')]
    .map(a => a.getAttribute('href')).filter(Boolean));
  A(`/services/ still reachable from ${from}`, links.includes('/services/'),
    links.includes('/services/') ? 'in-body link present' : 'NO in-body link');
  await c.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
