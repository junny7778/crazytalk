import type { DemoState, Lesson } from "./model";
import { minutes, transition } from "./domain";
import { rememberLessonPay } from "./halfMonthPayroll";

function clock(minute: number) {
  return [Math.floor(minute / 60), minute % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

// The initial balances in the seed already include its completed classes.
export function finalizeDemoLessonHistory(data: DemoState): DemoState {
  const absent = data.lessons.find(l => l.id === "l93")!;
  absent.classInAttendanceReceived = true;
  absent.studentAttendance = ["正常"];
  absent.studentIn = absent.time;
  absent.studentOut = clock(minutes(absent.time) + absent.duration);
  const absenceAt = absent.date + "T" + absent.studentOut + ":00+08:00";
  rememberLessonPay(data, absent, absenceAt);
  data = transition(data, {type: "lesson.attendance", id: absent.id, person: "老师",
    result: "缺席", at: absenceAt, operator: "ClassIn"}).data;

  const waiting = data.lessons.find(l => l.id === "l25")!;
  waiting.time = "17:30";
  waiting.status = "待确认";
  waiting.note = "本节刚结束，等待 ClassIn 最终考勤。";

  for (const lesson of data.lessons.filter(l => l.status === "已完成" && l.attendance === "正常")) {
    lesson.classInAttendanceReceived = true;
    lesson.teacherAttendance = lesson.studentAttendance = ["正常"];
  }
  const occupied: Lesson[] = [];
  // Keep specific attendance/payroll scenarios in their authored slots.
  const courses = data.lessons.filter(l => l.status !== "已取消").sort((a, b) =>
    Number(/^l\d+$/.test(a.id) && a.attendance === "正常") -
    Number(/^l\d+$/.test(b.id) && b.attendance === "正常"));
  for (const lesson of courses) {
    const original = minutes(lesson.time);
    let start = original;
    const neighbors = occupied.filter(l => l.date === lesson.date &&
      (l.teacherId === lesson.teacherId || l.studentId === lesson.studentId));
    while (neighbors.some(l => minutes(l.time) < start + lesson.duration && start < minutes(l.time) + l.duration)) {
      start -= 30;
    }
    if (start !== original) {
      for (const key of ["time", "teacherIn", "teacherOut", "studentIn", "studentOut"] as const) {
        if (lesson[key]) lesson[key] = clock(minutes(lesson[key]) + start - original);
      }
    }
    occupied.push(lesson);
  }

  const charged = new Set(data.credits.filter(c => c.type === "上课扣课").map(c => c.lessonId));
  const historical = data.lessons.filter(l => l.deducted && !charged.has(l.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  for (const lesson of historical) {
    const pack = data.orders!.find(p => p.id === lesson.orderId)!;
    const opening = data.credits.find(c => c.orderId === pack.id && c.type === "期初课时")!;
    const units = lesson.confirmedUnits!;
    pack.units += units;
    pack.balance += units;
    opening.units += units;
    lesson.status = "待确认";
    lesson.deducted = false;
    const at = lesson.date + "T" + lesson.teacherOut + ":00+08:00";
    rememberLessonPay(data, lesson, at);
  }
  if (historical.length) {
    data = transition(data, {type: "lesson.resolve", ids: historical.map(l => l.id),
      decision: "扣课", operator: "系统自动扣课", reason: "双方考勤正常，按核定课时扣课。"}).data;
    for (const lesson of historical) {
      const at = lesson.date + "T" + lesson.teacherOut + ":00+08:00";
      const credit = data.credits.find(c => c.lessonId === lesson.id)!;
      const event = data.events.find(e => e.relatedType === "lesson" && e.relatedId === lesson.id)!;
      credit.id = "demo-history-" + lesson.id;
      event.id = "demo-resolve-" + lesson.id;
      credit.date = event.date = lesson.date;
      credit.recordedAt = event.recordedAt = at;
    }
  }
  for (const pack of data.orders ?? []) {
    const opening = data.credits.find(c => c.orderId === pack.id && c.type === "期初课时");
    if (!opening) continue;
    pack.date = opening.date;
    let balance = 0;
    for (const entry of data.credits.filter(c => c.orderId === pack.id)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.recordedAt ?? "").localeCompare(b.recordedAt ?? ""))) {
      balance += entry.units;
      entry.balance = balance;
    }
  }
  for (const lesson of data.lessons.filter(l => l.deducted && l.studentIn)) {
    const student = data.students.find(s => s.id === lesson.studentId)!;
    if (lesson.date > student.lastLesson) student.lastLesson = lesson.date;
  }
  const result = transition(data, {type: "teacher.offboard", teacherId: "demo-tutor-nora",
    payrollEndDate: "2026-10-31", reason: "固定时段授课合同到期"}).data;
  result.events[0].id = "demo-offboard-nora";
  return result;
}
