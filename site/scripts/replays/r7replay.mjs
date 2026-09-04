/**
 * Round 7 — full assertion replay against the v2 layout.
 *
 * Every assertion from Rounds 4.1, 4.2, 5 and 5b, re-run on the redesign. A
 * redesign that looks right but drops a source line, shows a withheld day, or
 * lets an action say "fix" is a failure of the round, so these run first and
 * the screenshots come second.
 */
import { launchChromium } from './browser.mjs';
import fs from 'node:fs';
const B = 'http://127.0.0.1:9400';
import pathMod from 'node:path';
import { fileURLToPath } from 'node:url';

// Round 9. Session ids come from the local fixture, which lives beside the
// database it describes (site/.wrangler/state) so the two can never disagree.
// A missing fixture used to surface as `getComputedStyle(null)` three screens
// later; now it says exactly what to run.
const SESSIONS_FILE = pathMod.resolve(
  pathMod.dirname(fileURLToPath(import.meta.url)), '..', '..', '.wrangler', 'state', 'sessions.json',
);
if (!fs.existsSync(SESSIONS_FILE)) {
  console.error(`
[x] local fixture missing - no ${SESSIONS_FILE}
` +
    `    Run:  npx tsx scripts/local-fixture.ts
` +
    `    Then start the worker with:  scripts/local-worker.sh
`);
  process.exit(2);
}
const S = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
const b = await launchChromium();

let pass = 0, fail = 0;
const results = [];
function A(round, label, ok, note = '') {
  ok ? pass++ : fail++;
  results.push({ round, label, ok, note });
  console.log(`  ${ok ? 'PASS' : '**FAIL**'}  [${round}] ${label}${note ? '  — ' + note : ''}`);
}

async function open(sid, w = 1440, path = '/home/') {
  const c = await b.newContext({ viewport: { width: w, height: 1400 } });
  if (sid) await c.addCookies([
    { name: 'thi_session', value: sid, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
    { name: 'thi_signed_in', value: '1', domain: '127.0.0.1', path: '/', sameSite: 'Lax' },
  ]);
  const p = await c.newPage();
  const hosts = new Set();
  p.on('request', r => hosts.add(new URL(r.url()).host));
  await p.goto(B + path, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  return { p, c, hosts };
}

const scrape = p => p.evaluate(() => {
  const q = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  return {
    // score / band / delta / verdict
    band: q('[data-band-label]')?.textContent?.trim() ?? null,
    verdict: q('.dash-verdict')?.textContent?.trim() ?? null,
    delta: q('[data-delta]')?.textContent?.trim() ?? null,
    coverage: q('[data-coverage]')?.textContent?.trim() ?? null,
    caveat: q('.dash-caveat')?.textContent?.trim() ?? null,
    ring: !!q('.score-ring, [data-score-ring], svg'),
    methodologyLinks: all('a[href="/methodology/home-stress-index/"]').length,
    publicView: q('.dash-links a[href^="/dashboard/"]')?.getAttribute('href') ?? null,
    // identity / geography
    email: q('[data-account-email]')?.textContent?.trim() ?? null,
    address: q('[data-address]')?.textContent?.trim() ?? null,
    precision: q('[data-precision-note]')?.textContent?.trim() ?? null,
    signOut: !!q('form[action="/api/auth/sign-out/"] button'),
    deleteLink: q('a[href="/privacy/#your-account"]')?.textContent?.trim() ?? null,
    // event card
    event: !!q('[data-alert]'),
    eventText: q('[data-alert]')?.innerText ?? '',
    eventSource: /Source:/.test(q('[data-alert]')?.innerText ?? ''),
    eventGoesAway: /goes away when the\s+condition does/i.test((q('[data-alert]')?.innerText ?? '').replace(/\s+/g, ' ')),
    // this week
    openCount: q('[data-open-count]')?.textContent?.trim() ?? null,
    reminders: all('[data-reminder]').length,
    doneBtns: all('[data-action="complete"]').length,
    snoozeBtns: all('[data-action="snooze"]').length,
    skipBtns: all('[data-action="skip"]').length,
    lastDoneInRow: all('[data-due]').some(e => /last done/i.test(e.textContent)),
    snoozedNote: q('[data-snoozed]')?.textContent?.trim() ?? null,
    addReminder: !!q('[data-add-reminder] select') && !!q('[data-add-reminder] button'),
    allClear: q('[data-all-clear]')?.textContent?.trim() ?? null,
    buckets: all('[data-bucket]').map(e => e.dataset.bucket),
    // municipal
    muni: !!q('[data-municipal]'),
    collStatus: q('[data-muni-collection]')?.dataset.status ?? null,
    collDay: q('[data-collection-day]')?.textContent?.trim() ?? null,
    collWeek: q('[data-collection-week]')?.textContent?.trim() ?? null,
    collWithheld: q('[data-collection-withheld]')?.textContent?.trim() ?? null,
    waterStatus: q('[data-muni-watering]')?.dataset.status ?? null,
    waterStage: q('[data-water-stage]')?.textContent?.trim() ?? null,
    waterDay: q('[data-water-day]')?.textContent?.trim() ?? null,
    waterStale: q('[data-water-stale]')?.textContent?.trim() ?? null,
    bulk: q('[data-bulk-entitlement]')?.textContent?.trim() ?? null,
    bulkText: q('[data-muni-bulk]')?.innerText ?? '',
    muniText: q('[data-municipal]')?.innerText ?? '',
    muniSources: all('[data-municipal] .muni-source').length,
    withheldPanels: all('.citysvc-withheld').length,
    citysvcCount: q('[data-citysvc-count]')?.textContent?.trim() ?? null,
    // signals
    signals: all('[data-signal]').length,
    signalIds: all('[data-signal]').map(e => e.dataset.signal),
    signalValues: all('[data-signal] [data-value]').map(e => e.textContent.trim()),
    signalBands: all('[data-signal] [data-band]').map(e => e.textContent.trim()),
    signalSources: all('[data-signal] .sig-source').map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    sparks: all('[data-spark]').length,
    whys: all('[data-why]').length,
    actions: all('[data-action-text]').map(e => e.textContent.trim()),
    normalNoAction: all('[data-signal]').filter(c => /Normal/.test(c.querySelector('[data-band]')?.textContent || '')).every(c => !c.querySelector('[data-action-text]')),
    unavailableSignals: all('[data-signal][data-computable="no"]').map(e => ({
      id: e.dataset.signal,
      value: e.querySelector('[data-value]')?.textContent?.trim(),
      band: e.querySelector('[data-band]')?.textContent?.trim(),
    })),
    trackBtns: all('[data-action-reminder] button').length,
    // keep zone
    history: all('[data-history-item]').length,
    noHistory: !!q('[data-no-history]'),
    seasonal: all('.v2-bullet-list li').length,
    prefs: all('[data-alert-pref]').length,
    prefChecked: all('[data-pref]').map(e => e.checked),
    accountStrip: !!q('[data-account-strip]'),
    // page
    noindex: !!q('meta[name="robots"][content*="noindex"]'),
    h1: all('h1').length,
    height: document.body.scrollHeight,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    fonts: document.fonts.size,
    fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').length,
    h1Font: getComputedStyle(document.querySelector('h1, .dash-verdict')).fontFamily.split(',')[0].replace(/["']/g, ''),
    queueMonoFont: q('.queue-meta') ? getComputedStyle(q('.queue-meta')).fontFamily.split(',')[0].replace(/["']/g, '') : null,
    valueFont: q('.sig-value') ? getComputedStyle(q('.sig-value')).fontFamily.split(',')[0].replace(/["']/g, '') : null,
  };
});

const BANNED = ["fix","repair","repairs","replace","replacement","install","installation","contractor","contractors","roofer","plumber","technician","professional","quote","quotes","estimate","estimates","bid","bids","claim","claims","insurance","adjuster","warranty","hire","damaged","damage"];
const DAY_WORDS = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;

console.log('\n══ POPULATED AUSTIN HOME (78704, 1001 W Milton St) ══');
{
  // Complete one reminder first: "last done" can only render for a home that
  // has actually marked something done. Otherwise the assertion below would be
  // testing the fixture, not the page.
  const { p, c } = await open(S.POP);
  const id = await p.evaluate(() => document.querySelector('[data-reminder]')?.dataset.reminder);
  if (id) await p.evaluate(async (rid) => {
    const fd = new FormData(); fd.append('reminder_id', rid); fd.append('action', 'complete'); fd.append('days', '3');
    await fetch('/api/reminders/action/', { method: 'POST', body: fd });
  }, id);
  await c.close();
}
const { p: pp, c: pc, hosts: phosts } = await open(S.POP);
const r = await scrape(pp);

// ---- Round 4.1 ----
A('4.1', 'nav "My Home" → /home/ and logged-out chrome hidden',
  await pp.evaluate(() => document.querySelector('[data-nav-signed-in]:not([hidden]) .nav-cta')?.getAttribute('href') === '/home/'
    && !!document.querySelector('[data-nav-signed-out][hidden]')));
A('4.1', 'five signals present', r.signals === 5, r.signalIds.join(','));
A('4.1', 'Normal band carries no action', r.normalNoAction);
const hit = BANNED.find(w => new RegExp(`\\b${w}\\b`, 'i').test(r.actions.join(' ')));
A('4.1', `banned-phrase guard over ${r.actions.length} rendered actions`, !hit, hit ? `HIT: ${hit}` : 'none');
// The two event-card assertions moved to their own block below (Round 9c).
// They ran here, against POP, and could only pass while an Austin condition
// happened to be active - which it is not, so they sat red for three rounds.
// The FIRED fixture account carries a deterministic one instead.
A('4.1', '"Track this" buttons present', r.trackBtns > 0, `${r.trackBtns}`);
A('4.1', 'own-county precision note present', !!r.precision && /describe the area/.test(r.precision));
A('4.1', 'noindex on the logged-in view', r.noindex);
A('4.1', 'fonts loaded 6/6, Newsreader display + Plex Mono queue meta',
  r.fonts === 6 && r.fontsLoaded === 6 && r.h1Font === 'Newsreader' && r.queueMonoFont === 'IBM Plex Mono',
  `${r.fontsLoaded}/${r.fonts} display=${r.h1Font} queue=${r.queueMonoFont}`);

// ---- Round 4.2 ----
A('4.2', 'no horizontal scroll at 1440px', !r.hScroll);
A('4.2', 'reminder rows have no dead gap (grid pairs them)',
  await pp.evaluate(() => {
    const it = document.querySelector('.queue-item');
    const t = it?.querySelector('.queue-title'), a = it?.querySelector('.queue-actions');
    if (!t || !a) return false;
    const gap = a.getBoundingClientRect().left - t.getBoundingClientRect().right;
    return gap < 200;
  }));
A('4.2', 'prose measures capped (verdict ≤ 62ch equivalent)',
  await pp.evaluate(() => {
    const v = document.querySelector('.dash-verdict');
    const fs = parseFloat(getComputedStyle(v).fontSize);
    return Math.round(v.getBoundingClientRect().width / (fs * 0.5)) <= 66;
  }));

// ---- Round 5 ----
A('5', 'reminders render with Done / Remind me / Skip',
  r.reminders > 0 && r.doneBtns === r.reminders && r.snoozeBtns === r.reminders && r.skipBtns === r.reminders,
  `${r.reminders} rows`);
A('5', 'open-count line present', !!r.openCount && /open/.test(r.openCount), r.openCount);
A('5', 'last-done shown on a reminder row', r.lastDoneInRow);
A('5', 'due buckets rendered', r.buckets.length > 0, r.buckets.join(','));
A('5', 'add-a-reminder form present', r.addReminder);
A('5', 'alert preference toggles present', r.prefs === 4, `${r.prefs}`);
A('5', '"what your home remembers" present', r.history > 0 || r.noHistory);
A('5', 'seasonal guidance present', r.seasonal > 0, `${r.seasonal} items`);
A('5', 'sign out present', r.signOut);
A('5', 'delete-my-data link present', !!r.deleteLink);
A('5', 'account email rendered', !!r.email);
A('5', 'public view link for this ZIP', r.publicView === '/dashboard/78704/', r.publicView);
A('5', 'methodology link present (score never without it)', r.methodologyLinks >= 1, `${r.methodologyLinks}`);

// ---- Round 5b ----
A('5b', 'municipal card present', r.muni);
A('5b', 'collection day + A/B week shown for a matched address',
  r.collStatus === 'found' && r.collDay === 'Tuesday' && r.collWeek === 'Week B',
  `${r.collDay} / ${r.collWeek}`);
A('5b', 'no recycling DATE invented from the week letter', !/recycling (is|falls) on \w+day/i.test(r.muniText));
A('5b', 'watering shows stage with customer-conditional framing',
  r.waterStatus === 'current' && r.waterStage === 'Conservation Stage' && /If your home is an Austin Water customer/i.test(r.waterDay ?? ''),
  `${r.waterStage}`);
A('5b', 'watering parity correct (1001 is odd → Friday)', /odd number/.test(r.waterDay ?? '') && /Friday/.test(r.waterDay ?? ''));
A('5b', 'never asserts the watering day IS this home\'s', !/your watering day is/i.test(r.muniText));
A('5b', 'bulk is an entitlement, never a date',
  r.bulk === '3 pickups a year' && !DAY_WORDS.test(r.bulkText) && !/\b\d{4}-\d{2}-\d{2}\b/.test(r.bulkText));
A('5b', 'municipal provenance lines render', r.muniSources === 3, `${r.muniSources}`);
A('5b', 'no city host requested on the serving path',
  [...phosts].every(h => !/austintexas\.gov/i.test(h)), [...phosts].join(','));

// signals detail
A('5b', 'every signal keeps source · data-through · updated',
  r.signalSources.length === 5 && r.signalSources.every(s => /Source:/.test(s) && /Updated/.test(s)),
  `${r.signalSources.length}/5`);
A('7', 'sparklines only where an honest series exists', r.sparks > 0 && r.sparks <= 5, `${r.sparks}/5`);
A('7', '"Why this reading" disclosure retained', r.whys === 5, `${r.whys}`);
A('7', 'exactly one h1', r.h1 === 1, `${r.h1}`);
A('7', 'mono tabular figures on signal values', r.valueFont === 'IBM Plex Mono', r.valueFont);
const popHeight = r.height;
await pc.close();

console.log('\n══ AUSTIN HOME THAT WITHHOLDS TRASH (999 Nowhere St) ══');
{
  const { p, c } = await open(S.NOTRASH);
  const x = await scrape(p);
  A('5b', 'collection withheld, no day anywhere', x.collStatus === 'withheld' && x.collDay === null);
  A('5b', 'withheld chip reads "Not shown"', x.collWithheld === 'Not shown', x.collWithheld);
  A('5b', 'withheld state explains why and routes forward',
    /couldn't find this address/i.test(x.muniText) && /Look your address up/i.test(x.muniText));
  A('7', 'withhold renders as a designed inset panel, not a blank',
    x.withheldPanels >= 1, `${x.withheldPanels} inset panel(s)`);
  A('7', 'city-services counter states how many are shown', !!x.citysvcCount, x.citysvcCount);
  A('5b', 'watering still shown for this home', x.waterStatus === 'current');
  await c.close();
}

console.log('\n══ SAN ANTONIO HOME (78205) ══');
{
  const { p, c } = await open(S.SA);
  const x = await scrape(p);
  A('5b', 'collection withheld + watering unavailable',
    x.collStatus === 'withheld' && x.waterStatus === 'unavailable');
  A('5b', 'Austin day / stage / bulk never shown to SA',
    x.collDay === null && x.waterStage === null && x.bulk === null);
  A('5b', 'no weekday named anywhere in the municipal card', !DAY_WORDS.test(x.muniText));
  A('5b', 'says municipal data is Austin-only', /Austin-only/i.test(x.muniText));
  A('4.1', 'withheld HVAC visibly ABSENT, not zero',
    x.unavailableSignals.length === 1 && x.unavailableSignals[0].id === 'hvac'
      && x.unavailableSignals[0].value === '—' && /Not published/i.test(x.unavailableSignals[0].band),
    JSON.stringify(x.unavailableSignals));
  A('4.1', 'weight coverage stated when a signal is withheld',
    !!x.coverage && /80%/.test(x.coverage), x.coverage);
  A('4.1', 'still five signal rows (the withheld one is present, not dropped)', x.signals === 5);
  A('5b', 'SA signals keep their provenance too',
    x.signalSources.filter(s => /Source:/.test(s)).length >= 4, `${x.signalSources.length}`);
  await c.close();
}

console.log('\n══ STALE WATERING STATE ══');
{
  // Round 9: repo-relative, so the replay is not tied to one machine's
  // absolute path. `path` is shadowed deliberately inside this block.
  const path = pathMod.resolve(pathMod.dirname(fileURLToPath(import.meta.url)),
    '..', '..', 'dist', 'client', 'data', 'stress-index', 'austin.json');
  const saved = fs.readFileSync(path, 'utf8');
  const a = JSON.parse(saved);
  a.municipal.waterStage.observedAt = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z';
  fs.writeFileSync(path, JSON.stringify(a, null, 2));
  const { p, c } = await open(S.POP);
  const x = await scrape(p);
  A('5b', 'stale keeps the last known stage', x.waterStatus === 'stale' && x.waterStage === 'Conservation Stage');
  A('5b', 'stale is marked with its as-of date', /Last confirmed/i.test(x.waterStale ?? ''));
  A('5b', 'stale drops the watering day', x.waterDay === null);
  A('7', 'stale chip is visually distinct from a live one',
    await p.evaluate(() => !!document.querySelector('.citysvc-chip--stale')));
  await c.close();
  fs.writeFileSync(path, saved);
}

console.log('\n══ EMPTY / ALL-CLEAR REMINDERS ══');
{
  // Clear this account's reminders through the API so the empty state is real.
  const { p, c } = await open(S.EMPTY);
  const ids = await p.evaluate(() => [...document.querySelectorAll('[data-reminder]')].map(e => e.dataset.reminder));
  for (const id of ids) {
    await p.evaluate(async (rid) => {
      const fd = new FormData(); fd.append('reminder_id', rid); fd.append('action', 'snooze'); fd.append('days', '30');
      await fetch('/api/reminders/action/', { method: 'POST', body: fd });
    }, id);
  }
  await c.close();
  const { p: p2, c: c2 } = await open(S.EMPTY);
  const x = await scrape(p2);
  A('5', 'all-clear state renders when nothing is due',
    x.reminders === 0 && !!x.allClear, `"${x.allClear}" (${x.reminders} rows)`);
  A('5', 'snoozed count explained, due date not moved',
    !!x.snoozedNote && /does not move the due/i.test(x.snoozedNote), x.snoozedNote?.slice(0, 60));
  A('5', 'add-a-reminder still offered in the all-clear state', x.addReminder);
  await c2.close();
}

console.log('\n══ CONDITION CARD (FIRED fixture account) ══');
{
  // Round 9c. This home's area is `fixture-condition`, whose artifact the local
  // fixture writes into dist/ (uncommittable - see scripts/fixture-condition.ts).
  // The alert copy in it is EXTRACTED from src/lib/account/alerts.ts, not
  // written by the fixture, so the honesty assertions below still test the
  // product's sentences. `alertcopyunit.ts` proves that extraction is faithful
  // and checks every alert template, firing or not.
  if (!S.FIRED) {
    console.error('\n[x] no FIRED session - the fixture predates Round 9c. Run: npm run fixture\n');
    process.exit(2);
  }
  const { p, c } = await open(S.FIRED);
  const e = await p.evaluate(() => {
    const card = document.querySelector('[data-alert]');
    return {
      present: !!card,
      cards: document.querySelectorAll('[data-alert]').length,
      text: card?.innerText ?? '',
      hasSource: /Source:/.test(card?.innerText ?? ''),
      hasTime: !!card?.querySelector('time[datetime]'),
      checklist: card?.querySelectorAll('li').length ?? 0,
      h2: card?.querySelector('h2')?.innerText ?? '',
    };
  });
  A('4.1', 'event card present and area-honest',
    e.present && /area/i.test(e.text) && !/at your (home|address|house)/i.test(e.text),
    e.present ? e.h2 : 'no card rendered');
  A('4.1', 'event card states it goes away when the condition does',
    /goes away when the\s+condition does/i.test(e.text.replace(/\s+/g, ' ')));
  A('9c', 'exactly one condition card, sourced and dated',
    e.cards === 1 && e.hasSource && e.hasTime, `${e.cards} card(s)`);
  A('9c', 'the card carries its checklist', e.checklist >= 3, `${e.checklist} item(s)`);
  await c.close();
}

console.log('\n══ PUBLIC ZIP DASHBOARD UNTOUCHED ══');
{
  const { p, c } = await open(null, 1440, '/dashboard/78704/');
  // Round 9c. This used to pin `verdict === 391px`. That number was never a
  // layout fact: `.dash-score-read` is a `flex: 0 1 auto` item, so its width is
  // its widest child's MAX-CONTENT width, and that child is the verdict
  // sentence - "Conditions across Austin scored 46 of 100 (Moderate)." The 391
  // was the rendered width of that sentence with the band word `Elevated`;
  // Austin's score fell below the Elevated edge of 50 and the word became
  // `Moderate`, which measures 397.72px. Nothing moved. One word got wider.
  //
  // So the assertion now pins what is actually structural - the signal card and
  // the score row, neither of which depends on the copy - and asserts that the
  // verdict FITS: no overflow, inside the row, within its own prose cap. Then
  // it re-measures under every band label the index can produce, so a future
  // band change cannot break it again.
  const BAND_WORDS = ['Calm', 'Settled', 'Normal', 'Moderate', 'Elevated', 'Severe'];
  const x = await p.evaluate((bands) => {
    const q = s => document.querySelector(s);
    const v = q('.dash-verdict');
    const row = q('.dash-score-row');
    const original = v.textContent;

    const fits = () => {
      const vr = v.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      const cap = parseFloat(getComputedStyle(v).maxWidth) || Infinity;
      return {
        noOverflow: v.scrollWidth <= v.clientWidth + 1,
        insideRow: vr.right <= rr.right + 1 && vr.left >= rr.left - 1,
        underCap: vr.width <= cap + 1,
        w: Math.round(vr.width),
      };
    };

    const perBand = {};
    for (const band of bands) {
      // Swap only the band word, leaving the sentence otherwise intact.
      v.textContent = original.replace(/\(([^)]*)\)\.\s*$/, `(${band}).`);
      const f = fits();
      perBand[band] = f;
    }
    v.textContent = original;

    return {
      cards: document.querySelectorAll('.signal-card').length,
      rows: document.querySelectorAll('.sig-row').length,
      homeDash: document.querySelectorAll('.home-dash').length,
      v2: document.querySelectorAll('[class*="v2-"]').length,
      signalCardW: Math.round(q('.signal-card').getBoundingClientRect().width),
      scoreRowW: Math.round(row.getBoundingClientRect().width),
      live: fits(),
      bandWord: (original.match(/\(([^)]*)\)\.\s*$/) || [])[1] ?? '(none)',
      perBand,
    };
  }, BAND_WORDS);

  A('4.2', 'public page still uses SignalCard, not the v2 table',
    x.cards === 5 && x.rows === 0, `${x.cards} cards / ${x.rows} rows`);
  A('4.2', 'no .home-dash or v2 classes leaked to the public page',
    x.homeDash === 0 && x.v2 === 0, `home-dash=${x.homeDash} v2=${x.v2}`);
  A('4.2', 'public layout unchanged (signal card 351px, score row 611px)',
    x.signalCardW === 351 && x.scoreRowW === 611,
    `card=${x.signalCardW} row=${x.scoreRowW}`);
  A('4.2', 'verdict fits its container as rendered',
    x.live.noOverflow && x.live.insideRow && x.live.underCap,
    `band=${x.bandWord} w=${x.live.w}px`);
  const bad = BAND_WORDS.filter(b => {
    const f = x.perBand[b];
    return !(f.noOverflow && f.insideRow && f.underCap);
  });
  A('4.2', 'verdict still fits under every band word the index can produce',
    bad.length === 0,
    bad.length ? `breaks on: ${bad.join(', ')}`
               : BAND_WORDS.map(b => `${b}=${x.perBand[b].w}px`).join(' '));
  await c.close();
}

console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
fs.writeFileSync('/tmp/r7results.json', JSON.stringify({ pass, fail, popHeight, results }, null, 2));
await b.close();
process.exit(fail === 0 ? 0 : 1);
