import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const dir = "docs/evidence/scheduling-materials-20261121";
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5173/schedule?student=10000004");
  await page.locator(".roster-person.selected").waitFor();
  await page.getByRole("button", { name: "绑定账号", exact: true }).click();
  await page
    .getByPlaceholder("手机号或邮箱")
    .fill("scheduling-ui-review@example.com");
  await page.getByRole("button", { name: "核实账号", exact: true }).click();
  await page.getByRole("button", { name: "确认关联", exact: true }).click();
  await page.getByRole("button", { name: "一键排课", exact: true }).click();
  await page.getByLabel("开始日期", { exact: true }).fill("2026-11-23");
  await page.getByRole("button", { name: "周一", exact: true }).click();
  await page.getByRole("button", { name: "周三", exact: true }).click();
  await page.screenshot({ path: dir + "/auto-settings.png", fullPage: true });
  await page.getByRole("button", { name: "生成排课方案", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "推荐排课方案", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".schedule-match-card").first()).toContainText(
    "推荐原因",
  );
  await page.screenshot({ path: dir + "/recommendations.png", fullPage: true });
  await page
    .getByRole("button", { name: "查看排课方案", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "学员固定课表", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: dir + "/auto-calendar.png", fullPage: true });
  await page.getByRole("tab", { name: "查看课表", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核对排课", exact: true }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "操作排课", exact: true }).click();
  await page.getByRole("button", { name: "返回调整", exact: true }).click();
  await page.getByRole("button", { name: "返回概况", exact: true }).click();
  if (await page.getByRole("dialog", { name: "放弃本次修改？" }).count())
    await page
      .getByRole("button", { name: "放弃本次修改", exact: true })
      .click();
  await page.getByRole("button", { name: "自定义排课", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "自定义排课日历" }),
  ).toBeVisible();
  await page.screenshot({ path: dir + "/custom-calendar.png", fullPage: true });
  await page.locator(".flex-time-cell.available").first().click();
  await page.locator("[role=dialog] .flex-teacher-choice").first().click();
  await page.getByRole("button", { name: "加入课表", exact: true }).click();
  await page.getByRole("button", { name: "预览排课", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "自定义排课预览" }),
  ).toContainText("Think 1");
  await page.screenshot({ path: dir + "/custom-review.png", fullPage: true });
  await page.getByRole("button", { name: "确认排课", exact: true }).click();
  await expect(page.getByText(/已为.*安排/).first()).toBeVisible();
  await page.getByRole("tab", { name: "按老师排课", exact: true }).click();
  await page.getByRole("button", { name: "为该老师排课", exact: true }).click();
  await page.getByLabel("搜索待排学员").fill("林可欣");
  await page.screenshot({
    path: dir + "/teacher-calendar.png",
    fullPage: true,
  });
  await page.getByRole("tab", {name:"查看课表",exact:true}).click();
  await page.locator(".flex-booked").first().click();
  await expect(page.getByRole("dialog", {name:"课程详情",exact:true})).toBeVisible();
  await page.screenshot({path:dir+"/course-detail.png",fullPage:true});
  await page.getByRole("dialog", {name:"课程详情",exact:true}).getByRole("button", {name:"关闭",exact:true}).first().click();
  await page.getByRole("tab", {name:"操作排课",exact:true}).click();
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    )
    .toBe(false);
  await page.screenshot({ path: dir + "/narrow-calendar.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173/students/10000004?tab=courses");
  const arrangement = page.locator(".sc-arrangement-summary");
  await expect(arrangement).toContainText("学习教材");
  const beforeStudent = await arrangement
    .locator("div")
    .filter({ hasNot: page.locator("dt", { hasText: "学习教材" }) })
    .allTextContents();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await page
    .getByRole("group", { name: "学习教材", exact: true })
    .getByRole("checkbox", { name: "Power Up 1", exact: true })
    .check();
  await page.getByRole("button", { name: "保存学员资料", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(arrangement).toContainText("Power Up 1");
  expect(
    await arrangement
      .locator("div")
      .filter({ hasNot: page.locator("dt", { hasText: "学习教材" }) })
      .allTextContents(),
  ).toEqual(beforeStudent);
  await page.screenshot({
    path: dir + "/student-materials.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:5173/teachers/t1");
  await expect(
    page.getByRole("button", { name: "编辑资料", exact: true }),
  ).toBeVisible();
  const originalFields = await page
    .locator(".teacher-detail-section dl > div")
    .filter({ hasNot: page.locator("dt", { hasText: "可授教材" }) })
    .allTextContents();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  const teacherBooks = page.getByRole("group", {
    name: "可授教材",
    exact: true,
  });
  const power3 = teacherBooks.getByRole("checkbox", {
    name: "Power Up 3",
    exact: true,
  });
  await power3.setChecked(!(await power3.isChecked()));
  await page.getByRole("button", { name: "保存老师", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page
      .locator(".teacher-detail-section dl > div")
      .filter({ hasNot: page.locator("dt", { hasText: "可授教材" }) })
      .allTextContents(),
  ).toEqual(originalFields);
  await page.screenshot({
    path: dir + "/teacher-materials.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    dir + "/browser-checks.txt",
    "PASS 自动排课设置、卡片展开、方案日历、查看/操作切换、自定义选时选老师、预览、确认本地课程、按老师学员卡片及已排课程详情、900px无页面溢出、老师及学员教材使用原编辑入口、保存后原资料字段一致、无浏览器页面错误。\n仅本地Demo；账号关联使用开发服务器的模拟查询，无真实ClassIn调用。\n",
  );
  await writeFile(dir + "/initial-page-errors.json", JSON.stringify(errors));
} catch (e) {
  await page.screenshot({ path: dir + "/failure.png", fullPage: true });
  console.log((await page.locator("body").innerText()).slice(-3500));
  throw e;
} finally {
  await browser.close();
}
