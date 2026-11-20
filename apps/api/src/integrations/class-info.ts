import { z } from "zod";
import {
  isAvailable,
  transition,
} from "../../../../packages/shared/src/domain";
import { readState, writeState, type Transaction } from "../store";

const uid = z.coerce.string();
const patchSchema = z.object({
  courseName: z.string().optional(),
  courseStatus: z.number().optional(),
  mainTeacherInfo: z.object({ teacherUid: uid }).optional(),
  beginTime: z.number().optional(),
  endTime: z.number().optional(),
  classStatus: z.number().optional(),
  teacherInfo: z.object({ teacherUid: uid }).optional(),
  studentInfos: z.array(z.object({ studentUid: uid })).optional(),
});
const noticeSchema = z.object({
  Cmd: z.enum([
    "eeoCourseInfoChange",
    "eeoClassInfoChange",
    "eeoCourseStudentChange",
    "eeoClassStudentChange",
  ]),
  CourseId: uid,
  ClassID: uid.optional(),
  opType: z.number(),
  opTime: z.number(),
  opData: patchSchema,
});
const factsSchema = z.object({
  values: patchSchema.default({}),
  times: z.record(z.number()).default({}),
  studentUids: z.array(z.string()).optional(),
});

export async function applyClassInfoEvent(tx: Transaction, input: unknown) {
  const event = noticeSchema.parse(input);
  const isClass =
    event.Cmd === "eeoClassInfoChange" || event.Cmd === "eeoClassStudentChange";
  const mapping =
    isClass && event.ClassID
      ? await tx.classInLesson.findFirst({
          where: { courseId: event.CourseId, classId: event.ClassID },
        })
      : null;
  const group = !isClass
    ? await tx.classInClass.findUnique({ where: { courseId: event.CourseId } })
    : null;
  if (isClass && !mapping) return "待关联外部课节";
  if (!isClass && !group) return "待关联外部班级";
  const current = factsSchema.parse((mapping ?? group)!.externalFacts ?? {});
  const incoming = {
    ...event.opData,
    ...(isClass && event.opType === 2 && event.Cmd === "eeoClassInfoChange"
      ? { classStatus: 4 }
      : {}),
  };
  // Notifications contain partial fields. A late name update must not discard a newer time update.
  const accepted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    const field = event.Cmd + ":" + key;
    if (event.opTime < (current.times[field] ?? 0)) continue;
    accepted[key] = value;
    current.times[field] = event.opTime;
  }
  if (!Object.keys(accepted).length) return null;
  const values = patchSchema.parse({ ...current.values, ...accepted });
  if ("studentInfos" in accepted) {
    const members = new Set(
      current.studentUids ??
        [mapping?.studentUid ?? group?.studentUid].filter(
          (v): v is string => !!v,
        ),
    );
    for (const member of values.studentInfos ?? []) {
      if (event.opType === 2) members.delete(member.studentUid);
      else members.add(member.studentUid);
    }
    current.studentUids = [...members];
  }
  const facts = JSON.parse(
    JSON.stringify({
      values,
      times: current.times,
      studentUids: current.studentUids,
    }),
  );
  if (mapping)
    await tx.classInLesson.update({
      where: { lessonId: mapping.lessonId },
      data: {
        externalFacts: facts,
        externalUpdatedAt: Math.max(
          mapping.externalUpdatedAt ?? 0,
          event.opTime,
        ),
      },
    });
  if (group) {
    await tx.classInClass.update({
      where: { id: group.id },
      data: {
        externalFacts: facts,
        externalUpdatedAt: Math.max(group.externalUpdatedAt ?? 0, event.opTime),
        ...(accepted.courseName !== undefined
          ? { name: values.courseName }
          : {}),
        ...(accepted.mainTeacherInfo !== undefined
          ? { mainTeacherUid: values.mainTeacherInfo!.teacherUid }
          : {}),
      },
    });
    if (event.Cmd === "eeoCourseStudentChange" && "studentInfos" in accepted) {
      const state = await readState(tx);
      const expected = state.classInAccounts?.find((a) =>
        a.studentIds.includes(group.studentId),
      )?.uid;
      if (
        current.studentUids?.length !== 1 ||
        current.studentUids[0] !== expected
      ) {
        await tx.classInClass.update({
          where: { id: group.id },
          data: { studentUid: null },
        });
        return "ClassIn 班级学生发生变更，与本地学员账号不一致，请核实成员";
      }
      await tx.classInClass.update({
        where: { id: group.id },
        data: { studentUid: expected },
      });
    }
    return null;
  }
  let state = await readState(tx);
  let lesson = state.lessons.find((l) => l.id === mapping!.lessonId);
  if (!lesson) return "本地课节不存在";
  if (lesson.status === "已取消" && values.classStatus !== 4) return null;
  if (
    values.classStatus !== 4 &&
    (await tx.classInJob.count({
      where: {
        lessonId: lesson.id,
        status: {
          in: ["pending", "processing", "failed", "blocked", "uncertain"],
        },
        createdAt: { gte: new Date((event.opTime + 1) * 1000) },
      },
    }))
  )
    return null;
  const before = structuredClone(state);
  const previous = JSON.stringify(lesson);
  let conflict = "";
  if (
    current.studentUids &&
    (current.studentUids.length !== 1 ||
      current.studentUids[0] !== mapping!.studentUid) &&
    lesson.status !== "已取消"
  ) {
    conflict = "ClassIn 课节学员发生变更，请核实；本地学员归属保持原记录";
  }
  if (
    values.teacherInfo &&
    values.teacherInfo.teacherUid !== mapping!.teacherUid
  )
    conflict = "ClassIn 主讲老师与本地班级归属不一致，请核实";
  if (event.Cmd === "eeoClassInfoChange") {
    if (values.classStatus === 4 && lesson.status !== "已取消") {
      state = transition(state, {
        type: "lesson.cancel",
        id: lesson.id,
        reason: "ClassIn 外部取消，扣课责任待核实",
        responsibility: "平台",
        operator: "ClassIn 同步",
      }).data;
      lesson = state.lessons.find((l) => l.id === mapping!.lessonId)!;
    } else if (
      lesson.status !== "已取消" &&
      ("beginTime" in accepted || "endTime" in accepted)
    ) {
      const start =
        values.beginTime ??
        Date.parse(`${lesson.date}T${lesson.time}:00+08:00`) / 1000;
      const end = values.endTime ?? start + lesson.duration * 60;
      if (end <= start) return "ClassIn 课节时间无效，请核实";
      const local = new Date(start * 1000 + 8 * 3600000).toISOString();
      lesson.date = local.slice(0, 10);
      lesson.time = local.slice(11, 16);
      lesson.duration = (end - start) / 60;
      const clashes = isAvailable(
        state,
        lesson.teacherId,
        lesson.date,
        lesson.time,
        lesson.duration,
        lesson.studentId,
        lesson.id,
        true,
        true,
      );
      if (clashes.length)
        conflict ||= `ClassIn 已改期，与本地安排冲突：${clashes.join("；")}`;
    }
    if (
      lesson.status !== "已取消" &&
      values.classStatus === 3 &&
      lesson.status === "未开始"
    )
      lesson.status = "待确认";
  }
  if (lesson.status === "已取消") {
    conflict = "";
    state.slotLocks = state.slotLocks?.filter(
      (lock) =>
        !(
          lock.studentId === lesson!.studentId &&
          lock.teacherId === lesson!.teacherId &&
          lock.date === lesson!.date &&
          lock.time === lesson!.time
        ),
    );
  }
  lesson.conflict = !!conflict;
  lesson.sync = conflict ? "未同步" : "已同步";
  lesson.syncState = conflict ? "blocked" : "completed";
  if (!conflict) delete lesson.classInPreviousSlot;
  lesson.syncRetryable = false;
  lesson.syncReason = conflict;
  if (values.classStatus === 4 && event.Cmd === "eeoClassInfoChange") {
    // A deletion notification confirms cancellation even if our HTTP response was lost.
    await tx.classInJob.updateMany({
      where: {
        lessonId: lesson.id,
        operation: "cancel",
        status: { in: ["pending", "failed", "blocked", "uncertain"] },
      },
      data: { status: "completed", error: null },
    });
    await tx.classInJob.updateMany({
      where: {
        lessonId: lesson.id,
        operation: { in: ["create", "update"] },
        status: { in: ["pending", "failed", "blocked", "uncertain"] },
      },
      data: { status: "superseded" },
    });
  }
  if (JSON.stringify(lesson) !== previous) {
    state.events.unshift({
      id: crypto.randomUUID(),
      date: new Date(event.opTime * 1000).toISOString(),
      studentId: lesson.studentId,
      teacherId: lesson.teacherId,
      type: "ClassIn 课程变更",
      operator: "ClassIn 同步",
      content:
        conflict ||
        `已同步外部课程：${lesson.date} ${lesson.time} ${lesson.status}`,
      relatedType: "lesson",
      relatedId: lesson.id,
    });
    // This is an inbound state change, so never enqueue a matching outbound edit.
    await tx.classInJob.updateMany({
      where: {
        lessonId: lesson.id,
        operation: { not: "cancel" },
        status: { in: ["pending", "failed", "blocked"] },
        createdAt: { lte: new Date(event.opTime * 1000) },
      },
      data: { status: "superseded" },
    });
    await writeState(tx, state, before);
  }
  return conflict || null;
}
