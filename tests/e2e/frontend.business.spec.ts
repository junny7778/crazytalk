import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const credentials = JSON.parse(readFileSync("apps/api/.env.browser-test.json", "utf8"));

test("教务从页面建档购课，刷新后查询真实余额和流水", async ({ page, browser }) => {
  const name = "业务验收" + Date.now();
  await page.goto("http://127.0.0.1:5175");
  await page.getByLabel("账号", { exact: true }).fill(credentials.login);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("link", { name: "学员中心", exact: true }).click();
  await page.getByRole("button", { name: "新建学员", exact: true }).click();
  const profile = page.getByRole("dialog");
  await profile.getByLabel("学生中文名", { exact: true }).fill(name);
  await profile.getByRole("button", { name: "保存并加课时", exact: true }).click();
  const credit = page.getByRole("dialog");
  await expect(credit).toContainText("购买课时");
  await credit.getByRole("button", { name: "确认加 72 课时", exact: true }).click();
  await expect(credit).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "课时与续费", exact: true }).click();
  await expect(page.getByText("72 课时", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "test-results/business-student-credit.png", fullPage: true });
  await page.getByRole("tab", { name: "概述信息", exact: true }).click();
  await page.getByRole("button", { name: "生成专属链接", exact: true }).click();
  const surveyLink = page.getByRole("link", { name: "打开专属问卷", exact: true });
  await expect(surveyLink).toBeVisible();
  const publicContext = await browser.newContext();
  const survey = await publicContext.newPage();
  await survey.goto((await surveyLink.getAttribute("href"))!);
  await expect(survey.getByRole("heading", { name: "外教匹配信息收集问卷" })).toBeVisible();
  const { matchingSurveyQuestions } = await import("../../packages/shared/src/studentSurvey");
  for (const question of matchingSurveyQuestions) {
    if (question.options && question.required) await survey.getByRole("radio", { name: question.options[0], exact: true }).check();
  }
  await survey.getByRole("button", { name: "提交", exact: true }).click();
  await expect(survey.getByRole("heading", { name: "已收到学员资料" })).toBeVisible();
  await publicContext.close();
  await page.reload();
  await expect(page.getByText("已填写", { exact: true })).toBeVisible();
});

test("老师独立登录、完成培训并刷新保留结果", async ({ browser, request }) => {
  const { createSeed } = await import("../../packages/shared/src/seed");
  const { execFileSync } = await import("node:child_process");
  const { resolve } = await import("node:path");
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const login = "teacher-e2e-" + id;
  const password = "Test-" + randomUUID();
  const admin = await request.post("/api/session", { data: credentials, headers: { Origin: "http://127.0.0.1:5175" } });
  expect(admin.ok()).toBeTruthy();
  const identity = await (await request.get("/api/me")).json();
  const teacher = { ...createSeed().teachers[0], id, name: "老师验收" + id.slice(0, 6), phone: "", tmAccountId: "" };
  const created = await request.post("/api/commands", {
    headers: { Origin: "http://127.0.0.1:5175", "X-CSRF-Token": identity.csrfToken },
    data: { command: { type: "teacher.save", teacher }, requestId: randomUUID() },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  execFileSync("pnpm", ["exec", "tsx", "src/create-teacher-account.ts"], {
    cwd: resolve("apps/api"),
    env: { ...process.env, TEACHER_ID: id, ACCOUNT_LOGIN: login, ACCOUNT_PASSWORD: password },
    stdio: "pipe",
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/teacher");
  await page.getByLabel("账号", { exact: true }).fill(login);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText(teacher.name + "，你好")).toBeVisible();
  await page.reload();
  await expect(page.getByText(teacher.name + "，你好")).toBeVisible();
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await page.getByRole("button", { name: /^培训/ }).click();
  await page.getByRole("button", { name: "开始培训", exact: true }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await page.getByRole("button", { name: "开始测验", exact: true }).click();
  await page.getByRole("radio", { name: "检查耳机和麦克风" }).check();
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.getByText("麦克风设置 · 100 分", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await page.getByRole("button", { name: /^培训/ }).click();
  await expect(page.getByText("已完成", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/business-teacher-login.png", fullPage: true });
  await page.getByRole("button", { name: "消息", exact: true }).click();
  await page.getByRole("button", { name: "全部标为已读", exact: true }).click();
  await expect(page.locator(".teacher-message-unread")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "消息", exact: true }).click();
  await expect(page.locator(".teacher-message-unread")).toHaveCount(0);
  await page.getByRole("button", { name: "打开菜单", exact: true }).click();
  await page.getByRole("button", { name: "账号", exact: true }).click();
  await page.getByRole("button", { name: "修改密码", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const nextPassword = "New1!" + randomUUID().slice(0, 8);
  await dialog.getByLabel("当前密码", { exact: true }).fill(password);
  await dialog.getByLabel("新密码", { exact: true }).fill(nextPassword);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByLabel("账号", { exact: true }).fill(login);
  await page.getByLabel("密码", { exact: true }).fill(nextPassword);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText(teacher.name + "，你好")).toBeVisible();
  await context.close();
});
