// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { createSeed } from "../../../../packages/shared/src/seed";
import { transition } from "../../../../packages/shared/src/domain";
import { emptyStudentProfile, studentHistorySchema } from "@crazytalk/shared";
import { getStudentSummary } from "../../../../packages/shared/src/studentSummary";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentProfileEditor from "../components/StudentProfileEditor";
import StudentHistoryEditor from "../components/StudentHistoryEditor";
import App from "../App";
import { Workbook } from "exceljs";
import { readStudentWorkbook } from "../lib/studentWorkbook";
const exportCapture = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => {}),
);
vi.mock("../lib/export", () => ({ downloadTable: exportCapture }));
function mount(child: React.ReactNode, path = "/students") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>{child}</MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
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
  vi.unstubAllGlobals();
});
it("history editor prefills stored seed values and preserves missing history as empty", () => {
  const students = demoRepository.read().students;
  const jayden = students.find((student) => student.name === "Jayden");
  if (!jayden) throw new Error("Missing Jayden fixture");
  mount(<StudentHistoryEditor student={jayden} onClose={() => {}} />);
  const inputValue = (label: string) => {
    const input = screen.getByLabelText(label);
    if (!(input instanceof HTMLInputElement)) throw new Error("Expected input");
    return input.value;
  };
  expect(inputValue("序号")).toBe("1");
  expect(inputValue("买单日期")).toBe("2026-09-01");
  expect(inputValue("历史总课时")).toBe("48");
  expect(inputValue("历史上课时间")).toBe("周二、周四 19:00");
  expect(inputValue("历史周上课频次")).toBe("2*25mins");
  expect(inputValue("历史第一节课")).toBe("2026-09-03");
  expect(inputValue("投诉记录（次数）")).toBe("0");
  cleanup();
  const leo = students.find((student) => student.name === "Leo");
  if (!leo) throw new Error("Missing Leo fixture");
  mount(<StudentHistoryEditor student={leo} onClose={() => {}} />);
  for (const label of [
    "序号",
    "买单日期",
    "历史总课时",
    "历史上课时间",
    "历史周上课频次",
    "历史第一节课",
  ])
    expect(inputValue(label)).toBe("");
});
it("student overview explains card details and preserves navigation", async () => {
  const student = demoRepository.read().students[0];
  mount(<App />, `/students/${student.id}`);
  const balance = await screen.findByTitle("查看课时明细");
  expect(screen.getByRole("tab", { name: "概述信息" })).toBeTruthy();
  const headings = screen
    .getAllByRole("heading")
    .map((item) => item.textContent);
  expect(headings.indexOf("学习特点与偏好")).toBe(
    headings.indexOf("学生基本信息") + 1,
  );
  expect(screen.queryByRole("heading", { name: "课中相关" })).toBeNull();
  expect(screen.queryByText("月度上课情况")).toBeNull();
  expect(balance.textContent).toContain("余额状态：已核实");
  const teacher = screen.getByTitle("查看课程安排");
  expect(teacher.textContent).toMatch(/固定上课：每周[一二三四五六日]/);
  const lesson = screen.getByTitle("查看本节课程");
  expect(lesson.textContent).toMatch(/\d+月\d+日 \d{2}:\d{2}/);
  expect(lesson.textContent).toContain("本节时长：");
  const progress = screen.getByTitle("查看学习进度");
  expect(progress.textContent).toContain("当前教材：");
  expect(progress.textContent).not.toMatch(/p\.\d/);
  fireEvent.click(screen.getByRole("tab", { name: "课程与教材进度" }));
  expect(screen.getByText("月度上课情况")).toBeTruthy();
  expect(screen.getByRole("button", { name: "查看月应上课课程" })).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
  expect(screen.getByRole("heading", { name: "服务记录统计" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /投诉次数/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /补偿次数/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /被缺席次数/ })).toBeTruthy();
  fireEvent.click(balance);
  expect(
    screen
      .getByRole("tab", { name: "课时、续费与转介绍" })
      .getAttribute("aria-selected"),
  ).toBe("true");
});
it("independent: new form offers three saves, omits legacy fields, creates linked zero balance student", () => {
  mount(<StudentProfileEditor onClose={() => {}} />);
  for (const label of [
    "序号",
    "订单状态",
    "买单日期",
    "总课时",
    "是否续课",
    "历史上课时间",
    "投诉记录（次数）",
  ])
    expect(screen.queryByLabelText(label)).toBeNull();
  for (const name of ["保存学员资料", "保存并加课时", "保存并去排课"])
    expect(screen.getByRole("button", { name })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/学生名字/), {
    target: { value: "独立验收新学员" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
  const student = demoRepository.read().students[0];
  expect(student).toMatchObject({
    name: "独立验收新学员",
    balance: 0,
    balanceKnown: true,
    status: "待排课",
    orderStatus: "正常",
  });
  expect(student.id).toMatch(/^\d{8}$/);
  expect(
    demoRepository.read().lessons.filter((l) => l.studentId === student.id),
  ).toHaveLength(0);
});
it("independent: unrelated update retains current progress; stale same-field update rejects", () => {
  let d = createSeed();
  const s = d.students[0];
  const old = s.name;
  d = transition(d, {
    type: "student.details.update",
    id: s.id,
    patch: { name: "新名" },
    expected: { name: old },
  }).data;
  expect(() =>
    transition(d, {
      type: "student.details.update",
      id: s.id,
      patch: { name: "过期名" },
      expected: { name: old },
    }),
  ).toThrow(/已更新/);
  const progress = getStudentSummary(d, s.id).progress;
  d = transition(d, {
    type: "student.details.update",
    id: s.id,
    patch: { phone: "13800138000" },
    expected: { phone: s.phone },
  }).data;
  expect(getStudentSummary(d, s.id).progress).toEqual(progress);
});
it("independent: unknown historical purchases remain unknown even with known cutoff and new purchase", () => {
  const d = createSeed(),
    s = d.students[0];
  s.totalUnits = null;
  s.historyStartDate = "2026-10-01";
  d.credits = [
    {
      id: "independent-credit",
      studentId: s.id,
      date: "2026-10-20",
      type: "新购",
      units: 10,
      balance: 10,
      note: "",
      operator: "验收",
    },
  ];
  expect(getStudentSummary(d, s.id).systemPurchaseUnits).toBe(10);
  expect(getStudentSummary(d, s.id).totalUnits).toBeNull();
});
it("independent: monthly moved/cancelled and attendance counts use lesson outcome", () => {
  const d = createSeed(),
    s = d.students[0],
    sample = d.lessons[0];
  d.lessons = ["正常", "学员缺席", "老师缺席"].map((attendance, i) => ({
    ...sample,
    id: `accept-${i}`,
    studentId: s.id,
    date: "2026-10-20",
    status: "已完成" as const,
    attendance: attendance as typeof sample.attendance,
  }));
  expect(getStudentSummary(d, s.id, "2026-10").monthly).toMatchObject({
    planned: 3,
    actual: 1,
  });
  expect(getStudentSummary(d, s.id).teacherAbsences.system).toBe(1);
  d.lessons[0].date = "2026-11-01";
  d.lessons[1].status = "已取消";
  expect(getStudentSummary(d, s.id, "2026-10").monthly).toMatchObject({
    planned: 1,
    actual: 0,
  });
  expect(getStudentSummary(d, s.id, "2026-11").monthly.planned).toBe(1);
});
it("independent: complaints follow rating, compensation counts entries, ambiguous history stays separate", () => {
  const d = createSeed(),
    s = d.students[0];
  s.historyStartDate = "";
  s.legacyComplaints = "2";
  s.legacyCompensations = "1";
  d.feedback = [
    { ...d.feedback[0], studentId: s.id, rating: "差评", date: "2026-10-20" },
  ];
  d.credits = [
    {
      id: "a",
      studentId: s.id,
      date: "2026-10-20",
      type: "补偿",
      units: 3,
      balance: 3,
      note: "",
      operator: "验收",
    },
    {
      id: "b",
      studentId: s.id,
      date: "2026-10-20",
      type: "赠送",
      units: 9,
      balance: 12,
      note: "",
      operator: "验收",
    },
  ];
  expect(getStudentSummary(d, s.id).complaints).toMatchObject({
    system: 1,
    total: null,
  });
  expect(getStudentSummary(d, s.id).compensations.system).toBe(1);
  d.feedback[0].rating = "好评";
  expect(getStudentSummary(d, s.id).complaints.system).toBe(0);
  s.historyStartDate = "2026-10-21";
  expect(getStudentSummary(d, s.id).compensations).toMatchObject({
    system: 0,
    total: 1,
  });
});
it("independent: history correction requires reason and audit includes human readable before/after", () => {
  let d = createSeed();
  const s = d.students[0],
    history = { ...studentHistorySchema.parse(s), legacyComplaints: "7" };
  expect(() =>
    transition(d, {
      type: "student.history.update",
      id: s.id,
      history,
      reason: "",
    }),
  ).toThrow(/原因/);
  d = transition(d, {
    type: "student.history.update",
    id: s.id,
    history,
    reason: "核对原表修正",
  }).data;
  const audit = d.events.find((e) => e.type === "更正历史资料");
  expect(audit?.content).toContain("核对原表修正");
  expect(audit?.content).toContain("→ 7");
  expect(audit?.operator).toBeTruthy();
});
it.each(["停课", "结课", "退费"] as const)(
  "independent: %s cancels future lessons, retains balances/history and resume does not resurrect",
  (status) => {
    let d = createSeed();
    const s = d.students[0],
      balance = s.balance;
    d.lessons.push({
      ...d.lessons[0],
      id: "future-independent",
      studentId: s.id,
      date: "2026-11-09",
      status: "未开始",
    });
    d = transition(d, {
      type: "student.lifecycle",
      studentId: s.id,
      status,
      reason: "独立验收",
    }).data;
    expect(d.lessons.find((l) => l.id === "future-independent")?.status).toBe(
      "已取消",
    );
    expect(d.students[0].balance).toBe(balance);
    d = transition(d, {
      type: "student.lifecycle",
      studentId: s.id,
      status: "在读",
      reason: "复课",
    }).data;
    expect(d.lessons.find((l) => l.id === "future-independent")?.status).toBe(
      "已取消",
    );
  },
);
it("independent: stopped profile keeps five tabs, offers resume and human readable history form", async () => {
  const s = demoRepository.read().students[0];
  demoRepository.execute({
    type: "student.lifecycle",
    studentId: s.id,
    status: "停课",
    reason: "验收停课",
  });
  mount(<App />, `/students/${s.id}`);
  expect(await screen.findByRole("button", { name: "办理复课" })).toBeTruthy();
  expect(screen.getAllByRole("tab")).toHaveLength(5);
  expect(screen.queryByRole("button", { name: "历史资料" })).toBeNull();
  fireEvent.click(screen.getByText("更多操作"));
  fireEvent.click(screen.getByRole("button", { name: "补录／更正历史资料" }));
  const dialog = screen.getByRole("dialog", { name: "补录／更正历史资料" });
  expect(
    within(dialog).getByRole("button", { name: "保存历史资料" }),
  ).toBeTruthy();
  expect(dialog.textContent).not.toContain("legacyComplaints");
  expect(dialog.textContent).not.toContain('"planned"');
});
it("independent: chronological lesson progress wins over insertion order; correction audits without touching balance", () => {
  let d = createSeed();
  const s = d.students[0],
    base = d.lessons[0],
    report = d.reports[0];
  d.lessons = [
    { ...base, id: "old", studentId: s.id, date: "2026-10-10" },
    { ...base, id: "new", studentId: s.id, date: "2026-10-20" },
  ];
  d.reports = [
    {
      ...report,
      id: "r-new",
      lessonId: "new",
      studentId: s.id,
      material: "Latest Book",
      to: "p30",
    },
    {
      ...report,
      id: "r-old",
      lessonId: "old",
      studentId: s.id,
      material: "Old Book",
      to: "p5",
    },
  ];
  expect(getStudentSummary(d, s.id).progress.material).toBe("Latest Book");
  const balance = s.balance;
  d = transition(d, {
    type: "report.correct",
    id: "r-old",
    material: "Old corrected",
    from: "p1",
    to: "p8",
    reason: "核实旧课",
  }).data;
  expect(getStudentSummary(d, s.id).progress.material).toBe("Latest Book");
  d = transition(d, {
    type: "report.correct",
    id: "r-new",
    material: "Latest corrected",
    from: "p20",
    to: "p35",
    reason: "核对最新报告",
  }).data;
  expect(getStudentSummary(d, s.id).progress).toMatchObject({
    material: "Latest corrected",
    unit: "p35",
  });
  expect(d.students[0].balance).toBe(balance);
  expect(
    d.events.some(
      (e) => e.type === "更正教材进度" && e.content.includes("核对最新报告"),
    ),
  ).toBe(true);
});
it("independent: suspended student cannot change teacher or move a lesson; compensation does not resume", () => {
  let d = createSeed();
  const s = d.students[0],
    l = d.lessons.find((x) => x.studentId === s.id)!;
  d = transition(d, {
    type: "student.lifecycle",
    studentId: s.id,
    status: "停课",
    reason: "休息",
  }).data;
  expect(() =>
    transition(d, {
      type: "lesson.changeTeacher",
      studentId: s.id,
      teacherId: d.teachers[1].id,
      from: "2026-11-02",
      reason: "更换",
    }),
  ).toThrow(/复课/);
  d = transition(d, {
    type: "credit.add",
    studentId: s.id,
    units: 3,
    kind: "补偿",
    note: "一次补偿三节",
  }).data;
  expect(d.students[0].status).toBe("停课");
  expect(d.lessons.find((x) => x.id === l.id)).toBeTruthy();
});

it("independent final: course report correction through full profile updates parent summary and retains balance", async () => {
  const data = demoRepository.read();
  const lesson = data.lessons
    .filter((l) => l.status === "已完成")
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  demoRepository.execute({
    type: "report.save",
    report: {
      lessonId: lesson.id,
      teacherId: lesson.teacherId,
      studentId: lesson.studentId,
      date: lesson.date,
      material: "验收教材",
      from: "p1",
      to: "p2",
      rating: 0,
      comment: "",
      suggestedLevel: "",
    },
  });
  const balance = demoRepository
    .read()
    .students.find((s) => s.id === lesson.studentId)!.balance;
  mount(<App />, `/students/${lesson.studentId}`);
  fireEvent.click(await screen.findByRole("tab", { name: "课程与教材进度" }));
  const courseButtons = screen.getAllByRole("button", {
    name: new RegExp(`查看课程 ${lesson.date} ${lesson.time}`),
  });
  fireEvent.click(courseButtons[0]);
  fireEvent.click(await screen.findByRole("button", { name: "更正教材进度" }));
  fireEvent.change(screen.getByLabelText(/结束页码／章节/), {
    target: { value: "p99" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存教材进度" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    demoRepository.read().reports.find((r) => r.lessonId === lesson.id)?.to,
  ).toBe("p2");
  fireEvent.change(screen.getByLabelText(/进度更正原因/), {
    target: { value: "独立最终UI核对" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存教材进度" }));
  await waitFor(() =>
    expect(
      demoRepository.read().reports.find((r) => r.lessonId === lesson.id)?.to,
    ).toBe("p99"),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "关闭" })[0]);
  expect(screen.getByRole("button", { name: /教材进度 p99/ })).toBeTruthy();
  expect(
    demoRepository.read().students.find((s) => s.id === lesson.studentId)
      ?.balance,
  ).toBe(balance);
});
it("independent final: real export arguments keep dynamic statistics in third sheet; xlsx reimport preserves historical counts", async () => {
  exportCapture.mockClear();
  const data = demoRepository.read(),
    s = data.students[0];
  const legacy = {
    complaints: s.legacyComplaints,
    compensations: s.legacyCompensations,
    missed: s.legacyMissed,
    total: s.totalUnits,
  };
  mount(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "导出数据" }));
  await waitFor(() => expect(exportCapture).toHaveBeenCalledTimes(1));
  const [name, headers, rows, extras] = exportCapture.mock.calls[0] as [
    string,
    string[],
    (string | number)[][],
    { name: string; headers: string[]; rows: (string | number)[][] }[],
  ];
  expect(headers).toHaveLength(27);
  expect(extras.map((e) => e.name)).toEqual([
    "月度上课明细",
    "当前课程与服务统计",
  ]);
  const book = new Workbook();
  const sheet = book.addWorksheet(name);
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  for (const e of extras) {
    const x = book.addWorksheet(e.name);
    x.addRow(e.headers);
    e.rows.forEach((r) => x.addRow(r));
  }
  const buffer = Uint8Array.from(
    new Uint8Array((await book.xlsx.writeBuffer()) as unknown as ArrayBuffer),
  ).buffer;
  const parsed = await readStudentWorkbook(buffer, data);
  const restored = parsed.rows.find((r) => r.name === s.name)!;
  expect(restored.legacyComplaints).toBe(legacy.complaints);
  expect(restored.legacyCompensations).toBe(legacy.compensations);
  expect(restored.legacyMissed).toBe(legacy.missed);
  expect(restored.totalUnits).toBe(legacy.total);
  expect(extras[1].headers).toContain("投诉已有明细");
});
it("independent final: frequency window ends today plus six days", () => {
  const d = createSeed(),
    s = d.students[0],
    base = d.lessons[0];
  d.lessons = ["2026-10-31", "2026-11-06", "2026-11-07"].map((date, i) => ({
    ...base,
    id: `window-${i}`,
    studentId: s.id,
    date,
    status: "未开始" as const,
    kind: "固定课" as const,
  }));
  expect(getStudentSummary(d, s.id).frequencyText).toBe("2节／未来7天");
});
