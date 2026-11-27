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
  await page.getByLabel("搜索老师").fill(teacher.name);
  await page
    .getByRole("row")
    .filter({ hasText: teacher.name })
    .getByRole("link", { name: "查看工资单" })
    .click();
  expect(new URL(page.url()).pathname).toBe("/payroll/2025-01-1/" + teacherId);
  const statement = page.getByRole("region", { name: "工资单详情" });
  const title = statement.getByRole("heading", { name: teacher.name + " · 工资单", level: 1 });
  await expect(title).toBeVisible();
  await page.reload();
  await expect(title).toBeVisible();
  await statement.getByRole("button", { name: "显示列" }).click();
  await statement.getByRole("checkbox", { name: "计算说明" }).check();
  await statement.getByRole("button", { name: "显示列" }).click();
  for (const [amount, reason] of [["306", "验收补发"], ["-6", "验收扣款"]]) {
    await statement.getByRole("button", { name: "人工调整", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "人工调整" });
    await editor.getByLabel(/金额（加款/).fill(amount);
    await editor.getByLabel("调整原因").fill(reason);
    await editor.getByRole("button", { name: "添加调整" }).click();
    await expect(editor).toBeHidden();
  }
  const detail = statement.getByRole("table", { name: "薪资明细" });
  await expect(statement.getByRole("table")).toHaveCount(1);
  await expect(detail.getByRole("row").filter({ hasText: "验收补发" })).toContainText("+₱306");
  await expect(detail.getByRole("row").filter({ hasText: "验收扣款" })).toContainText("-₱6");
  const detailFilter = statement.getByRole("combobox", { name: "明细状态" });
  await detailFilter.click();
  await page.getByRole("option", { name: "待核实" }).click();
  await expect(detail.getByText("没有符合该状态的明细。")).toBeVisible();
  await detailFilter.click();
  await page.getByRole("option", { name: "已计算" }).click();
  await expect(detail.getByRole("row").filter({ hasText: "验收扣款" })).toContainText("-₱6");
  await expect(statement.getByLabel("老师应结", { exact: true })).toContainText(
    "₱300",
  );
  await statement.getByRole("button", { name: "确认薪资" }).click();
  await expect(
    statement.getByRole("button", { name: "标记已发放" }),
  ).toBeVisible();
  await statement.getByRole("button", { name: "标记已发放" }).click();
  await expect(statement.getByRole("button", { name: "标记已发放" })).toBeHidden();
  await statement.getByRole("link", { name: "返回薪资列表" }).click();
  await expect(page.getByLabel("搜索老师")).toHaveValue(teacher.name);
  await expect(page.getByLabel("结算周期")).toHaveText("2025/01/01 – 2025/01/15");
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
  expect(records).toHaveLength(2);
  for (const [reason, amount] of [["验收补发", "306"], ["验收扣款", "-6"]]) {
    const record = records.find((record) => record.includes(reason));
    expect(record).toContain(teacher.name);
    expect(record).toContain("已确认");
    expect(record).toContain(',"' + amount + '","0"');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await paidRow.getByRole("link", { name: "查看工资单" }).click();
  await expect(statement.getByLabel("老师应结", { exact: true })).toContainText(
    "₱300",
  );
  await expect(statement.getByText("已发放", { exact: true })).toBeVisible();
  expect((await statement.boundingBox())!.width).toBeLessThanOrEqual(390);
  const directPage = await page.context().newPage();
  await directPage.goto(origin + "/payroll/2025-01-1/" + teacherId);
  await expect(directPage.getByRole("heading", { name: teacher.name + " · 工资单", level: 1 })).toBeVisible();
  await expect(directPage.getByLabel("老师应结", { exact: true })).toHaveText("₱300");
  await directPage.close();
  await statement.getByRole("link", { name: "返回薪资列表" }).click();
  await expect(page.getByLabel("确认状态")).toHaveText("已确认");
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

test("工资单按字段分列，可切换附加列并在窄屏横向查看", async ({ page }) => {
  const { teacherId, readState } = await loginAdmin(page);
  const data = await readState();
  const lesson = data.lessons.find(
    (lesson) =>
      lesson.status === "已完成" &&
      lesson.teacherId !== teacherId &&
      data.teachers.some(
        (teacher) => teacher.id === lesson.teacherId && !teacher.payMode,
      ),
  )!;
  const period =
    lesson.date.slice(0, 7) +
    (Number(lesson.date.slice(8)) <= 15 ? "-1" : "-2");
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto(origin + "/payroll/" + period + "/" + lesson.teacherId);
  const statement = page.getByRole("region", { name: "工资单详情" });
  const table = statement.getByRole("table", { name: "薪资明细" });
  const headers = table.getByRole("columnheader");
  await expect(headers).toHaveText([
    "计薪日期",
    "上课时间",
    "学员",
    "老师金额",
    "SO 金额",
    "计薪项目",
    "计薪数量",
    "明细状态",
    "操作",
  ]);
  const modeCell = page.getByRole("cell", {
    name: "未设置计薪方式",
    exact: true,
  });
  await expect(modeCell).toHaveCount(1);
  const config = table.getByRole("row").filter({ has: modeCell });
  await expect(config.getByRole("cell").first()).toHaveText("—");
  const course = table
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: lesson.time, exact: true }),
    })
    .filter({
      has: page.getByRole("cell", { name: lesson.date, exact: true }),
    })
    .filter({ hasText: "计薪方式待设置" });
  await expect(course.getByRole("cell").nth(1)).toHaveText(lesson.time);
  await expect(course.getByRole("cell").nth(3)).toHaveText("—");
  await expect(course.getByRole("cell").nth(4)).toHaveText("—");

  const showColumns = statement.getByRole("button", { name: "显示列" });
  await showColumns.click();
  await expect(statement.getByRole("checkbox", { name: "教材", exact: true })).toHaveCount(0);
  const teacherAmount = statement.getByRole("checkbox", { name: "老师金额", exact: true });
  await teacherAmount.uncheck();
  await expect(table.getByRole("columnheader", { name: "老师金额" })).toHaveCount(0);
  await teacherAmount.check();
  await expect(headers.nth(3)).toHaveText("老师金额");
  for (const column of ["课型", "课程时长", "课程状态", "老师单价", "SO 单价", "计薪比例", "计算说明", "来源"]) {
    await page.getByRole("checkbox", { name: column, exact: true }).check();
    await expect(
      table.getByRole("columnheader", { name: column, exact: true }),
    ).toBeVisible();
  }
  await showColumns.click();
  await expect(
    course.getByRole("cell", { name: lesson.status, exact: true }),
  ).toBeVisible();
  expect(
    await course.evaluate((row) => {
      const headers = row.closest("table")!.querySelectorAll("thead th");
      const cells = row.querySelectorAll("td");
      return (
        cells.length === headers.length &&
        Array.from(cells).every(
          (cell, index) =>
            Math.abs(
              cell.getBoundingClientRect().x -
                headers[index].getBoundingClientRect().x,
            ) < 1,
        )
      );
    }),
  ).toBe(true);

  const detailFilter = statement.getByRole("combobox", { name: "明细状态" });
  await detailFilter.click();
  await page.getByRole("option", { name: "待核实", exact: true }).click();
  await expect(detailFilter).toHaveText("待核实");
  await expect(config).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const scrollRegion = statement.getByRole("region", {
    name: "薪资明细滚动区",
  });
  await scrollRegion.hover();
  await page.mouse.wheel(2500, 0);
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const operation = (await table
    .getByRole("columnheader", { name: "操作" })
    .boundingBox())!;
  expect(operation.x + operation.width).toBeLessThanOrEqual(390);
  const source = config.getByRole("cell", { name: "老师资料" });
  expect(
    await source.evaluate((cell) => {
      const text = document.createRange();
      text.selectNodeContents(cell);
      return text.getClientRects().length;
    }),
  ).toBe(1);

  const review = page.getByRole("dialog", { name: "核实薪资明细" });
  await course.getByRole("button", { name: "核实", exact: true }).click();
  const fields = review.locator("dl dt");
  await expect(fields).toContainText(["上课时间", "待核项目", "核实说明", "操作"]);
  const columnsAlign = await fields.evaluateAll((labels) => {
    const rightColumn = labels[0].nextElementSibling!.getBoundingClientRect().left;
    return labels.every((label) => {
      const value = label.nextElementSibling!;
      const rect = value.getBoundingClientRect();
      return value.tagName === "DD" && rect.left === rightColumn &&
        label.getBoundingClientRect().right <= rect.left &&
        value.scrollWidth <= value.clientWidth && rect.right <= window.innerWidth;
    });
  });
  expect(columnsAlign).toBe(true);
  await expect(review.getByText("未设置计薪方式", { exact: true })).toBeVisible();
  await expect(
    review.getByRole("link", { name: "查看上课记录" }),
  ).toHaveAttribute("href", "/lessons?lesson=" + lesson.id);
  await review.getByRole("button", { name: "关闭" }).click();
  await expect(review).toBeHidden();
  await expect(course).toContainText("待核实");
  await config.getByRole("button", { name: "核实", exact: true }).click();
  await review.getByRole("link", { name: "设置计薪方式" }).click();
  const teacherEditor = page.getByRole("dialog", { name: "编辑老师" });
  await expect(
    teacherEditor.getByRole("combobox", { name: "计薪方式" }),
  ).toBeFocused();
  await teacherEditor.getByRole("button", { name: "取消", exact: true }).click();
  await expect(teacherEditor).toBeHidden();
  expect(new URL(page.url()).searchParams.has("edit")).toBe(false);

  await page.goBack();
  const officeRate = table.getByRole("row").filter({ hasText: "未设置 SO 单价" });
  await officeRate.getByRole("button", { name: "核实", exact: true }).click();
  await review.getByRole("link", { name: "设置 SO 单价" }).click();
  const rateEditor = page.getByRole("dialog", { name: "编辑课时单价" });
  await expect(rateEditor.getByRole("spinbutton")).toBeVisible();
});

test("工资单可以单独筛选等待结果，未结束的固定时段不能人工核实或提前确认", async ({ page }) => {
  const { readState, request, headers } = await loginAdmin(page);
  const teacher = {
    ...(await readState()).teachers[0], id: randomUUID(), name: "等待固定时段验收", payMode: "OP",
    startDate: "", availabilityFrom: "", availability: [{ day: 1, start: "19:00", end: "19:30" }],
  };
  const response = await request.post(origin + "/api/commands", {
    headers, data: { requestId: randomUUID(), command: { type: "teacher.save", teacher } },
  });
  expect(response.status(), await response.text()).toBe(201);
  const nextMonth = new Date();
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const period = nextMonth.toISOString().slice(0, 7) + "-1";
  await page.goto(origin + "/payroll/" + period + "/" + teacher.id);
  const detail = page.getByRole("region", { name: "工资单详情" });
  const filters = detail.getByRole("group", { name: "薪资明细筛选" });
  const select = filters.getByRole("combobox", { name: "明细状态" });
  const waiting = filters.getByRole("button", { name: /^等待结果 \d+ 项$/ });
  await expect(waiting).toBeVisible();
  const selectBox = (await select.boundingBox())!;
  const waitingBox = (await waiting.boundingBox())!;
  expect(waitingBox.x).toBeGreaterThan(selectBox.x + selectBox.width);
  expect(waitingBox.y).toBeLessThan(selectBox.y + selectBox.height);
  await waiting.click();
  await expect(select).toHaveText("等待结果");
  const table = detail.getByRole("table", { name: "薪资明细" });
  await expect(table.getByRole("cell", { name: "等待结果", exact: true }).first()).toBeVisible();
  await expect(table.getByRole("button", { name: "核实", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "确认薪资" })).toBeDisabled();
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
    .getByRole("link", { name: "查看工资单" })
    .click();
  const statement = page.getByRole("region", { name: "工资单详情" });
  await expect(statement.getByRole("heading", { name: name + " · 工资单", level: 1 })).toBeVisible();
  await expect(
    statement.getByLabel("老师已计算小计", { exact: true }),
  ).toHaveText(/₱[1-9]/);
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
