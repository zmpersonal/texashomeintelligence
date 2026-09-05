/*
 * Round 27 — Roof Scan, verified in a browser.
 *
 * A green build proves this page compiles. It does not prove that no hail SIZE
 * crept onto a page whose source column has no published unit, that the radar
 * and confirmed products stayed distinguishable to a reader rather than only in
 * the data, that no count got labelled as a county figure, or that one metro's
 * measurement did not end up under the other's heading — which is exactly the
 * defect the first build of this page shipped and this file caught.
 *
 * THE FIGURES ARE RE-DERIVED HERE from src/data/generated rather than pinned,
 * so an assertion cannot pass by agreeing with a number someone typed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = 'http://127.0.0.1:9400';
const URL_PATH = '/tools/roof-scan/';
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

const gen = (ds, loc) => JSON.parse(readFileSync(
  join(SITE, 'src', 'data', 'generated', ds, `${loc}.json`), 'utf8'));

/** Confirmed hail per county, recomputed from the committed storm-events file. */
function confirmed(loc) {
  const rows = gen('noaa-storm-events', loc).observations.filter((o) => !o.seed);
  const by = new Map();
  for (const r of rows) {
    const c = r.value.county; if (!c) continue;
    const e = by.get(c) ?? { hail: 0, other: 0 };
    if (r.value.eventType === 'Hail') e.hail++; else e.other++;
    by.set(c, e);
  }
  return { by, total: [...by.values()].reduce((t, v) => t + v.hail, 0) };
}
/**
 * Re-roof permits, recomputed from the committed trade-activity file over the
 * window the PAGE SAYS it used. The window is read off the page rather than
 * pinned here, so the assertion follows the data forward and still fails if the
 * page ever sums a different span than the one it names — including the
 * incomplete current month, which is the Round 15 defect this guards.
 */
function permitTotalOver(loc, firstMonth, lastMonth) {
  return gen('permit-trade-activity', loc).observations
    .filter((o) => !o.seed && o.value.category === 'roofing')
    .filter((o) => o.value.month >= firstMonth && o.value.month <= lastMonth)
    .reduce((t, o) => t + o.value.permitCount, 0);
}
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
/** "September 2025" -> "2025-09", so the window can be read off the page. */
function monthKey(human) {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(human.trim());
  if (!m) return undefined;
  const i = MONTHS.indexOf(m[1].toLowerCase());
  return i < 0 ? undefined : `${m[2]}-${String(i + 1).padStart(2, '0')}`;
}
const RADAR_COMMITTED = existsSync(join(SITE, 'src', 'data', 'generated', 'swdi-nx3hail'));

const b = await launchChromium();

// ══ 1. STRUCTURE AND THE PUBLISHED FIGURES ════════════════════════════════
console.log('\n══ ROOF SCAN — structure and figures ══');
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText.trim(),
    sections: [...document.querySelectorAll('section[id]')].map((s) => s.id),
    main: document.querySelector('main').innerText,
    cards: [...document.querySelectorAll('[data-reading]')].map((e) => ({
      reading: e.dataset.reading, metro: e.dataset.metro,
      value: e.querySelector('.metric-value')?.innerText.trim(),
      text: e.innerText,
    })),
    countyRows: [...document.querySelectorAll('tr[data-county]')].map((tr) => ({
      metro: tr.closest('[data-metro]')?.dataset.metro,
      county: tr.dataset.county,
      cells: [...tr.querySelectorAll('th,td')].map((x) => x.innerText.trim()),
    })),
    badges: [...document.querySelectorAll('.live-badge,.sample-badge,.stale-badge,.unavailable-badge')]
      .map((x) => x.innerText.trim()),
    dataMeta: [...document.querySelectorAll('.data-meta')].map((x) => x.innerText.replace(/\s+/g, ' ')),
    sourceLinks: [...document.querySelectorAll('#sources a')].map((a) => a.href),
    nojsHidden: (() => {
      const e = document.querySelector('.rs-nojs');
      return !!e && getComputedStyle(e).display === 'none';
    })(),
    jsFlag: document.documentElement.getAttribute('data-rs-js'),
  }));

  A('the page renders', !!r.h1, r.h1);
  for (const id of ['your-area', 'radar-signatures', 'confirmed-reports', 'the-difference',
    'permits', 'licensing', 'limits', 'sources'])
    A(`#${id} is present`, r.sections.includes(id));

  for (const loc of ['austin', 'san-antonio']) {
    const exp = confirmed(loc);
    const card = r.cards.find((x) => x.reading === 'confirmed' && x.metro === loc);
    A(`${loc}: the confirmed-hail total is the one in the dataset`,
      card?.value === String(exp.total), `page ${card?.value} vs dataset ${exp.total}`);
    for (const [county, v] of exp.by) {
      const row = r.countyRows.find((x) => x.metro === loc && x.county === county);
      A(`${loc}: ${county} County row matches the dataset`,
        row && row.cells[1] === String(v.hail) && row.cells[2] === String(v.other),
        row ? row.cells.join(' | ') : 'ROW MISSING');
    }
  }

  // The reading this tool exists to show, and the one a reader is likeliest to
  // misread as missing data.
  const bexar = r.countyRows.find((x) => x.county === 'Bexar');
  A('Bexar County is listed with zero confirmed hail AND a non-zero other-event count',
    bexar && bexar.cells[1] === '0' && Number(bexar.cells[2]) > 0,
    bexar ? bexar.cells.join(' | ') : 'BEXAR ROW MISSING');
  A('and the page says in so many words that a zero there is a reading, not a gap',
    /That is a reading, not a gap/.test(r.main));

  for (const loc of ['austin', 'san-antonio']) {
    const card = r.cards.find((x) => x.reading === 'permits' && x.metro === loc);
    const win = /Across \d+ complete months, ([A-Za-z]+ \d{4}) to ([A-Za-z]+ \d{4})/.exec(card?.text ?? '');
    const from = win && monthKey(win[1]), to = win && monthKey(win[2]);
    const expected = from && to ? permitTotalOver(loc, from, to) : undefined;
    A(`${loc}: the permit total is the sum of the months the page names`,
      !!expected && card.value === expected.toLocaleString(),
      `page ${card?.value} over ${from}..${to} vs dataset ${expected?.toLocaleString()}`);
  }

  A('four-bucket badges render', r.badges.length >= 4, r.badges.join(', '));
  A('dual dates render', r.dataMeta.some((m) => /Data through/.test(m) && /Updated/.test(m)));
  A('with scripts running, the no-JS explanation is hidden', r.nojsHidden && r.jsFlag === '1');
  A('sources link to primary sources',
    r.sourceLinks.some((u) => u.includes('ncdc.noaa.gov'))
    && r.sourceLinks.some((u) => u.includes('tdlr.texas.gov')));

  // ══ 2. THE RADAR / CONFIRMED DISTINCTION, VISIBLE TO A READER ═══════════
  console.log('\n══ RADAR IS NOT CONFIRMED, AND A READER CAN SEE IT ══');
  A('the two products have separate headings',
    /Radar hail signatures/.test(r.main) && /Confirmed hail reports/.test(r.main));
  A('the difference has a section of its own, not a footnote',
    r.sections.includes('the-difference')
    && /Why the two hail numbers do not match/.test(r.main));
  A('the radar product is named as radar-derived where its number would sit',
    r.cards.filter((x) => x.reading === 'radar')
      .every((x) => /radar-derived hail signatures, not confirmed hail reports/.test(x.text)));
  A('the confirmed product is named as human-confirmed',
    /a person reported and the National Weather Service accepted/.test(r.main));
  A('a radar signature is never called hail that fell',
    !/hail (that )?fell (on|at) your|hail hit your/i.test(r.main));

  // ══ 3. NO COUNT IS LABELLED AS A COUNTY FIGURE THAT IS NOT ONE ══════════
  console.log('\n══ THE BOX IS NOT A COUNTY ══');
  for (const card of r.cards.filter((x) => x.reading === 'radar')) {
    A(`${card.metro}: the radar card states its area as a box`, /a box 0\.5°/.test(card.text));
    A(`${card.metro}: and says explicitly it is not a county`,
      /not a county and not a city limit/.test(card.text));
    A(`${card.metro}: the radar card names no county`,
      !/\b(Travis|Bexar|Williamson|Comal|Hays|Bastrop|Burnet|Blanco|Caldwell|Atascosa|Bandera|Guadalupe|Kendall|Medina|Wilson)\b/
        .test(card.text), card.text.slice(0, 60));
  }
  // Case-insensitive on purpose: .data-table row headers are capitalised by
  // CSS, so innerText returns BEXAR while the data-county attribute holds
  // Bexar. Round 20's lesson, and the third replay in a row to walk into it.
  A('the county-filed product is the only one shown per county',
    r.countyRows.every((x) => {
      const card = r.cards.find((cd) => cd.metro === x.metro && cd.reading === 'confirmed');
      return !!card && card.text.toLowerCase().includes(x.county.toLowerCase());
    }));
  A('and the page states that nothing converts one shape into the other',
    /Nothing on this site converts one shape into the other/.test(r.main));

  // ══ 4. THE HONESTY GUARDS ══════════════════════════════════════════════
  console.log('\n══ HONESTY GUARDS ══');
  // A hail SIZE, in any unit, or a hedge that implies one.
  const SIZE = /\b\d+(\.\d+)?\s*(inch(es)?|in\.|mm|millimet|cm|centimet)\b|\b\d+(\.\d+)?\s*["″]|\bup to \d|\blargest\b.*\b\d|\bgolf ?ball\b|\bquarter[- ]siz/i;
  A('no hail size, in any unit, anywhere', !SIZE.test(r.main), r.main.match(SIZE)?.[0] ?? 'clean');
  A('and the page says why it publishes none',
    /size column has no published unit/.test(r.main));

  const MONEY = /\$[\d,]+|\b\d[\d,]*\s*dollars\b|\bcost(s)? (about|around|roughly)\b|\bprice range\b/i;
  A('no cost figure anywhere', !MONEY.test(r.main), r.main.match(MONEY)?.[0] ?? 'clean');

  // Round 24's lesson, hit again on the first run: the first version of this
  // pattern matched "needs replacing" inside the sentence that REFUSES to say
  // it — "It cannot tell you whether yours is damaged, whether it needs
  // replacing, or when". Narrow the pattern, never the copy. So this is an
  // AFFIRMATIVE claim only, and the refusal is asserted positively below it.
  // ...and again, on the second run, from the LIMITS heading "Whether your
  // roof is damaged." Both hits were the page declining to make the claim.
  // The lookbehind is what separates a refusal from an assertion.
  const DAMAGE = /(?<!whether )(?<!Whether )\byour roof (is|was|has been|may be|is likely) damaged\b|\byour roof (needs|is due for)\b|\byou (need|should) (a )?(new roof|to replace)\b|\breplacement window (is|of)\b|\btime to replace\b|\byears? (of life )?(left|remaining)\b|\bfile a claim\b|\blikely (damage|damaged)\b/i;
  A('no affirmative damage claim and no replacement timing', !DAMAGE.test(r.main),
    r.main.match(DAMAGE)?.[0] ?? 'clean');
  A('and the page says in so many words that it will not make one',
    /cannot tell you whether yours is damaged, whether it needs replacing, or when/.test(r.main));
  A('the limits section leads with the damage question it refuses',
    /Whether your roof is damaged/.test(r.main));
  A('the refusal is stated on the page',
    /has not seen your roof/i.test(r.main) && /We are not going to guess/.test(r.main));

  A('no roof area or square footage', !/\bsq(uare)?[ .]?f(ee)?t\b|\bsquares\b|\bpitch\b/i.test(r.main));
  A('no address or parcel claim',
    !/\benter your address\b|\bsitus\b|\bparcel footprint\b/i.test(r.main));

  // Round 25's guard, generalised: a percentage on a tool page must name its
  // source in the same block.
  const pctBlocks = await p.evaluate(() => [...document.querySelectorAll('main p, main li')]
    .filter((e) => /\d[\d,.]*\s?%/.test(e.innerText))
    .map((e) => e.innerText));
  A('every percentage names the archive it was measured on',
    pctBlocks.length > 0 && pctBlocks.every((t) => /roof-matched permits in the archive/.test(t)),
    `${pctBlocks.length} block(s) carry a percentage`);

  // The defect the first build of this page shipped.
  console.log('\n══ ONE METRO\'S MEASUREMENT NEVER UNDER THE OTHER\'S HEADING ══');
  const sa = r.cards.find((x) => x.reading === 'permits' && x.metro === 'san-antonio');
  const atx = r.cards.find((x) => x.reading === 'permits' && x.metro === 'austin');
  A('San Antonio\'s permit card carries no Austin text-match measurement',
    !!sa && !/roof-matched permits in the archive/.test(sa.text) && !/%/.test(sa.text),
    sa?.text.slice(0, 90).replace(/\n/g, ' '));
  A('Austin\'s permit card does carry it, because Austin is the text-matched one',
    !!atx && /roof-matched permits in the archive/.test(atx.text));
  A('San Antonio\'s card names its dedicated permit class',
    !!sa && /Re-Roof Permit/.test(sa.text));
  A('both permit cards say the two metros are not comparable',
    [sa, atx].every((x) => /not comparable with the other metro's number/.test(x?.text ?? '')));
  A('the two counts are never in one table',
    await p.evaluate(() => [...document.querySelectorAll('#permits table')].length === 0));

  await c.close();
}

// ══ 5. THE LABEL FOLLOWS THE INPUT ════════════════════════════════════════
console.log('\n══ HOMEOWNER-REPORTED LABEL FOLLOWS THE INPUT ══');
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
  const read = () => p.evaluate(() => {
    const el = document.getElementById('rs-zip-bucket');
    const rd = document.getElementById('rs-zip-read');
    const cs = getComputedStyle(el);
    return {
      text: el.innerText.trim(), state: el.getAttribute('data-state'),
      border: cs.borderStyle, bg: cs.backgroundColor, colour: cs.color,
      live: el.getAttribute('aria-live'), hidden: el.getAttribute('aria-hidden'),
      readText: rd.innerText.trim(), readEmpty: rd.getAttribute('data-empty'),
      emphasised: [...document.querySelectorAll('[data-emphasis]')]
        .map((e) => e.dataset.county ?? e.dataset.metro),
    };
  });
  // .rs-bucket is capitalised by CSS, so innerText comes back shouted.
  const is = (a, b2) => a.toLowerCase() === b2.toLowerCase();

  const before = await read();
  A('before entry the label says nothing was entered', is(before.text, 'Nothing entered'), before.text);
  A('before entry nothing is emphasised', before.emphasised.length === 0);

  await p.fill('#rs-zip', '78201');
  const sa = await read();
  A('the label changes the moment a value is entered',
    is(sa.text, "Your ZIP — area readings, not your address") && sa.state === 'reported', sa.text);
  A('and it changes VISIBLY, not just in text',
    sa.border !== before.border || sa.bg !== before.bg || sa.colour !== before.colour,
    `border ${before.border}->${sa.border}, bg ${before.bg}->${sa.bg}`);
  A('it is announced to screen readers', sa.live === 'polite' && sa.hidden === null);
  A('78201 resolves to Bexar County, San Antonio',
    /78201 is in Bexar County, San Antonio metro/.test(sa.readText), sa.readText.slice(0, 80));
  A('and the reading is still framed as the county, not the address',
    /not this address/.test(sa.readText));
  A('the Bexar row and the San Antonio cards are emphasised',
    sa.emphasised.includes('Bexar') && sa.emphasised.includes('san-antonio')
    && !sa.emphasised.includes('austin'), sa.emphasised.join(', '));

  await p.fill('#rs-zip', '78704');
  const atx = await read();
  A('78704 resolves to Travis County, Austin',
    /78704 is in Travis County, Austin metro/.test(atx.readText), atx.readText.slice(0, 60));
  A('and the emphasis moves with it',
    atx.emphasised.includes('Travis') && atx.emphasised.includes('austin')
    && !atx.emphasised.includes('san-antonio'), atx.emphasised.join(', '));

  await p.fill('#rs-zip', '99999');
  const miss = await read();
  A('an uncovered ZIP says so rather than guessing',
    /We do not cover 99999 yet/.test(miss.readText) && miss.emphasised.length === 0);

  await p.fill('#rs-zip', '');
  const cleared = await read();
  A('clearing the field returns the label to empty',
    is(cleared.text, 'Nothing entered') && cleared.readEmpty === 'true'
    && cleared.emphasised.length === 0);

  await c.close();
}

// ══ 6. PHONE WIDTHS ═══════════════════════════════════════════════════════
// Round 26's measurement. A county table is exactly the element that takes a
// document horizontal, so it is measured rather than assumed.
console.log('\n══ PHONE WIDTHS ══');
for (const width of [320, 360, 390]) {
  const c = await b.newContext({ viewport: { width, height: 800 } });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    return {
      sw: de.scrollWidth, cw: de.clientWidth,
      over: [...document.querySelectorAll('body *')].filter((e) => {
        const b2 = e.getBoundingClientRect();
        return (b2.width || b2.height) && (b2.right > de.clientWidth + 0.5 || b2.left < -0.5);
      }).map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().split(/\s+/).join('.')}`),
      input: (() => { const b2 = document.getElementById('rs-zip').getBoundingClientRect();
        return { w: Math.round(b2.width), h: Math.round(b2.height) }; })(),
      tableScrolls: (() => { const t = document.querySelector('.rs-table-wrap');
        return t ? getComputedStyle(t).overflowX : 'none'; })(),
      links: [...document.querySelectorAll('main a')].map((a) => ({
        t: a.innerText.trim().slice(0, 40),
        zone: a.closest('nav,.breadcrumbs,[aria-label="Breadcrumb"]') ? 'breadcrumb'
          : a.closest('#sources,.data-meta,.key-findings,p') ? 'in-sentence' : 'body',
        h: Math.round(a.getBoundingClientRect().height),
      })),
    };
  });
  A(`no horizontal scroll at ${width}px`, r.sw === r.cw && r.over.length === 0,
    `scrollWidth ${r.sw}${r.over.length ? ' — ' + r.over.slice(0, 4).join(', ') : ''}`);
  if (width === 320) {
    A('the ZIP input is at least 48px tall', r.input.h >= 48, `${r.input.w}x${r.input.h}`);
    A('the county table scrolls inside its own box', r.tableScrolls === 'auto', r.tableScrolls);
    console.log('  tap targets at 320px:');
    for (const l of r.links) console.log(`    ${String(l.h).padStart(3)}px  ${l.zone.padEnd(12)} ${l.t}`);
    const own = r.links.filter((l) => l.zone === 'body' && l.h < 24);
    A('no standalone (non-inline, non-chrome) link is under 24px tall', own.length === 0,
      own.map((l) => `${l.t} ${l.h}px`).join(', ') || `${r.links.length} links measured`);
  }
  await c.close();
}

// ══ 7. NO JAVASCRIPT ══════════════════════════════════════════════════════
console.log('\n══ SCRIPTING DISABLED ══');
{
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 }, javaScriptEnabled: false });
  const p = await c.newPage();
  await p.goto(B + URL_PATH, { waitUntil: 'domcontentloaded' });
  const html = await p.content();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#\d+;|&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
  for (const loc of ['austin', 'san-antonio']) {
    const exp = confirmed(loc);
    A(`${loc}: the confirmed-hail total is in the served HTML`,
      text.includes(` ${exp.total} `), String(exp.total));
    for (const [county, v] of exp.by)
      A(`${loc}: ${county} is in the served HTML with its counts`,
        new RegExp(`${county}\\s+${v.hail}\\s+${v.other}`).test(text), `${v.hail}/${v.other}`);
  }
  A('both permit readings are in the served HTML',
    /Re-roof permits on record, Austin/.test(text) && /Re-roof permits on record, San Antonio/.test(text));
  A('the licensing position is in the served HTML', /It does not license roofing/.test(text));
  A('the radar feed states its unavailable status rather than a zero',
    /Not published yet/.test(text) && !/Radar hail signatures over the Austin box\s*0\b/.test(text));
  A('the limits section is in the served HTML', /What this tool cannot see/.test(text));
  A('the page explains what needs scripts', /needs JavaScript/.test(text));
  A('and the label reads as nothing entered', /Nothing entered/.test(text));
  await c.close();
}

// ══ 8. THE FEED THIS ROUND COULD NOT PUBLISH ══════════════════════════════
// Not a failure — a fact about the repo, asserted so that the day a run lands
// the data, this replay is what tells us the page changed shape.
console.log('\n══ SWDI nx3hail ══');
A(RADAR_COMMITTED
  ? 'a swdi-nx3hail dataset is committed — the radar cards should now carry counts'
  : 'no swdi-nx3hail dataset is committed, and the page says so instead of showing a zero',
  true, RADAR_COMMITTED ? 'committed' : 'src/data/generated/swdi-nx3hail/ does not exist');

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
