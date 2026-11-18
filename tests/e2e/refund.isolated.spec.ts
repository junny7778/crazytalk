import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { emptyStudentProfile } from "../../packages/shared/src/model";
test.skip(process.env.CT_ISOLATED_BROWSER !== "1", "Use node tests/e2e/run-isolated.mjs for isolated fixtures");
const origin = "http://127.0.0.1:5177";
test("隔离业务共享退款确认与持久化", async ({ page, request }) => {
  const credentials = JSON.parse(
    readFileSync("/tmp/ct-browser-isolated.json", "utf8"),
  );
  await request.post(origin + "/api/session", {
    data: { login: credentials.login, password: credentials.password },
    headers: { Origin: origin },
  });
  const me = await (await request.get(origin + "/api/me")).json();
  const send = async (command: unknown) => {
    const r = await request.post(origin + "/api/commands", {
      headers: { Origin: origin, "X-CSRF-Token": me.csrfToken },
      data: { command, requestId: randomUUID() },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).data;
  };
  let data = await send({
    type: "student.create",
    student: {
      ...emptyStudentProfile(),
      name: "退款甲",
      chineseName: "退款甲",
    },
  });
  const a = data.students[0].id;
  data = await send({
    type: "student.create",
    student: {
      ...emptyStudentProfile(),
      name: "退款乙",
      chineseName: "退款乙",
    },
  });
  const b = data.students[0].id;
  const order = randomUUID();
  await send({
    type: "order.buy",
    id: order,
    studentId: a,
    studentIds: [a],
    units: 72,
    date: "2026-11-18",
    kind: "新购",
    note: "隔离验收",
  });
  await send({ type: "order.join", orderId: order, studentId: b });
  await page.goto(origin + "/students/" + a);
  await page.getByLabel("账号", { exact: true }).fill(credentials.login);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("link", { name: "排课管理", exact: true }).click();
  await page.getByRole("button", { name: "安排课程", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto(origin + "/students/" + a + "?tab=courses");
  await expect(
    page.getByRole("heading", { name: "退款甲", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "概述信息", exact: true }).click();
  await page.getByRole("button", { name: "关联账号", exact: true }).click();
  const binding = page.getByRole("dialog");
  await binding.getByLabel("ClassIn 账号", { exact: true }).fill("13900000000");
  await binding
    .getByLabel("新账号初始密码", { exact: true })
    .fill("Testing123!");
  await expect(
    binding.getByRole("button", { name: "注册/获取 UID", exact: true }),
  ).toBeDisabled();
  await binding.getByRole("checkbox").check();
  await expect(
    binding.getByRole("button", { name: "注册/获取 UID", exact: true }),
  ).toBeEnabled();
  await binding.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("tab", { name: "课时与续费", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "共享课时" }),
  ).toContainText("退款乙");
  await page.locator("summary").filter({ hasText: "更多操作" }).click();
  await page
    .getByRole("button", { name: "退款后停用服务", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("账号共享课时清零");
  await expect(dialog).toContainText("退款甲");
  await expect(dialog).toContainText("退款乙");
  await page.screenshot({
    path: "test-results/shared-refund-confirmation.png",
    fullPage: true,
  });
  await dialog.getByRole("checkbox").check();
  await dialog.locator("textarea").fill("账号退款验收");
  await dialog
    .getByRole("button", { name: "确认停用服务", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.reload();
  data = await (await request.get(origin + "/api/state")).json();
  for (const id of [a, b])
    expect(
      data.students.find((s: { id: string }) => s.id === id),
    ).toMatchObject({ balance: 0, status: "退费" });
  expect(
    data.credits.filter(
      (c: { type: string; orderId: string }) =>
        c.type === "退费" && c.orderId === order,
    ),
  ).toHaveLength(1);
});
