// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { createSeed, DEMO_TODAY, emptyStudentProfile, studentProfileSchema, transition } from "@crazytalk/shared";
import { demoRepository, DEMO_STORAGE_KEY } from "../../../../packages/shared/src/repository";
import { readStudentWorkbook, studentWorkbookRow } from "../lib/studentWorkbook";
import Students from "../pages/Students";
import TeacherApp from "../../../teacher/src/App";
import Schedule from "../pages/Schedule";

function mount(child: React.ReactNode, path = "/students") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DemoProvider><ToastProvider><MemoryRouter initialEntries={[path]}>{child}</MemoryRouter></ToastProvider></DemoProvider>
  </QueryClientProvider>);
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("scrollTo", () => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("独立需求验收：学生档案与老师结课", () => {
  it("真实源文件每一业务行的27列文本/数字往返保留，年份不补猜", async () => {
    const source = await readFile(resolve(process.cwd(), "../docs/学生课程信息表.xlsx"));
    const { Workbook } = await import("exceljs");
    const book = new Workbook();
    await book.xlsx.load(Uint8Array.from(source).buffer);
    const result = await readStudentWorkbook(Uint8Array.from(source).buffer, createSeed());
    const sheet = book.worksheets[0];
    const actual = result.rows.map(row => studentWorkbookRow(row));
    const expected: (string | number)[][] = [];
    sheet.eachRow((row, rowNo) => {
      if (rowNo < 3 || !row.getCell(6).text.trim()) return;
      expected.push(Array.from({ length: 27 }, (_, index) => {
        if(index===4)return ""; // 新模板中的学员 ID 在首次导入时留空分配。
        const cell = row.getCell(index + 1);
        if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
        if (typeof cell.value === "number" && [2, 14].includes(index)) {
          return new Date(Date.UTC(1899, 11, 30) + cell.value * 86400000).toISOString().slice(0, 10);
        }
        if (typeof cell.value === "number" && [7, 12, 13, 15].includes(index)) return cell.value;
        return cell.text.trim();
      }));
    });
    expect(actual).toEqual(expected);
    expect(result.rows[0].groupName).toBe(sheet.getRow(3).getCell(5).text.trim());
    expect(result.rows).toHaveLength(55);
    expect(result.skipped).toBe(2);
    expect(result.rows.every(row => row.monthlyRecords[0].month === "7月（原表，年份未注明）")).toBe(true);
  });

  it("覆盖导入不能静默更换老师并造成原表、关联老师与后续课不一致", () => {
    const before = demoRepository.read();
    const snapshot = structuredClone(before);
    const student = before.students[0];
    const another = before.teachers.find(t => t.id !== student.teacherId)!;
    expect(() => demoRepository.execute({ type: "student.import", mode: "update", students: [{
      ...studentProfileSchema.parse(student), code: "", teacherName: another.name, teacherId: another.id,
    }] })).toThrow(/换老师/);
    expect(demoRepository.read()).toEqual(snapshot);
    mount(<Students />, `/students?q=${encodeURIComponent(student.name)}`);
    const row = screen.getByRole("link", { name: student.name }).closest("tr")!;
    expect(within(row).getByRole("cell", { name: student.teacherName })).toBeTruthy();
  });

  it("原表覆盖更新保留余额、已登记月份、转介绍、待办和换师流水", () => {
    const before = createSeed();
    const s = before.students[0];
    s.monthlyRecords.push({ id: "history-month", month: "2026-11", planned: 0, actual: null, note: "保留" });
    s.teacherChanges.push({ id: "change-history", date: "2026-10-01", fromTeacher: "A", toTeacher: "B", reason: "已确认" });
    const after = transition(before, { type: "student.import", mode: "update", students: [{ ...studentProfileSchema.parse(s), totalUnits: 123, monthlyRecords: [] }] }).data;
    const updated = after.students.find(row => row.id === s.id)!;
    expect(updated.balance).toBe(s.balance);
    expect(updated.monthlyRecords).toEqual(s.monthlyRecords);
    expect(updated.teacherChanges).toEqual(s.teacherChanges);
    expect(after.credits).toEqual(before.credits);
    expect(after.referrals).toEqual(before.referrals);
    expect(after.tasks).toEqual(before.tasks);
  });

  it("无台账依据的新档案不把未知剩余课时当作已核实0", () => {
    const after = transition(createSeed(), { type: "student.create", student: { ...emptyStudentProfile(), name: "余额未知的新学生" } }).data;
    expect(after.students[0].balanceKnown).toBe(false);
    expect(after.students[0].totalUnits).toBeNull();
    expect(after.students[0].code).toMatch(/^SYS-/);
  });

  it("缺少本次新增字段的旧存储加载不清空已有档案和余额", () => {
    const fixture = createSeed();
    fixture.students[0].name = "原存储保护标记";
    fixture.students[0].balance = -3;
    const legacy = JSON.parse(JSON.stringify(fixture));
    delete legacy.tasks;
    delete legacy.referrals;
    for (const student of legacy.students) {
      for (const key of ["sourceSequence", "groupName", "orderStatus", "ageText", "teacherName", "monthlyRecords", "teacherChanges", "serviceStopResults", "totalUnits", "balanceKnown"]) delete student[key];
    }
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(legacy));
    const loaded = demoRepository.refresh();
    expect(loaded.students[0]).toMatchObject({ id: fixture.students[0].id, code: fixture.students[0].code, name: "原存储保护标记", balance: -3 });
    expect(loaded.students).toHaveLength(fixture.students.length);
    expect(loaded.lessons).toEqual(fixture.lessons);
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toContain("原存储保护标记");
  });

  it("退款仅停用未来教学服务，不抹去历史课、余额或既有服务记录", () => {
    const before = createSeed();
    const s = before.students[0];
    const historic = before.lessons.filter(l => l.studentId === s.id && l.date < DEMO_TODAY);
    const after = transition(before, { type: "student.lifecycle", studentId: s.id, status: "退费", reason: "客户确认" }).data;
    expect(after.students[0].balance).toBe(s.balance);
    expect(after.students[0].orderStatus).toBe("退款");
    expect(after.lessons.filter(l => l.studentId === s.id && l.date < DEMO_TODAY)).toEqual(historic);
    expect(after.lessons.some(l => l.studentId === s.id && l.date >= DEMO_TODAY && l.status === "未开始")).toBe(false);
    expect(after.feedback).toEqual(before.feedback);
    expect(after.credits).toEqual(before.credits);
  });

  it.each(["补偿", "续费"])("给结课学生登记%s不会隐式复课，明确复课才恢复正常", kind => {
    const before = createSeed();
    const student = before.students[0];
    const ended = transition(before, { type: "student.lifecycle", studentId: student.id, status: "结课", reason: "服务已结束" }).data;
    const after = transition(ended, { type: "credit.add", studentId: student.id, units: 1, kind, date: "2026-10-01", note: "补记历史业务" }).data;
    expect(after.students[0]).toMatchObject({ status: "结课", orderStatus: "结课", balance: student.balance + 1 });
    expect(after.students[0].renewalStatus).toBe(kind === "续费" ? "是" : student.renewalStatus);
    const resumed = transition(after, { type: "student.lifecycle", studentId: student.id, status: "在读", reason: "确认恢复教学服务" }).data;
    expect(resumed.students[0]).toMatchObject({ status: "在读", orderStatus: "正常", balance: student.balance + 1 });
  });

  it("老师能对今天已完成的课程立即提交教材页码并结课", () => {
    const fixture = createSeed();
    fixture.language = "zh";
    const l = fixture.lessons.find(row => row.teacherId === "t1")!;
    fixture.lessons = [{ ...l, id: "review-today-completed", date: DEMO_TODAY, time: "17:00", status: "已完成" }];
    fixture.reports = [];
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fixture));
    demoRepository.refresh();
    mount(<TeacherApp />);
    const today = screen.getByRole("heading", { name: "今日课程" }).closest("section")!;
    fireEvent.click(today.querySelector(".teacher-lesson-row")!);
    expect(screen.getByRole("button", { name: "结课" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "结课" }));
    fireEvent.change(screen.getByLabelText("教材", { exact: true }), { target: { value: "验收新教材" } });
    fireEvent.change(screen.getByLabelText("页码", { exact: true }), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: "提交结课" }));
    const saved = demoRepository.read();
    expect(saved.reports).toHaveLength(1);
    expect(saved.reports[0]).toMatchObject({ material: "验收新教材", comment: "", rating: 0 });
    expect(saved.students.find(s => s.id === l.studentId)?.material).toBe("验收新教材");
    expect(saved.students.find(s => s.id === l.studentId)?.unit).toContain("p.17");
    expect(saved.lessons[0].deducted).toBe(l.deducted);
  });

  it("未来、未开始和已取消课程均不能提前提交教学进度", () => {
    const fixture = createSeed();
    const sample = fixture.lessons[0];
    for (const lesson of [
      { ...sample, date: "2099-01-01", status: "已完成" as const },
      { ...sample, date: DEMO_TODAY, status: "未开始" as const },
      { ...sample, date: DEMO_TODAY, status: "已取消" as const },
    ]) {
      const state = { ...fixture, lessons: [lesson], reports: [] };
      expect(() => transition(state, { type: "report.save", report: {
        lessonId: lesson.id, studentId: lesson.studentId, teacherId: lesson.teacherId,
        date: DEMO_TODAY, material: "教材", from: "", to: "p.5", rating: 0, comment: "", suggestedLevel: "",
      } })).toThrow();
      expect(state.reports).toEqual([]);
    }
  });

  it("55分钟排课不预设2课时，时长下拉支持原表55分钟", () => {
    mount(<Schedule />, `/schedule?student=s1&date=${DEMO_TODAY}`);
    fireEvent.click(screen.getByRole("combobox", { name: "每节时长" }));
    expect(screen.getByRole("option", { name: "55 分钟" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /分钟.*课时/ })).toBeNull();
  });

  it.each(["固定课", "临时课"] as const)("55分钟%s可从真实排课表单保存，并联动学生与老师课表", kind => {
    const fixture = createSeed();
    fixture.lessons = [];
    fixture.leaves = [];
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fixture));
    demoRepository.refresh();
    mount(<Schedule />, `/schedule?student=s1&date=${DEMO_TODAY}`);
    fireEvent.click(screen.getByRole("combobox", { name: "每节时长" }));
    fireEvent.click(screen.getByRole("option", { name: "55 分钟" }));
    fireEvent.click(screen.getByRole("button", { name: `T. Carol ${DEMO_TODAY} 17:00 常规可排` }));
    fireEvent.click(screen.getByRole("button", { name: kind === "固定课" ? "给 Jayden 排固定课" : "排临时课" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "确认排课" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "确认排课" }));
    const saved = demoRepository.read();
    expect(saved.lessons).toHaveLength(kind === "固定课" ? 8 : 1);
    expect(saved.lessons.every(l => l.studentId === "s1" && l.teacherId === "t1" && l.duration === 55 && l.kind === kind)).toBe(true);
    expect(saved.lessons.every(l => !l.deducted && l.confirmedUnits === undefined)).toBe(true);
    expect(saved.students[0].teacherId).toBe("t1");
  });

  it("55分钟未核实课程详情不按分钟自动声称已知课时数", () => {
    const fixture = createSeed();
    const lesson = fixture.lessons.find(l => l.teacherId === "t1")!;
    fixture.lessons = [{ ...lesson, id: "review-55", date: DEMO_TODAY, time: "17:00", duration: 55, status: "未开始", deducted: false }];
    delete fixture.lessons[0].confirmedUnits;
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fixture));
    demoRepository.refresh();
    const { container } = mount(<Schedule />, `/schedule?date=${DEMO_TODAY}`);
    fireEvent.click(container.querySelector(".schedule-lesson")!);
    const detail = screen.getByRole("dialog");
    expect(detail.textContent).toContain("55 分钟");
    expect(detail.textContent).not.toMatch(/55 分钟.*2 课时/);
  });
});
