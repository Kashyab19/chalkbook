import { strict as assert } from 'node:assert';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/Users/nikash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = 'https://os.kashyab.xyz';
const browser = await chromium.launch({headless:true,executablePath:process.env.GYM_BROWSER_EXECUTABLE||'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',args:process.env.GYM_DEPLOYMENT_IP?[`--host-resolver-rules=MAP os.kashyab.xyz ${process.env.GYM_DEPLOYMENT_IP}`]:[]});
try {
 const context = await browser.newContext({viewport:{width:390,height:844}});
 const page = await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const response=await page.goto(origin);assert.equal(response.status(),200);
 await page.getByLabel('Account name',{exact:true}).first().waitFor();
 await page.evaluate(()=>navigator.serviceWorker.ready);
 assert.equal(await page.evaluate(()=>window.isSecureContext),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'outputs/deployment-sign-in.png',fullPage:true});
 await context.setOffline(true);await page.reload();await page.getByLabel('Account name',{exact:true}).first().waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS deployed HTTPS browser shell, phone layout, private sign-in screen and offline shell reload; no workout data changed');
} finally {await browser.close()}
