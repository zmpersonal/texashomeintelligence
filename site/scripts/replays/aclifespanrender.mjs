/*
 * Round 25 — AC Lifespan, verified in a browser.
 *
 * A green build proves this page compiles. It does not prove that the
 * homeowner-reported label actually changes when someone types, that the
 * warranty verdict never becomes a replacement recommendation, that no cost
 * figure crept in beyond the published rate, or that the page still says
 * something true with scripts off. This does.
 *
 * THE FIGURES ARE RE-DERIVED HERE from src/data/generated rather than pinned,
 * so an assertion cannot pass by agreeing with a number someone typed into a
 * brief.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = 'http://127.0.0.1:9400';
const URL_PATH = '/tools/ac-lifespan/';
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

/** The annual normal, recomputed from the committed dataset. */
function annualNormal(loc) {
  const j = JSON.parse(readFileSync(
    join(SITE, 'src', 'data', 'generated', 'noaa-climate', `${loc}.json`), 'utf8'));
  const n = j.observations.filter(o => !o.seed && o.value.kind === 'normal-1991-2020');
  return n.reduce((t, o) => t + o.value.coolingDegreeDaysF, 0)
    .toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function eiaRate() {
  const j = JSON.parse(readFileSync(
    join(SITE, 'src', 'data', 'generated', 'eia-electricity', 'texas.json'), 'utf8'));
  return j.observations.filter(o => !o.seed)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0].value.pricePerKwhCents.toFixed(2);
}

const b = await launchChromium();

// ══ 1. STRUCTURE AND THE PUBLISHED FIGURES ════════════════════════════════
console.log('\n══ AC LIFESPAN — structure and figures ══');
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText.trim(),
    sections: [...document.querySelectorAll('section[id]')].map(s => s.id),
    main: document.querySelector('main').innerText,
    badges: [...document.querySelectorAll('.live-badge,.sample-badge,.stale-badge,.unavailable-badge')]
      .map(x => x.innerText.trim()),
    dataMeta: [...document.querySelectorAll('.data-meta')].map(x => x.innerText.replace(/\s+/g, ' ')),
    sourceLinks: [...document.querySelectorAll('#sources a')].map(a => a.href),
    // The counterpart of section 5: with scripts running the no-JS explanation
    // must be gone, or the page tells the reader it cannot do something it just did.
    nojsHidden: (() => {
      const e = document.querySelector('.acl-nojs');
      return !!e && getComputedStyle(e).display === 'none';
    })(),
    jsFlag: document.documentElement.getAttribute('data-acl-js'),
  }));

  A('the page renders', !!r.h1, r.h1);
  for (const id of ['your-system', 'cooling-load', 'running-cost', 'tax-credit', 'limits', 'sources'])
    A(`#${id} is present`, r.sections.includes(id));
  A('both metros\' cooling load appears',
    r.main.includes(annualNormal('austin')) && r.main.includes(annualNormal('san-antonio')),
    `${annualNormal('austin')} / ${annualNormal('san-antonio')}`);
  A('the base temperature is stated', /base 65°F/i.test(r.main));
  A('each station is named with its distance',
    /CAMP MABRY.*3\.8 miles/is.test(r.main) && /STINSON.*6 miles/is.test(r.main));
  A('years of record are stated', /29-30 years of record/.test(r.main) && /19-20 years/.test(r.main));
  A('the EIA rate is the published one', r.main.includes(eiaRate()), `${eiaRate()}¢`);
  A('four-bucket badges render', r.badges.length >= 3, r.badges.join(', '));
  A('dual dates render', r.dataMeta.some(m => /Data through/.test(m) && /Updated/.test(m)),
    r.dataMeta[0]?.slice(0, 80));
  A('the 25C credit is named as expired', /25C credit for HVAC equipment expired/.test(r.main));
  A('with scripts running, the no-JS explanation is hidden', r.nojsHidden && r.jsFlag === '1');
  A('sources link to primary sources',
    r.sourceLinks.some(u => u.includes('ncei.noaa.gov'))
    && r.sourceLinks.some(u => u.includes('eia.gov'))
    && r.sourceLinks.some(u => u.includes('irs.gov')));

  // ══ 2. THE HONESTY GUARDS ═══════════════════════════════════════════════
  console.log('\n══ HONESTY GUARDS ══');
  const REPLACE = /\b(time to replace|should replace|due for replacement|replacement window|replace (it|your (system|unit)) (now|soon|this)|end of (its )?life|expected lifespan|life expectancy|years? (of life )?(left|remaining)|repair[- ]versus[- ]replace|repair or replace)\b/i;
  A('no replacement-timing or lifespan recommendation anywhere',
    !REPLACE.test(r.main), r.main.match(REPLACE)?.[0] ?? 'clean');
  A('the refusal is stated on the page',
    /will not tell you when to replace your system/i.test(r.main));
  A('and again in the limits section', /We are not going to guess/i.test(r.main));

  // Currency and ranges. The EIA rate is a published cent figure and the only
  // permitted money on the page.
  const money = r.main.match(/\$[\d,]+|\b\d[\d,]*\s*(?:to|–|-)\s*\$?[\d,]+\s*(?:dollars|USD)\b/gi) ?? [];
  A('no cost figure beyond the published rate', money.length === 0, money.join(' | ') || 'none');
  // Round 24's lesson, hit again on the first run: the first version of this
  // pattern matched the word "payback" inside the sentence that REFUSES to give
  // one — "turning it into a monthly bill, a running cost or a payback period
  // needs this home's actual consumption, which we do not have and will not
  // assume." Narrow the pattern, never the copy. So the assertion is now for an
  // AFFIRMATIVE estimate, and the refusal is asserted positively below it.
  const ESTIMATE = /\b(your payback|payback (period )?(is|of|would be|works out)|you would save|you'll save|estimated (bill|savings|payback)|per (month|summer) to run|costs? about \$|expect to (pay|save))\b/i;
  A('no affirmative payback, saving or bill estimate',
    !ESTIMATE.test(r.main), r.main.match(ESTIMATE)?.[0] ?? 'clean');
  A('and the page says in so many words why it will not give one',
    /a payback period needs this home's actual consumption/i.test(r.main));

  // A statistic caught in review before this round shipped: the limits copy
  // carried "99.79% of them" about a TCAD field, and no round ever measured it —
  // Round 16 says in so many words that the export could not be opened and no
  // figure is offered. Every figure this page is allowed to print is a degree-day
  // total, a cent-per-kWh rate or a count of years, so a percentage anywhere on it
  // is by construction a number with no source behind it.
  const PCT = r.main.match(/\d[\d,.]*\s?%/g) ?? [];
  A('no percentage figure on the page (none of them could be sourced)',
    PCT.length === 0, PCT.join(', ') || 'none');

  A('no runtime multiplier is published',
    !/times the national|× the national|national average/i.test(r.main),
    'omitted — see the audit');
  A('no tonnage or sizing claim', !/\b\d+(\.\d+)?\s*tons?\b/i.test(r.main));
  A('no address or parcel claim',
    !/\b(sq ft|square feet|year built|parcel|situs)\b/i.test(r.main)
    || /is the building's rather than the equipment's/.test(r.main));
  A('warranty terms are framed as a convention, not a fact about the unit',
    /not a fact about your unit/i.test(r.main) && /vary by manufacturer/i.test(r.main));

  await c.close();
}

// ══ 3. THE LABEL FOLLOWS THE INPUT ════════════════════════════════════════
// data-labeling-spec.md requirement 4: the label must change visibly at the
// moment of edit. This is the interaction that spec calls the most important
// one in the whole labelling system.
console.log('\n══ HOMEOWNER-REPORTED LABEL FOLLOWS THE INPUT ══');
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
  const read = () => p.evaluate(() => {
    const el = document.getElementById('acl-age-bucket');
    const v = document.getElementById('acl-verdict');
    const cs = getComputedStyle(el);
    return {
      text: el.innerText.trim(), state: el.getAttribute('data-state'),
      border: cs.borderStyle, bg: cs.backgroundColor, colour: cs.color,
      live: el.getAttribute('aria-live'), hidden: el.getAttribute('aria-hidden'),
      verdict: v.innerText.trim(), verdictEmpty: v.getAttribute('data-empty'),
    };
  });

  // Round 20's lesson, and this replay walked into it too: .acl-bucket inherits
  // a capitalising text-transform from .metric-label, so innerText comes back
  // shouted. The page is right and a case-sensitive assertion is wrong, so
  // compare the rendered casing, not the source casing.
  //
  // (The word for that transform is deliberately not written here. Tailwind 4
  // auto-detects its sources from the project root, scripts/ included, so the
  // bare token in a comment in THIS FILE emits that utility into the SITEWIDE
  // stylesheet and rehashes all 267 pages. Verified twice this round.)
  const is = (a, b) => a.toLowerCase() === b.toLowerCase();

  const before = await read();
  A('before entry the label says nothing was entered', is(before.text, 'Nothing entered'), before.text);
  A('before entry the verdict is the convention, not a statement about anyone',
    before.verdictEmpty === 'true');

  await p.fill('#acl-age', '7');
  const after = await read();
  A('the label changes the moment a value is entered',
    is(after.text, 'Homeowner-reported') && after.state === 'reported', after.text);
  A('and it changes VISIBLY, not just in text',
    after.border !== before.border || after.bg !== before.bg || after.colour !== before.colour,
    `border ${before.border}->${after.border}, bg ${before.bg}->${after.bg}`);
  A('it is announced to screen readers', after.live === 'polite' && after.hidden === null);
  A('7 years reads as inside the 10-year term and outside the 5-year one',
    /inside the 10-year registered term and outside the 5-year/i.test(after.verdict), after.verdict);

  await p.fill('#acl-age', '3');
  const young = await read();
  A('3 years reads as inside both terms', /inside both terms/i.test(young.verdict), young.verdict);
  await p.fill('#acl-age', '14');
  const old = await read();
  A('14 years reads as outside both terms', /outside both terms/i.test(old.verdict), old.verdict);
  A('and still does not recommend anything',
    !/replace|new system|upgrade/i.test(old.verdict), old.verdict);

  await p.fill('#acl-age', '');
  const cleared = await read();
  A('clearing the field returns the label to empty',
    is(cleared.text, 'Nothing entered') && cleared.verdictEmpty === 'true',
    `${cleared.text} / data-empty=${cleared.verdictEmpty}`);

  await c.close();
}

// ══ 4. NARROW MOBILE — TAP TARGETS ════════════════════════════════════════
console.log('\n══ NARROW MOBILE (320px) ══');
{
  const c = await b.newContext({ viewport: { width: 320, height: 720 } });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const box = (el) => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      input: box(document.getElementById('acl-age')),
      allLinks: [...document.querySelectorAll('main a')].map(a => ({
        t: a.innerText.trim().slice(0, 44),
        zone: a.closest('nav,.breadcrumbs,[aria-label="Breadcrumb"]') ? 'breadcrumb'
          : a.closest('#sources,#tax-credit,.data-meta,.key-findings,p') ? 'in-sentence' : 'body',
        ...box(a),
      })),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  A('the age input is at least 48px tall', r.input.h >= 48, `${r.input.w}x${r.input.h}`);
  A('the page does not scroll horizontally at 320px', !r.overflow, `scrollWidth ${r.scrollWidth}`);

  // TAP TARGETS — measured and printed, then asserted only where WCAG 2.2's
  // 2.5.8 actually applies. Every link in #sources and #tax-credit is a link
  // inside a sentence, which is the standard's explicit inline exception; the
  // breadcrumb links are sitewide chrome this tool did not introduce. So the
  // numbers are REPORTED for all of them and the assertion covers the rest.
  console.log('  tap targets at 320px:');
  for (const l of r.allLinks) console.log(`    ${String(l.h).padStart(3)}px  ${l.zone.padEnd(12)} ${l.t}`);
  const own = r.allLinks.filter(l => l.zone === 'body' && l.h < 24);
  A('no standalone (non-inline, non-chrome) link is under 24px tall', own.length === 0,
    own.map(l => `${l.t} ${l.h}px`).join(', ') || `${r.allLinks.length} links measured`);
  await c.close();
}

// ══ 5. NO JAVASCRIPT ══════════════════════════════════════════════════════
// Every published figure must still be present, and the page must say what it
// cannot do rather than showing a dead control.
console.log('\n══ SCRIPTING DISABLED ══');
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 }, javaScriptEnabled: false });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'domcontentloaded' });
  // No p.evaluate here: it needs the scripting this context switched off. The
  // served HTML is the whole subject of this section anyway.
  const html = await p.content();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#\d+;|&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
  A('both cooling-load figures are in the served HTML',
    text.includes(annualNormal('austin')) && text.includes(annualNormal('san-antonio')));
  A('the electricity rate is in the served HTML', text.includes(eiaRate()));
  A('the warranty terms are in the served HTML', /10-year parts warranty/.test(text));
  A('the 25C position is in the served HTML', /expired on December 31, 2025/.test(text));
  A('the limits section is in the served HTML', /What this tool cannot see/.test(text));
  A('the page explains what needs scripts', /This part needs JavaScript/.test(text));
  A('and the label reads as nothing entered', /Nothing entered/.test(text));
  await c.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
