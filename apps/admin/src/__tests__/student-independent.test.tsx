import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import {
  emptyStudentProfile,
  studentHistorySchema,
  studentProfileSchema,
} from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import App from "../App";

function TestRole() {
  const { setRole } = useDemo();
  return <button onClick={() => setRole("ops")}>测试切换教务</button>;
}
function mount(path = "/students") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <TestRole />
            <App />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
async function change(label: string, value: string) {
  await testAct(async () => {
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  });
}
async function choose(label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await testAct(async () => {
    trigger.focus();
    fireEvent.click(trigger);
  });
  const target = await screen.findByRole("option", { name: option });
  await testAct(async () => {
    fireEvent.click(target);
  });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
}
function originalProfile() {
  return {
    ...emptyStudentProfile(),
    name: "独立验收学员",
    chineseName: "独立验收学员",
    groupName: "QA901专属学习群",
    sourceSequence: "51",
    channel: "独立渠道",
    orderStatus: "正常",
    purchaseDate: "2026-07-01",
    totalUnits: 0,
    teacherName: "原表未建档老师",
    material: "原教材",
    scheduleText: "周二19:00，不规律",
    frequencyText: "2*50mins",
    firstLessonDate: "2026-07-03",
    ageText: "/",
    gender: "女",
    personality: "慢热",
    foreignTeacherExperience: "有",
    preferences: "温柔有耐心",
    legacyComplaints: "7",
    legacyCompensations: "2",
    legacyMissed: "/",
    originalTeacher: "历史老师A",
    firstChangedTeacher: "历史老师B",
    secondChangedTeacher: "历史老师C",
    renewalStatus: "是",
    monthlyRecords: [
      {
        id: "qa-july",
        month: "7月（原表，年份未注明）",
        planned: null,
        actual: 0,
        note: "原表保留",
      },
    ],
  };
}
function importProfile() {
  demoRepository.execute({
    type: "student.import",
    students: [originalProfile()],
    mode: "skip",
  });
  return demoRepository.read().students.find((s) => s.name === "独立验收学员")!;
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  demoRepository.execute({type:"catalog.save",entry:{id:"independent-channel",type:"渠道",name:"独立渠道",detail:"",enabled:true}});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("独立学员数字化验收", () => {
  it("新建资料与历史补录分开，空手机及年龄原文保留，历史零值保存后读回", async () => {
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    });
    const fields: Record<string, string> = {
      学生中文名: "完整建档验收",
      年龄: "/",
      小孩性格: "活泼",
      喜欢的老师类型: "幽默耐心",
      教材: "New Book",
      "起始单元／页码": "p.23",
    };
    for (const [label, value] of Object.entries(fields))
      await change(label, value);
    const activeTeacher = demoRepository
      .read()
      .teachers.find((teacher) => teacher.status === "在职");
    if (!activeTeacher) throw new Error("缺少在职老师");
    await choose("上课老师", `${activeTeacher.name} · ${activeTeacher.so}`);
    await choose("性别", "女");
    await choose("外教上课经验", "有");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "新建学员" })).toBeNull(),
    );
    const created = demoRepository
      .read()
      .students.find((item) => item.name === "完整建档验收");
    if (!created) throw new Error("建档失败");
    demoRepository.execute({
      type: "student.history.update",
      id: created.id,
      reason: "迁移原表",
      history: studentHistorySchema.parse({
        ...created,
        sourceSequence: "0",
        purchaseDate: "2026-07-02",
        totalUnits: 0,
        frequencyText: "1*55mins",
        scheduleText: "周日20:00",
        firstLessonDate: "2026-07-05",
        renewalStatus: "是",
        legacyComplaints: "0",
        legacyCompensations: "2",
        legacyMissed: "/",
        originalTeacher: "A",
        firstChangedTeacher: "B",
        secondChangedTeacher: "C",
        monthlyRecords: [
          {
            id: "qa-history",
            month: "7月（原表，年份未注明）",
            planned: null,
            actual: 0,
            note: "",
          },
        ],
      }),
    });
    const saved = demoRepository
      .read()
      .students.find((s) => s.name === "完整建档验收")!;
    expect(saved).toMatchObject({
      name: "完整建档验收",
      phone: "",
      age: null,
      ageText: "/",
      totalUnits: 0,
      purchaseDate: "2026-07-02",
      material: "New Book",
      unit: "p.23",
      teacherId: activeTeacher.id,
      teacherName: activeTeacher.name,
      orderStatus: "正常",
      renewalStatus: "是",
      gender: "女",
      personality: "活泼",
      foreignTeacherExperience: "有",
      legacyComplaints: "0",
      legacyCompensations: "2",
      legacyMissed: "/",
      originalTeacher: "A",
      firstChangedTeacher: "B",
      secondChangedTeacher: "C",
    });
    expect(saved.monthlyRecords[0]).toMatchObject({
      month: "7月（原表，年份未注明）",
      planned: null,
      actual: 0,
    });
    expect(
      studentProfileSchema.parse(
        JSON.parse(localStorage.getItem("crazytalk-demo-v1")!).students.find(
          (s: { name: string }) => s.name === "完整建档验收",
        ),
      ),
    ).toEqual(studentProfileSchema.parse(saved));
  }, 15000);
  it("已有学员完整编辑不清空关联老师，且资料表单不能绕过办理操作改状态", async () => {
    const student = demoRepository.read().students[0];
    const beforeLessons = structuredClone(
      demoRepository.read().lessons.filter((l) => l.studentId === student.id),
    );
    mount(`/students/${student.id}`);
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    });
    expect(screen.queryByRole("combobox", { name: "订单状态" })).toBeNull();
    expect(screen.queryByLabelText("上课老师")).toBeNull();
    expect(screen.queryByLabelText("总课时")).toBeNull();
    await change("学生中文名", "更新后的原表群名");
    await change("手机号码", "");
    await change("年龄", "0");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "编辑学员资料" })).toBeNull(),
    );
    const after = demoRepository
      .read()
      .students.find((s) => s.id === student.id)!;
    expect(after).toMatchObject({
      chineseName: "更新后的原表群名",
      teacherName: student.teacherName,
      teacherId: student.teacherId,
      status: student.status,
      phone: "",
      age: 0,
      ageText: "",
      totalUnits: student.totalUnits,
      balance: student.balance,
    });
    expect(
      demoRepository.read().lessons.filter((l) => l.studentId === student.id),
    ).toEqual(beforeLessons);
  });
  it("完整档案展示画像和历史月度，服务记录可进入真实反馈详情", async () => {
    const student = importProfile();
    const feedback = demoRepository.read().feedback[0];
    demoRepository.execute({
      type: "feedback.create",
      feedback: {
        studentId: student.id,
        teacherId: feedback.teacherId,
        lessonId: "",
        date: "2026-11-01",
        owner: "Rita",
        source: "独立验收",
        teacherName: "测试老师",
        so: "",
        stage: "",
        grade: "",
        categories: [],
        rating: "差评",
        content: "真实反馈关联测试",
        screenshots: [],
      },
    });
    mount(`/students/${student.id}`);
    expect(
      screen.getByRole("heading", { name: "独立验收学员", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("慢热")).toBeTruthy();
    expect(screen.getAllByText("暂未排课").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2*50mins").length).toBeGreaterThan(0);
    expect(
      demoRepository.read().students.find((s) => s.id === student.id),
    ).toMatchObject({
      originalTeacher: "历史老师A",
      firstChangedTeacher: "历史老师B",
      secondChangedTeacher: "历史老师C",
      legacyComplaints: "7",
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "课程与教材进度" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByText("历史月度记录"));
    });
    const month = screen.getByRole("row", { name: /7月（原表，年份未注明）/ });
    expect(within(month).getByText("未填写")).toBeTruthy();
    expect(within(month).getByText("0")).toBeTruthy();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
    });
    const content = screen.getByText("真实反馈关联测试", { exact: true });
    const article = content.closest("article");
    if (!article) throw new Error("反馈缺少服务记录");
    await testAct(async () => {
      fireEvent.click(
        within(article).getByRole("button", { name: "查看详情" }),
      );
    });
    expect(
      await screen.findByRole("dialog", { name: "反馈详情" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "独立验收学员",
        level: 1,
        hidden: true,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "保存客服处理" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "客服备注" })).toBeNull();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "前往反馈处理" }));
    });
    const updateCustomer = await screen.findByRole("button", {
      name: "更新客服处理",
    });
    await testAct(async () => {
      fireEvent.click(updateCustomer);
    });
    expect(screen.getByRole("combobox", { name: "客服处理进度" })).toBeTruthy();
  });
  it("导入未知余额显示未核实，录入0余额必须带核实说明并产生独立流水", async () => {
    const student = importProfile();
    mount(`/students/${student.id}?tab=credits`);
    expect(screen.getAllByText("未核实").length).toBeGreaterThan(0);
    await change("初始剩余课时", "0");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认录入余额" }));
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.balanceKnown,
    ).toBe(false);
    await change("核实说明", "已核对原台账为0");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认录入余额" }));
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "确认录入余额" })).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((s) => s.id === student.id),
    ).toMatchObject({ balanceKnown: true, balance: 0, totalUnits: 0 });
    expect(
      demoRepository.read().credits.filter((c) => c.studentId === student.id),
    ).toHaveLength(1);
    expect(screen.getByRole("cell", { name: "已核对原台账为0" })).toBeTruthy();
  });
  it("列表按唯一 ID 搜索和订单状态筛选，未知余额保持未核实", async () => {
    const student = importProfile();
    mount();
    await change("搜索学员 ID、姓名或手机号", student.id);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "独立验收学员" })).toBeTruthy(),
    );
    await choose("订单状态筛选", "正常");
    expect(screen.queryByRole("combobox", { name: "是否续课筛选" })).toBeNull();
    expect(screen.getByRole("link", { name: "独立验收学员" })).toBeTruthy();
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.balanceKnown,
    ).toBe(false);
  });
  it("教务按权限使用资料功能，导入和导出入口不越权显示", async () => {
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "测试切换教务" }));
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "导入数据" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "导出数据" })).toBeNull();
    expect(screen.getByRole("button", { name: "新建学员" })).toBeTruthy();
  });
  it("实际导出47列客服原表，保留学员ID、零课时和年龄原文", async () => {
    const student = importProfile();
    demoRepository.execute({
      type: "student.history.update",
      id: student.id,
      reason: "补录月度记录",
      history: studentHistorySchema.parse({
        ...studentProfileSchema.parse(student),
        monthlyRecords: [
          ...student.monthlyRecords,
          {
            id: "qa-nov",
            month: "2026-11",
            planned: 8,
            actual: 0,
            note: "新增月度记录",
          },
        ],
      }),
    });
    let exported: NodeBlob | undefined;
    const NativeURL = URL;
    vi.stubGlobal("Blob", NodeBlob);
    vi.stubGlobal(
      "URL",
      class extends NativeURL {
        static createObjectURL(blob: unknown) {
          if (!(blob instanceof NodeBlob))
            throw new Error("导出未生成文件Blob");
          exported = blob;
          return "blob:student-qa";
        }
        static revokeObjectURL() {}
      },
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mount("/students?q=QA901");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "导出数据" }));
    });
    await waitFor(() => expect(exported).toBeDefined());
    const { Workbook } = await import("exceljs");
    const book = new Workbook();
    await book.xlsx.load(await exported!.arrayBuffer());
    expect(book.worksheets).toHaveLength(1);
    const sheet = book.worksheets[0];
    expect(sheet.columnCount).toBe(47);
    expect(sheet.rowCount).toBe(2);
    const headers = sheet.getRow(1).values as string[];
    const cell = (name: string) =>
      sheet.getRow(2).getCell(headers.indexOf(name)).value;
    expect(cell("学员ID")).toBe(student.id);
    expect(cell("学生中文名")).toBe("独立验收学员");
    expect(cell("总课时")).toBe(0);
    expect(cell("年龄")).toBe("/");
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.monthlyRecords,
    ).toHaveLength(2);
    // Keep the browser URL stub alive until the download revocation timer finishes.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
  it("导入学员可录入负期初余额，续费累加到该课包", async () => {
    const student = importProfile();
    mount(`/students/${student.id}?tab=credits`);
    await change("初始剩余课时", "-2");
    await change("核实说明", "旧台账确认欠2课时");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "确认录入余额" }));
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "确认录入余额" })).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((s) => s.id === student.id),
    ).toMatchObject({ balance: -2, balanceKnown: true, totalUnits: 0 });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "课时与续费" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "加课时" }));
    });
    const dialog = screen.getByRole("dialog", {
      name: "给 独立验收学员 加课时",
    });
    await testAct(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "确认加 72 课时" }),
      );
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "给 独立验收学员 加课时" }),
      ).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((s) => s.id === student.id),
    ).toMatchObject({ balance: 70 });
    const packages = demoRepository
      .read()
      .orders?.filter((order) => order.studentIds.includes(student.id));
    expect(packages).toHaveLength(1);
    expect(packages?.[0]).toMatchObject({ kind: "期初余额", balance: 70 });
  });
  it("原表没有最后上课日期的在读学员不误列为两周没上课", async () => {
    const profile = { ...originalProfile(), status: "在读" as const };
    demoRepository.execute({
      type: "student.import",
      students: [profile],
      mode: "skip",
    });
    const student = demoRepository
      .read()
      .students.find((s) => s.name === "独立验收学员")!;
    expect(student.lastLesson).toBe("");
    mount("/students?view=inactive&q=QA901");
    expect(screen.queryByRole("link", { name: "独立验收学员" })).toBeNull();
    expect(screen.getByText("没有符合条件的学员")).toBeTruthy();
  });
  it("非法手机号用中文提示而非校验JSON，不创建学员", async () => {
    const count = demoRepository.read().students.length;
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    });
    await change("学生中文名", "手机号校验测试");
    await change("手机号码", "138");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("手机号需为 11 位，暂未提供可留空");
    expect(alert.textContent).not.toMatch(/\[|\{|code|path|ZodError/);
    expect(screen.getByRole("dialog", { name: "新建学员" })).toBeTruthy();
    expect(demoRepository.read().students).toHaveLength(count);
    expect(
      demoRepository
        .read()
        .students.some((student) => student.name === "手机号校验测试"),
    ).toBe(false);
  });
  it("无需编号也能建档，零余额直接进入加课时弹窗", async () => {
    mount();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    });
    await change("学生中文名", "空白编号验收");
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存并加课时" }));
    });
    const dialog = await screen.findByRole("dialog", {
      name: "给 空白编号验收 加课时",
    });
    expect(dialog.textContent).not.toContain("SYS-");
    expect(
      demoRepository
        .read()
        .students.find((student) => student.name === "空白编号验收"),
    ).toMatchObject({ balance: 0, balanceKnown: true });
    expect(screen.queryByRole("dialog", { name: "新建学员" })).toBeNull();
    expect(
      await screen.findByRole("dialog", { name: "给 空白编号验收 加课时" }),
    ).toBeTruthy();
  });
});

it("共享套餐详情标注实际使用人，学员链接打开成员档案", () => {
  const [a, b] = demoRepository.read().students;
  const expectedBalance = a.balance + b.balance + 72;
  for (const id of [a.id, b.id])
    demoRepository.execute({
      type: "student.bindClassIn",
      id,
      phone: "13900001234",
      uid: "101",
    });
  demoRepository.execute({
    type: "order.buy",
    id: "ui-family",
    studentId: a.id,
    studentIds: [a.id, b.id],
    units: 72,
    kind: "新购",
    date: "2026-11-01",
    note: "",
  });
  mount(`/students/${b.id}?tab=credits`);
  const packageRow = within(
    screen.getByText(/共享课时 · 2 人共用/).closest("tr")!,
  );
  expect(packageRow.getByText(`${expectedBalance} 课时`)).toBeTruthy();
  expect(
    packageRow.getByRole("link", { name: a.name }).getAttribute("href"),
  ).toBe(`/students/${a.id}`);
  expect(screen.getAllByRole("button", { name: "加课时" })).toHaveLength(1);
});
