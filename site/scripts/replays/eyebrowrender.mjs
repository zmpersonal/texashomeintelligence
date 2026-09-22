/*
 * Round 34 — the free-account eyebrow's accent, measured rather than declared.
 *
 * A colour choice is the easiest thing on a site to break silently. Nothing in
 * a build fails when a token moves and a label drops below AA, and nobody
 * reads a hex value off a screenshot. So this computes the contrast ratio from
 * what the browser actually painted, and counts the amber in the view.
 *
 * ── WHAT IT PINS, AND WHY EACH ONE ────────────────────────────────────────
 *  1. THE RATIO IS AT LEAST 4.5:1. The eyebrow renders at 15.04px weight 600,
 *     which is NOT WCAG large text (that needs 18.66px AND bold), so the
 *     normal-text threshold applies. Navy on this amber measures 4.53:1 and
 *     would pass by 0.03; ink measures 5.15:1. This asserts the real number,
 *     so a token nudge that eats the margin fails here instead of shipping.
 *  2. ONE CONTENT ACCENT PER VIEW. The brand spends amber sparingly - one
 *     deliberate use per view. The header wordmark's amber "Intelligence" is
 *     brand chrome rather than a content accent (owner's ruling, Round 34), so
 *     it is excluded by POSITION - anything inside <header> - rather than by
 *     name, which would let a second amber slip in beside it.
 *  3. THE QUIET LABELS STAYED QUIET. "Modeled - per-ZIP coming soon" sits on
 *     the same page and "<alert> - condition detected" on the signed-in one.
 *     Both are .card-tag, and the accent is a MODIFIER precisely so they do
 *     not inherit it. If someone later moves the colour onto .card-tag, these
 *     two assertions are what says so.
 *
 * Needs `npm run build` and `npm run worker` (port 9400).
 */
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser.mjs';

const B = 'http://127.0.0.1:9400';
/* The signed-in dashboard is where the "condition detected" label lives, and
   it does not render without a session. Checking /home/ signed out would pass
   this file's quiet-label assertion by finding nothing to look at, which is
   not the same as finding the label unaccented. */
const SESSIONS_FILE = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', '.wrangler', 'state', 'sessions.json',
);
if (!fs.existsSync(SESSIONS_FILE)) {
  console.error(`\n[x] no ${SESSIONS_FILE} — run \`npm run fixture\` with the worker stopped.\n`);
  process.exit(2);
}
const SESSION = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
const AMBER = 'rgb(196, 119, 46)';        // --thi-amber  #C4772E
const INK = 'rgb(14, 23, 38)';            // --thi-ink    #0E1726
let pass = 0, fail = 0;
const A = (label, ok, note = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : '**FAIL**'}  ${label}${note ? '  — ' + note : ''}`);
};

/** WCAG 2.x relative luminance and contrast, over "rgb(r, g, b)" strings. */
const channel = (c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => {
  const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const b = await launchChromium();

console.log('\n══ THE EYEBROW CARRIES THE ACCENT, AT A LEGIBLE RATIO ══');
for (const zip of ['78704', '78205']) {
  for (const width of [1366, 390]) {
    const c = await b.newContext({ viewport: { width, height: 1100 } });
    const p = await c.newPage();
    await p.goto(`${B}/dashboard/${zip}/`, { waitUntil: 'networkidle' });
    const r = await p.evaluate(() => {
      const el = document.querySelector('.unlock-card .card-tag');
      if (!el) return null;
      const cs = getComputedStyle(el);
      // Walk up for the painted backdrop if the element's own is transparent.
      let bg = cs.backgroundColor, node = el;
      while (bg === 'rgba(0, 0, 0, 0)' && node.parentElement) {
        node = node.parentElement;
        bg = getComputedStyle(node).backgroundColor;
      }
      return {
        text: el.innerText.trim(), color: cs.color, bg,
        fontSize: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10),
        hasModifier: el.classList.contains('card-tag-accent'),
      };
    });
    A(`/dashboard/${zip}/ @${width} — the eyebrow renders`, r !== null, r?.text);
    if (!r) { await c.close(); continue; }
    const ratio = contrast(r.color, r.bg);
    // Large text is >=18.66px AND bold; this is 15.04px at 600, so 4.5 applies.
    const large = r.fontSize >= 18.66 && r.weight >= 700;
    A(`/dashboard/${zip}/ @${width} — contrast is at least 4.5:1`, ratio >= 4.5,
      `${ratio.toFixed(2)}:1 · ${r.color} on ${r.bg} · ${r.fontSize}px/${r.weight}${large ? ' (large text)' : ' (normal text, 4.5:1 applies)'}`);
    A(`/dashboard/${zip}/ @${width} — it is the amber pill, in ink`,
      r.bg === AMBER && r.color === INK && r.hasModifier,
      `${r.color} on ${r.bg}`);
    await c.close();
  }
}

console.log('\n══ ONE CONTENT ACCENT IN THE VIEW ══');
{
  const c = await b.newContext({ viewport: { width: 1366, height: 1100 } });
  const p = await c.newPage();
  await p.goto(`${B}/dashboard/78704/`, { waitUntil: 'networkidle' });
  const amber = await p.evaluate((AMBER2) => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      const cs = getComputedStyle(el);
      const painted = [];
      if (cs.color === AMBER2 && el.innerText?.trim()) painted.push('text');
      if (cs.backgroundColor === AMBER2) painted.push('background');
      if (cs.fill === AMBER2) painted.push('fill');
      if (cs.borderLeftColor === AMBER2 && parseFloat(cs.borderLeftWidth) > 0) painted.push('border');
      if (cs.borderTopColor === AMBER2 && parseFloat(cs.borderTopWidth) > 0) painted.push('border');
      if (!painted.length) continue;
      out.push({
        what: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`,
        painted: painted.join('+'),
        chrome: !!el.closest('header, footer'),
      });
    }
    return out;
  }, AMBER);
  const content = amber.filter((x) => !x.chrome);
  const chrome = amber.filter((x) => x.chrome);
  for (const x of amber) console.log(`     ${x.chrome ? 'chrome ' : 'CONTENT'}  ${x.what}  (${x.painted})`);
  A('exactly one amber content accent on a ZIP dashboard', content.length === 1,
    content.map((x) => x.what).join(', ') || 'none');
  A('and it is the free-account eyebrow',
    content[0]?.what.includes('card-tag-accent'), content[0]?.what);
  // Stated rather than asserted away: the wordmark is brand chrome and does
  // not spend the view's accent (owner's ruling). It is counted separately so
  // a change to it is still visible here.
  console.log(`     chrome amber, excluded by rule: ${chrome.map((x) => x.what).join(', ') || 'none'}`);
  await c.close();
}

console.log('\n══ THE QUIET LABELS STAYED QUIET ══');
for (const [path, needle, sid] of [
  ['/dashboard/78704/', 'modeled', null],
  // FIRED is the fixture account whose area has a condition firing, so the
  // card that carries the "condition detected" label actually renders.
  ['/home/', 'condition detected', SESSION.FIRED],
]) {
  const c = await b.newContext({ viewport: { width: 1366, height: 1100 } });
  if (sid) await c.addCookies([
    { name: 'thi_session', value: sid, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'thi_signed_in', value: '1', domain: '127.0.0.1', path: '/', sameSite: 'Lax' },
  ]);
  const p = await c.newPage();
  const res = await p.goto(B + path, { waitUntil: 'networkidle' });
  // Landing somewhere else is its own failure, reported as itself. /home/
  // redirects to a ZIP dashboard when the signed-in view cannot render — which
  // is what a missing local fixture artifact looks like — and without this the
  // symptom is "label not found" on a page that never had the label.
  const landed = new URL(p.url()).pathname;
  A(`${path} — renders ${path}, not a redirect`, res.status() === 200 && landed === path,
    `${res.status()} at ${landed}`);
  if (res.status() !== 200 || landed !== path) { await c.close(); continue; }
  const tags = await p.evaluate(() =>
    [...document.querySelectorAll('.card-tag')].map((el) => ({
      text: el.innerText.trim(),
      accent: el.classList.contains('card-tag-accent'),
      bg: getComputedStyle(el).backgroundColor,
    })));
  const quiet = tags.filter((t) => !t.accent);
  const match = quiet.find((t) => t.text.toLowerCase().includes(needle));
  // The label must BE THERE and be quiet. "Not found" is a failure here: it
  // would mean this assertion is looking at a page that cannot disprove it.
  A(`${path} — "${needle}" label is present and carries no accent`,
    match !== undefined && !match.accent && match.bg !== AMBER,
    match ? `"${match.text}" bg=${match.bg}` : 'LABEL NOT FOUND — nothing was checked');
  A(`${path} — no unaccented .card-tag turned amber`,
    quiet.every((t) => t.bg !== AMBER), `${quiet.length} quiet label(s)`);
  await c.close();
}

console.log('\n══ WITH SCRIPTING OFF ══');
{
  const read = async (js) => {
    const c = await b.newContext({ viewport: { width: 1366, height: 1100 }, javaScriptEnabled: js });
    const p = await c.newPage();
    await p.goto(`${B}/dashboard/78704/`, { waitUntil: 'load' });
    const r = await p.evaluate(() => {
      const el = document.querySelector('.unlock-card .card-tag');
      const cs = getComputedStyle(el);
      return `${el.className}|${el.innerText.trim()}|${cs.color}|${cs.backgroundColor}`;
    });
    await c.close();
    return r;
  };
  const on = await read(true), off = await read(false);
  A('the eyebrow is identical with scripting off', on === off, off);
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
