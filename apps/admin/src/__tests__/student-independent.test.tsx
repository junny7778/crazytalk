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
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function choose(label: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}
function originalProfile() {
  return {
    ...emptyStudentProfile(),
    code: "QA901",
    name: "独立验收学员",
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
  return demoRepository.read().students.find((s) => s.code === "QA901")!;
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
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
    fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    const fields: Record<string, string> = {
      学生名字: "完整建档验收",
      学生群名: "QA902学习群",
      年龄: "/",
      小孩性格: "活泼",
      喜欢的老师类型: "幽默耐心",
      教材: "New Book",
      "起始单元／页码": "p.23",
    };
    Object.entries(fields).forEach(([label, value]) => change(label, value));
    const activeTeacher = demoRepository
      .read()
      .teachers.find((teacher) => teacher.status === "在职");
    if (!activeTeacher) throw new Error("缺少在职老师");
    choose("上课老师", `${activeTeacher.name} · ${activeTeacher.so}`);
    choose("性别", "女");
    choose("外教上课经验", "有");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
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
    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    expect(screen.queryByRole("combobox", { name: "订单状态" })).toBeNull();
    expect(screen.queryByLabelText("上课老师")).toBeNull();
    expect(screen.queryByLabelText("总课时")).toBeNull();
    change("学生群名", "更新后的原表群名");
    change("手机号码", "");
    change("年龄", "0");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "编辑学员资料" })).toBeNull(),
    );
    const after = demoRepository
      .read()
      .students.find((s) => s.id === student.id)!;
    expect(after).toMatchObject({
      groupName: "更新后的原表群名",
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
  it("完整档案分别展示原表月度/课中/换师记录和真实反馈详情入口", async () => {
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
    expect(screen.getByText("QA901专属学习群")).toBeTruthy();
    expect(screen.getByText("慢热")).toBeTruthy();
    expect(screen.getAllByText("周二19:00，不规律").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2*50mins").length).toBeGreaterThan(0);
    expect(screen.getByText("历史老师A")).toBeTruthy();
    expect(screen.getByText("历史老师B")).toBeTruthy();
    expect(screen.getByText("历史老师C")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "课程与教材进度" }));
    fireEvent.click(screen.getByText("历史月度记录"));
    const month = screen.getByRole("row", { name: /7月（原表，年份未注明）/ });
    expect(within(month).getByText("未填写")).toBeTruthy();
    expect(within(month).getByText("0")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
    const content = screen.getByText("真实反馈关联测试", { exact: true });
    const article = content.closest("article");
    if (!article) throw new Error("反馈缺少服务记录");
    fireEvent.click(within(article).getByRole("button", { name: "查看详情" }));
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
    fireEvent.click(screen.getByRole("button", { name: "前往反馈处理" }));
    expect(
      await screen.findByRole("combobox", { name: "客服处理进度" }),
    ).toBeTruthy();
  });
  it("导入未知余额显示未核实，录入0余额必须带核实说明并产生独立流水", async () => {
    const student = importProfile();
    mount(`/students/${student.id}?tab=credits`);
    expect(screen.getAllByText("未核实").length).toBeGreaterThan(0);
    change("初始剩余课时", "0");
    fireEvent.click(screen.getByRole("button", { name: "确认录入余额" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.balanceKnown,
    ).toBe(false);
    change("核实说明", "已核对原台账为0");
    fireEvent.click(screen.getByRole("button", { name: "确认录入余额" }));
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
  it("列表按群名搜索并按原表订单/续课筛选，未知余额不当作欠课", async () => {
    const student = importProfile();
    mount();
    change("搜索学生名字、学生群名或手机号", "QA901专属学习群");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "独立验收学员" })).toBeTruthy(),
    );
    choose("订单状态筛选", "正常");
    choose("是否续课筛选", "是");
    expect(screen.getByRole("link", { name: "独立验收学员" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    fireEvent.click(screen.getByLabelText("剩余课时"));
    expect(screen.getByRole("cell", { name: "未核实" })).toBeTruthy();
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.balanceKnown,
    ).toBe(false);
  });
  it("教务按权限使用资料功能，导入和导出入口不越权显示", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "测试切换教务" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "导入数据" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "导出数据" })).toBeNull();
    expect(screen.getByRole("button", { name: "新建学员" })).toBeTruthy();
  });
  it("实际导出文件含27列原表及完整月度明细，保留未知年份、0和其他月份", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "导出数据" }));
    await waitFor(() => expect(exported).toBeDefined());
    const { Workbook } = await import("exceljs");
    const book = new Workbook();
    await book.xlsx.load(await exported!.arrayBuffer());
    expect(book.worksheets).toHaveLength(3);
    expect(book.worksheets[2].name).toBe("当前课程与服务统计");
    expect(book.worksheets[2].getRow(1).values).toContain("历史统计起算");
    expect(book.worksheets[0].columnCount).toBe(27);
    expect(book.worksheets[0].rowCount).toBe(2);
    expect(book.worksheets[0].getRow(2).getCell(6).value).toBe("独立验收学员");
    expect(book.worksheets[0].getRow(2).getCell(8).value).toBe(0);
    expect(book.worksheets[0].getRow(2).getCell(16).value).toBe("/");
    const values = book.worksheets[1].getSheetValues().flat().filter(Boolean);
    expect(values).toContain("7月（原表，年份未注明）");
    expect(values).toContain("2026-11");
    expect(values).toContain("新增月度记录");
    expect(book.worksheets[1].rowCount).toBe(3);
    expect(book.worksheets[1].getRow(2).getCell(4).value).toBe("");
    expect(book.worksheets[1].getRow(2).getCell(5).value).toBe(0);
    expect(book.worksheets[1].getRow(3).getCell(5).value).toBe(0);
    // Keep the browser URL stub alive until the download revocation timer finishes.
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
  it("导入学员可录入负期初余额，续费先抵欠且保留原表总课时", async () => {
    const student = importProfile();
    mount(`/students/${student.id}?tab=credits`);
    change("初始剩余课时", "-2");
    change("核实说明", "旧台账确认欠2课时");
    fireEvent.click(screen.getByRole("button", { name: "确认录入余额" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "确认录入余额" })).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((s) => s.id === student.id),
    ).toMatchObject({ balance: -2, balanceKnown: true, totalUnits: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "课时、续费与转介绍" }));
    fireEvent.click(screen.getByRole("button", { name: "加课时" }));
    const dialog = screen.getByRole("dialog", {
      name: "给 独立验收学员 加课时",
    });
    const amount = within(dialog).getByRole("spinbutton", {
      name: /增加课时|课时数/,
    });
    fireEvent.change(amount, { target: { value: "4" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "确认加 4 课时" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "给 独立验收学员 加课时" }),
      ).toBeNull(),
    );
    expect(
      demoRepository.read().students.find((s) => s.id === student.id),
    ).toMatchObject({ balance: 2, totalUnits: 0 });
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
      .students.find((s) => s.code === "QA901")!;
    expect(student.lastLesson).toBe("");
    mount("/students?view=inactive&q=QA901");
    expect(screen.queryByRole("link", { name: "独立验收学员" })).toBeNull();
    expect(screen.getByText("没有符合条件的学员")).toBeTruthy();
  });
  it("非法手机号用中文提示而非校验JSON，不创建学员", async () => {
    const count = demoRepository.read().students.length;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    change("学生名字", "手机号校验测试");
    change("手机号码", "138");
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
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
    fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    change("学生名字", "空白编号验收");
    fireEvent.click(screen.getByRole("button", { name: "保存并加课时" }));
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
