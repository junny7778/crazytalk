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
    !(lesson.attendanceMessages?.学员 && !lesson.studentIn) &&
    !(lesson.attendanceMessages?.老师 && !lesson.teacherIn) &&
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
  const balances = new Map(input.orders?.map(order => [order.id, order.balance]));
  const ids: string[] = [];
  for (const lesson of input.lessons) {
    if (!canAutoSettleLesson(lesson, now)) continue;
    const memberOrders = input.orders?.filter(order => order.studentIds.includes(lesson.studentId)) ?? [];
    const order = lesson.orderId ? input.orders?.find(item => item.id === lesson.orderId)
      : memberOrders.length === 1 ? memberOrders[0] : undefined;
    if (order) {
      const available = balances.get(order.id) ?? 0;
      const units = lesson.confirmedUnits!;
      if (available < units) continue;
      balances.set(order.id, available - units);
    } else if (lesson.orderId || input.packageBalanceVersion || memberOrders.length ||
      !input.students.some(student => student.id === lesson.studentId && student.balanceKnown)) {
      continue;
    }
    ids.push(lesson.id);
  }
  if (!ids.length) return input;
  return transition(input, {
    type: "lesson.resolve",
    ids,
    decision: "扣课",
    reason: "课程已结束且双方考勤正常，按预设课时自动扣课",
    operator: "系统自动扣课",
  }).data;
}
