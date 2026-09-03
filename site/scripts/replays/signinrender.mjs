import { launchChromium } from './browser.mjs';
const B='http://127.0.0.1:9400';
const b=await launchChromium();
let pass=0,fail=0;
const A=(l,c,n='')=>{c?pass++:fail++;console.log(`  ${c?'PASS':'**FAIL**'}  ${l}${n?'  — '+n:''}`)};
for (const w of [1440, 380]) {
  const c=await b.newContext({viewport:{width:w,height:1200}});
  const p=await c.newPage();
  await p.goto(B+'/home/sign-in/',{waitUntil:'networkidle'});
  await p.evaluate(()=>document.fonts.ready);
  const s=await p.evaluate(()=>{
    const consent=document.querySelector('[data-consent]');
    const weekly=document.querySelector('[data-weekly-optin]');
    return {
      consentChecked: consent?.checked, consentRequired: consent?.required,
      weeklyPresent: !!weekly, weeklyChecked: weekly?.checked, weeklyRequired: weekly?.required,
      weeklyName: weekly?.getAttribute('name'), weeklyValue: weekly?.getAttribute('value'),
      order: [...document.querySelectorAll('.notify-consent input')].map(i=>i.getAttribute('name')),
      text: document.querySelector('.notify-consent--optional')?.innerText ?? '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h1: document.querySelectorAll('h1').length,
      submits: document.querySelectorAll('form button[type=submit]').length,
    };
  });
  console.log(`══ ${w}px ══`);
  A('weekly box present', s.weeklyPresent);
  A('UNCHECKED by default', s.weeklyChecked === false);
  A('not required — skipping it is a complete answer', s.weeklyRequired === false);
  A('posts weekly=yes', s.weeklyName==='weekly' && s.weeklyValue==='yes');
  A('account consent still required and unchecked', s.consentRequired===true && s.consentChecked===false);
  A('consent first, weekly second', JSON.stringify(s.order)===JSON.stringify(['consent','weekly']), s.order.join(','));
  A('names the cadence and the way out', /One message a week/.test(s.text) && /turn it off/.test(s.text));
  A('no horizontal scroll', s.overflow<=0, `${s.overflow}px`);
  A('one h1, one submit', s.h1===1 && s.submits===1);
  await c.close();
}
await b.close();
console.log(`\n═══ ${pass} passed, ${fail} failed ═══`);
process.exit(fail?1:0);
