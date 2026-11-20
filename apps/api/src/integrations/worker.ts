import { refreshOffboardRebooking } from "../../../../packages/shared/src/teacherOffboard";
import { advanceAccountChanges } from "./account-change";
import { ensureClass, syncCourseOwner } from "./classes";
import { refreshRefundSync } from "./refund-sync";
import { processMappedClassInEvents } from "./webhook-replay";
import { createHash } from "node:crypto";
import { loadClassInConfiguration } from "./credentials";
import { z } from "zod";
import { database, lockBusiness, readState, writeState, type Transaction } from "../store";
import { ClassInClient, ClassInUncertainError, ClassInTransportError } from "./classin";
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
          lesson.syncState = "uncertain"; lesson.syncRetryable = false;
          refreshOffboardRebooking(state);
          await refreshRefundSync(tx, state);
          await writeState(tx, state);
        }
      });
    }
    await advanceAccountChanges();
    await runNextJob(clientFactory);
    await advanceAccountChanges();
    await processMappedClassInEvents();
  }, { timeout: 120000 });
}

async function runNextJob(clientFactory: () => Promise<ClassInClient>) {
  const job = await database.classInJob.findFirst({ where: { status: "pending", OR: [{ retryAt: null }, { retryAt: { lte: new Date() } }] }, orderBy: { createdAt: "asc" } });
  if (!job) return;
  const uncertainEarlier = await database.classInJob.count({ where: { ...(job.lessonId ? {lessonId:job.lessonId} : {classLocalId:job.classLocalId, payload:{path:["courseId"],equals:z.object({courseId:z.string()}).parse(job.payload).courseId}}), status: "uncertain" } });
  if (uncertainEarlier) {
    await database.$transaction(async tx => {
      await lockBusiness(tx);
      await tx.classInJob.update({ where: { id: job.id }, data: { status: "blocked", error: "同课节存在结果未知的同步任务" } });
      const state = await readState(tx);
      const lesson = state.lessons.find(item => item.id === job.lessonId);
      if (lesson) { lesson.sync = "未同步"; lesson.syncReason = "同课节存在结果未知的同步任务"; lesson.syncState = "blocked"; lesson.syncRetryable = false; }
      refreshOffboardRebooking(state);
      await refreshRefundSync(tx, state);
      await writeState(tx, state);
    });
    return;
  }
  const claim = await database.classInJob.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "processing", attempts: { increment: 1 } } });
  if (!claim.count) return;
  let failure: string | null = null;
  let uncertain = false;
  let retryAt: Date | null = null;
  let currentStep = "";
  const completedSteps = z.object({completedSteps:z.array(z.string()).optional()}).parse(job.payload).completedSteps ?? [];
  const setStep = async (classinStep: string) => {
    if (currentStep && currentStep !== classinStep && !completedSteps.includes(currentStep)) completedSteps.push(currentStep);
    currentStep = classinStep;
    const payload = job.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("同步任务格式错误");
    await database.classInJob.update({ where: { id: job.id }, data: { payload: { ...payload, classinStep, completedSteps } } });
  };
  try {
    if (job.operation.startsWith("course.")) {
      const payload = z.object({courseId:z.string(),studentId:z.string(),ownerAccountId:z.string().optional(),memberUid:z.string().optional(),sourceUid:z.string().optional(),studentUid:z.string().optional()}).parse(job.payload);
      const client = await clientFactory();
      const state = await readState();
      if (job.operation === "course.owner") {
        const owner = state.accounts.find(a => a.id === payload.ownerAccountId);
        if (!owner?.classInUid) throw new Error("接手教务尚未关联 ClassIn 账号");
        if (state.students.find(s => s.id === payload.studentId)?.ownerAccountId !== owner.id) throw new Error("教务归属已变化，请按当前归属重新同步");
        const mode = await syncCourseOwner(payload.courseId,owner.classInUid,client,setStep,completedSteps.includes("owner.add"));
        await database.classInClass.updateMany({where:{courseId:payload.courseId},data:{ownerAccountId:owner.id,ownerMode:mode,...(mode === "headteacher" ? {mainTeacherUid:owner.classInUid} : {}),teacherUids:{push:owner.classInUid}}});
        await database.classInJob.update({where:{id:job.id},data:{payload:{...payload,ownerMode:mode,ownerUid:owner.classInUid}}});
      } else if (job.operation === "course.student") {
        if (!payload.sourceUid || !payload.studentUid) throw new Error("缺少新旧学员账号");
        const others = await database.classInLesson.count({where:{courseId:payload.courseId,lessonId:{in:state.lessons.filter(l => l.studentId !== payload.studentId).map(l => l.id)}}});
        if (others) throw new Error("该历史班级还关联其他学员，请先核实班级成员，不能移除共享账号");
        if (!completedSteps.includes("member.replace.add")) {
          await setStep("member.replace.add");
          await client.call("addCourseStudent",{courseId:payload.courseId,identity:"1",studentUid:payload.studentUid});
        }
        await setStep("member.replace.remove");
        await client.call("delCourseStudent",{courseId:payload.courseId,identity:"1",studentUid:payload.sourceUid});
        await database.classInClass.updateMany({where:{courseId:payload.courseId},data:{studentUid:payload.studentUid}});
      } else if (job.operation === "course.member") {
        if (!payload.memberUid) throw new Error("请选择要加入的成员");
        await setStep("teacher.add");
        await client.addCourseTeacher(payload.courseId,payload.memberUid);
        await database.classInClass.updateMany({where:{courseId:payload.courseId},data:{teacherUids:{push:payload.memberUid}}});
      }
    } else {
    const lesson = lessonSchema.parse(job.payload);
    const state = await readState();
    if (job.operation !== "cancel" && state.lessons.find(l => l.id === lesson.id)?.status === "已取消") {
      await database.classInJob.update({where:{id:job.id},data:{status:"superseded",error:null}});
      return;
    }
    let mapping = await database.classInLesson.upsert({ where: { lessonId: lesson.id }, create: { lessonId: lesson.id }, update: {} });
    if (job.operation === "cancel") {
      if (!mapping.courseId || !mapping.classId) {
        const history = await database.classInJob.findMany({ where: { lessonId: lesson.id, id: { not: job.id } } });
        const neverCreated = !mapping.classId && history.some(item => item.operation === "create") && history.every(item => {
          if (!item.attempts && item.status === "superseded") return true;
          const progress = z.object({classinStep:z.string().optional(),verification:z.object({outcome:z.string()}).optional()}).parse(item.payload);
          return progress.verification?.outcome === "not-applied" || item.operation === "create" && !!progress.classinStep && !["lesson.create","lesson.edit"].includes(progress.classinStep);
        });
        if (!neverCreated) throw new Error("缺少外部课节映射，待核实取消结果");
      } else {
        await setStep("lesson.cancel");
        await (await clientFactory()).cancelLesson(mapping.courseId, mapping.classId);
      }
    } else {
      const client = await clientFactory();
      const teacher = state.teachers.find(item => item.id === lesson.teacherId);
      const student = state.classInAccounts?.find(item => item.studentIds.includes(lesson.studentId));
      if (!teacher?.classInUid || !student?.uid) throw new Error("请先关联老师和学员的 ClassIn UID");
      const teacherUid = teacher.classInUid;
      if (!mapping.courseId) {
        const group = await ensureClass(state, lesson, client, setStep, job.id);
        mapping = await database.classInLesson.update({where:{lessonId:lesson.id},data:{classLocalId:group.id,courseId:group.courseId,studentUid:group.studentUid}});
      }
      const courseId = mapping.courseId!;
      const start = Date.parse(lesson.date + "T" + lesson.time + ":00+08:00") / 1000;
      const end = start + lesson.duration * 60;
      if (mapping.studentUid && mapping.studentUid !== student.uid) throw new Error("已有课节不能直接更换学员账号，请取消后重新排课");
      if (mapping.teacherUid && mapping.teacherUid !== teacherUid) throw new Error("已有课节不能直接更换老师账号，请取消后重新排课");
      if (mapping.classId) {
        await setStep("lesson.edit");
        await client.editLesson(courseId, mapping.classId, start, end, teacherUid);
      } else {
        await setStep("lesson.create");
        const response = await client.callV2("/lms/activity/createClass", {
          courseId: Number(courseId), name: lesson.material || "Crazy Talk", teacherUid: Number(teacherUid),
          startTime: start, endTime: end, seatNum: 2, isHd: 1, recordState: 1, recordType: 0, liveState: 0, openState: 0, uniqueIdentity: createHash("md5").update(lesson.id).digest("hex"),
        });
        const result = z.object({ classId: z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()]).transform(String), activityId: z.union([z.string().regex(/^[1-9]\d*$/),z.number().int().positive()]).transform(String) }).safeParse(response);
        if (!result.success) throw new ClassInUncertainError("建课节已返回成功，但课节 ID 无法解析，请核对外部记录");
        mapping = await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { classId: result.data.classId, activityId: result.data.activityId } });
      }
      await database.classInLesson.update({ where: { lessonId: lesson.id }, data: { teacherUid, studentUid: student.uid } });
    }
    }
  } catch (error) {
    uncertain = error instanceof ClassInUncertainError;
    if (error instanceof ClassInTransportError && job.attempts < 2 &&
        ["course.create", "member.add", "teacher.add", "owner.add", "member.replace.add", "member.replace.remove", "lesson.cancel", "lesson.edit"].includes(currentStep)) {
      retryAt = new Date(Date.now() + (job.attempts === 0 ? 2000 : 5000));
    }
    failure = error instanceof Error ? error.message : "ClassIn 同步失败";
  }
  await database.$transaction(async tx => {
    await lockBusiness(tx);
    const state = await readState(tx);
    const lesson = state.lessons.find(item => item.id === job.lessonId);
    const newer = await tx.classInJob.count({ where: { lessonId: job.lessonId, createdAt: { gt: job.createdAt } } });
    const snapshot = job.lessonId ? lessonSchema.parse(job.payload) : undefined;
    const sameIntent = lesson && snapshot && ["studentId","teacherId","date","time","duration","status"].every(key => Reflect.get(lesson,key) === Reflect.get(snapshot,key));
    if (lesson && !newer && sameIntent) {
      if (!failure) delete lesson.classInPreviousSlot;
      lesson.sync = retryAt ? "处理中" : failure ? "未同步" : "已同步";
      lesson.syncReason = retryAt ? "正在处理" : failure || "";
      lesson.syncState = retryAt ? "pending" : uncertain ? "uncertain" : failure ? "failed" : "completed";
      lesson.syncRetryable = !retryAt && !!failure && (!uncertain || currentStep === "course.create");
    }
    await tx.classInJob.update({ where: { id: job.id }, data: { status: retryAt ? "pending" : uncertain ? "uncertain" : failure ? "failed" : "completed", retryAt, error: failure } });
    refreshOffboardRebooking(state);
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
