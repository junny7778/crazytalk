import { isUnstartedBooking } from "./classInChanges";
import { type DemoState } from "./model";

export function teacherOffboardImpact(data: DemoState, teacherId: string) {
  const lessons = data.lessons.filter(
    (l) => l.teacherId === teacherId && isUnstartedBooking(l),
  );
  const students = data.students.filter(
    (s) =>
      lessons.some((l) => l.studentId === s.id) ||
      (!["停课", "结课", "退费"].includes(s.status) &&
        (s.teacherId === teacherId ||
          data.slotLocks?.some(
            (l) => l.teacherId === teacherId && l.studentId === s.id,
          ))),
  );
  return { lessons, students };
}

export function refreshOffboardRebooking(data: DemoState) {
  for (const task of data.tasks) {
    if (!task.rebooking) continue;
    const complete = task.rebooking.slots.every((slot) =>
      data.lessons.some(
        (l) =>
          l.id === slot.lessonId &&
          l.status !== "已取消" &&
          (!l.syncState || l.syncState === "completed"),
      ),
    );
    task.status = complete ? "已完成" : "待处理";
    task.result = complete ? "已完成离职老师对应课程的重新安排" : "";
    task.completedAt = complete
      ? task.completedAt || new Date().toISOString()
      : "";
    if (complete) {
      task.completedBy = "系统";
      const student = data.students.find((s) => s.id === task.studentId)!;
      if (student.status === "待排课") student.status = "在读";
    }
  }
}
