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
  { path: '/san-antonio/hvac/', category: 'hvac', noun: 'HVAC' },
  { path: '/san-antonio/plumbing/', category: 'plumbing', noun: 'plumbing' },
];

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
  A('trend threshold matches Poisson noise on the monthly mean',
    r.answerText.includes(`${e.noisePct.toFixed(1)}%`), `±${e.noisePct.toFixed(1)}%`);
  A('#data table has one row per month, values matching the archive',
    r.dataRows === e.months && r.dataCells.join(',') === e.monthly.map(n => n.toLocaleString()).join(','),
    `${r.dataRows} rows`);
  A('facts render in real <table> elements', r.tables >= 3, `${r.tables} tables`);

  A('every reading carries a four-bucket label', r.badges.length >= 2, `${r.badges.length} badges`);
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
  A('#faq renders real disclosure elements', r.faqDetails === 5, `${r.faqDetails} items`);

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
    !!faq && faq.mainEntity.length === 5 &&
    faq.mainEntity.every(q => q.acceptedAnswer?.text && !/\{[A-Z_]+\}/.test(q.acceptedAnswer.text)),
    `${faq?.mainEntity.length} questions`);
  A('the schema FAQ answers match the visible ones',
    faq.mainEntity.every(q => openBody.includes(q.acceptedAnswer.text.slice(0, 60).replace(/\s+/g, ' '))),
    `${faq.mainEntity.length} answers compared`);

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
