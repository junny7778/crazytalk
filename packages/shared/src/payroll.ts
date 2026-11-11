import type { DemoState } from "./model";
import { personAttendance } from "./lessonAttendance";

export function payrollBreakdown(data: DemoState, id: string) {
  const p = data.payroll.find((item) => item.id === id);
  if (!p) throw new Error("找不到工资单");
  if (p.breakdownSnapshot) return p.breakdownSnapshot;
  const rate = data.teachers.find((teacher) => teacher.id === p.teacherId)?.rate ?? 0;
  // Old locked payroll has no lesson-level settlement snapshot; do not fabricate one.
  if (p.status !== "待确认") {
    const base = p.snapshot?.base ?? p.lessons * rate;
    const deductions = p.snapshot?.deductions ?? 0;
    const total = p.snapshot?.total ?? base - deductions + p.adjustment;
    return {
      opening: { units: p.lessons, amount: base, source: "历史已确认薪资汇总，原逐课计薪明细未留存" },
      rows: [], units: p.lessons, base, deductions, total,
      adjustment: total - base + deductions, adjustmentNote: p.adjustmentNote, deductionRows: [], frozen: true,
    };
  }
  const rows = data.lessons.filter((lesson) =>
    lesson.teacherId === p.teacherId && lesson.date.startsWith(p.month) &&
    lesson.status === "已完成" &&
    personAttendance(lesson, "老师").every((tag) => tag === "正常") &&
    personAttendance(lesson, "老师").length > 0 &&
    personAttendance(lesson, "学员").every((tag) => tag === "正常") &&
    personAttendance(lesson, "学员").length > 0
  ).map((lesson) => {
    const units = lesson.duration / 25;
    return { lessonId: lesson.id, date: lesson.date, time: lesson.time,
      studentId: lesson.studentId, duration: lesson.duration, units, rate,
      amount: Math.round(units * rate * 100) / 100 };
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const rowUnits = rows.reduce((sum, row) => sum + row.units, 0);
  const rowAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const opening = p.opening ?? {
    units: p.lessons - rowUnits, amount: Math.round((p.lessons * rate - rowAmount) * 100) / 100,
    source: "历史汇总余额（原总额减当前可追溯课酬），缺少原始逐课凭据",
  };
  const base = Math.round((opening.amount + rowAmount) * 100) / 100;
  const deductionRows = data.actions.filter((a) => a.teacherId === p.teacherId &&
    a.date.startsWith(p.month) && a.status === "已确认" && a.type === "扣款"
  ).map(({ id, date, reason, amount, feedbackId }) => ({ id, date, reason, amount, feedbackId }));
  const deductions = deductionRows.reduce((sum, a) => sum + a.amount, 0);
  return { opening, rows, units: opening.units + rowUnits, base, deductions,
    total: base - deductions + p.adjustment, adjustment: p.adjustment, adjustmentNote: p.adjustmentNote, deductionRows, frozen: false };
}

export function initializePayroll(data: DemoState) {
  for (const p of data.payroll) {
    if (p.status !== "待确认" && !p.breakdownSnapshot) {
      p.breakdownSnapshot = payrollBreakdown(data, p.id);
    } else if (p.status === "待确认" && !p.opening) {
      p.opening = payrollBreakdown(data, p.id).opening;
    }
  }
}
