// Local diagnostic harness; captures no request bodies, cookies, or storage contents.
import { chromium } from '@playwright/test';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const selfTest = process.argv.includes('--self-test');
const url = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:5175';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Local URLs only');
const dir = join(homedir(), '.crazytalk/logs', `hang-${Date.now()}`);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const log = (event, details = {}) => appendFileSync(join(dir, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), event, ...details }) + '\n');
const context = await chromium.launchPersistentContext(process.env.CT_CAPTURE_PROFILE || join(dir, 'profile'), {
  channel: 'chrome', headless: selfTest, viewport: null,
  args: [`--js-flags=--prof --prof-sampling-interval=5000 --logfile=${dir}/v8.log`],
});
const browser = context.browser();
const browserCDP = await browser.newBrowserCDPSession();
const page = context.pages()[0];
let lastPulse = Date.now();
let visible = true;
await context.exposeBinding('__ctDiagnosticPulse', (_, pulse) => {
  lastPulse = Date.now();
  visible = pulse.visible;
  log('pulse', pulse);
});
await context.addInitScript(() => {
  setInterval(() => window.__ctDiagnosticPulse({
    visible: document.visibilityState === 'visible',
    heapBytes: performance.memory?.usedJSHeapSize,
    path: location.pathname,
  }), 1000);
});
const session = await context.newCDPSession(page);
await session.send('Performance.enable');
const version = await browserCDP.send('Browser.getVersion');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const diff = execFileSync('git', ['diff', '--stat'], { encoding: 'utf8' });
writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ url, selfTest, version, revision, diff }, null, 2));
let segment = 0;
let traceFile;
session.on('Tracing.dataCollected', ({ value }) => {
  for (const event of value) appendFileSync(traceFile, JSON.stringify(event) + '\n');
});
async function startTrace() {
  traceFile = join(dir, `trace-${++segment}.jsonl`);
  await session.send('Tracing.start', {
    categories: 'devtools.timeline,v8,disabled-by-default-devtools.timeline,disabled-by-default-v8.cpu_profiler',
    transferMode: 'ReportEvents',
  });
}
async function endTrace() {
  const complete = new Promise(resolve => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.end');
  await complete;
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('CDP timed out after 5s')), 5000);
    })]);
  } finally { clearTimeout(timer); }
}
await startTrace();
await page.goto(selfTest ? 'data:text/html,<h1>Diagnostic self-test</h1>' : url);
console.log(`CAPTURE_READY ${dir}`);
log('ready');
let running = true;
let stalled = false;
let traceActive = true;
let lastRotation = Date.now();
let processIds = [];
context.on('close', () => { running = false; });
page.on('close', () => { log('page-closed'); running = false; });
page.on('crash', () => { log('page-crashed'); running = false; });
process.on('SIGINT', () => { running = false; });
// OS sampling is independent of the page event loop and CDP responsiveness.
const processTimer = setInterval(() => {
  if (!processIds.length) return;
  try {
    const rows = execFileSync('ps', ['-p', processIds.join(','), '-o', 'pid=,pcpu=,rss=,comm='], { encoding: 'utf8' });
    log('processes', { rows });
  } catch (error) { log('process-sample-ended', { code: error.status }); }
}, 1000);
try {
  if (selfTest) await page.evaluate(() => setTimeout(() => {
    const until = performance.now() + 8000;
    while (performance.now() < until) Math.sqrt(Math.random());
  }, 2500));
  const started = Date.now();
  while (running) {
    await delay(1000);
    if (!running) break;
    const gapMs = Date.now() - lastPulse;
    if (visible && gapMs > 4000 && !stalled) {
      stalled = true;
      log('stall', { gapMs });
      console.log('STALL_CAPTURED — keep this window open; evidence is being saved.');
      try { await bounded(endTrace()); } catch (error) { log('trace-stop-failed', { message: error.message }); }
      traceActive = false;
    }
    if (stalled && gapMs < 2000) {
      log('recovered');
      if (selfTest) break;
      stalled = false;
      await bounded(startTrace());
      traceActive = true;
      lastRotation = Date.now();
    }
    if (!stalled) {
      try {
        const { processInfo } = await bounded(browserCDP.send('SystemInfo.getProcessInfo'));
        processIds = processInfo.map(p => p.id);
        log('process-map', { processInfo });
        const { metrics } = await bounded(session.send('Performance.getMetrics'));
        log('metrics', { metrics });
        if (Date.now() - lastRotation >= 10000) {
          await bounded(endTrace());
          traceActive = false;
          await bounded(startTrace());
          traceActive = true;
          lastRotation = Date.now();
        }
      } catch (error) { log('cdp-unresponsive', { message: error.message }); }
    }
    if (selfTest && Date.now() - started > 25000) throw new Error('Self-test did not capture and recover from stall');
  }
} finally {
  clearInterval(processTimer);
  if (traceActive) {
    try { await bounded(endTrace()); } catch (error) { log('trace-stop-failed', { message: error.message }); }
  }
  await context.close();
}
console.log(selfTest ? 'SELF_TEST_PASS: stall and recovery captured' : `CAPTURE_SAVED ${dir}`);
