import { operationsNow } from "@crazytalk/shared";
export {
  attendanceOptions,
  attendanceIssue,
  personAttendance,
  attendanceLabels,
} from "@crazytalk/shared";

import { attendanceLabels, hasFinalPayrollAttendance, lessonAttendanceBlocker, personAttendance, type Lesson } from "@crazytalk/shared";
import { isOverdueLesson, lessonStart } from "./lessonOrder";

function attendanceDataStatus(lesson: Lesson, now: number) {
  const blocker = lessonAttendanceBlocker(lesson, now);
  if (blocker?.category === "等待" && lesson.status === "待确认" && !lesson.classInAttendanceReceived && !lesson.incident &&
      (lesson.attendance.endsWith("缺席") || lesson.studentAttendance?.includes("缺席") || lesson.teacherAttendance?.includes("缺席"))) {
    return "等待回传";
  }
  return blocker?.dataStatus;
}

export function recordPersonAttendance(lesson: Lesson, person: "老师" | "学员", now: number) {
  const label = attendanceDataStatus(lesson, now);
  if (label) {
    const [enter, leave] = person === "老师" ? [lesson.teacherIn, lesson.teacherOut] : [lesson.studentIn, lesson.studentOut];
    return enter && leave ? "已记录进出" : label;
  }
  if (isOverdueLesson(lesson, now)) return "待核实";
  return personAttendance(lesson, person).join("、") || "—";
}

export function hasReportedStudentAbsence(lesson: Lesson) {
  return hasFinalPayrollAttendance(lesson) && lesson.studentAttendance?.includes("缺席") && !lesson.incident;
}

export function recordAttendance(lesson: Lesson, now = operationsNow()): string[] {
  const missing = attendanceDataStatus(lesson, now);
  if (missing) return [missing];
  return isOverdueLesson(lesson, now) ? ["待核实"] : attendanceLabels(lesson);
}

export function teacherNoShowHint(lesson: Lesson): string | undefined {
  const notice = lesson.attendanceMessages?.老师;
  if (!notice || lesson.teacherIn || lesson.attendanceFinal?.老师 ||
      (lesson.status !== "未开始" && lesson.status !== "待确认")) return;

  const observedAt = Date.parse(lesson.attendanceUpdates?.老师 ?? notice);
  const elapsed = observedAt - lessonStart(lesson);
  if (elapsed >= 10 * 60_000)
    return "开课满 10 分钟，老师仍未到堂";
}
