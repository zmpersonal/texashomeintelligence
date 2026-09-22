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
 *
 * ROUND 33 restructured the columns. NONE of the Round 10b/29 assertions below
 * changed their expectations — the seven Austin service links, the /tools/ hub
 * link, the absence of /services/ and /start/, and one identical footer
 * sitewide all still hold, which is the point of leaving them alone. What is
 * new is everything after them: the exact columns and their exact links (the
 * old file asserted a handful of links and never the SHAPE, so a column could
 * be renamed, reordered or emptied without an assertion moving), the single
 * social profile, and the phone tap targets.
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

// ══ ROUND 33 — THE EXACT FOOTER ══════════════════════════════════════════
// Headings are compared case-insensitively: .footer-grid h4 carries a shouting
// text-transform, so innerText hands back "COMPANY" where the source says
// "Company". The assertion is about the words and their order, not the casing.
console.log('\n══ THE COLUMNS, EXACTLY ══');
const EXPECTED_COLUMNS = [
  ['Texas Home Intelligence', []],
  ['Company', ['/austin/', '/san-antonio/', '/tools/', '/home/sign-in/', '/dashboard/']],
  ['Services', [
    '/austin/roofing/', '/austin/hvac/', '/austin/plumbing/',
    '/austin/fire-damage-restoration/', '/austin/mold-remediation/',
    '/austin/electrical/', '/austin/tree-trimming/',
  ]],
  ['Data', [
    '/data/', '/analysis/', '/methodology/',
    '/data/#austin', '/data/#san-antonio', '/privacy/',
  ]],
];
// Round 36 changed two expectations in this file, and only two: the profile
// COUNT (one -> two) and the Pinterest half of the "no YouTube or Pinterest"
// assertion, which Round 33 wrote when neither account existed. Pinterest now
// does; YouTube still does not, and the assertion still says so. Everything
// else here is untouched.
const PROFILES = [
  ['Facebook', 'https://www.facebook.com/people/Texas-Home-Intelligence/61593991198459/'],
  ['Pinterest', 'https://www.pinterest.com/texasintelligence/'],
];

{
  const c = await b.newContext({ viewport: { width: 1366, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + '/austin/roofing/', { waitUntil: 'networkidle' });
  const cols = await p.evaluate(() =>
    [...document.querySelectorAll('.footer-grid > div')].map((el) => ({
      heading: el.querySelector('h4')?.textContent.trim(),
      headings: [...el.querySelectorAll('h4')].map((h) => h.textContent.trim()),
      links: [...el.querySelectorAll('ul:not(.footer-social) a')].map((a) => a.getAttribute('href')),
    })));

  A('four columns', cols.length === 4, `${cols.length}`);
  A('column order', cols.map((x) => x.heading?.toLowerCase()).join(' | ') ===
    EXPECTED_COLUMNS.map(([h]) => h.toLowerCase()).join(' | '),
    cols.map((x) => x.heading).join(' | '));
  for (const [i, [heading, links]] of EXPECTED_COLUMNS.entries()) {
    const got = cols[i];
    if (!got) { A(`column ${i + 1} (${heading}) exists`, false); continue; }
    A(`${heading} — its links, in order`, got.links.join(' ') === links.join(' '),
      got.links.join(' ') || '(none)');
  }
  A('the brand column carries the Connect label',
    (cols[0]?.headings ?? []).some((h) => /^connect$/i.test(h)),
    (cols[0]?.headings ?? []).join(' | '));
  A('no Locations column survives',
    !cols.some((x) => /^locations$/i.test(x.heading ?? '')),
    cols.map((x) => x.heading).join(' | '));
  A('no About link until there is an About page',
    !cols.some((x) => x.links.some((h) => /about/i.test(h ?? ''))));

  // ── the social profile ──
  const social = await p.evaluate(() =>
    [...document.querySelectorAll('.footer-social a')].map((a) => ({
      href: a.getAttribute('href'),
      rel: a.getAttribute('rel'),
      label: a.getAttribute('aria-label'),
      // The accessible name a screen reader announces, not the markup: an icon
      // link with no text has nothing else to offer one.
      name: (a.getAttribute('aria-label') || a.innerText || '').trim(),
      svgs: a.querySelectorAll('svg').length,
      svgHidden: [...a.querySelectorAll('svg')].every((s2) => s2.getAttribute('aria-hidden') === 'true'),
      imgs: a.querySelectorAll('img').length,
    })));
  A(`${PROFILES.length} social profiles ship`, social.length === PROFILES.length, `${social.length}`);
  for (const [i, [name, url]] of PROFILES.entries()) {
    const got = social[i];
    A(`${name} — the exact URL, in order`, got?.href === url, got?.href);
    A(`${name} — rel names me and noopener`,
      /\bme\b/.test(got?.rel ?? '') && /\bnoopener\b/.test(got?.rel ?? ''), got?.rel);
    A(`${name} — has an accessible name`, new RegExp(name, 'i').test(got?.name ?? ''), got?.name);
    A(`${name} — an inline svg, hidden from the accessibility tree`,
      got?.svgs === 1 && got?.svgHidden && got?.imgs === 0,
      `${got?.svgs} svg, ${got?.imgs} img`);
  }
  // YouTube still does not exist, and nothing stands in for it.
  const allFooterHrefs = await p.evaluate(() =>
    [...document.querySelectorAll('footer a')].map((a) => a.getAttribute('href')));
  A('no YouTube icon', !allFooterHrefs.some((h) => /youtube/i.test(h ?? '')));
  A('no placeholder href anywhere in the footer',
    !allFooterHrefs.some((h) => !h || h === '#' || h.startsWith('javascript:')),
    allFooterHrefs.filter((h) => !h || h === '#').join(', ') || 'none');
  // No third-party script pulled in for an icon.
  const foreign = await p.evaluate(() =>
    [...document.querySelectorAll('script[src], link[rel="stylesheet"]')]
      .map((e) => e.getAttribute('src') || e.getAttribute('href'))
      .filter((u) => u && /^https?:/i.test(u) && !u.includes('texashomeintelligence.com')));
  A('no third-party script or stylesheet for the icon', foreign.length === 0, foreign.join(', ') || 'none');
  await c.close();
}

// ══ THE /data/ ANCHORS THE FOOTER POINTS AT ══════════════════════════════
// A fragment is the one kind of internal link check-links cannot judge: it
// normalizes the fragment away, so /data/#nothing-here passes as /data/.
console.log('\n══ THE METRO ANCHORS EXIST AND LAND CLEAR ══');
for (const id of ['austin', 'san-antonio']) {
  // A FRESH CONTEXT PER ANCHOR, and that is the assertion working rather than
  // a tidiness habit. Navigating an open page from /data/#austin to
  // /data/#san-antonio is a same-document jump against settled layout, which
  // lands correctly whatever the margin is; a cold load makes the jump and
  // then shifts as the fonts swap. Reusing the page tested the easy path and
  // reported the hard one as passing.
  const c = await b.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await c.newPage();
  {
    await p.goto(`${B}/data/#${id}`, { waitUntil: 'networkidle' });
    // `html { scroll-behavior: smooth }` means the jump is ANIMATED. Measuring
    // straight after navigation catches the element mid-flight and reports a
    // position it is only passing through — which is how this first failed.
    await p.waitForFunction(() => new Promise((done) => {
      let last = -1, still = 0;
      const tick = () => {
        const y = Math.round(window.scrollY);
        still = y === last ? still + 1 : 0;
        last = y;
        still >= 3 ? done(true) : requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), null, { timeout: 5000 });
    const r = await p.evaluate((wanted) => {
      const el = document.getElementById(wanted);
      if (!el) return null;
      const nav = document.querySelector('.site-nav');
      const box = el.getBoundingClientRect();
      return {
        heading: el.querySelector('h3')?.innerText.trim(),
        top: Math.round(box.top),
        navBottom: Math.round(nav?.getBoundingClientRect().bottom ?? 0),
      };
    }, id);
    A(`/data/#${id} is a real element`, r !== null, r?.heading);
    if (r) A(`/data/#${id} lands clear of the sticky header`, r.top >= r.navBottom,
      `card top ${r.top}px, header bottom ${r.navBottom}px`);
  }
  await c.close();
}

// ══ TAP TARGETS ON A PHONE ═══════════════════════════════════════════════
console.log('\n══ EVERY FOOTER TARGET IS 44px ON A PHONE ══');
for (const width of [390, 360]) {
  const c = await b.newContext({ viewport: { width, height: 900 } });
  const p = await c.newPage();
  await p.goto(B + '/austin/roofing/', { waitUntil: 'networkidle' });
  const taps = await p.evaluate(() =>
    [...document.querySelectorAll('footer a')].map((a) => {
      const r = a.getBoundingClientRect();
      return {
        h: Math.round(r.height), w: Math.round(r.width),
        // Found by CLASS, not by matching its text. Two goes at the text
        // failed for different reasons: an icon link's innerText is a
        // whitespace string, which is truthy, so `innerText || label` never
        // read the label; and the label that did come through was then cut to
        // 28 characters for the log, which removes the word "Facebook" from
        // "Texas Home Intelligence on Facebook". The class is what the
        // stylesheet keys the 44px box off, so it is the honest handle.
        social: a.classList.contains('footer-social-link'),
        top: Math.round(r.top),
        t: (a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 40),
      };
    }));
  const small = taps.filter((t) => t.h < 44);
  A(`${width}px — every footer link is at least 44px tall`, small.length === 0,
    `${taps.length - small.length}/${taps.length}${small.length ? ' — ' + small.slice(0, 3).map((t) => `${t.h}px "${t.t}"`).join(', ') : ''}`);
  const icons = taps.filter((t) => t.social);
  A(`${width}px — every icon target is 44px both ways`,
    icons.length === PROFILES.length && icons.every((i) => i.h >= 44 && i.w >= 44),
    icons.map((i) => `${i.w}x${i.h}`).join(', ') || 'no icon links found');
  // A second icon must not push the Connect block onto a second row on a phone.
  const rows = new Set(icons.map((i) => i.top));
  A(`${width}px — the icons sit on one row`, rows.size === 1, `${rows.size} row(s)`);
  await c.close();
}

// ══ NO LABEL IS CUT OFF ══════════════════════════════════════════════════
// Line boxes via a Range over the anchor's contents, not scrollHeight: the
// anchor is a 44px flex box on a phone, so its scrollHeight says 44 whether
// the text inside is one line or two.
console.log('\n══ NO FOOTER LABEL IS CLIPPED ══');
for (const width of [390, 360, 320]) {
  const c = await b.newContext({ viewport: { width, height: 900 } });
  const p = await c.newPage();
  await p.goto(B + '/austin/roofing/', { waitUntil: 'networkidle' });
  const rows = await p.evaluate(() => [...document.querySelectorAll('footer a')].map((a) => {
    const rng = document.createRange();
    rng.selectNodeContents(a);
    const boxes = [...rng.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    return {
      t: (a.getAttribute('aria-label') || a.innerText || '').trim(),
      lines: boxes.length,
      clipX: a.scrollWidth > a.clientWidth + 1,
      clipY: a.scrollHeight > a.clientHeight + 1,
    };
  }));
  const clipped = rows.filter((r) => r.clipX || r.clipY);
  A(`${width}px — no label is cut off`, clipped.length === 0,
    clipped.map((r) => r.t).join(', ') || `${rows.length} links, none clipped`);
  if (width === 390) {
    // The design width. A gutter wide enough to wrap the longest label here is
    // how this check earned its place: 4px fits it, 8px did not.
    const wrapped = rows.filter((r) => r.lines > 1);
    A('390px — no label wraps', wrapped.length === 0,
      wrapped.map((r) => `${r.t} (${r.lines} lines)`).join(', ') || 'all single-line');
  }
  await c.close();
}

// ══ WITH SCRIPTING OFF ═══════════════════════════════════════════════════
// The footer has no JS and must not acquire any: it is chrome on all 272 pages.
console.log('\n══ THE FOOTER IS THE SAME WITH SCRIPTING OFF ══');
{
  const on = await b.newContext({ viewport: { width: 1366, height: 1200 } });
  const off = await b.newContext({ viewport: { width: 1366, height: 1200 }, javaScriptEnabled: false });
  const read = async (ctx) => {
    const p = await ctx.newPage();
    await p.goto(B + '/austin/roofing/', { waitUntil: 'load' });
    return p.evaluate ? await p.evaluate(() => {
      const f = document.querySelector('footer');
      return [...f.querySelectorAll('a')].map((a) => `${a.getAttribute('href')}|${(a.innerText || a.getAttribute('aria-label') || '').trim()}`).join('\n');
    }) : '';
  };
  const withJs = await read(on);
  const withoutJs = await read(off);
  A('identical footer links and labels with JS off', withJs === withoutJs,
    withJs === withoutJs ? `${withJs.split('\n').length} links, identical` : 'DIFFERENT');
  await on.close(); await off.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
