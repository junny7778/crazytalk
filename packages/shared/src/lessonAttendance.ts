import { operationsNow } from "./clock";
import type { Lesson } from "./model";
export const cancellationAttendanceConflict = "课程已取消，但最终考勤显示师生均已到堂，请核实本节实际上课结果";
export function bothAttendedInClassIn(lesson: Lesson): boolean {
  return !!(lesson.classInAttendanceReceived && !lesson.classInAttendanceIssue &&
    lesson.teacherIn && lesson.teacherOut && lesson.studentIn && lesson.studentOut &&
    [lesson.teacherAttendance, lesson.studentAttendance].every(tags =>
      tags?.length && tags.every(tag => tag === "正常" || tag === "迟到" || tag === "早退")));
}
export function cancellationParty(conclusion: string) {
  if (["学员取消", "学员提前3小时取消", "学员3小时内取消"].includes(conclusion)) return "学员";
  if (["老师取消", "老师24小时内取消", "老师1–5天取消", "老师超过5天请假"].includes(conclusion)) return "老师";
}
function needsLessonDecisionRepair(lesson: Lesson) {
  const reason = lesson.incident?.reason ?? "";
  if (lesson.status === "已取消") {
    if (lesson.classInAttendanceIssue) return true;
    const cancellation = lesson.cancellation;
    if (!cancellation)
      return !!cancellationParty(reason) || [reason, lesson.note].some(text => /^(?:学员|老师)(?:请假|取消|原因)/.test(text));
    const partyCancellation = /学员|老师/.test(cancellation.kind) ||
      ["老师", "学员"].includes(cancellation.responsibility);
    return partyCancellation && (!cancellation.responsibility || !Number.isFinite(Date.parse(cancellation.at)));
  }
  return lesson.status === "已完成" && (Boolean(cancellationParty(reason)) || reason === "教材错误或重复" ||
    (reason.includes("网络") && !lesson.incident?.networkOutcome));
}
export function halfMonthLastDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return day <= 15 ? 15 : new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function lessonAttendanceBlocker(l: Lesson, now: number):
  { category: "等待" | "待核"; title: string; detail: string; dataStatus?: "等待回传" | "数据缺失"; nextChangeAt?: number } | undefined {
  const start = Date.parse(l.date + "T" + l.time + ":00+08:00");
  const end = start + l.duration * 60000;
  if (l.status !== "已取消" && now < end) {
    const upcoming = now < start;
    return {
      category: "等待", title: upcoming ? "课程尚未开始" : "正在上课",
      detail: "课程结束并收到最终考勤后自动计薪",
      nextChangeAt: upcoming ? start : end,
    };
  }
  if (needsLessonDecisionRepair(l)) {
    return { category: "待核", title: "原课程结果待补核",
      detail: l.classInAttendanceIssue || "请从上课记录补齐实际取消时间、责任方或最终上课结果" };
  }
  if (l.status === "已取消") return;
  if (l.status === "已完成" && l.incident) return;
  if (l.classInAttendanceIssue) {
    return { category: "待核", title: "课程考勤待核", dataStatus: /缺少|数据缺失/.test(l.classInAttendanceIssue) ? "数据缺失" : undefined, detail: l.classInAttendanceIssue };
  }
  if (l.attendance === "账号待关联") {
    return { category: "待核", title: "上课账号待关联", detail: "请关联本节学员的 ClassIn 账号并核实最终考勤" };
  }
  if (l.classInAttendanceReceived) {
    if (!hasFinalPayrollAttendance(l)) {
      return { category: "待核", title: "课程考勤待核", dataStatus: "数据缺失", detail: "数据缺失：请核实最终摘要中的双方考勤及老师异常分钟数" };
    }
    return;
  }
  if (l.status === "未开始" || l.status === "待确认") {
    const lastDay = halfMonthLastDay(l.date);
    const last = l.date.slice(0, 8) + lastDay;
    const deadline = Date.parse(last + "T00:00:00+08:00") + (l.date === last ? 86400000 : 0);
    return now < deadline
      ? { category: "等待", title: "等待最终考勤", dataStatus: "等待回传", detail: "等待回传：收到 ClassIn 课后考勤摘要后自动计薪", nextChangeAt: deadline }
      : { category: "待核", title: "课程结果待核", dataStatus: "数据缺失", detail: "数据缺失：结算时仍未收到 ClassIn 最终考勤，请核定课程结果" };
  }
  const teacher = personAttendance(l, "老师");
  if (!teacher.includes("缺席") && (teacher.includes("待核实") || personAttendance(l, "学员").includes("待核实"))) {
    return { category: "待核", title: "课程结果待核", dataStatus: "数据缺失", detail: "请在上课记录补齐双方考勤并核实课程结果" };
  }
}

export function needsLessonOutcomeReview(lesson: Lesson, now = operationsNow()) {
  return lessonAttendanceBlocker(lesson, now)?.category === "待核";
}

export const attendanceOptions = [
  "正常",
  "老师迟到",
  "老师早退",
  "老师缺席",
  "学员迟到",
  "学员早退",
  "学员缺席",
  "待核实",
];
export function attendanceIssue(lesson: Lesson): string | undefined {
  if (lesson.classInAttendanceIssue) return lesson.classInAttendanceIssue;
  if (lesson.status === "已取消") return;
  if (lesson.attendance === "无数据") return "未收到考勤数据";
  if (lesson.attendance === "账号待关联") return "上课账号尚未关联学员";
}
export function personAttendance(
  lesson: Lesson,
  person: "老师" | "学员",
): string[] {
  if (lesson.status === "未开始" || lesson.status === "已取消") return [];
  if (attendanceIssue(lesson)) return ["待核实"];
  const tags =
    person === "老师" ? lesson.teacherAttendance : lesson.studentAttendance;
  if (tags) return tags;
  if (lesson.attendance.startsWith(person)) return [lesson.attendance.slice(2)];
  if (person === "学员" && lesson.status === "缺席") return ["缺席"];
  const hasTimes =
    person === "老师"
      ? lesson.teacherIn && lesson.teacherOut
      : lesson.studentIn && lesson.studentOut;
  return hasTimes ? ["正常"] : ["待核实"];
}
export function attendanceLabels(lesson: Lesson): string[] {
  const teacher = personAttendance(lesson, "老师");
  const student = personAttendance(lesson, "学员");
  if (!teacher.length && !student.length) return [];
  const labels = [
    ...teacher
      .filter((tag) => tag !== "正常")
      .map((tag) => (tag === "待核实" ? tag : `老师${tag}`)),
    ...student
      .filter((tag) => tag !== "正常")
      .map((tag) => (tag === "待核实" ? tag : `学员${tag}`)),
  ];
  return labels.length ? [...new Set(labels)] : ["正常"];
}

export function hasFinalPayrollAttendance(lesson: Lesson) {
  if (!lesson.classInAttendanceReceived || lesson.classInAttendanceIssue ||
      lesson.attendance === "无数据" || lesson.attendance === "账号待关联") return false;
  const { teacherAttendance, studentAttendance } = lesson;
  if (!teacherAttendance || !studentAttendance ||
      teacherAttendance.includes("待核实") || studentAttendance.includes("待核实")) return false;
  if (lesson.attendance !== "正常") {
    const tags = lesson.attendance.startsWith("老师") ? teacherAttendance : studentAttendance;
    if (!tags.some(tag => lesson.attendance.endsWith(tag))) return false;
  }
  return !teacherAttendance.some(tag => tag === "迟到" || tag === "早退") ||
    lesson.classInTeacherExceptionMinutes !== undefined;
}
