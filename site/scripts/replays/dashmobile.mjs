/*
 * Round 26 — the dashboard on a phone.
 *
 * /dashboard/[zip]/ shipped at scrollWidth 451 in a 320px viewport: a single
 * `1fr` grid track sized to its widest unshrinkable descendant, which a grid
 * container overflows rather than growing to fit. Seventeen elements reported
 * past the edge and nine of them were passengers.
 *
 * WHAT THIS ASSERTS THAT A SCROLLWIDTH CHECK ALONE WOULD NOT: that the page
 * fits BECAUSE IT LAYS OUT, not because something clipped. overflow-x: hidden
 * would satisfy "scrollWidth === clientWidth" while leaving the ZIP picker
 * unreachable, so the no-clipping and full-legibility assertions below are the
 * point of the file, not decoration.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B = 'http://127.0.0.1:9400';
const WIDTHS = [320, 360, 390];
let pass = 0, fail = 0;
function A(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  **FAIL**  ${label}${detail ? `  — ${detail}` : ''}`); }
}

let SESSIONS = {};
try {
  SESSIONS = JSON.parse(readFileSync(join(SITE, '.wrangler', 'state', 'sessions.json'), 'utf8'));
} catch {
  console.error('\n[x] no sessions.json — run `npm run fixture` (worker stopped) first.\n');
  process.exit(2);
}

/** Every element whose border box leaves the viewport, innermost first. */
const OVERFLOW = () => {
  const de = document.documentElement;
  return {
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    over: [...document.querySelectorAll('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (r.width || r.height) && (r.right > de.clientWidth + 0.5 || r.left < -0.5);
      })
      .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().trim().split(/\s+/).join('.')}`
        + ` (w=${Math.round(e.getBoundingClientRect().width)})`),
  };
};

const PAGES = [
  { path: '/dashboard/78704/', label: 'public ZIP dashboard (Austin)', auth: null },
  { path: '/dashboard/78201/', label: 'public ZIP dashboard (San Antonio)', auth: null },
  { path: '/dashboard/',       label: 'ZIP prompt', auth: null },
  { path: '/home/',            label: 'signed-in dashboard', auth: 'POP' },
  { path: '/home/',            label: 'signed-in dashboard, condition firing', auth: 'FIRED' },
  { path: '/home/',            label: 'signed-in dashboard, no home yet', auth: 'EMPTY' },
  // Controls: clean before this round, and they must stay clean after a change
  // to a stylesheet every page on the site loads.
  { path: '/austin/hvac/',           label: 'CONTROL service page', auth: null },
  { path: '/tools/plumbing-triage/', label: 'CONTROL triage', auth: null },
  { path: '/tools/ac-lifespan/',     label: 'CONTROL ac-lifespan', auth: null },
];

const b = await launchChromium();

console.log('\n══ NO HORIZONTAL SCROLL AT PHONE WIDTHS ══');
for (const pg of PAGES) {
  for (const width of WIDTHS) {
    const c = await b.newContext({ viewport: { width, height: 800 } });
    if (pg.auth) {
      const sid = SESSIONS[pg.auth];
      if (!sid) { console.error(`[x] no ${pg.auth} session — re-run npm run fixture`); process.exit(2); }
      await c.addCookies([{ name: 'thi_session', value: sid, domain: '127.0.0.1', path: '/',
        httpOnly: true, sameSite: 'Lax' }]);
    }
    const p = await c.newPage();
    await p.goto(B + pg.path, { waitUntil: 'networkidle' });
    const r = await p.evaluate(OVERFLOW);
    A(`${pg.label} @${width}px`,
      r.scrollWidth === r.clientWidth && r.over.length === 0,
      `scrollWidth ${r.scrollWidth}${r.over.length ? ' — past the edge: ' + r.over.slice(0, 4).join(', ') : ''}`);
    await c.close();
  }
}

// ══ THE FIX IS A LAYOUT FIX, NOT A CLIP ═══════════════════════════════════
console.log('\n══ IT FITS BECAUSE IT LAYS OUT ══');
{
  const c = await b.newContext({ viewport: { width: 320, height: 900 } });
  const p = await c.newPage();
  await p.goto(B + '/dashboard/78704/', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const w = (s) => { const e = q(s); return e ? Math.round(e.getBoundingClientRect().width) : -1; };
    const grid = q('.dash-hero-grid');
    const sel = q('#zip-select');
    const btn = q('.zip-picker .btn');
    return {
      clipping: [...document.querySelectorAll('body *')].filter((e) => {
        const o = getComputedStyle(e).overflowX;
        return (o === 'hidden' || o === 'clip' || o === 'scroll') && e.scrollWidth > e.clientWidth + 1;
      }).map((e) => `.${(e.className || '').toString().trim().split(/\s+/).join('.')}`),
      gridW: Math.round(grid.getBoundingClientRect().width),
      track: getComputedStyle(grid).gridTemplateColumns,
      panelW: w('.dash-score-panel'), pickerW: w('.dash-picker-panel'),
      selW: Math.round(sel.getBoundingClientRect().width),
      selNatural: (() => { const prev = sel.style.width; sel.style.width = 'max-content';
        const n = Math.round(sel.getBoundingClientRect().width); sel.style.width = prev; return n; })(),
      selLabel: sel.options[sel.selectedIndex].text,
      btnW: Math.round(btn.getBoundingClientRect().width),
      btnH: Math.round(btn.getBoundingClientRect().height),
      btnWrapped: btn.getBoundingClientRect().top > sel.getBoundingClientRect().bottom - 2,
      // BRAND.md: the fit must not have been bought with type or spacing.
      type: Object.fromEntries(['.dash-h1', '.ring-score', '.dash-verdict', '.dash-interpret', '.dash-cadence']
        .map((s) => [s, q(s) ? getComputedStyle(q(s)).fontSize : null])),
      ringW: w('.ring'),
      heroPad: getComputedStyle(q('.dash-hero')).padding,
      pickerPad: getComputedStyle(q('.dash-picker-panel')).padding,
    };
  });

  A('nothing clips horizontal content', r.clipping.length === 0, r.clipping.join(', ') || 'no clipped element');
  A('the grid track equals its container, not its widest descendant',
    r.track === `${r.gridW}px`, `track ${r.track} vs container ${r.gridW}px`);
  A('both hero panels are the container width', r.panelW === 280 && r.pickerW === 280,
    `score ${r.panelW}px, picker ${r.pickerW}px`);
  A('the ZIP select keeps its natural width — the selected ZIP stays readable',
    r.selW >= r.selNatural - 1, `${r.selW}px rendered vs ${r.selNatural}px natural, showing "${r.selLabel}"`);
  A('the submit button keeps its full size and drops to its own line',
    r.btnWrapped && r.btnW >= 140 && r.btnH >= 44, `${r.btnW}x${r.btnH}, wrapped=${r.btnWrapped}`);

  // The brand rule this round was explicitly not allowed to break.
  A('type scale untouched at 320px',
    r.type['.dash-h1'] === '22.4px' && r.type['.ring-score'] === '32px'
    && r.type['.dash-verdict'] === '16.32px' && r.type['.dash-interpret'] === '16px'
    && r.type['.dash-cadence'] === '12px', JSON.stringify(r.type));
  A('spacing not collapsed to force the fit',
    r.heroPad === '32px 0px 36px' && r.pickerPad === '18px' && r.ringW === 108,
    `hero ${r.heroPad}, picker ${r.pickerPad}, ring ${r.ringW}px`);
  await c.close();
}

// ══ THE INDEX ITSELF IS UNTOUCHED ═════════════════════════════════════════
// A layout round must not move a number. These are read from the committed
// artifact, not pinned here, so the assertion cannot drift with the data.
console.log('\n══ THE READING IS THE SAME READING ══');
{
  // Read from the artifact the Worker actually serves, not a number pinned here:
  // an assertion that agrees with a constant proves nothing about the page.
  const art = JSON.parse(readFileSync(
    join(SITE, 'dist', 'client', 'data', 'stress-index', 'austin.json'), 'utf8'));
  const c = await b.newContext({ viewport: { width: 320, height: 900 } });
  const p = await c.newPage();
  await p.goto(B + '/dashboard/78704/', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    score: document.querySelector('.ring-score')?.innerText.trim(),
    band: document.querySelector('.dash-band')?.innerText.trim(),
    method: !!document.querySelector('a[href*="/methodology/home-stress-index/"]'),
    signals: [...document.querySelectorAll('.signal-card')].length,
  }));
  A('the score on the page is the score in the artifact',
    r.score === String(art.composite.score), `page ${r.score} vs artifact ${art.composite.score}`);
  A('the band on the page is the band in the artifact',
    r.band?.toLowerCase().includes(art.composite.bandLabel.toLowerCase()),
    `page "${r.band}" vs artifact "${art.composite.bandLabel}"`);
  A('the methodology link is still present at 320px — BRAND.md allows no score without it', r.method);
  A('all five signal cards render', r.signals === 5, `${r.signals} cards`);
  await c.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
