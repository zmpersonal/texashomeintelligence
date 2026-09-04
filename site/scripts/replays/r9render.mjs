/** Round 9 — render-side checks for the pieces a green build cannot see. */
import { launchChromium } from './browser.mjs';
import fs from 'node:fs';
const B = 'http://127.0.0.1:9400';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Round 9. Session ids come from the local fixture, which lives beside the
// database it describes (site/.wrangler/state) so the two can never disagree.
// A missing fixture used to surface as `getComputedStyle(null)` three screens
// later; now it says exactly what to run.
const SESSIONS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.wrangler', 'state', 'sessions.json',
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
let pass=0, fail=0;
const A=(l,ok,n='')=>{ok?pass++:fail++;console.log(`  ${ok?'PASS':'**FAIL**'}  ${l}${n?'  — '+n:''}`)};

async function open(sid, w=1440, path='/home/') {
  const c = await b.newContext({ viewport:{width:w,height:1400} });
  if (sid) await c.addCookies([
    {name:'thi_session',value:sid,domain:'127.0.0.1',path:'/',httpOnly:true,sameSite:'Lax'},
    {name:'thi_signed_in',value:'1',domain:'127.0.0.1',path:'/',sameSite:'Lax'},
  ]);
  const p = await c.newPage();
  await p.goto(B+path,{waitUntil:'networkidle'});
  await p.evaluate(()=>document.fonts.ready);
  return {p,c};
}

console.log('\n══ WEEKLY-EMAIL CONTROL ON /home/ ══');
{
  const {p,c} = await open(S.POP);
  const st = await p.evaluate(()=>{
    const box = document.querySelector('[data-weekly]');
    const panel = document.querySelector('[data-weekly-pref]');
    return {
      present: !!box, checked: box?.checked ?? null, key: box?.dataset.weekly ?? null,
      text: panel?.innerText ?? '',
      alerts: document.querySelectorAll('[data-pref]').length,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1: document.querySelectorAll('h1').length,
    };
  });
  A('control renders (migration applied)', st.present);
  // Round 9c. This replay MUTATES the preference: it toggles it on below, and
  // its unsubscribe section later writes an explicit off-row for POP. The reset
  // lives in the fixture (local-fixture.ts deletes account_email_prefs,
  // weekly_email_sends and email_suppressions on every run) rather than in a
  // restore step here - a restore only runs when the replay finishes, and this
  // replay's whole history is of not finishing. So the failure mode to name is
  // "you did not re-run the fixture", not "the product regressed".
  A('OFF by default — a missing row is never opt-in', st.checked === false,
    st.checked === false ? '' : 'STALE FIXTURE? re-run: npm run fixture (worker stopped)');
  A('posts the pref key it was rendered with', st.key === 'weekly', st.key);
  A('names the cadence and the way out', /One email a week/.test(st.text) && /turn it back off/.test(st.text));
  A('separate from the four alert toggles', st.alerts === 4, `${st.alerts} alert toggles`);
  A('no horizontal scroll at 1440px', st.overflow <= 0, `${st.overflow}px`);
  A('still exactly one h1', st.h1 === 1);

  // Toggle it on and prove it survives a reload.
  await p.click('[data-weekly]');
  await p.waitForTimeout(500);
  await c.close();
  const {p:p2,c:c2} = await open(S.POP);
  const persisted = await p2.evaluate(()=>document.querySelector('[data-weekly]')?.checked === true);
  A('toggle persists across a reload', persisted,
    persisted ? '' : 'STALE FIXTURE? re-run: npm run fixture (worker stopped)');
  await c2.close();
}

console.log('\n══ MOBILE 380px ══');
{
  const {p,c} = await open(S.POP, 380);
  const st = await p.evaluate(()=>({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    visible: !!document.querySelector('[data-weekly]')?.offsetParent,
  }));
  A('no horizontal scroll at 380px', st.overflow <= 0, `${st.overflow}px`);
  A('control visible on mobile', st.visible);
  await c.close();
}

console.log('\n══ UNSUBSCRIBE PAGE ══');
{
  // A real signed token, taken from a dry run.
  const res = await fetch(`${B}/api/email/weekly-run/?dryRun=1`, {
    method:'POST', headers:{Authorization:'Bearer local-test-run-token','Content-Type':'application/json'},
  });
  // Round 9b. Without EMAIL_LINK_SIGNING_KEY and WEEKLY_RUN_TOKEN this endpoint
  // 404s with plain text, and `res.json()` used to die on "Unexpected token 'N'"
  // ten assertions in. Say what is missing instead.
  if (!res.ok) {
    console.error(`
[x] /api/email/weekly-run/ returned ${res.status} - the unsubscribe section cannot run.

    It needs two LOCAL TEST values in site/.dev.vars (gitignored, not secrets):

        EMAIL_LINK_SIGNING_KEY=<any string>
        WEEKLY_RUN_TOKEN=local-test-run-token

    WEEKLY_RUN_TOKEN must match the Bearer token above exactly. Restart the
    worker after writing the file.

    The ${pass} assertion(s) above all passed; only this section is blocked.
`);
    await b.close();
    process.exit(2);
  }
  const report = await res.json();
  const body = report.outcomes.find(o=>o.body)?.body ?? '';
  const token = (body.match(/\?t=(\S+)/)||[])[1];
  A('dry run produced a signed link', !!token, token ? token.slice(0,24)+'…' : 'none');

  const c = await b.newContext({viewport:{width:1440,height:1000}});
  const p = await c.newPage();
  await p.goto(`${B}/email/unsubscribe/?t=${token}`,{waitUntil:'networkidle'});
  const g = await p.evaluate(()=>({
    h1: document.querySelector('h1')?.innerText,
    h1s: document.querySelectorAll('h1').length,
    btn: document.querySelector('form button')?.innerText,
    noindex: document.querySelector('meta[name="robots"]')?.content ?? '',
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    says: document.body.innerText,
  }));
  A('GET renders a confirmation, does not unsubscribe', /Stop the weekly email/.test(g.h1||''), g.h1);
  A('one h1, and a real button', g.h1s===1 && /Unsubscribe me/.test(g.btn||''));
  A('noindex — a personal page', /noindex/.test(g.noindex), g.noindex);
  A('says what it does NOT stop', /sign-in links still work/.test(g.says));
  A('no horizontal scroll', g.overflow<=0, `${g.overflow}px`);

  await p.click('form button');
  await p.waitForLoadState('networkidle');
  const d = await p.evaluate(()=>document.querySelector('h1')?.innerText);
  A('the button unsubscribes', /You're unsubscribed/.test(d||''), d);
  await c.close();

  // And the page is honest about a token it cannot read.
  const c2 = await b.newContext(); const p2 = await c2.newPage();
  await p2.goto(`${B}/email/unsubscribe/?t=${token.slice(0,-1)}X`,{waitUntil:'networkidle'});
  A('GET with a mangled token says so', /didn't work/.test(await p2.evaluate(()=>document.querySelector('h1')?.innerText||'')));
  await c2.close();
}

await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail?1:0);
