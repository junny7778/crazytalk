import type { DemoState } from "./model";

export function scheduleUnits(duration: number, manualUnits?: number) {
  return duration === 25 ? 1 : duration === 50 ? 2 : manualUnits;
}
export function getScheduleCredits(
  data: DemoState,
  studentId: string,
  count: number,
  unitsPerLesson: number,
) {
  const student = data.students.find((item) => item.id === studentId);
  const pending = data.lessons.filter(
    (lesson) =>
      lesson.studentId === studentId &&
      !lesson.deducted &&
      ["未开始", "待确认", "缺席"].includes(lesson.status),
  );
  const unknownCount = pending.filter(
    (lesson) =>
      scheduleUnits(lesson.duration, lesson.plannedUnits) === undefined,
  ).length;
  const reserved = Number(
    pending
      .reduce(
        (sum, lesson) =>
          sum + (scheduleUnits(lesson.duration, lesson.plannedUnits) ?? 0),
        0,
      )
      .toFixed(8),
  );
  const balance = student?.balance ?? 0;
  const available = Number((balance - reserved).toFixed(8));
  const required = Number((count * unitsPerLesson).toFixed(8));
  let error = "";
  if (!student) error = "请选择学员";
  else if (!student.balanceKnown) error = "请先核实并录入剩余课时";
  else if (
    !Number.isFinite(unitsPerLesson) ||
    unitsPerLesson <= 0 ||
    !Number.isInteger(count) ||
    count < 0
  )
    error = "请填写有效的每节预计扣课数";
  else if (unknownCount)
    error = `有 ${unknownCount} 节已排课程尚未登记预计扣课数，请先核实占用课时`;
  else if (required > available)
    error = `可用课时不足：剩余 ${balance} 课时，已占用 ${reserved} 课时，可用 ${available} 课时，本次需要 ${required} 课时`;
  return { balance, reserved, available, required, unknownCount, error };
}
