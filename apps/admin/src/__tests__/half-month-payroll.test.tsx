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
import { MemoryRouter } from "react-router-dom";
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
        <MemoryRouter>
          <HalfMonthPayroll />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  fireEvent.click(screen.getByRole("button", { name: "查看工资单" }));
  let dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("应结汇总")).toBeTruthy();
  expect(within(dialog).getByText(/2026-10-28.*上课记录/)).toBeTruthy();
  expect(within(dialog).getAllByText("₱180").length).toBeGreaterThan(0);
  fireEvent.change(within(dialog).getByLabelText(/金额（加款/), {
    target: { value: "300" },
  });
  fireEvent.change(within(dialog).getByLabelText("调整原因"), {
    target: { value: "人工补发专项" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "添加调整" }));
  expect(await within(dialog).findByText(/人工补发专项/)).toBeTruthy();
  expect(within(dialog).getByText("₱480")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
  fireEvent.click(screen.getByRole("tab", { name: "SO 汇总" }));
  fireEvent.click(screen.getByRole("button", { name: "查看老师明细" }));
  fireEvent.click(screen.getByRole("button", { name: "查看工资单" }));
  dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("₱480")).toBeTruthy();
  expect(within(dialog).getByText(/人工补发专项/)).toBeTruthy();
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
        <MemoryRouter>
          <HalfMonthPayroll />
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
  expect(screen.getAllByRole("button", { name: "查看工资单" })).toHaveLength(
    25,
  );
  fireEvent.click(screen.getByRole("button", { name: "导出数据" }));
  const csv = context.exportCsv.mock.lastCall![1] as (string | number)[][];
  expect(csv.slice(1)).toHaveLength(26);
  expect(csv.at(-1)?.slice(1, 4)).toEqual(["外教 25", "A", "已确认"]);
  fireEvent.click(screen.getByRole("tab", { name: "SO 汇总" }));
  const row = within(screen.getByText("26").closest("tr")!);
  expect(row.getByText("₱260")).toBeTruthy();
});

it("薪资权限组登记导出权限，只有查看权限的账号看不到导出按钮", () => {
  expect(permissionGroups.find(group => group.name === "薪资")?.keys).toContain("payroll.export");
  expect(permissionLabels["payroll.export"]).toBe("导出薪资明细");
  expect(superAdminRole().permissions).toContain("payroll.export");
  context.useDemo.mockReturnValue({
    data: createSeed(), can: (key: string) => ["payroll.view", "field.pay_amount"].includes(key),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider><MemoryRouter><HalfMonthPayroll /></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("结算周期")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "导出数据" })).toBeNull();
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
        <MemoryRouter>
          <HalfMonthPayroll />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  const row = screen.getByText("OP 老师").closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "查看工资单" }));
  expect(
    within(screen.getByRole("dialog")).getByLabelText("老师应结").textContent,
  ).toBe("₱180");
  expect(
    within(screen.getByRole("dialog")).getByText("2026-10-19"),
  ).toBeTruthy();
});

it("edits all payroll rules together and opens teacher and SO rates only on demand", async () => {
  const data = createSeed();
  const act = vi.fn().mockResolvedValue({ message: "已保存" });
  context.useDemo.mockReturnValue({ data, act, can: () => true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <HalfMonthPayroll />
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
        <MemoryRouter>
          <HalfMonthPayroll />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "查看工资单" }));
  return within(screen.getByRole("dialog"));
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
      minutes: 2,
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
    material: "上期课",
  });
  const dialog = openLessonStatement(data);
  const table = within(dialog.getByRole("table", { name: "逐课明细" }));
  expect(
    table
      .getByRole("link", { name: lesson.date + " " + lesson.time })
      .getAttribute("href"),
  ).toBe("/lessons?lesson=" + lesson.id);
  expect(table.getByText(data.students[0].name)).toBeTruthy();
  expect(table.getByText("专项课本")).toBeTruthy();
  expect(table.queryByText("上期课")).toBeNull();
  const pay = within(table.getByText("NP 正常完课").closest("tr")!);
  expect(pay.getByText("₱180")).toBeTruthy();
  expect(pay.getByText("待核")).toBeTruthy();
  expect(dialog.getByLabelText("SO 应结").textContent).toBe("待核");
  const fine = within(table.getByText("迟到或早退").closest("tr")!);
  expect(fine.getByText(/2 分钟/)).toBeTruthy();
  expect(fine.getByText(/-4/)).toBeTruthy();
});

it("没有上课记录且只有配置待核时，单列空状态和待核合计", () => {
  const { data, teacher } = statementFixture();
  teacher.payMode = undefined;
  data.officePayRates = {};
  data.lessons = [];
  const dialog = openLessonStatement(data);
  expect(dialog.getByText("本期没有可查看的上课记录。")).toBeTruthy();
  expect(dialog.getByLabelText("老师应结").textContent).toBe("待核");
  expect(dialog.getByText("未设置计薪方式")).toBeTruthy();
  expect(dialog.getByText("未设置 SO 单价")).toBeTruthy();
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
  const dialog = openLessonStatement(data);
  const table = within(dialog.getByRole("table", { name: "逐课明细" }));
  expect(table.getAllByText("底薪按固定时段单列")).toHaveLength(2);
  expect(table.queryByText("₱360")).toBeNull();
  expect(dialog.getByLabelText("老师应结").textContent).toBe("₱360");
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
  data.lessons.push({ ...lesson, id: "added-later", time: "15:00" });
  const dialog = openLessonStatement(data);
  const table = within(dialog.getByRole("table", { name: "逐课明细" }));
  expect(table.getByText("₱180")).toBeTruthy();
  expect(table.queryByText("₱320")).toBeNull();
  expect(table.getByText("工资单无单节计薪记录")).toBeTruthy();
  expect(dialog.getByLabelText("老师应结").textContent).toBe("₱176");
});

it("未设置计薪方式的已完课同时显示已核定的扣款与待核课酬", () => {
  const { data, teacher } = statementFixture();
  teacher.payMode = undefined;
  const table = within(
    openLessonStatement(data).getByRole("table", { name: "逐课明细" }),
  );
  expect(
    within(table.getByText("迟到或早退").closest("tr")!).getByText(/-4/),
  ).toBeTruthy();
  expect(
    within(table.getByText("计薪方式待设置").closest("tr")!).getAllByText(
      "待核",
    ),
  ).toHaveLength(2);
});
