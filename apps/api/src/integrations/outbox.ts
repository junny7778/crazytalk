import { refreshRefundSync } from "./refund-sync";
import { DemoState } from "../../../../packages/shared/src/model";
import { Transaction } from "../store";

export async function queueClassInChanges(tx: Transaction, before: DemoState, after: DemoState) {
  for (const lesson of after.lessons) {
    const previous = before.lessons.find(item => item.id === lesson.id);
    const schedule = (item: typeof lesson) => [item.studentId, item.teacherId, item.date, item.time, item.duration, item.status === "已取消"];
    const accountUid = (state: DemoState) => state.classInAccounts?.find(account => account.studentIds.includes(lesson.studentId))?.uid;
    const teacherUid = (state: DemoState) => state.teachers.find(teacher => teacher.id === lesson.teacherId)?.classInUid;
    const accountChanged = (accountUid(before) !== accountUid(after) || teacherUid(before) !== teacherUid(after)) && lesson.status === "未开始";
    if (previous && JSON.stringify(schedule(previous)) === JSON.stringify(schedule(lesson)) && !accountChanged) continue;
    const operation = lesson.status === "已取消" ? "cancel" : previous ? "update" : "create";
    await tx.classInJob.updateMany({
      where: { lessonId: lesson.id, status: { in: ["pending", "failed", "blocked"] } },
      data: { status: "superseded" },
    });
    const refund = operation === "cancel" && before.students.find(item => item.id === lesson.studentId)?.status !== "退费" && after.students.find(item => item.id === lesson.studentId)?.status === "退费"
      ? after.events.find(item => item.studentId === lesson.studentId && item.type === "退费") : undefined;
    await tx.classInJob.create({ data: { lessonId: lesson.id, operation, payload: refund ? { ...lesson, serviceStopEventId: refund.id } : lesson } });
    lesson.sync = "处理中";
    lesson.syncReason = "等待 ClassIn 同步";
  }
  await refreshRefundSync(tx, after);
}
