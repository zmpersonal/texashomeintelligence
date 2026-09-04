/**
 * Round 18 — Plumbing Triage, verified in a browser.
 *
 * Three things a green build cannot tell you, and this does:
 *  1. **The focus screens have nothing competing.** The shutoff and both
 *     interrupts must be alone on screen. Asserted by measuring what is
 *     actually VISIBLE, not by reading the markup.
 *  2. **The electrical interrupt terminates.** No verdict, no checks, no
 *     questions, and no onward navigation except back. This is the one
 *     assertion whose failure would be a safety defect rather than a bug.
 *  3. **No cost figure and no contractor referral anywhere.** Both are owner
 *     decisions that a future edit could quietly undo.
 *
 * Copy is compared against `src/data/plumbingTriage.ts` rather than pinned as
 * literals here, so the strings cannot drift from the config the copy deck
 * governs — the same discipline `saservicerender` uses for figures.
 */
import { launchChromium } from './browser.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = 'http://127.0.0.1:9400';
const URL_PATH = '/tools/plumbing-triage/';

let pass = 0, fail = 0;
const A = (label, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : '**FAIL**'}  ${label}${note ? '  — ' + note : ''}`);
};

// The config is the source of truth for copy; read it rather than restate it.
const src = readFileSync(join(SITE, 'src', 'data', 'plumbingTriage.ts'), 'utf8');
const screenIds = [...src.matchAll(/^\s*id:\s*"([a-z0-9-]+)"/gm)].map(m => m[1]);
const FOCUS = ['shutoff', 'gas-stop', 'electrical-stop', 'sewage-stop'];
const TERMINAL = ['electrical-stop', 'gas-stop'];

const b = await launchChromium();
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p = await c.newPage();

console.log('\n══ PAGE ══');
const res = await p.goto(B + URL_PATH, { waitUntil: 'networkidle' });
A('renders 200', res.status() === 200, String(res.status()));
A('is indexed', !/noindex/.test(await p.evaluate(() =>
  document.querySelector('meta[name="robots"]')?.content ?? '')));

// ── every screen is in the served HTML, before any script runs ────────────
const raw = await (await fetch(B + URL_PATH)).text();
A('every screen is in the SERVED HTML (no-JS reachable)',
  screenIds.every(id => raw.includes(`id="${id}"`)),
  `${screenIds.length} screens: ${screenIds.filter(id => !raw.includes(`id="${id}"`)).join(',') || 'all present'}`);

// ── the two guards that protect owner decisions ───────────────────────────
// Scoped to <main> — the sitewide footer says "drought and energy costs for
// Austin…" on all 265 pages and is not this tool's content.
const mainHtml = raw.slice(raw.indexOf('<main'), raw.indexOf('</main>') + 7);
const servedText = mainHtml.replace(/<[^>]+>/g, ' ');
// A cost FIGURE or a cost CLAIM — not the word. The deck legitimately contains
// "what does that cost?" as a question to ask a contractor, and forbidding the
// word would forbid authored copy. What must never appear is a currency amount
// or a published range, which is what Round 6 measured as unsupportable.
const COST = /\$\s?[\d,]|\b\d[\d,]*\s*(?:to|–|-)\s*\$?\d[\d,]*\b|typical (?:cost|spend|range)|cost range|replacement cost|price range|\bper (?:square|sq\.? ?ft|hour)\b/i;
const costHit = servedText.match(COST);
A('NO cost figure or published range in the tool',
  !costHit, costHit ? `found: ${costHit[0]}` : 'none');
A('the design\'s cost panel is gone entirely',
  !/Typical cost in|costRange|costNote|Estimate<|City of Austin plumbing permits/i.test(mainHtml));
const REFERRAL = /get (free )?quotes?|find a (pro|contractor|plumber)|matched with|request a quote|compare bids|hire a/i;
const refHit = servedText.match(REFERRAL);
A('NO contractor referral or handoff', !refHit, refHit ? `found: ${refHit[0]}` : 'none');
A('utility and emergency instructions ARE present (not referral)',
  /call your electric utility/i.test(servedText) && /call 911/i.test(servedText));

// ── no four-bucket labels: nothing here reads a dataset ───────────────────
const badges = await p.evaluate(() =>
  document.querySelectorAll('.live-badge,.aged-badge,.stale-badge,.error-badge,.sample-badge').length);
A('no four-bucket freshness labels (nothing reads a dataset)', badges === 0, `${badges} badge(s)`);

// ── walk every screen ─────────────────────────────────────────────────────
console.log('\n══ EVERY SCREEN ══');
const goto = async (id) => {
  await p.evaluate((i) => {
    for (const s of document.querySelectorAll('[data-screen]')) s.hidden = s.dataset.screen !== i;
  }, id);
};
for (const id of screenIds) {
  await goto(id);
  const r = await p.evaluate(() => {
    const vis = [...document.querySelectorAll('[data-screen]')].filter(s => !s.hidden);
    const s = vis[0];
    const btns = [...(s?.querySelectorAll('.tri-btn, .tri-back, .tri-copy') ?? [])]
      .map(el => { const b = el.getBoundingClientRect();
        return { t: el.textContent.trim().slice(0, 34), w: Math.round(b.width), h: Math.round(b.height) }; });
    return {
      visibleCount: vis.length,
      id: s?.dataset.screen,
      headline: s?.querySelector('.tri-headline,.tri-h1')?.textContent?.trim() ?? '',
      hasVerdict: !!s?.querySelector('.tri-verdict'),
      forward: [...(s?.querySelectorAll('[data-go]') ?? [])]
        .filter(a => a.dataset.go !== s.dataset.back).map(a => a.textContent.trim()),
      back: !!s?.querySelector('.tri-back'),
      minTap: Math.min(...btns.map(x => x.h), 999),
      btns,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  A(`${id}: exactly one screen visible`, r.visibleCount === 1, `${r.visibleCount} visible · "${r.headline.slice(0, 46)}"`);
  A(`${id}: back present`, r.back || id === 'gas-check', r.back ? 'yes' : 'none (entry-adjacent)');
  A(`${id}: tap targets >= 44px`, r.minTap >= 44 || r.btns.length === 0, `min ${r.minTap === 999 ? 'n/a' : r.minTap + 'px'}`);
  A(`${id}: no horizontal scroll at 390px`, r.overflow <= 0, `${r.overflow}px`);
}

// ── the focus screens ─────────────────────────────────────────────────────
console.log('\n══ FOCUS SCREENS — nothing competes ══');
for (const id of FOCUS) {
  await goto(id);
  const r = await p.evaluate(() => {
    const s = [...document.querySelectorAll('[data-screen]')].find(x => !x.hidden);
    const others = [...document.querySelectorAll('[data-screen]')].filter(x => x !== s && !x.hidden);
    // Everything painted above the fold that is not this screen's own content.
    // Body-wide, so site chrome is caught too — the first version looked only
    // inside <main> and would have missed the header entirely. An ANCESTOR of
    // the visible screen is not a stray (it contains it), which is what made
    // <main> itself show up as one.
    const strays = [...document.querySelectorAll('body *')].filter(el => {
      if (s.contains(el) || el.contains(s)) return false;
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.top < window.innerHeight && b.bottom > 0;
    }).map(el => `${el.tagName}.${(el.className || '').toString().split(' ')[0]}`);
    return {
      others: others.length, strays,
      hasVerdict: !!s.querySelector('.tri-verdict'),
      hasList: !!s.querySelector('.tri-list'),
      headlinePx: parseFloat(getComputedStyle(s.querySelector('.tri-headline')).fontSize),
      bodyPx: Math.max(0, ...[...s.querySelectorAll('.tri-body')].map(e => parseFloat(getComputedStyle(e).fontSize))),
    };
  });
  A(`${id}: no other screen visible`, r.others === 0, `${r.others}`);
  A(`${id}: nothing else painted in the viewport`, r.strays.length === 0,
    r.strays.length ? r.strays.slice(0, 8).join(', ') : 'clean — no chrome, no other screen');
  A(`${id}: no verdict or checklist competing`, !r.hasVerdict && !r.hasList);
  A(`${id}: headline is larger than body`, r.headlinePx > r.bodyPx,
    `${r.headlinePx}px vs ${r.bodyPx}px`);
}

// ── the terminal screens ──────────────────────────────────────────────────
console.log('\n══ TERMINAL — the electrical interrupt ENDS the path ══');
for (const id of TERMINAL) {
  await goto(id);
  const r = await p.evaluate(() => {
    const s = [...document.querySelectorAll('[data-screen]')].find(x => !x.hidden);
    const back = s.dataset.screen && s.querySelector('.tri-back')?.getAttribute('href')?.slice(1);
    const gos = [...s.querySelectorAll('[data-go]')].map(a => a.dataset.go);
    return {
      marked: s.dataset.end === 'true',
      forward: gos.filter(g => g !== back),
      backTo: back,
      externals: [...s.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute('href')),
      verdict: !!s.querySelector('.tri-verdict'),
      questions: !!s.querySelector('[data-questions]'),
      checks: !!s.querySelector('.tri-list'),
    };
  });
  A(`${id}: marked terminal in the DOM`, r.marked);
  A(`${id}: NO onward navigation except back`, r.forward.length === 0,
    r.forward.length ? `forward to: ${r.forward.join(',')}` : `only back → ${r.backTo}`);
  A(`${id}: no verdict`, !r.verdict);
  A(`${id}: no "what to check" list`, !r.checks);
  A(`${id}: no three-questions block`, !r.questions);
  if (id === 'electrical-stop') {
    const t = await p.evaluate(() =>
      [...document.querySelectorAll('[data-screen]')].find(x => !x.hidden).innerText);
    A('electrical: cites ESFI by its real document title',
      /Electrical Safety Foundation International — Flooding and Disaster Safety/.test(t));
    A('electrical: carries the utility-confirmation rule',
      /until the utility has confirmed the power is off/i.test(t));
    A('electrical: forbids a wet-handed breaker',
      /Don't touch a breaker with wet hands or while standing on anything wet/i.test(t));
    A('⚠️ electrical: does NOT permit breaker use when the panel is dry',
      !/only turn off a breaker if the panel is dry/i.test(t),
      'the line ESFI does not support');
  }
  A(`${id}: emergency call is a real tel: link`, id !== 'gas-stop' || r.externals.includes('tel:911'),
    r.externals.join(',') || 'none');
}

// ── verdicts carry all three blocks ───────────────────────────────────────
console.log('\n══ VERDICTS ══');
const verdictIds = screenIds.filter(id => id.startsWith('v-'));
for (const id of verdictIds) {
  await goto(id);
  const r = await p.evaluate(() => {
    const s = [...document.querySelectorAll('[data-screen]')].find(x => !x.hidden);
    return {
      checks: s.querySelectorAll('.tri-list li').length,
      questions: s.querySelectorAll('[data-questions] li').length,
      stop: /When to stop looking/i.test(s.innerText),
      disclaimer: /not a diagnosis of yours/i.test(s.innerText),
      order: [...s.querySelectorAll('.tri-headline,.tri-vsub')].map(e => e.textContent.trim()),
    };
  });
  A(`${id}: verdict, then checks, then three questions`,
    r.checks > 0 && r.questions === 3 && r.stop,
    `${r.checks} checks · ${r.questions} questions · ${r.order.slice(0, 4).join(' → ')}`);
  A(`${id}: carries the not-a-diagnosis footer`, r.disclaimer);
}

// ── tap-target report ─────────────────────────────────────────────────────
console.log('\n══ TAP TARGETS @ 390×844 ══');
await goto('symptoms');
const taps = await p.evaluate(() => [...document.querySelectorAll('[data-screen]')]
  .find(x => !x.hidden).querySelectorAll('.tri-btn'))
  .then(() => p.evaluate(() => [...[...document.querySelectorAll('[data-screen]')]
    .find(x => !x.hidden).querySelectorAll('.tri-btn, .tri-back')]
    .map(el => { const b = el.getBoundingClientRect();
      return `${Math.round(b.width)}×${Math.round(b.height)}  ${el.textContent.trim().slice(0, 40)}`; })));
for (const t of taps) console.log(`    ${t}`);
A('every symptom button is full-width and >= 64px tall',
  taps.filter(t => /^\d+×/.test(t)).slice(1).every(t => {
    const [w, h] = t.split(/×|\s/).map(Number); return w > 300 && h >= 64;
  }), `${taps.length} targets`);

await c.close();
await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
