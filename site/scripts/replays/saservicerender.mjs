/**
 * Round 10 — the San Antonio service pages, verified in a browser.
 *
 * A green build proves these pages compile. It does not prove the block order
 * survived, that the QuoteReady funnel is actually gone from the body, that a
 * label reaches a screen reader, or that a figure on the page matches the
 * generated data it claims to come from. This does.
 *
 * The figures are re-derived HERE from src/data/generated/permit-trade-activity
 * rather than pinned as literals, so the assertions cannot drift away from the
 * feed — and cannot pass by agreeing with a number someone typed into a brief.
 */
import { launchChromium } from './browser.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = 'http://127.0.0.1:9400';
const ORDER = ['answer', 'data', 'method', 'context', 'faq', 'sources'];

let pass = 0, fail = 0;
const A = (label, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : '**FAIL**'}  ${label}${note ? '  — ' + note : ''}`);
};

/** The same arithmetic the page does, straight from the archive. */
function expected(category) {
  const j = JSON.parse(readFileSync(
    join(SITE, 'src', 'data', 'generated', 'permit-trade-activity', 'san-antonio.json'), 'utf8'));
  const rows = j.observations.filter(o => !o.seed && o.value.category === category)
    .map(o => o.value).sort((a, b) => a.month.localeCompare(b.month));
  const total = rows.reduce((s, r) => s + r.permitCount, 0);
  const n = rows.length, half = Math.floor(n / 2);
  const h1 = rows.slice(0, half).reduce((s, r) => s + r.permitCount, 0);
  const h2 = rows.slice(n - half).reduce((s, r) => s + r.permitCount, 0);
  const mean = Math.round(total / n);
  const types = new Set(rows.flatMap(r => r.sourceValues.map(s => s.value)));
  return {
    total, months: n, mean,
    changePct: ((h2 - h1) / h1) * 100,
    noisePct: (100 * Math.sqrt(total / n)) / (total / n),
    issuedTypes: types.size,
    monthly: rows.map(r => r.permitCount),
  };
}

const b = await launchChromium();
const PAGES = [
  // Round 10b: the HVAC page carries the restored EIA rate alongside AirNow.
  { path: '/san-antonio/hvac/', category: 'hvac', noun: 'HVAC', readings: 4, faqs: 5 },
  { path: '/san-antonio/plumbing/', category: 'plumbing', noun: 'plumbing', readings: 3, faqs: 5 },
  // Round 12. Roofing is the page whose trend does NOT clear the threshold, so
  // it is the one that proves the page declines to make the claim.
  { path: '/san-antonio/roofing/', category: 'roofing', noun: 're-roof', readings: 4, faqs: 7 },
];

/** The rate as the archive holds it — never pinned as a literal here. */
function eiaRate() {
  const j = JSON.parse(readFileSync(
    join(SITE, 'src', 'data', 'generated', 'eia-electricity', 'texas.json'), 'utf8'));
  const newest = j.observations.filter(o => !o.seed)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  return { cents: newest.value.pricePerKwhCents, observedAt: newest.observedAt };
}

for (const page of PAGES) {
  console.log(`\n══ ${page.path} ══`);
  const e = expected(page.category);
  const c = await b.newContext({ viewport: { width: 1440, height: 1600 } });
  const p = await c.newPage();
  const res = await p.goto(B + page.path, { waitUntil: 'networkidle' });
  A('renders 200', res.status() === 200, String(res.status()));

  const r = await p.evaluate((ORDER) => {
    const txt = (el) => (el?.innerText ?? '').replace(/\s+/g, ' ').trim();
    const ids = [...document.querySelectorAll('section[id]')].map(s => s.id).filter(i => ORDER.includes(i));
    const dataSec = document.querySelector('#data');
    const sources = document.querySelector('#sources');
    const badges = [...document.querySelectorAll('.live-badge,.aged-badge,.stale-badge,.error-badge,.sample-badge')]
      .map(el => ({
        label: txt(el),
        ariaHidden: el.closest('[aria-hidden="true"]') !== null || el.getAttribute('aria-hidden') === 'true',
        meta: txt(el.parentElement?.querySelector('.data-meta')),
      }));
    const times = [...document.querySelectorAll('time[datetime]')].map(t => t.getAttribute('datetime'));
    return {
      ids,
      h1: txt(document.querySelector('h1')),
      h1Count: document.querySelectorAll('h1').length,
      answerText: txt(document.querySelector('#answer')),
      answerLedeSize: parseFloat(getComputedStyle(document.querySelector('#answer .answer-lede')).fontSize),
      otherProseSizes: [...document.querySelectorAll('#method p, #context p, #faq p')]
        .map(el => parseFloat(getComputedStyle(el).fontSize)),
      dataRows: dataSec?.querySelectorAll('tbody tr').length ?? 0,
      dataCells: [...(dataSec?.querySelectorAll('tbody tr td.num') ?? [])]
        .filter((_, i) => i % 2 === 0).map(td => txt(td)),
      tables: document.querySelectorAll('table').length,
      sourceLinks: [...(sources?.querySelectorAll('a') ?? [])].map(a => ({ text: txt(a), href: a.getAttribute('href') })),
      sourcesInMain: !!sources && !sources.closest('footer'),
      badges, times,
      bodyText: txt(document.querySelector('main') ?? document.body),
      footerText: txt(document.querySelector('footer')),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      noindex: document.querySelector('meta[name="robots"]')?.content ?? '',
      faqDetails: document.querySelectorAll('#faq details').length,
    };
  }, ORDER);

  A('block order is answer > data > method > context > faq > sources',
    r.ids.join(',') === ORDER.join(','), r.ids.join(' > '));
  A('exactly one h1', r.h1Count === 1, r.h1);
  A('#answer is the largest text after the H1',
    r.otherProseSizes.length > 0 && r.answerLedeSize > Math.max(...r.otherProseSizes),
    `answer=${r.answerLedeSize}px vs max other ${Math.max(...r.otherProseSizes)}px`);
  A('#answer leads with the figure, not an intro',
    /^[^.]*\b\d[\d,]*\b[^.]*\./.test(r.answerText.replace(/^[^?]*\?\s*/, '')),
    r.answerText.replace(/^[^?]*\?\s*/, '').split('.')[0].slice(0, 90) + '…');

  A('mean per month matches the archive', r.answerText.includes(e.mean.toLocaleString()), String(e.mean));
  A('window total matches the archive', r.answerText.includes(e.total.toLocaleString()), e.total.toLocaleString());
  A('half-over-half change matches the archive',
    r.answerText.includes(`${Math.abs(e.changePct).toFixed(1)}%`), `${e.changePct.toFixed(1)}%`);
  // The claim must follow the arithmetic in BOTH directions: a series that
  // clears the threshold says so, and one that does not says it does not.
  const clears = Math.abs(e.changePct) > e.noisePct;
  A(clears ? 'clears the threshold, and the page reports a trend'
           : 'does NOT clear the threshold, and the page declines to claim a trend',
    clears ? /clears the ±/.test(r.answerText)
           : /does not clear the ±/.test(r.answerText) && /do not report that as a trend/.test(r.answerText),
    `${Math.abs(e.changePct).toFixed(1)}% vs ±${e.noisePct.toFixed(1)}%`);
  A('trend threshold matches Poisson noise on the monthly mean',
    r.answerText.includes(`${e.noisePct.toFixed(1)}%`), `±${e.noisePct.toFixed(1)}%`);
  A('#data table has one row per month, values matching the archive',
    r.dataRows === e.months && r.dataCells.join(',') === e.monthly.map(n => n.toLocaleString()).join(','),
    `${r.dataRows} rows`);
  A('facts render in real <table> elements', r.tables >= 3, `${r.tables} tables`);

  A('every reading carries a four-bucket label', r.badges.length === page.readings,
    `${r.badges.length} badges, expected ${page.readings}`);
  A('labels are announced, never aria-hidden', r.badges.every(x => !x.ariaHidden),
    r.badges.map(x => x.label).join(','));
  A('every label carries dual dates: data-through AND confirmed',
    r.badges.every(x => /Data through/.test(x.meta) && /(Updated|Last checked|Last known value):/.test(x.meta)),
    r.badges[0]?.meta?.slice(0, 80));
  A('dates are machine-readable <time datetime>', r.times.length >= 4, `${r.times.length} <time> elements`);
  A('every datetime parses', r.times.every(t => t && !Number.isNaN(Date.parse(t))),
    r.times.filter(t => !t || Number.isNaN(Date.parse(t))).join(',') || 'all valid');

  A('#sources is page content, not footer chrome', r.sourcesInMain);
  A('#sources links primary sources', r.sourceLinks.length >= 3, `${r.sourceLinks.length} links`);
  A('#sources names the city permit source',
    r.sourceLinks.some(l => /sanantonio\.gov/.test(l.href)),
    r.sourceLinks.map(l => l.href).join(' '));
  // Round 14b. The citation is DERIVED from the package id the fetchers request
  // (`package_show?id=building-permits`), so it cannot drift from the fetch.
  // Asserting the slug rather than any URL also catches a silent revert to the
  // UUID Round 14 could not confirm against our own code.
  A('the dataset citation is the slug the fetchers actually request',
    r.sourceLinks.some(l => l.href === 'https://data.sanantonio.gov/dataset/building-permits'),
    r.sourceLinks.filter(l => /sanantonio/.test(l.href)).map(l => l.href).join(' '));

  const BANNED = /QuoteReady|Project Brief|quote tool|Get Better [A-Za-z]+ Quotes/i;
  const bodyOnly = r.bodyText.replace(r.footerText, '');
  A('no QuoteReady copy in the page body', !BANNED.test(bodyOnly),
    (bodyOnly.match(BANNED) || ['none'])[0]);
  const COST = /\$[\d,]/;
  A('no cost, price or spend figure anywhere on the page', !COST.test(r.bodyText),
    (r.bodyText.match(COST) || ['none'])[0]);
  A('says plainly that permit data cannot support a cost figure',
    /does not support a cost figure|cannot support it/i.test(bodyOnly));
  A('page stays indexed', !/noindex/.test(r.noindex), r.noindex || '(none)');
  A('no horizontal scroll at 1440px', r.overflow <= 0, `${r.overflow}px`);
  A('#faq renders real disclosure elements', r.faqDetails === page.faqs, `${r.faqDetails} items`);

  // A collapsed <details> keeps its answer out of innerText. The text IS in the
  // served HTML — crawlers and screen readers reach it — so open them before
  // comparing rather than concluding the schema disagrees with the page.
  await p.evaluate(() => document.querySelectorAll('#faq details').forEach(d => { d.open = true; }));
  const openBody = await p.evaluate(() => document.querySelector('#faq').innerText.replace(/\s+/g, ' '));
  const ld = await p.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)));
  const article = ld.find(x => x['@type'] === 'Article');
  const faq = ld.find(x => x['@type'] === 'FAQPage');
  A('Article schema present with a dateModified', !!article?.dateModified, article?.dateModified);
  A('FAQPage schema present with every answer filled',
    !!faq && faq.mainEntity.length === page.faqs &&
    faq.mainEntity.every(q => q.acceptedAnswer?.text && !/\{[A-Z_]+\}/.test(q.acceptedAnswer.text)),
    `${faq?.mainEntity.length} questions`);
  A('the schema FAQ answers match the visible ones',
    faq.mainEntity.every(q => openBody.includes(q.acceptedAnswer.text.slice(0, 60).replace(/\s+/g, ' '))),
    `${faq.mainEntity.length} answers compared`);

  if (page.category === 'roofing') {
    // The seasonality sentence is a FAQ answer, and a collapsed <details> keeps
    // its text out of innerText. It IS in the served HTML — crawlers and screen
    // readers reach it — so open them rather than concluding it is absent.
    await p.evaluate(() => document.querySelectorAll('#faq details').forEach(d => { d.open = true; }));
    const fullBody = await p.evaluate(() =>
      (document.querySelector('main') ?? document.body).innerText.replace(/\s+/g, ' '));
    // The brief's hard rule: never put the two metros' roofing counts side by
    // side. They differ 3.27x for measurement-method reasons alone, so an
    // invited comparison would read as a finding about roofs when it is a
    // finding about permit taxonomies.
    const austinFigures = /\b1,945\b|\b1,878\b|\b366\b/;
    A('does not put Austin roofing numbers on the page',
      !austinFigures.test(bodyOnly), (bodyOnly.match(austinFigures) || ['none'])[0]);
    A('does not invite a cross-metro roofing comparison',
      !/\bthan (in )?Austin\b|compared (with|to) Austin|Austin (issues|issued)/i.test(bodyOnly),
      (bodyOnly.match(/[^.]*Austin[^.]*\./) || ['no mention of Austin'])[0].trim().slice(0, 90));
    A('reports seasonality even though the trend is flat',
      /spread between busiest and quietest/.test(fullBody) && /σ\)/.test(fullBody),
      (fullBody.match(/a [\d.]+× spread[^.]*\./) || ['not found'])[0].slice(0, 90));
    A('reconciles against our own roof-permits page rather than contradicting it',
      /roof-permits\/ page reports a larger number/.test(bodyOnly));
    A('states the storm feed publishes on a lag, with the measured age',
      /publishes on a lag/.test(bodyOnly) && /\b\d{2,3} days old\b/.test(bodyOnly),
      (bodyOnly.match(/its newest record is \d+ days old/) || [''])[0]);
    A('does not imply hail in Bexar that NOAA did not record',
      /No hail was recorded in Bexar County/.test(bodyOnly));
    // Round 14. Was pinned to the phrase "no state roofing licence in Texas",
    // which the narrowing removed. It now tests the SUBSTANCE — the contrast,
    // and the citation — plus the thing the narrowing was for: the page must
    // not reclaim more than its one source supports.
    A('states roofing is not TDLR-licensed, cited to the state',
      /does not license roofing/i.test(bodyOnly) &&
      r.sourceLinks.some(l => /tdlr\.texas\.gov/.test(l.href)));
    A('keeps the contrast: names TDLR-licensed trades against roofing\'s absence',
      /Air Conditioning and Refrigeration/i.test(bodyOnly) &&
      /Electricians/i.test(bodyOnly) &&
      /Mold Assessors and Remediators/i.test(bodyOnly) &&
      /Roofing is not/i.test(bodyOnly));
    A('does not claim more than the one cited page supports',
      !/no other Texas agency/i.test(bodyOnly),
      (bodyOnly.match(/[^.]*no other Texas agency[^.]*\./) || ['no over-broad claim'])[0].slice(0, 70));
  }

  if (page.category === 'hvac') {
    // Round 14b. The 25C claim was wrong twice in opposite directions — first
    // asserted without checking, then softened without checking. These pin the
    // SUBSTANCE the owner verified against FS-2025-05, so a future edit that
    // loses either half fails here rather than on the page.
    A('states the 25C test the IRS states: placed in service after Dec 31 2025',
      /will not be allowed for any property placed in service after December 31, 2025/.test(bodyOnly));
    A('draws the placed-in-service vs purchased distinction',
      /Placed in service, not purchased/.test(bodyOnly));
    A('keeps the no-grandfather point', /no grandfather provision/i.test(bodyOnly));
    A('carries the IRS\'s own qualification about these FAQs',
      /not published in the Internal Revenue Bulletin/.test(bodyOnly) &&
      /accuracy-related penalties/.test(bodyOnly));
    A('does not overstate that qualification into doubt',
      !/may be wrong|might not be accurate|cannot be relied on by anyone/i.test(bodyOnly));
    A('cites the fact sheet by number', /Fact Sheet 2025-05/.test(bodyOnly));
  }

  if (page.category === 'hvac') {
    const rate = eiaRate();
    const el = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('#context .data-card')];
      const card = cards.find(c => /electricity/i.test(c.querySelector('.metric-label')?.textContent ?? ''));
      if (!card) return null;
      const badge = card.querySelector('.live-badge,.aged-badge,.stale-badge,.error-badge,.sample-badge');
      return {
        label: card.querySelector('.metric-label')?.textContent?.trim(),
        value: card.querySelector('.metric-value')?.textContent?.trim(),
        badge: badge?.textContent?.trim(),
        badgeAriaHidden: badge?.getAttribute('aria-hidden') === 'true',
        meta: card.querySelector('.data-meta')?.innerText.replace(/\s+/g, ' ').trim(),
        link: card.querySelector('a')?.getAttribute('href'),
        times: [...card.querySelectorAll('time[datetime]')].map(t => t.getAttribute('datetime')),
      };
    });
    A('the EIA electricity rate is restored to the page', !!el, el ? el.label : 'no rate card found');
    A('the rate matches the archive', !!el?.value?.includes(rate.cents.toFixed(2)),
      `${el?.value} vs archive ${rate.cents.toFixed(2)}`);
    A('the rate is labelled STATEWIDE, not as a San Antonio figure',
      /Texas/.test(el?.label ?? '') && !/San Antonio/.test(el?.label ?? ''), el?.label);
    A('the rate carries a four-bucket label, announced', !!el?.badge && !el?.badgeAriaHidden, el?.badge);
    A('the rate carries dual dates',
      /Data through/.test(el?.meta ?? '') && /(Updated|Last checked|Last known value):/.test(el?.meta ?? ''),
      el?.meta);
    A('the rate dates are machine-readable', (el?.times?.length ?? 0) >= 2 &&
      el.times.every(t => !Number.isNaN(Date.parse(t))), (el?.times ?? []).join(' '));
    A('the rate links its full data page', el?.link === '/data/texas/electricity-prices/', el?.link);
    // Forbid the DERIVED FIGURE, not the words. The page's own sentence —
    // "turning it into a monthly bill or a payback period needs this home's
    // actual consumption, which we do not have and will not assume" — is the
    // most useful line in the block, and a word-matching guard would fight it.
    // What actually must not exist is a second quantity that could only come
    // from multiplying the rate by a consumption figure we do not hold.
    const rateBlock = await p.evaluate(() => {
      const cards = [...document.querySelectorAll('#context .context-item')];
      const card = cards.find(c => /electricity/i.test(c.innerText));
      return card ? card.innerText.replace(/\s+/g, ' ') : '';
    });
    const numbers = (rateBlock.match(/\d[\d,]*(\.\d+)?/g) ?? [])
      // The rate itself, and the two dates beside it, are the block's own facts.
      .filter(n => n !== rate.cents.toFixed(2) && !/^(19|20)\d\d$/.test(n) && Number(n.replace(/,/g, '')) > 31);
    A('the rate block carries no quantity beyond the rate and its dates',
      numbers.length === 0, numbers.join(', ') || 'only the rate and its dates');
    const derivedQty = /\$\s?[\d,]+|\d[\d,]*\s*(kWh\s*(×|x|\*)|per year|a year|\/year)/i;
    A('no quantity derived from the rate appears anywhere on the page',
      !derivedQty.test(bodyOnly), (bodyOnly.match(derivedQty) || ['none'])[0]);
    A('the page says why it stops at the rate',
      /needs this home's actual\s+consumption|will not assume/i.test(bodyOnly));
  }

  await p.setViewportSize({ width: 380, height: 1400 });
  const m = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  A('no horizontal scroll at 380px', m.overflow <= 0, `${m.overflow}px`);
  await c.close();
}

console.log('\n══ AUSTIN UNTOUCHED ══');
for (const path of ['/austin/hvac/', '/austin/plumbing/']) {
  const c = await b.newContext({ viewport: { width: 1440, height: 1200 } });
  const p = await c.newPage();
  await p.goto(B + path, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText.trim(),
    blocks: [...document.querySelectorAll('section[id]')]
      .map(s => s.id).filter(i => ['answer','data','method','context','faq','sources'].includes(i)).length,
    quoteReady: /QuoteReady/.test(document.body.innerText),
  }));
  A(`${path} still renders its own copy`, r.quoteReady && r.blocks === 0,
    `${r.h1} · belowHero blocks=${r.blocks}`);
  await c.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
