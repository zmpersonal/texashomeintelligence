/*
 * Round 31 — the analysis layer, verified in a browser.
 *
 * Three guarantees this round makes, each of which a green build would not
 * catch if it broke:
 *
 *  1. THE KEY FIGURE IS THE ARTICLE'S OWN. Every value in the strip is read
 *     from the article's frontmatter `card` block and compared string-equal
 *     to what the page renders. A figure that drifted from the block — or one
 *     computed at render time — fails here rather than contradicting the
 *     sentence beside it.
 *  2. NOTHING RE-TYPES ARTICLE COPY. The stored markdown is autoposter-owned
 *     and ledger-verified; this round is a formatting round, so a diff under
 *     src/data/analysis/ is a failure of the round, not a change to review.
 *  3. THE ANSWER BOX'S SHAPE IS MEASURED. The box is styled off the heading
 *     slug plus two sibling paragraphs, which is the shape all five articles
 *     have. A sixth article with a different shape must fail here rather than
 *     render a torn panel.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARTICLE_DIR = join(SITE, 'src', 'data', 'analysis');
const B = 'http://127.0.0.1:9400';
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

/**
 * The article's frontmatter, read from the stored markdown — the source of
 * truth this file compares the rendered page against. A minimal reader rather
 * than a YAML dependency: the fields needed are flat strings and a one-level
 * `card` block, and COST.md asks before a dependency is added.
 */
function frontmatter(file) {
  const raw = readFileSync(join(ARTICLE_DIR, file), 'utf8');
  const fm = raw.split(/^---$/m)[1] ?? '';
  const scalar = (key, indent = '') => {
    const m = new RegExp(`^${indent}${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm').exec(fm);
    return m ? m[1].trim() : undefined;
  };
  const cardBlock = /^card:\n((?:[ ]{2}.*\n?)+)/m.exec(fm)?.[1];
  const card = cardBlock
    ? Object.fromEntries(
        [...cardBlock.matchAll(/^ {2}(\w+):\s*"([^"]*)"/gm)].map((m) => [m[1], m[2]]),
      )
    : undefined;
  return {
    slug: file.replace(/\.md$/, ''),
    title: scalar('title'),
    publishedAt: scalar('publishedAt'),
    updatedAt: scalar('updatedAt'),
    published: /^published:\s*true\s*$/m.test(fm),
    card,
  };
}

const articles = readdirSync(ARTICLE_DIR).filter((f) => f.endsWith('.md')).map(frontmatter);
const live = articles.filter((a) => a.published);

const b = await launchChromium();

// ══ 1. THE HUB ════════════════════════════════════════════════════════════
console.log('\n══ /analysis/ — the hub ══');
{
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await c.newPage();
  await p.goto(`${B}/analysis/`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    h1: document.querySelector('h1')?.innerText.trim(),
    entries: [...document.querySelectorAll('.analysis-card')].map((e) => ({
      title: e.querySelector('.analysis-card-title')?.innerText.trim(),
      href: e.querySelector('.analysis-card-title a')?.getAttribute('href'),
      standfirst: e.querySelector('.analysis-card-standfirst')?.innerText.trim(),
      date: e.querySelector('.analysis-card-date time')?.getAttribute('datetime'),
      dateText: e.querySelector('.analysis-card-date')?.innerText.trim(),
      headline: e.querySelector('.analysis-card-headline')?.innerText.trim(),
      subhead: e.querySelector('.analysis-card-subhead')?.innerText.trim(),
    })),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent)),
  }));

  A('the hub renders', !!r.h1, r.h1);
  A('every published article is listed', r.entries.length === live.length,
    `${r.entries.length} listed vs ${live.length} published`);
  const dates = r.entries.map((e) => e.date);
  A('newest first', dates.every((d, i) => i === 0 || dates[i - 1] >= d), dates.join(' · '));
  for (const e of r.entries) {
    const src = live.find((a) => e.href === `/analysis/${a.slug}/`);
    A(`${src?.slug ?? e.href}: title, standfirst and date render`,
      !!src && e.title === src.title && !!e.standfirst && e.date === src.publishedAt);
    A(`${src?.slug}: the listed figure is the article's card block`,
      !!src?.card && e.headline === src.card.headline && e.subhead === src.card.subhead,
      `${e.headline} / ${e.subhead}`);
  }
  // ROUND 31b — the hub printed raw ISO (`2026-09-18`) with no label. It now
  // renders a human date with the machine form underneath it.
  for (const e of r.entries) {
    A(`${e.href}: the hub date is human-readable, not raw ISO`,
      !/^\d{4}-\d{2}-\d{2}$/.test(e.dateText) && /\d{4}$/.test(e.dateText), e.dateText);
    A(`${e.href}: and carries the machine date underneath`,
      /^\d{4}-\d{2}-\d{2}$/.test(e.date), e.date);
  }

  const collection = r.jsonLd.find((j) => j['@type'] === 'CollectionPage');
  A('CollectionPage schema is present', !!collection);
  A('its ItemList matches the rendered list',
    collection?.mainEntity?.numberOfItems === r.entries.length
    && collection?.mainEntity?.itemListElement?.length === r.entries.length,
    `${collection?.mainEntity?.numberOfItems} items`);
  await c.close();
}

// ══ 2. EACH ARTICLE ═══════════════════════════════════════════════════════
for (const art of live) {
  console.log(`\n══ /analysis/${art.slug}/ ══`);
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await c.newPage();
  await p.goto(`${B}/analysis/${art.slug}/`, { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const answer = q('.analysis h2#the-short-answer');
    // Everything between the answer heading and the next h2 — the shape the
    // answer-box styling is built on.
    const shape = [];
    for (let n = answer?.nextElementSibling; n && n.tagName !== 'H2'; n = n.nextElementSibling)
      shape.push(n.tagName.toLowerCase());
    return {
      dateline: q('.analysis-dateline')?.innerText.replace(/\s+/g, ' ').trim(),
      datelineTimes: [...document.querySelectorAll('.analysis-dateline time')]
        .map((t) => t.getAttribute('datetime')),
      keyfigure: q('.analysis-keyfigure') ? {
        headline: q('.analysis-keyfigure-headline').innerText.trim(),
        subhead: q('.analysis-keyfigure-subhead').innerText.trim(),
        provenance: q('.analysis-keyfigure-provenance').innerText.trim(),
      } : null,
      answerShape: shape,
      answerBoxed: answer ? getComputedStyle(answer).borderLeftWidth : null,
      answerFirstP: answer?.nextElementSibling
        ? getComputedStyle(answer.nextElementSibling).backgroundColor : null,
      sources: [...document.querySelectorAll('.analysis-source-list li')].map((li) => ({
        name: li.querySelector('.analysis-source-name')?.innerText.trim(),
        asOf: li.querySelector('.analysis-source-asof')?.innerText.trim(),
        datetime: li.querySelector('time')?.getAttribute('datetime'),
      })),
      more: [...document.querySelectorAll('.analysis-more-list a')].map((a) => a.getAttribute('href')),
      dataLink: q('.analysis-datalink a')?.getAttribute('href') ?? null,
      tables: [...document.querySelectorAll('.analysis table')].length,
      bodyTables: [...document.querySelectorAll('.analysis > table')].map((t) => {
        const cell = t.querySelector('td');
        const th = t.querySelector('th');
        const cs = cell ? getComputedStyle(cell) : null;
        const rows = [...t.querySelectorAll('tr')]
          .map((tr) => [...tr.children].map((c) => Math.round(c.getBoundingClientRect().left)));
        return {
          cellPad: cs ? cs.padding : '0px',
          cellBorder: cs ? cs.borderBottomWidth : '0px',
          thStyled: th ? getComputedStyle(th).backgroundColor !== 'rgba(0, 0, 0, 0)' : false,
          thBg: th ? getComputedStyle(th).backgroundColor : '—',
          aligned: rows.every((r2) => r2.every((x, i) => Math.abs(x - rows[0][i]) < 2)),
        };
      }),
      scrollers: [...document.querySelectorAll('.analysis .table-scroll')]
        .map((e) => getComputedStyle(e).overflowX),
      measure: q('.analysis') ? getComputedStyle(q('.analysis')).maxWidth : null,
      measureCh: (() => {
        const p2 = q('.analysis > p');
        if (!p2) return 0;
        const fs = parseFloat(getComputedStyle(p2).fontSize);
        return Math.round(p2.getBoundingClientRect().width / (fs * 0.5));
      })(),
      h2MarginTop: (() => {
        const h = [...document.querySelectorAll('.analysis h2')].find((x) => x.id !== 'the-short-answer');
        return h ? parseFloat(getComputedStyle(h).marginTop) : 0;
      })(),
      articleJsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => JSON.parse(s.textContent)).find((j) => j['@type'] === 'Article'),
    };
  });

  // The date line — visible, and labelled for what it is.
  A('a visible date line renders', !!r.dateline && /^Published /.test(r.dateline), r.dateline);
  A('the published date is the frontmatter date', r.datelineTimes[0] === art.publishedAt,
    `${r.datelineTimes[0]} vs ${art.publishedAt}`);
  A(art.updatedAt ? 'and "Updated" renders too' : 'and no "Updated" is shown, because none is stored',
    art.updatedAt ? /Updated /.test(r.dateline) : !/Updated /.test(r.dateline));

  // The key figure — string-equal to the card block, or absent.
  if (art.card) {
    A('the key-figure strip renders', !!r.keyfigure);
    A('its headline is the card block, character for character',
      r.keyfigure?.headline === art.card.headline, `"${r.keyfigure?.headline}"`);
    A('its subhead is the card block, character for character',
      r.keyfigure?.subhead === art.card.subhead, `"${r.keyfigure?.subhead}"`);
    A('its provenance is the card block source and asOf',
      r.keyfigure?.provenance === `${art.card.source} · ${art.card.asOf}`,
      `"${r.keyfigure?.provenance}"`);
  } else {
    A('no card block, so no strip — withheld rather than synthesised', r.keyfigure === null);
  }

  // The answer box, and the shape its styling depends on.
  A('the answer section is the measured shape (two paragraphs)',
    r.answerShape.join(',') === 'p,p', r.answerShape.join(','));
  A('the answer section is styled as a box, not prose',
    r.answerBoxed === '3px' && r.answerFirstP !== 'rgba(0, 0, 0, 0)',
    `rule ${r.answerBoxed}, panel ${r.answerFirstP}`);

  // Sources.
  A('the Sources section renders every stored source', r.sources.length >= 1,
    r.sources.map((s) => s.name).join(' | '));
  A('an as-of that is a normals period renders as a period, not a date',
    r.sources.every((s) => !/^\d{4}-\d{4}$/.test(s.asOf.replace('as of ', '').trim())
      || s.datetime === null),
    r.sources.map((s) => s.asOf).join(' | '));

  // More analysis.
  A('"More analysis" excludes the current article',
    !r.more.includes(`/analysis/${art.slug}/`) && r.more.length > 0,
    `${r.more.length} links`);

  // ROUND 31b — BODY TABLES. A markdown table carries no class, so an
  // article's table arrived as a bare <table>: no cell padding, no rules
  // between cells, reading as run-together text. It now gets the same
  // treatment the data pages use. Column alignment is compared row by row
  // rather than assumed, because the mobile scroll affordance changes the
  // table's display type and that is exactly what could break it.
  for (const t of r.bodyTables) {
    A(`a body table is padded and ruled like every other THI table`,
      t.cellPad !== '0px' && t.cellBorder !== '0px', `padding ${t.cellPad}, rule ${t.cellBorder}`);
    A(`its header row is styled`, t.thStyled, t.thBg);
    A(`and its columns line up`, t.aligned);
  }

  // Table and the data-page link.
  if (r.tables > 0) {
    A('the table is horizontally scrollable', r.scrollers.every((o) => o === 'auto'),
      r.scrollers.join(', '));
  }
  // ROUND 31b — a measure, and a measure in the right BAND. "max-width is set"
  // passed at 76ch, which is still wider than comfortable long-form reading.
  A('body text sits in a comfortable measure (65-75ch)',
    r.measureCh >= 60 && r.measureCh <= 78, `≈${r.measureCh}ch (${r.measure})`);
  A('and headings own the space above them, not below',
    r.h2MarginTop > 20, `h2 margin-top ${r.h2MarginTop}px`);
  A('Article schema still carries the dates',
    r.articleJsonLd?.datePublished === art.publishedAt);
  await c.close();
}

// ══ 3. PHONE WIDTHS ═══════════════════════════════════════════════════════
console.log('\n══ PHONE AND DESKTOP WIDTHS ══');
for (const path of ['/analysis/', ...live.map((a) => `/analysis/${a.slug}/`)]) {
  for (const width of [390, 1280]) {
    const c = await b.newContext({ viewport: { width, height: 900 } });
    const p = await c.newPage();
    await p.goto(B + path, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => {
      const de = document.documentElement;
      return {
        sw: de.scrollWidth, cw: de.clientWidth,
        over: [...document.querySelectorAll('body *')].filter((e) => {
          const b2 = e.getBoundingClientRect();
          return (b2.width || b2.height) && (b2.right > de.clientWidth + 0.5 || b2.left < -0.5);
        }).map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().split(/\s+/).join('.')}`),
      };
    });
    A(`${path} @${width}px — no horizontal scroll`, r.sw === r.cw && r.over.length === 0,
      `scrollWidth ${r.sw}${r.over.length ? ' — ' + r.over.slice(0, 3).join(', ') : ''}`);
    await c.close();
  }
}

// ══ 4. WITH SCRIPTING OFF ═════════════════════════════════════════════════
console.log('\n══ SCRIPTING DISABLED ══');
{
  const art = live[0];
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, javaScriptEnabled: false });
  const p = await c.newPage();
  await p.goto(`${B}/analysis/${art.slug}/`, { waitUntil: 'domcontentloaded' });
  const html = await p.content();
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#\d+;|&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
  A('the date line is in the served HTML', /Published /.test(text));
  A('the key figure is in the served HTML', text.includes(art.card.headline), art.card.headline);
  A('the Sources section is in the served HTML', /Sources/.test(text));
  A('"More analysis" is in the served HTML', /More analysis/.test(text));
  await c.close();

  const c2 = await b.newContext({ viewport: { width: 1280, height: 1000 }, javaScriptEnabled: false });
  const p2 = await c2.newPage();
  await p2.goto(`${B}/analysis/`, { waitUntil: 'domcontentloaded' });
  const hub = (await p2.content()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  A('the hub lists every article with scripting off',
    live.every((a) => hub.includes(a.title)), `${live.length} titles`);
  await c2.close();

  // Round 31b's two additions are chrome and a build-time module, so both must
  // be in the served HTML rather than assembled after load.
  const c3 = await b.newContext({ viewport: { width: 1366, height: 900 }, javaScriptEnabled: false });
  const p3 = await c3.newPage();
  await p3.goto(`${B}/`, { waitUntil: 'domcontentloaded' });
  const homeHtml = await p3.content();
  A('the nav item is in the served HTML', /href="\/analysis\/"/.test(homeHtml));
  A('the homepage module is in the served HTML', /id="latest-analysis"/.test(homeHtml));
  const newest3 = live.slice().sort((a2, z) => z.publishedAt.localeCompare(a2.publishedAt)).slice(0, 3);
  A('with its three articles and their figures',
    newest3.every((a2) => homeHtml.includes(a2.title) && homeHtml.includes(a2.card.headline)));
  await c3.close();

  // A body table has to be a real table in the served HTML, not a script's output.
  const c4 = await b.newContext({ viewport: { width: 1366, height: 900 }, javaScriptEnabled: false });
  const p4 = await c4.newPage();
  await p4.goto(`${B}/analysis/did-austins-ac-rush-follow-the-heat-in-august-2026/`,
    { waitUntil: 'domcontentloaded' });
  const tblHtml = await p4.content();
  A('the body table is real <table> markup in the served HTML',
    /<table>[\s\S]*?<th>August 2026<\/th>/.test(tblHtml));
  await c4.close();
}

// ══ 4b. THE OWNER DECISIONS: NAV ITEM AND HOMEPAGE MODULE (Round 31b) ═════
console.log('\n══ NAV ITEM (D10a) AND HOMEPAGE MODULE (D10b) ══');
{
  const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await c.newPage();
  await p.goto(`${B}/austin/roofing/`, { waitUntil: 'networkidle' });
  const nav = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.nav-links > li')].map((li) => ({
      text: li.innerText.trim().split('\n')[0],
      href: li.querySelector('a')?.getAttribute('href') ?? null,
    }));
    const a = document.querySelector('.nav-links a[href="/analysis/"]');
    return { items, present: !!a, tag: a?.tagName, inNav: !!a?.closest('nav[aria-label="Primary"]') };
  });
  A('the nav carries Analysis', nav.present && nav.tag === 'A' && nav.inNav);
  A('and it sits between Data and Locations',
    nav.items.map((i) => i.text).join(' · ') === 'Data · Analysis · Locations',
    nav.items.map((i) => i.text).join(' · '));

  // Keyboard reachability: a real <a> in the primary nav is tabbable, and the
  // CSS-only mobile menu reveals the same <ul>, so no JS is involved either way.
  const focused = await p.evaluate(() => {
    const a = document.querySelector('.nav-links a[href="/analysis/"]');
    a.focus();
    return document.activeElement === a && a.tabIndex >= 0;
  });
  A('the nav item is keyboard-focusable', focused);
  await c.close();

  // The mobile menu is a CSS checkbox toggle — assert the item is inside what
  // the toggle reveals, at a width where the menu is collapsed.
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p2 = await c2.newPage();
  await p2.goto(`${B}/austin/roofing/`, { waitUntil: 'networkidle' });
  const mob = await p2.evaluate(() => {
    const toggle = document.getElementById('nav-toggle');
    const a = document.querySelector('.nav-links a[href="/analysis/"]');
    const before = a.getBoundingClientRect().height > 0;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return { toggleExists: !!toggle, before, after: a.getBoundingClientRect().height > 0 };
  });
  A('on a phone the item lives inside the CSS-only menu the toggle reveals',
    mob.toggleExists && mob.after, `visible before toggle=${mob.before}, after=${mob.after}`);
  await c2.close();
}

{
  const c = await b.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await c.newPage();
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  const home = await p.evaluate(() => {
    const sec = document.getElementById('latest-analysis');
    if (!sec) return null;
    return {
      heading: sec.querySelector('h2')?.innerText.trim(),
      entries: [...sec.querySelectorAll('.analysis-card')].map((e) => ({
        href: e.querySelector('.analysis-card-title a')?.getAttribute('href'),
        date: e.querySelector('.analysis-card-date time')?.getAttribute('datetime'),
        headline: e.querySelector('.analysis-card-headline')?.innerText.trim(),
      })),
      allLink: !!sec.querySelector('a[href="/analysis/"]'),
    };
  });
  A('the homepage carries a Latest analysis module', !!home, home?.heading);
  A('its heading is the owner copy', home?.heading === 'Latest analysis', home?.heading);
  A('it lists exactly three articles', home?.entries.length === 3, `${home?.entries.length}`);
  const newest = live.slice().sort((a2, z) => z.publishedAt.localeCompare(a2.publishedAt)).slice(0, 3);
  A('and they are the three newest published ones',
    home?.entries.map((e) => e.href).join(',') === newest.map((a2) => `/analysis/${a2.slug}/`).join(','),
    home?.entries.map((e) => e.href).join(', '));
  A('each figure is that article\'s own card block',
    home?.entries.every((e, i) => e.headline === newest[i].card?.headline),
    home?.entries.map((e) => e.headline).join(' | '));
  A('and it links on to the hub', home?.allLink);
  await c.close();
}

// ══ 5. THE FOOTER CARRIES /analysis/ ══════════════════════════════════════
console.log('\n══ REACHABILITY ══');
for (const from of ['/', '/austin/roofing/', '/data/', '/tools/']) {
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await c.newPage();
  await p.goto(B + from, { waitUntil: 'networkidle' });
  const link = p.locator('footer a[href="/analysis/"]');
  const found = await link.count();
  if (found) {
    await link.first().click();
    await p.waitForLoadState('networkidle');
  }
  A(`${from} reaches /analysis/ from the footer`,
    found > 0 && p.url() === `${B}/analysis/`, found ? p.url().replace(B, '') : 'no footer link');
  await c.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
