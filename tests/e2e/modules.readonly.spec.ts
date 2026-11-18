import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const credentials = JSON.parse(readFileSync("apps/api/.env.browser-test.json", "utf8"));

test("业务管理模块只读导航、学员导出与刷新", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(credentials.login);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  for (const name of ["学员中心", "老师中心", "排课管理", "上课记录", "反馈", "薪资", "数据看板"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("Failed to fetch", { exact: false })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "学员中心", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出数据", exact: true }).click();
  const file = await download;
  expect(await file.failure()).toBeNull();
  await file.saveAs("test-results/business-students-export.xlsx");
  await page.screenshot({ path: "test-results/business-students-readonly.png", fullPage: true });
});
