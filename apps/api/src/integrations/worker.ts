import { refreshRefundSync } from "./refund-sync";
import { processMappedClassInEvents } from "./webhook-replay";
import { createHash } from "node:crypto";
import { loadClassInConfiguration } from "./credentials";
import { z } from "zod";
import { database, lockBusiness, readState, writeState, type Transaction } from "../store";
import { ClassInClient, ClassInUncertainError } from "./classin";
import { lessonSchema } from "../../../../packages/shared/src/model";

export async function processClassInJob(clientFactory = async () => new ClassInClient(await loadClassInConfiguration())) {
  await database.$transaction(async lock => {
    const rows = await lock.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(183019) AS acquired`;
    if (!rows[0].acquired) return;
    const abandoned = await database.classInJob.findMany({ where: { status: "processing" } });
    for (const job of abandoned) {
      await database.$transaction(async tx => {
        await lockBusiness(tx);
        await tx.classInJob.update({ where: { id: job.id }, data: { status: "uncertain", error: "同步进程中断，外部执行结果待核实" } });
        const state = await readState(tx);
        const lesson = state.lessons.find(item => item.id === job.lessonId);
        if (lesson) {
          lesson.sync = "未同步";
          lesson.syncReason = "同步进程中断，外部执行结果待核实";
          await refreshRefundSync(tx, state);
          await writeState(tx, state);
        }
      });
    }
    await runNextJob(clientFactory);
    await processMappedClassInEvents();
  }, { timeout: 120000 });
}

async function runNextJob(clientFactory: () => Promise<ClassInClient>) {
  const job = await database.classInJob.findFirst({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
  if (!job) return;
  const uncertainEarlier = await database.classInJob.count({ where: { lessonId: job.lessonId, status: "uncertain" } });
  if (uncertainEarlier) {
    await database.$transaction(async tx => {
      await lockBusiness(tx);
      await tx.classInJob.update({ where: { id: job.id }, data: { status: "blocked", error: "同课节存在结果未知的同步任务" } });
      const state = await readState(tx);
      const lesson = state.lessons.find(item => item.id === job.lessonId);
      if (lesson) { lesson.sync = "未同步"; lesson.syncReason = "同课节存在结果未知的同步任务"; }
      await refreshRefundSync(tx, state);
      await writeState(tx, state);
    });
    return;
  }
  const claim = await database.classInJob.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "processing", attempts: { increment: 1 } } });
  if (!claim.count) return;
  let failure: string | null = null;
  let uncertain = false;
  const setStep = async (classinStep: string) => {
    const payload = job.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("同步任务格式错误");
    await database.classInJob.update({ where: { id: job.id }, data: { payload: { ...payload, classinStep } } });
  };
  try {
    const lesson = lessonSchema.parse(job.payload);
    const state = await readState();
    let mapping = await database.classInLesson.upsert({ where: { lessonId: lesson.id }, create: { lessonId: lesson.id }, update: {} });
    if (job.operation === "cancel") {
      if (!mapping.courseId || !mapping.classId) {
        const history = await database.classInJob.findMany({ where: { lessonId: lesson.id, id: { not: job.id } } });
        const neverCreated = !mapping.courseId && !mapping.classId &&
          history.some(item => item.operation === "create" && item.status === "superseded" && item.attempts === 0) &&
          history.every(item => item.attempts === 0 && item.status === "superseded");
        if (!neverCreated) throw new Error("缺少外部课节映射，待核实取消结果");
      } else {
        await setStep("lesson.cancel");
        await (await clientFactory()).cancelLesson(mapping.courseId, mapping.classId);
      }
    } else {
      const client = await clientFactory();
      const teacher = state.teachers.find(item => item.id === lesson.teacherId);
      const student = state.classInAccounts?.find(item => item.studentIds.includes(lesson.studentId));
      if (!teacher?.phone || !student?.uid) throw new Error("老师账号或学员 ClassIn UID 尚未关联");
      if (!teacher.classInUid) throw new Error("请先在老师资料中注册/获取 ClassIn UID 并保存");
      const teacherUid = teacher.classInUid;
      if (!mapping.courseId) {
        await setStep("course.create");
        const result = await client.createCourse("Crazy Talk " + lesson.id, createHash("md5").update(lesson.id).digest("hex"));
        const parsed = z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()]).safeParse(result);
        if (!parsed.success) throw new ClassInUncertainError("建课已返回成功，但课程 ID 无法解析，请核对外部记录");
        const courseId = String(parsed.data);
        mapping = await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { courseId } });
      }
      const courseId = mapping.courseId!;
      const start = Date.parse(lesson.date + "T" + lesson.time + ":00+08:00") / 1000;
      const end = start + lesson.duration * 60;
      if (mapping.studentUid !== student.uid) {
        if (mapping.studentUid) {
          await setStep("member.remove");
          await client.call("delCourseStudent", { courseId, identity: "1", studentUid: mapping.studentUid });
          mapping = await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { studentUid: null } });
        }
        await setStep("member.add");
        await client.call("addCourseStudent", { courseId, identity: "1", studentUid: student.uid });
        mapping = await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { studentUid: student.uid } });
      }
      if (mapping.classId) {
        await setStep("lesson.edit");
        await client.editLesson(courseId, mapping.classId, start, end, teacherUid);
      } else {
        await setStep("lesson.create");
        const response = await client.callV2("/lms/activity/createClass", {
          courseId: Number(courseId), name: lesson.material || "Crazy Talk", teacherUid: Number(teacherUid),
          startTime: start, endTime: end, seatNum: 2, isHd: 1, recordState: 1, recordType: 0, liveState: 0, openState: 0, uniqueIdentity: createHash("md5").update(lesson.id).digest("hex"),
        });
        const result = z.object({ classId: z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()]).transform(String) }).safeParse(response);
        if (!result.success) throw new ClassInUncertainError("建课节已返回成功，但课节 ID 无法解析，请核对外部记录");
        mapping = await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { classId: result.data.classId } });
      }
      await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { teacherUid, studentUid: student.uid } });
    }
  } catch (error) {
    uncertain = error instanceof ClassInUncertainError;
    failure = error instanceof Error ? error.message : "ClassIn 同步失败";
  }
  await database.$transaction(async tx => {
    await lockBusiness(tx);
    const state = await readState(tx);
    const lesson = state.lessons.find(item => item.id === job.lessonId);
    const newer = await tx.classInJob.count({ where: { lessonId: job.lessonId, createdAt: { gt: job.createdAt } } });
    if (lesson && !newer) {
      lesson.sync = failure ? "未同步" : "已同步";
      lesson.syncReason = failure || "";
    }
    await tx.classInJob.update({ where: { id: job.id }, data: { status: uncertain ? "uncertain" : failure ? "failed" : "completed", error: failure } });
    await refreshRefundSync(tx, state);
    await writeState(tx, state);
  });
}

export async function retryClassInLesson(lessonId: string, tx: Transaction) {
  const unknown = await tx.classInJob.findMany({ where: { lessonId, status: "uncertain" } });
  // Only addCourse documents returning the existing ID for the same unique identity.
  if (unknown.some(job => z.object({ classinStep: z.string().optional() }).parse(job.payload).classinStep !== "course.create"))
    throw new Error("外部请求结果尚未核实，请先核对 ClassIn 课程记录");
  const result = await tx.classInJob.updateMany({
    where: { lessonId, status: { in: ["failed", "blocked", "uncertain"] } },
    data: { status: "pending", error: null },
  });
  if (!result.count) throw new Error("没有可重试的同步任务，请先核对同步状态");
}
