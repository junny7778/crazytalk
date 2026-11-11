import type { DemoState, Lesson } from "./model";
import { attendanceLabels } from "./lessonAttendance";
import { transition } from "./domain";
export function canAutoSettleLesson(lesson: Lesson, now: number): boolean {
  const end =
    Date.parse(`${lesson.date}T${lesson.time}:00+08:00`) +
    lesson.duration * 60_000;
  const attendance = attendanceLabels(lesson);
  return (
    lesson.status === "待确认" &&
    lesson.attendance === "正常" &&
    !lesson.requiresScreenshot &&
    !lesson.autoSettlementPaused &&
    !lesson.deducted &&
    end <= now &&
    Number.isFinite(lesson.confirmedUnits) &&
    (lesson.confirmedUnits ?? 0) > 0 &&
    attendance.length === 1 &&
    attendance[0] === "正常"
  );
}
export function autoSettleLessons(
  input: DemoState,
  now = Date.now(),
): DemoState {
  const ids = input.lessons
    .filter(
      (l) =>
        canAutoSettleLesson(l, now) &&
        (l.orderId ? input.orders?.some(o => o.id === l.orderId) : input.students.some((s) => s.id === l.studentId && s.balanceKnown)),
    )
    .map((l) => l.id);
  if (!ids.length) return input;
  return transition(input, {
    type: "lesson.resolve",
    ids,
    decision: "扣课",
    reason: "课程已结束且双方考勤正常，按预设课时自动扣课",
    operator: "系统自动扣课",
  }).data;
}
