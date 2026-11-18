export {
  attendanceOptions,
  attendanceIssue,
  personAttendance,
  attendanceLabels,
} from "@crazytalk/shared";

import { attendanceLabels, type Lesson } from "@crazytalk/shared";
import { isOverdueLesson, lessonStart } from "./lessonOrder";

export function recordAttendance(lesson: Lesson, now = Date.now()): string[] {
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
