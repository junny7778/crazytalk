import { refreshOffboardRebooking } from "../../../../packages/shared/src/teacherOffboard";
import { refreshRefundSync } from "./refund-sync";
import { DemoState } from "../../../../packages/shared/src/model";
import { Transaction } from "../store";
import { bookingIdentities } from "./classes";

export async function queueClassInChanges(tx: Transaction, before: DemoState, after: DemoState, operationId?: string) {
  for (const student of after.students) {
    const old = before.students.find(s => s.id === student.id);
    if (!old || old.ownerAccountId === student.ownerAccountId) continue;
    const groups = await tx.classInClass.findMany({where:{studentId:student.id}});
    const mappings = await tx.classInLesson.findMany({where:{lessonId:{in:after.lessons.filter(l => l.studentId === student.id).map(l => l.id)},courseId:{not:null}}});
    const courseIds = new Set([...groups.map(g => g.courseId),...mappings.map(m => m.courseId)].filter((v):v is string => !!v));
    if (courseIds.size && !after.accounts.some(a => a.id === student.ownerAccountId && a.enabled && a.classInUid)) throw new Error("接手教务须先关联 ClassIn 账号，再交接已有班级");
    for (const courseId of courseIds) {
      await tx.classInJob.create({data:{operationId, operation:"course.owner",classLocalId:groups.find(g => g.courseId === courseId)?.id,payload:{courseId,studentId:student.id,ownerAccountId:student.ownerAccountId || ""}}});
    }
  }
  for (const lesson of after.lessons) {
    const previous = before.lessons.find(item => item.id === lesson.id);
    const schedule = (item: typeof lesson) => [item.studentId, item.teacherId, item.date, item.time, item.duration, item.status === "已取消"];
    const accountUid = (state: DemoState) => state.classInAccounts?.find(account => account.studentIds.includes(lesson.studentId))?.uid;
    const teacherUid = (state: DemoState) => state.teachers.find(teacher => teacher.id === lesson.teacherId)?.classInUid;
    const accountChanged = (accountUid(before) !== accountUid(after) || teacherUid(before) !== teacherUid(after)) && lesson.status === "未开始";
    if (previous && JSON.stringify(schedule(previous)) === JSON.stringify(schedule(lesson)) && !accountChanged) continue;
    const operation = lesson.status === "已取消" ? "cancel" : previous ? "update" : "create";
    if (operation === "create") {
      const {student,teacher} = bookingIdentities(after,lesson);
      const existing = await tx.classInClass.findUnique({where:{studentId_teacherId:{studentId:student.id,teacherId:teacher.id}}});
      if (!existing && [...`${student.chineseName} ${student.id} - ${teacher.name} 学习群`].length > 90) throw new Error("班级名称超过 ClassIn 的 90 字限制，请缩短学员或老师名称");
    }
    if (previous && (previous.teacherId !== lesson.teacherId || previous.studentId !== lesson.studentId) && await tx.classInLesson.findFirst({where:{lessonId:lesson.id,courseId:{not:null}}}))
      throw new Error("已关联 ClassIn 的课程不能直接换师或换学员，请取消后重新排课");
    if (operation === "update" && previous && !lesson.classInPreviousSlot) {
      const {date,time,duration,teacherId} = previous;
      lesson.classInPreviousSlot = {date,time,duration,teacherId};
    }
    await tx.classInJob.updateMany({
      where: { lessonId: lesson.id, status: { in: ["pending", "failed", "blocked"] } },
      data: { status: "superseded" },
    });
    const refund = operation === "cancel" && before.students.find(item => item.id === lesson.studentId)?.status !== "退费" && after.students.find(item => item.id === lesson.studentId)?.status === "退费"
      ? after.events.find(item => item.studentId === lesson.studentId && item.type === "退费") : undefined;
    await tx.classInJob.create({ data: { operationId, lessonId: lesson.id, operation, payload: refund ? { ...lesson, serviceStopEventId: refund.id } : lesson } });
    lesson.sync = "处理中";
    lesson.syncReason = "等待 ClassIn 同步";
    lesson.syncState = "pending";
    lesson.syncRetryable = false;
  }
  refreshOffboardRebooking(after);
  await refreshRefundSync(tx, after);
}
