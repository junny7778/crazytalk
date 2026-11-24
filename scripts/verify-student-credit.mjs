#!/usr/bin/env node
import { chromium, expect } from "@playwright/test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.env.CT_DEMO_URL || "http://127.0.0.1:5173";
const evidenceRoot = resolve(".playwright/verify-crazytalk");
await mkdir(evidenceRoot, { recursive: true });
const evidence = await mkdtemp(`${evidenceRoot}/student-credit-`);
console.log(`Evidence: ${evidence}`);

const name = `验证学员${Date.now()}`;
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(origin);
  await expect(page).toHaveTitle("Crazy Talk · 教务运营");
  await expect(page.getByRole("link", { name: "数据看板", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "学员中心", exact: true }).click();
  await page.getByRole("button", { name: "新建学员", exact: true }).click();

  const profile = page.getByRole("dialog", { name: "新建学员" });
  await profile.getByLabel("学生中文名", { exact: true }).fill(name);
  await profile.getByRole("button", { name: "保存并加课时", exact: true }).click();
  const purchase = page.getByRole("dialog");
  const confirm = purchase.getByRole("button", { name: "确认加 72 课时", exact: true });
  await expect(confirm).toBeEnabled();
  await writeFile(`${evidence}/before-purchase.aria.txt`, await purchase.ariaSnapshot());
  await confirm.click();
  await expect(purchase).toBeHidden();

  const profileUrl = page.url();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const balance = page.getByTitle("查看课时明细", { exact: true });
  await expect(balance).toContainText("72 课时");
  await page.reload();
  await expect(page).toHaveURL(profileUrl);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(balance).toContainText("72 课时");
  await page.getByRole("tab", { name: "课时与续费", exact: true }).click();

  const order = page.getByRole("row").filter({
    has: page.getByRole("link", { name, exact: true }),
  });
  await expect(order.getByRole("cell", { name: "72 课时", exact: true })).toBeVisible();
  const ledger = page.locator("section").filter({
    has: page.getByRole("heading", { name: "课时与充值明细", exact: true }),
  });
  const entry = ledger.getByRole("row").filter({
    has: page.getByRole("cell", { name: name, exact: true }),
  });
  await expect(entry).toHaveCount(1);
  await expect(entry.getByRole("button", { name: "新购", exact: true })).toBeVisible();
  await expect(entry.getByRole("cell", { name: "+72", exact: true })).toBeVisible();
  await expect(entry.getByRole("cell", { name: "72", exact: true })).toBeVisible();

  const result = [
    `学员中心 → 新建学员 ${name} → 保存并加课时 → 确认加 72 课时 → 刷新`,
    profileUrl,
    await balance.ariaSnapshot(),
    await order.ariaSnapshot(),
    await entry.ariaSnapshot(),
  ];
  await writeFile(`${evidence}/result.txt`, `${result.join("\n\n")}\n`);
  await ledger.screenshot({ path: `${evidence}/ledger.png` });
  console.log("PASS 新建学员并购买 72 课时，刷新后档案余额、订单余额和新购流水一致");
} finally {
  await browser.close();
}
