import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DemoState } from "../../packages/shared/src/model";

test.skip(
  process.env.CT_ISOLATED_BROWSER !== "1",
  "Run using tests/e2e/run-isolated.mjs",
);
const origin = "http://127.0.0.1:5177";

async function loginAdmin(page: Page) {
  const { login, password, teacherId } = JSON.parse(
    readFileSync("/tmp/ct-browser-isolated.json", "utf8"),
  );
  const request = page.context().request;
  const session = await request.post(origin + "/api/session", {
    data: { login, password },
    headers: { Origin: origin },
  });
  expect(session.ok()).toBeTruthy();
  const { csrfToken } = await session.json();
  const headers = { Origin: origin, "X-CSRF-Token": csrfToken };
  const readState = async (): Promise<DemoState> =>
    (await request.get(origin + "/api/state")).json();
  return { teacherId, headers, request, readState };
}

test("后台半月工资单调整、确认及 SO 对账共用结果", async ({ page }) => {
  const { teacherId, headers, request, readState } = await loginAdmin(page);
  const teacher = (await readState()).teachers.find((t) => t.id === teacherId)!;
  const send = async (command: unknown) => {
    const response = await request.post(origin + "/api/commands", {
      headers,
      data: { requestId: randomUUID(), command },
    });
    expect(response.status(), await response.text()).toBe(201);
  };
  await send({
    type: "teacher.save",
    teacher: { ...teacher, startDate: "", payMode: "NP" },
  });
  await send({ type: "halfPay.officeRate", so: teacher.so, rate: 60 });
  await page.goto(origin + "/payroll");
  await expect(
    page.getByRole("heading", { name: "薪资", exact: true }),
  ).toBeVisible();
  await page.getByLabel("结算周期").click();
  await page.getByRole("option", { name: "2025/01/01 – 2025/01/15" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: teacher.name })
    .getByRole("button", { name: "查看工资单" })
    .click();
  const dialog = page.getByRole("dialog", { name: teacher.name + " · 工资单" });
  await dialog.getByLabel(/金额（加款/).fill("300");
  await dialog.getByLabel("调整原因").fill("验收补发");
  await dialog.getByRole("button", { name: "添加调整" }).click();
  await expect(dialog.getByLabel("老师应结", { exact: true })).toContainText(
    "₱300",
  );
  await dialog.getByRole("button", { name: "确认薪资" }).click();
  await expect(
    dialog.getByRole("button", { name: "标记已发放" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "标记已发放" }).click();
  await expect(dialog.getByRole("button", { name: "标记已发放" })).toBeHidden();
  await dialog.getByRole("button", { name: "关闭" }).click();
  const statusFilter = page.getByRole("combobox", { name: "确认状态" });
  await statusFilter.click();
  await page.getByRole("option", { name: "待确认" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: teacher.name }),
  ).toHaveCount(0);
  await statusFilter.click();
  await page.getByRole("option", { name: "已确认" }).click();
  await page.getByRole("tab", { name: "SO 汇总" }).click();
  const group = page.getByRole("row").filter({ hasText: teacher.so });
  await expect(group).toContainText("₱300");
  await group.getByRole("button", { name: "查看老师明细" }).click();
  const paidRow = page.getByRole("row").filter({ hasText: teacher.name });
  await expect(paidRow).toContainText("已确认");
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出数据" }).click();
  const csv = readFileSync((await (await downloadReady).path())!, "utf8");
  const records = csv.trim().split(/\r?\n/).slice(1);
  expect(records).toHaveLength(1);
  expect(records[0]).toContain(teacher.name);
  expect(records[0]).toContain("已确认");
  expect(records[0]).toContain("300");
  await page.setViewportSize({ width: 390, height: 844 });
  await paidRow.getByRole("button", { name: "查看工资单" }).click();
  await expect(dialog.getByLabel("老师应结", { exact: true })).toContainText(
    "₱300",
  );
  await expect(dialog.getByText("已发放", { exact: true })).toBeVisible();
  expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "关闭" }).click();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("tab", { name: "课时单价" }).click();
  for (const [tab, name, price] of [
    ["老师单价", teacher.name, "210"],
    ["SO 单价", teacher.so, "70"],
  ]) {
    await page.getByRole("tab", { name: tab }).click();
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "编辑" }).click();
    const editor = page.getByRole("dialog", { name: "编辑课时单价" });
    await editor.getByRole("spinbutton").fill(price);
    await editor.getByRole("button", { name: "保存" }).click();
    await expect(row).toContainText("₱" + price);
  }
  await page.getByRole("tab", { name: "薪资规则" }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("复购奖金（₱）").fill("1234");
  await page.getByRole("button", { name: "保存规则" }).click();
  await expect(page.getByRole("button", { name: "编辑", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("复购奖金（₱）")).toHaveValue("1234");
});

test("离职日历按可用空间展开，可选未来计薪日期并立即离职", async ({ page }) => {
  const { headers, request, readState } = await loginAdmin(page);
  const template = (await readState()).teachers[0];
  const teacherId = randomUUID();
  const name = "固定底薪验收";
  const teacher = {
    ...template,
    id: teacherId,
    name,
    startDate: "",
    rate: 180,
    payMode: "OP",
    availabilityFrom: "",
    availabilitySource: "entered",
    tags: [],
    materialIds: [],
    availability: Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "19:00",
      end: "19:30",
    })),
  };
  const response = await request.post(origin + "/api/commands", {
    headers,
    data: {
      requestId: randomUUID(),
      command: { type: "teacher.save", teacher },
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  await page.goto(origin + "/teachers/" + teacherId);
  await page.getByRole("button", { name: "离职", exact: true }).click();
  const modal = page
    .getByRole("dialog")
    .filter({ has: page.getByLabel("计薪结束时间") });
  const field = modal.getByLabel("计薪结束时间");
  const initial = await field.inputValue();
  const offsetDate = (n: number) => {
    const date = new Date(initial + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
  };
  const calendar = page.getByRole("dialog", { name: "选择日期", exact: true });
  await field.click();
  await expect(
    calendar.getByRole("button", { name: offsetDate(-1) }),
  ).toBeDisabled();
  const box = await calendar.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await calendar.getByRole("button", { name: offsetDate(1) }).click();
  await expect(field).toHaveValue(offsetDate(1));
  await modal.getByRole("textbox", { name: /离职原因/ }).fill("隔离验收");
  await modal.getByRole("button", { name: "确认离职" }).click();
  await expect(modal).toBeHidden();
  await expect
    .poll(async () =>
      (await readState()).teachers.find((t) => t.id === teacherId),
    )
    .toMatchObject({
      status: "已离职",
      payrollEndDate: offsetDate(1),
    });
  await page.goto(origin + "/payroll");
  await page.getByPlaceholder("搜索老师", { exact: true }).fill(name);
  await page
    .getByRole("row")
    .filter({ hasText: name })
    .getByRole("button", { name: "查看工资单" })
    .click();
  const statement = page.getByRole("dialog", { name: name + " · 工资单" });
  await expect(
    statement.getByLabel("老师应结", { exact: true }),
  ).not.toHaveText("₱0");
  await expect(
    statement.getByRole("row").filter({ hasText: initial }).first(),
  ).toBeVisible();
});

test("长表单上方日期向下弹，下方日期向上弹，弹层可选择", async ({ page }) => {
  const { teacherId } = await loginAdmin(page);
  await page.goto(origin + "/teachers/" + teacherId);
  await page.getByRole("button", { name: "编辑资料" }).click();
  const field = page.getByPlaceholder("开课日期");
  const calendar = page.getByRole("dialog", { name: "选择日期", exact: true });
  await field.focus();
  for (const [top, side] of [
    [540, "top"],
    [145, "bottom"],
  ] as const) {
    await field.evaluate((element, top) => {
      const body = element.closest(".overlay-body")!;
      body.scrollTop += element.getBoundingClientRect().top - top;
    }, top);
    const input = (await field.boundingBox())!;
    expect(Math.abs(input.y - top)).toBeLessThan(4);
    await page.mouse.click(input.x + 24, input.y + input.height / 2);
    await expect(calendar).toHaveAttribute("data-side", side);
    const box = await calendar.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    const day = calendar
      .getByRole("button", { name: /^\d{4}-\d{2}-15$/ })
      .first();
    const selected = await day.getAttribute("aria-label");
    await day.click();
    await expect(field).toHaveValue(selected!);
  }
});
