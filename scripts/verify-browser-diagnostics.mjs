// Tests local diagnostic capture against an isolated Vite source copy.
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const [copy, url] = process.argv.slice(2);
assert(copy && url, 'Usage: node scripts/verify-browser-diagnostics.mjs ISOLATED_COPY URL');
assert.notEqual(realpathSync(copy),realpathSync(process.cwd()),'Use an isolated source copy');
assert(['localhost','127.0.0.1'].includes(new URL(url).hostname));
const b=await chromium.launch({channel:'chrome',headless:true});const c=await b.newContext();
const events=[];const statuses=[];
await c.route('**/__business-render-log',async r=>{events.push(r.request().postDataJSON());await r.continue();});
const p=await c.newPage();p.on('response',r=>{if(r.url().endsWith('/__business-render-log'))statuses.push(r.status())});
try {
 await c.request.post(`${url}/api/session`,{data:JSON.parse(readFileSync('apps/api/.env.browser-test.json')),headers:{Origin:'http://127.0.0.1:5175'}});
 await p.goto(`${url}/settings?tab=org`);await p.locator('.settings-shell').waitFor();
 await p.addScriptTag({content:`for(let i=0;i<25;i++) console.error('Maximum update depth exceeded PRIVATE-TEST-VALUE',new Error('PRIVATE-TEST-VALUE'));\n//# sourceURL=${url}/diagnostic-fixture.js`});
 await delay(1200);
 assert(events.some(x=>x.errorKind==='update-depth' && x.frames.length));
 assert(!JSON.stringify(events).includes('PRIVATE-TEST-VALUE'));
 assert(events.filter(x=>x.reason==='error').length<=2);
 assert(events.some(x=>x.request?.phase==='response' && x.request.status===200));
 assert.equal(p.workers().length,1);
 const f=join(copy,'apps/admin/src/lib/browserDiagnostics.ts');writeFileSync(f,readFileSync(f,'utf8')+'\n// diagnostic lifecycle verification\n');
 await delay(3500);
 assert.equal(p.workers().length,1,'diagnostic worker leaked after HMR');
 assert(events.some(x=>x.reason==='hmr-start'));
 assert(events.every(x=>x.version===2));
 assert.equal(new Set(events.map(x=>x.documentId)).size,1);
 assert(events.some(x=>x.reason==='hmr-end' && !x.hotUpdate));
 await p.evaluate(()=>setTimeout(()=>{const until=performance.now()+7500;while(performance.now()<until){}},100));
 await delay(9000);
 assert(events.some(x=>x.event==='main-thread-stall'));
 assert(events.some(x=>x.event==='main-thread-recovered'));
 assert(statuses.every(x=>x===204),JSON.stringify(statuses));
 console.log('PASS: request correlation, safe stack frames, error throttling, HMR completion, one worker after HMR, stall/recovery, server 204');
 console.log('event counts',Object.fromEntries([...new Set(events.map(x=>x.event))].map(k=>[k,events.filter(x=>x.event===k).length])));
}finally {await b.close();}
