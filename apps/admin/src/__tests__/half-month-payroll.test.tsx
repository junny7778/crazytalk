// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ToastProvider } from "@crazytalk/ui";
import { createSeed, permissionGroups, permissionLabels, superAdminRole, type Command } from "@crazytalk/shared";
import { halfMonthStatement, transition } from "@crazytalk/shared";
import HalfMonthPayroll from "../pages/operations/HalfMonthPayroll";

const context = vi.hoisted(() => ({ useDemo: vi.fn(), exportCsv: vi.fn() }));
vi.mock("../pages/operations/common", async (original) => ({
  ...(await original<typeof import("../pages/operations/common")>()),
  exportCsv: context.exportCsv,
}));
vi.mock("@crazytalk/shared/react", async (original) => ({
  ...(await original<typeof import("@crazytalk/shared/react")>()),
  useDemo: context.useDemo,
}));
afterEach(cleanup);

function PayrollRoutes() {
  return (
    <Routes>
      <Route path="/payroll" element={<HalfMonthPayroll />} />
      <Route path="/payroll/:period/:teacherId" element={<HalfMonthPayroll />} />
    </Routes>
  );
}

function statementDetail() {
  return within(screen.getByRole("region", { name: "工资单详情" }));
}

function showColumns(detail: ReturnType<typeof statementDetail>, ...columns: string[]) {
  const toggle = detail.getByRole("button", { name: "显示列" });
  fireEvent.click(toggle);
  for (const name of columns) {
    fireEvent.click(detail.getByRole("checkbox", { name }));
  }
  fireEvent.click(toggle);
}

it("shows one itemized half-month statement from payroll and SO reconciliation", async () => {
  let data = createSeed();
  const teacher = data.teachers[0];
  teacher.payMode = "NP";
  teacher.rate = 180;
  teacher.startDate = "";
  data.teachers = [teacher];
  data.officePayRates = { [teacher.so]: 60 };
  data.payroll = [];
  data.feedback = [];
  data.actions = [];
  data.lessons = [
    {
      ...data.lessons[0],
      id: "classin-lesson",
      teacherId: teacher.id,
      date: "2026-10-28",
      duration: 25,
      attendance: "正常",
      status: "已完成",
      teacherAttendance: ["正常"],
      studentAttendance: ["正常"],
      classInAttendanceReceived: true,
      requiresScreenshot: true,
    },
  ];
  function provider() {
    return {
      data,
      can: () => true,
      act: async (command: Command) => {
        const result = transition(data, command);
        data = result.data;
        view.rerender(tree());
        return result;
      },
    };
  }
  context.useDemo.mockImplementation(provider);
  const client = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/payroll"]}>
          <PayrollRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(screen.getByRole("link", { name: "查看工资单" }));
  let detail = statementDetail();
  expect(
    detail.getByRole("heading", { name: teacher.name + " · 工资单", level: 1 }),
  ).toBeTruthy();
  expect(detail.getByText("应结汇总")).toBeTruthy();
  expect(detail.getByRole("cell", { name: "2026-10-28" })).toBeTruthy();
  expect(
    detail.getByRole("link", { name: "查看上课记录" }).getAttribute("href"),
  ).toBe("/lessons?lesson=classin-lesson");
  expect(detail.getByLabelText("老师应结").textContent).toBe("₱180");
  expect(detail.getAllByRole("table")).toHaveLength(1);
  expect(detail.getAllByText("完课底薪")).toHaveLength(1);
  showColumns(detail, "计算说明");
  fireEvent.click(detail.getByRole("button", { name: "人工调整" }));
  const editor = within(screen.getByRole("dialog", { name: "人工调整" }));
  fireEvent.change(editor.getByLabelText(/金额（加款/), {
    target: { value: "300" },
  });
  fireEvent.change(editor.getByLabelText("调整原因"), {
    target: { value: "人工补发专项" },
  });
  fireEvent.click(editor.getByRole("button", { name: "添加调整" }));
  expect(await detail.findByText(/人工补发专项/)).toBeTruthy();
  expect(detail.getByLabelText("老师应结").textContent).toBe("₱480");
  fireEvent.click(detail.getByRole("link", { name: "返回薪资列表" }));
  fireEvent.click(screen.getByRole("tab", { name: "SO 汇总" }));
  fireEvent.click(screen.getByRole("button", { name: "查看老师明细" }));
  fireEvent.click(screen.getByRole("link", { name: "查看工资单" }));
  detail = statementDetail();
  showColumns(detail, "计算说明");
  expect(detail.getByLabelText("老师应结").textContent).toBe("₱480");
  expect(detail.getByText(/人工补发专项/)).toBeTruthy();
});

it("exports every matching teacher across pages and includes paid statements in confirmed totals", () => {
  const data = createSeed();
  const base = data.teachers[0];
  data.lessons = [];
  data.actions = [];
  data.feedback = [];
  data.orders = [];
  data.teachers = Array.from({ length: 29 }, (_, i) => ({
    ...base,
    id: "teacher-" + i,
    name: "外教 " + i,
    so: i === 27 ? "B" : "A",
    payMode: "NP",
    startDate: "",
  }));
  data.teachers[28].name = "其他老师";
  data.officePayRates = { A: 60, B: 60 };
  data.halfMonthPayroll = data.teachers
    .filter((_, i) => i !== 26)
    .map((t, i) => ({
      teacherId: t.id,
      period: "2026-10-2",
      adjustments: [
        {
          key: "adj-" + i,
          at: "2026-10-20",
          side: "teacher",
          amount: 10,
          note: "人工补发",
          operator: "教务",
        },
      ],
      status: i === 25 ? "已发放" : "已确认",
    }));
  context.useDemo.mockReturnValue({ data, can: () => true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/payroll"]}>
          <PayrollRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("搜索老师"), {
    target: { value: "外教" },
  });
  fireEvent.click(screen.getByLabelText("所属 SO"));
  fireEvent.click(screen.getByRole("option", { name: "A" }));
  fireEvent.click(screen.getByLabelText("确认状态"));
  fireEvent.click(screen.getByRole("option", { name: "已确认" }));
  expect(screen.getAllByRole("link", { name: "查看工资单" })).toHaveLength(
    25,
  );
  fireEvent.click(screen.getByRole("button", { name: "导出数据" }));
  const csv = context.exportCsv.mock.lastCall![1] as (string | number)[][];
  expect(csv.slice(1)).toHaveLength(26);
  expect(csv.at(-1)?.slice(1, 4)).toEqual(["外教 25", "A", "已确认"]);
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  fireEvent.click(screen.getByRole("link", { name: "查看工资单" }));
  expect(
    statementDetail().getByRole("heading", { name: "外教 25 · 工资单", level: 1 }),
  ).toBeTruthy();
  fireEvent.click(statementDetail().getByRole("link", { name: "返回薪资列表" }));
  expect(
    screen.getByRole("button", { name: "第 2 页" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.getByLabelText("搜索老师")).toHaveProperty("value", "外教");
  expect(screen.getByRole("combobox", { name: "所属 SO" }).textContent).toBe("A");
  expect(screen.getByRole("combobox", { name: "确认状态" }).textContent).toBe("已确认");
  fireEvent.click(screen.getByRole("tab", { name: "SO 汇总" }));
  const row = within(screen.getByText("26").closest("tr")!);
  expect(row.getByText("₱260")).toBeTruthy();
});

it("薪资权限组登记导出权限，只有查看权限的账号可以查看工资单", () => {
  expect(permissionGroups.find(group => group.name === "薪资")?.keys).toContain("payroll.export");
  expect(permissionLabels["payroll.export"]).toBe("导出薪资明细");
  expect(superAdminRole().permissions).toContain("payroll.export");
  context.useDemo.mockReturnValue({
    data: createSeed(), can: (key: string) => ["payroll.view", "field.pay_amount"].includes(key),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider><MemoryRouter initialEntries={["/payroll"]}><PayrollRoutes /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("结算周期")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "导出数据" })).toBeNull();
  fireEvent.click(screen.getAllByRole("link", { name: "查看工资单" })[0]);
  const detail = statementDetail();
  expect(detail.getByRole("table", { name: "薪资明细" })).toBeTruthy();
  for (const name of ["人工调整", "确认薪资", "标记已发放", "记录处理结果"]) {
    expect(detail.queryByRole("button", { name })).toBeNull();
  }
});

it("keeps an offboarded OP teacher's fixed pay visible up to the cutoff with no lessons", () => {
  const data = createSeed();
  data.teachers = [
    {
      ...data.teachers[0],
      id: "departed",
      name: "OP 老师",
      status: "已离职",
      startDate: "2026-10-01",
      availabilityFrom: "2026-10-01",
      payMode: "OP",
      rate: 180,
      so: "A",
      payrollEndDate: "2026-10-19",
      availability: [{ day: 1, start: "09:00", end: "09:30" }],
    },
  ];
  data.officePayRates = { A: 60 };
  data.lessons = [];
  context.useDemo.mockReturnValue({ data, can: () => true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/payroll"]}>
          <PayrollRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const row = screen.getByText("OP 老师").closest("tr")!;
  fireEvent.click(within(row).getByRole("link", { name: "查看工资单" }));
  expect(
    statementDetail().getByLabelText("老师应结").textContent,
  ).toBe("₱180");
  expect(
    statementDetail().getByText("2026-10-19"),
  ).toBeTruthy();
});

it("edits all payroll rules together and opens teacher and SO rates only on demand", async () => {
  const data = createSeed();
  const act = vi.fn().mockResolvedValue({ message: "已保存" });
  context.useDemo.mockReturnValue({ data, act, can: () => true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/payroll"]}>
          <PayrollRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "薪资规则" }));
  expect(screen.queryByLabelText("结算周期")).toBeNull();
  for (const [name, count] of [
    ["奖金", 4], ["缺席与取消", 5], ["迟到与早退", 3], ["差评扣款", 1],
  ] as const) {
    const section = within(screen.getByRole("region", { name }));
    expect(section.getByRole("heading", { name })).toBeTruthy();
    expect(section.getAllByRole("spinbutton")).toHaveLength(count);
  }
  const fields = screen.getAllByRole("spinbutton") as HTMLInputElement[];
  expect(fields).toHaveLength(13);
  expect(fields.every((input) => input.readOnly)).toBe(true);
  const amount = screen.getByLabelText("复购奖金（₱）") as HTMLInputElement;
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  expect(fields.every((input) => !input.readOnly)).toBe(true);
  fireEvent.change(amount, { target: { value: "1234" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(amount.value).toBe("1000");
  expect(act).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  fireEvent.change(amount, { target: { value: "1234" } });
  fireEvent.change(screen.getByLabelText("差评扣款比例（%）"), { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
  expect(act).toHaveBeenCalledWith({
    type: "halfPay.rules",
    values: { renewal: 1234, complaintRatio: 0.75 },
  });
  await waitFor(() => expect(amount.readOnly).toBe(true));
  fireEvent.click(screen.getByRole("tab", { name: "课时单价" }));
  expect(screen.queryByRole("spinbutton")).toBeNull();
  for (const [tab, key] of [
    ["老师单价", "halfPay.teacherRate"],
    ["SO 单价", "halfPay.officeRate"],
  ]) {
    fireEvent.click(screen.getByRole("tab", { name: tab }));
    fireEvent.click(screen.getAllByRole("button", { name: "编辑" })[0]);
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByRole("spinbutton"), {
      target: { value: "85" },
    });
    fireEvent.click(within(modal).getByRole("button", { name: "保存" }));
    expect(act).toHaveBeenCalledWith(
      expect.objectContaining({ type: key, rate: 85 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
});

function openLessonStatement(data: ReturnType<typeof createSeed>) {
  context.useDemo.mockReturnValue({ data, can: () => true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/payroll/2026-10-2/" + data.teachers[0].id]}>
          <PayrollRoutes />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return statementDetail();
}

function statementFixture() {
  const data = createSeed();
  const teacher = data.teachers[0];
  data.teachers = [teacher];
  teacher.payMode = "NP";
  teacher.startDate = "";
  teacher.rate = 180;
  data.officePayRates = { [teacher.so]: 60 };
  data.credits = [];
  data.orders = [];
  data.actions = [];
  data.feedback = [];
  const lesson = {
    ...data.lessons[0],
    teacherId: teacher.id,
    studentId: data.students[0].id,
    date: "2026-10-19",
    time: "09:00",
    duration: 25,
    material: "专项课本",
    status: "已完成" as const,
    attendance: "老师迟到" as const,
    incident: {
      reason: "老师迟到",
      minutes: 3,
      note: "",
      at: "",
      operator: "",
    },
  };
  data.lessons = [lesson];
  return { data, teacher, lesson };
}

it("逐课核对课酬、待核单价和扣款，只列该老师当期的课程", () => {
  const { data, lesson } = statementFixture();
  data.officePayRates = {};
  data.lessons.push({
    ...lesson,
    id: "outside",
    date: "2026-10-15",
  });
  const detail = openLessonStatement(data);
  expect(detail.getByText(/ · NP · PHP$/)).toBeTruthy();
  const table = within(detail.getByRole("table", { name: "薪资明细" }));
  expect(detail.getAllByRole("table")).toHaveLength(1);
  expect(
    table.getAllByRole("columnheader").map((header) => header.textContent),
  ).toEqual([
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
  expect(table.queryByText("2026-10-15")).toBeNull();
  expect(table.getAllByText("完课底薪")).toHaveLength(1);
  expect(table.getAllByText("迟到或早退扣款")).toHaveLength(1);
  const pay = within(table.getByText("完课底薪").closest("tr")!);
  fireEvent.click(pay.getByRole("button", { name: "核实" }));
  const review = within(screen.getByRole("dialog", { name: "核实薪资明细" }));
  expect(review.getByText("未设置 SO 单价")).toBeTruthy();
  expect(review.getByRole("link", { name: "设置 SO 单价" })).toBeTruthy();
  expect(review.queryByRole("button", { name: "记录处理结果" })).toBeNull();
  fireEvent.click(review.getByRole("button", { name: "关闭" }));
  const payCells = pay.getAllByRole("cell").map((cell) => cell.textContent);
  expect(payCells).toEqual([
    lesson.date, lesson.time, data.students[0].name, "+₱180", "—",
    "完课底薪", "1 课时", "待核实", "核实",
  ]);
  expect(detail.getByLabelText("SO 已计算小计").textContent).toBe("待核");
  const fine = within(table.getByText("迟到或早退扣款").closest("tr")!);
  expect(fine.getByText(/3 分钟/)).toBeTruthy();
  expect(fine.getByText("-₱6")).toBeTruthy();
  expect(fine.getByText("₱0")).toBeTruthy();
  expect(fine.getByText("已计算")).toBeTruthy();
  expect(
    fine.getByRole("link", { name: "查看上课记录" }).getAttribute("href"),
  ).toBe("/lessons?lesson=" + lesson.id);
  fireEvent.click(detail.getByRole("combobox", { name: "明细状态" }));
  fireEvent.click(screen.getByRole("option", { name: "已计算" }));
  expect(table.queryByText("完课底薪")).toBeNull();
  expect(table.getByText("-₱6")).toBeTruthy();
  fireEvent.click(detail.getByRole("combobox", { name: "明细状态" }));
  fireEvent.click(screen.getByRole("option", { name: "待核实" }));
  expect(table.getByText("+₱180")).toBeTruthy();
  expect(table.queryByText("迟到或早退扣款")).toBeNull();
});

it("没有上课记录且只有配置待核时，同表显示待核依据和待核合计", () => {
  const { data, teacher } = statementFixture();
  teacher.payMode = undefined;
  data.officePayRates = {};
  data.lessons = [];
  const detail = openLessonStatement(data);
  const table = within(detail.getByRole("table", { name: "薪资明细" }));
  expect(detail.getByText("本期没有可查看的上课记录。")).toBeTruthy();
  expect(detail.getByLabelText("老师已计算小计").textContent).toBe("待核");
  for (const title of ["未设置计薪方式", "未设置 SO 单价"]) {
    const config = within(table.getByText(title).closest("tr")!);
    const cells = config.getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toEqual(["—", "—", "—", "—", "—", title, "—", "待核实", "核实"]);
  }
  const mode = within(table.getByText("未设置计薪方式").closest("tr")!);
  fireEvent.click(mode.getByRole("button", { name: "核实" }));
  const review = within(screen.getByRole("dialog", { name: "核实薪资明细" }));
  expect(review.getByText("未设置计薪方式")).toBeTruthy();
  expect(
    review.getByRole("link", { name: "设置计薪方式" }).getAttribute("href"),
  ).toBe("/teachers/" + teacher.id + "?edit=payMode");
});

it("薪资明细超过一页时按状态筛选并回到第一页", () => {
  const { data, teacher } = statementFixture();
  data.lessons = [];
  data.officePayRates = {};
  data.halfMonthPayroll = [{
    teacherId: teacher.id,
    period: "2026-10-2",
    status: "待确认",
    adjustments: Array.from({ length: 26 }, (_, index) => ({
      key: "adj-" + index,
      at: "2026-10-20",
      side: "teacher",
      amount: 10,
      note: "专项调整 " + index,
      operator: "教务",
    })),
  }];
  const detail = openLessonStatement(data);
  const table = within(detail.getByRole("table", { name: "薪资明细" }));
  const pagination = within(detail.getByRole("navigation", { name: "列表分页" }));
  expect(table.getAllByRole("row")).toHaveLength(26);
  fireEvent.click(pagination.getByRole("button", { name: "下一页" }));
  expect(pagination.getByRole("button", { name: "第 2 页" }).getAttribute("aria-current")).toBe("page");
  expect(table.getAllByRole("row")).toHaveLength(3);
  const filters = within(detail.getByRole("group", { name: "薪资明细筛选" }));
  fireEvent.click(filters.getByRole("button", { name: "待核实 1 项" }));
  expect(detail.getByRole("combobox", { name: "明细状态" }).textContent).toBe("待核实");
  expect(pagination.getByRole("button", { name: "第 1 页" }).getAttribute("aria-current")).toBe("page");
  expect(table.getAllByRole("row")).toHaveLength(2);
  expect(table.getByText("未设置 SO 单价")).toBeTruthy();
  expect(table.queryByText(/专项调整/)).toBeNull();
});

it("同一固定时段的两节正常课各自可见，时段底薪只计一次", () => {
  const { data, teacher, lesson } = statementFixture();
  teacher.payMode = "OP";
  teacher.availabilityFrom = "2026-10-19";
  teacher.payrollEndDate = "2026-10-19";
  teacher.availability = [{ day: 1, start: "09:00", end: "10:00" }];
  data.lessons = ["09:00", "09:30"].map((time) => ({
    ...lesson,
    id: time,
    time,
    attendance: "正常",
    incident: undefined,
    teacherAttendance: ["正常"],
    studentAttendance: ["正常"],
  }));
  const detail = openLessonStatement(data);
  expect(detail.getByText(/ · OP · PHP$/)).toBeTruthy();
  const table = within(detail.getByRole("table", { name: "薪资明细" }));
  showColumns(detail, "计算说明");
  expect(table.getByText("固定时段底薪")).toBeTruthy();
  expect(table.getAllByText("底薪按固定时段单列")).toHaveLength(2);
  expect(table.getAllByText("+₱360")).toHaveLength(1);
  expect(detail.getByLabelText("老师应结").textContent).toBe("₱360");
});

it("已确认工资单按冻结课酬显示，后改单价和新排课都不改动原金额", () => {
  const { data, teacher, lesson } = statementFixture();
  const period = "2026-10-2";
  data.halfMonthPayroll = [
    {
      teacherId: teacher.id,
      period,
      adjustments: [],
      status: "已确认",
      snapshot: halfMonthStatement(data, teacher, period),
    },
  ];
  teacher.rate = 320;
  data.officePayRates = { ...data.officePayRates, [teacher.so]: 100 };
  data.lessons.push({ ...lesson, id: "added-later", time: "15:00" });
  const detail = openLessonStatement(data);
  const table = within(detail.getByRole("table", { name: "薪资明细" }));
  expect(table.getByText("+₱180")).toBeTruthy();
  expect(table.queryByText("+₱320")).toBeNull();
  showColumns(detail, "老师单价", "SO 单价", "计薪比例", "计算说明");
  const pay = within(table.getByText("完课底薪").closest("tr")!);
  for (const value of ["₱180", "₱60", "100%"]) {
    expect(pay.getByRole("cell", { name: value })).toBeTruthy();
  }
  expect(table.getByText("工资单无单节计薪记录")).toBeTruthy();
  expect(detail.getByLabelText("老师应结").textContent).toBe("₱174");
});

it("未设置计薪方式的已完课同时显示已核定的扣款与待核课酬", () => {
  const { data, teacher, lesson } = statementFixture();
  teacher.payMode = undefined;
  data.lessons.push({
    ...lesson,
    id: "pending-class",
    time: "10:00",
    status: "待确认",
  });
  const table = within(
    openLessonStatement(data).getByRole("table", { name: "薪资明细" }),
  );
  expect(
    within(table.getByText("迟到或早退扣款").closest("tr")!).getByText("-₱6"),
  ).toBeTruthy();
  expect(table.getByText("课程结果待核")).toBeTruthy();
  const coursePay = within(table.getByText("计薪方式待设置").closest("tr")!);
  expect(
    coursePay
      .getAllByRole("cell")
      .slice(3, 5)
      .map((cell) => cell.textContent),
  ).toEqual(["—", "—"]);
  expect(coursePay.getByText("待核实")).toBeTruthy();
  expect(table.getAllByText("未设置计薪方式")).toHaveLength(1);
});

it("缺单价的老师缺席课程显示待核扣款", () => {
  const { data, teacher, lesson } = statementFixture();
  teacher.rate = 0;
  data.lessons = [
    {
      ...lesson,
      status: "缺席",
      attendance: "老师缺席",
      teacherAttendance: ["缺席"],
      incident: undefined,
    },
  ];
  const detail = openLessonStatement(data);
  const table = within(detail.getByRole("table", { name: "薪资明细" }));
  const fine = within(table.getByText("老师缺席扣款").closest("tr")!);
  showColumns(detail, "计算说明");
  expect(fine.getByText("课时费待核 × 3")).toBeTruthy();
  expect(fine.getAllByRole("cell")[3].textContent).toBe("—");
  expect(fine.getByText("待核实")).toBeTruthy();
  expect(table.queryByText("本节无计薪项目")).toBeNull();
  expect(detail.queryByRole("button", { name: "记录处理结果" })).toBeNull();
});

it("从待核的网络取消课酬打开处理表单", () => {
  const { data, lesson } = statementFixture();
  data.lessons = [
    {
      ...lesson,
      status: "已取消",
      incident: { ...lesson.incident, reason: "网络问题" },
    },
  ];
  const detail = openLessonStatement(data);
  const row = within(detail.getByText("网络取消课酬待核").closest("tr")!);
  fireEvent.click(row.getByRole("button", { name: "核实" }));
  const dialog = screen.getByRole("dialog", { name: "核实薪资明细" });
  const review = within(dialog);
  expect(review.getByText(/请逐项核定老师及 SO 本节应得课酬/)).toBeTruthy();
  fireEvent.click(review.getByRole("button", { name: "记录处理结果" }));
  const editor = within(screen.getByRole("dialog", { name: "记录处理结果" }));
  expect(screen.queryByRole("dialog", { name: "核实薪资明细" })).toBeNull();
  expect(editor.getByLabelText("本节老师应得课酬（₱）")).toBeTruthy();
  expect(editor.getByLabelText("本节 SO 应得课酬（₱）")).toBeTruthy();
});

it.each([
  ["2026-10-30T23:59:59+08:00", "等待结果"],
  ["2026-10-31T00:00:00+08:00", "待核实"],
])("未收到最终回传时，工资明细在 %s 标记%s", (at, expected) => {
  const { data, lesson } = statementFixture();
  Object.assign(lesson, {
    status: "待确认", incident: undefined, deducted: false, attendance: "无数据",
    classInAttendanceIssue: undefined, classInAttendanceReceived: false,
  });
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse(at));
  try {
    const detail = openLessonStatement(data);
    const table = within(detail.getByRole("table", { name: "薪资明细" }));
    const row = within(table.getByRole("cell", { name: lesson.time }).closest("tr")!);
    expect(row.getByRole("cell", { name: expected })).toBeTruthy();
    if (expected === "等待结果") {
      expect(row.queryByRole("button", { name: "核实" })).toBeNull();
      expect(row.queryByText(/数据缺失/)).toBeNull();
    } else {
      fireEvent.click(row.getByRole("button", { name: "核实" }));
      const review = within(screen.getByRole("dialog", { name: "核实薪资明细" }));
      expect(review.getAllByText(/数据缺失/).length).toBeGreaterThan(0);
    }
  } finally {
    now.mockRestore();
  }
});
