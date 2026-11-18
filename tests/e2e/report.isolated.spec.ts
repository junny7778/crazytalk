import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
test.skip(process.env.CT_ISOLATED_BROWSER !== "1", "Use node tests/e2e/run-isolated.mjs for isolated fixtures");
const origin = "http://127.0.0.1:5177";
test("隔离老师结课报告与教务同图读取", async ({ page, request }) => {
  const c = JSON.parse(readFileSync("/tmp/ct-browser-isolated.json", "utf8"));
  await request.post(origin + "/api/session", {
    data: { login: c.login, password: c.password },
    headers: { Origin: origin },
  });
  await page.goto(origin + "/teacher");
  await page.getByLabel("账号", { exact: true }).fill(c.teacherLogin);
  await page.getByLabel("密码", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator(".teacher-lesson-row").first().click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "ending.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nZsAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  const note = "跨端浏览器验收" + Date.now();
  await page.locator("textarea").fill(note);
  await page.getByRole("button", { name: "提交结课", exact: true }).click();
  await expect(
    page.getByText("课后记录已提交，谢谢！", { exact: true }),
  ).toBeVisible();
  const state = await (await request.get(origin + "/api/state")).json();
  const report = state.reports.find(
    (r: { comment: string }) => r.comment === note,
  );
  expect(report).toBeTruthy();
  expect(report.screenshot).toBeTruthy();
  expect((await request.get(origin + report.screenshot)).ok()).toBeTruthy();
  await page.context().clearCookies();
  await page.goto(origin + "/students/" + report.studentId + "?tab=courses");
  await page.getByLabel("账号", { exact: true }).fill(c.login);
  await page.getByLabel("密码", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/report-cross-role.png",
    fullPage: true,
  });
});
