// Run only against an isolated source copy and its own Vite server.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const [copy, url] = process.argv.slice(2);
assert(copy && url, 'Usage: node scripts/verify-business-hmr.mjs ISOLATED_COPY URL');
assert.notEqual(realpathSync(copy), realpathSync(process.cwd()), 'Do not mutate the working application');
assert(['127.0.0.1', 'localhost'].includes(new URL(url).hostname));
const model = join(resolve(copy), 'packages/shared/src/model.ts');
const original = readFileSync(model, 'utf8');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext();
  const credentials = JSON.parse(readFileSync('apps/api/.env.browser-test.json', 'utf8'));
  const login = await context.request.post(`${url}/api/session`, {
    data: credentials, headers: { Origin: 'http://127.0.0.1:5175' },
  });
  assert.equal(login.status(), 201);
  const pages = [];
  const pulses = [0, 0];
  let errors = 0;
  for (let i = 0; i < 2; i++) {
    const page = await context.newPage();
    await page.exposeFunction('diagnosticPulse', () => pulses[i]++);
    await page.addInitScript(() => setInterval(() => window.diagnosticPulse(), 250));
    page.on('pageerror', () => errors++);
    page.on('console', event => {
      if (event.text().includes('already been passed to createRoot')) errors++;
    });
    await page.goto(`${url}/settings?tab=org`);
    await page.locator('.settings-shell').waitFor({ timeout: 20000 });
    pages.push(page);
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    writeFileSync(model, original + `\n// isolated HMR regression ${cycle}\n`);
    await delay(6000);
    const before = [...pulses];
    await delay(2000);
    for (let i = 0; i < 2; i++) {
      assert(pulses[i] - before[i] >= 4, `Page ${i}: main thread stalled`);
      await pages[i].locator('.settings-shell').waitFor({ timeout: 5000 });
    }
    assert.equal(errors, 0, 'Runtime errors or duplicate React roots after HMR');
    console.log(`PASS cycle ${cycle + 1}: both pages responsive, no runtime errors or duplicate roots`);
  }
  for (const page of pages) {
    await page.getByRole('button', { name: '返回工作台', exact: true }).or(page.getByRole('link', { name: '返回工作台', exact: true })).click({ timeout: 5000 });
    await page.getByRole('link', { name: '学员中心', exact: true }).click({ timeout: 5000 });
    await page.waitForURL('**/students', { timeout: 5000 });
  }
  console.log('PASS navigation: both pages reached students after HMR');
} finally {
  await browser.close();
  writeFileSync(model, original);
}
