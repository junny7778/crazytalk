import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ClassInClient, ClassInUncertainError } from "./classin";
import { createSeed } from "../../../../packages/shared/src/seed";

async function verify() {
  const schema = "verify_worker_" + randomUUID().replaceAll("-", "");
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  process.env.CLASSIN_DATA_DIRECTORY = ".data/" + schema;
  process.env.CLASSIN_API_BASE = "https://api.eeo.cn";
  process.env.CLASSIN_SID = "local";
  process.env.CLASSIN_SECRET = "local";
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "pipe", env: process.env });
  const { database, writeState, readState } = await import("../store");
  const { processClassInJob, retryClassInLesson } = await import("./worker");
  let calls = 0;
  class Boundary extends ClassInClient {
    override async cancelLesson() {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 100));
      return {};
    }
  }
  const client = new Boundary({ CLASSIN_API_BASE: "https://api.eeo.cn", CLASSIN_SID: "local", CLASSIN_SECRET: "local" });
  const lesson = { ...createSeed().lessons[0], id: randomUUID(), status: "已取消" as const };
  try {
    await database.classInLesson.create({ data: { lessonId: lesson.id, courseId: "1", classId: "2" } });
    const job = await database.classInJob.create({ data: { lessonId: lesson.id, operation: "cancel", payload: lesson } });
    await Promise.all([processClassInJob(async () => client), processClassInJob(async () => client)]);
    assert.equal(calls, 1);
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: job.id } })).status, "completed");
    const abandoned = await database.classInJob.create({ data: { lessonId: lesson.id, operation: "update", payload: lesson, status: "processing" } });
    const later = await database.classInJob.create({ data: { lessonId: lesson.id, operation: "cancel", payload: lesson } });
    await processClassInJob(async () => client);
    assert.equal(calls, 1);
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: abandoned.id } })).status, "uncertain");
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: later.id } })).status, "blocked");
    const state = createSeed();
    state.accounts.filter(a=>a.roleId==="ops").forEach(a=>a.classInUid="900");
    const target = state.lessons[0];
    state.teachers.find(t => t.id === target.teacherId)!.classInUid = "400";
    state.classInAccounts = [{ id: randomUUID(), phone: "13800138000", uid: "300", studentIds: [target.studentId] }];
    await database.$transaction(tx => writeState(tx, state));
    await database.classInLesson.create({ data: { lessonId: target.id, courseId: "10", classId: "20", studentUid: "200" } });
    const actions: string[] = [];
    class RebindBoundary extends ClassInClient {
      override async call(action: string, params: Record<string, string>) {
        actions.push(action + ":" + params.studentUid + ":" + params.identity);
        return undefined;
      }
      override async editLesson() { actions.push("edit"); return undefined; }
    }
    const rebind = new RebindBoundary({ CLASSIN_API_BASE: "https://api.eeo.cn", CLASSIN_SID: "local", CLASSIN_SECRET: "local" });
    const changedAccountJob = await database.classInJob.create({ data: { lessonId: target.id, operation: "update", payload: target } });
    await processClassInJob(async () => rebind);
    assert.deepEqual(actions, []);
    assert.equal((await database.classInJob.findUniqueOrThrow({where:{id:changedAccountJob.id}})).status,"failed");
    assert.equal((await database.classInLesson.findUniqueOrThrow({ where: { lessonId: target.id } })).studentUid, "200");
    const { ClassInWebhookController } = await import("./webhook.controller");
    const { processMappedClassInEvents } = await import("./webhook-replay");
    const controller = new ClassInWebhookController();
    const stamp = Math.floor(Date.now() / 1000);
    const rating = { SID: "local", TimeStamp: stamp, SafeKey: createHash("md5").update("local" + stamp).digest("hex"), _id: randomUUID(), Cmd: "Rating", ClassID: "30", CourseID: "10", TUID: "400", Comments: { "300": { S2T: { Score: 5, Comment: "重放幂等测试" } } } };
    await Promise.all([controller.receive(rating), controller.receive(rating)]);
    assert.equal(await database.classInWebhook.count({ where: { error: "待关联外部课节" } }), 1);
    await database.classInLesson.update({ where: { lessonId: target.id }, data: { classId: "30", teacherUid: null, studentUid: null } });
    await controller.receive(rating);
    await processMappedClassInEvents();
    assert.equal(await database.classInWebhook.count({ where: { error: "待关联外部课节", processedAt: null } }), 1);
    await database.classInLesson.update({ where: { lessonId: target.id }, data: { teacherUid: "400", studentUid: "300" } });
    await processMappedClassInEvents();
    await Promise.all([controller.receive(rating), controller.receive(rating), processMappedClassInEvents()]);
    assert.equal((await readState()).feedback.filter(item => item.content === "重放幂等测试").length, 1);
    assert.equal(await database.classInWebhook.count({ where: { processedAt: { not: null } } }), 1);
    const start = Date.parse(target.date + "T" + target.time + ":00+08:00") / 1000;
    const end = start + target.duration * 60;
    const attendance = { ...rating, _id: randomUUID(), Cmd: "Attendance", ClassEndTime: end, Data: [
      { Uid: "400", AttendanceTime: target.duration * 60, FirstInTime: start, LastOutTime: end, Identity: 3 },
      { Uid: "300", AttendanceTime: target.duration * 60, FirstInTime: start, LastOutTime: end, Identity: 1 },
    ] };
    await controller.receive(attendance);
    const once = await readState();
    await Promise.all([controller.receive(attendance), controller.receive(attendance)]);
    const repeated = await readState();
    assert.deepEqual(repeated.lessons, once.lessons);
    assert.deepEqual(repeated.credits, once.credits);
    assert.deepEqual(repeated.events, once.events);
    const { transition } = await import("../../../../packages/shared/src/domain");
    const { queueClassInChanges } = await import("./outbox");
    const { applyBusinessEffects } = await import("../../../../packages/shared/src/businessEffects");
    const closedLoop = { ...target, id: randomUUID(), status: "未开始" as const, deducted: false, confirmedUnits: 0 };
    const closedState = await readState();
    closedState.lessons.push(closedLoop);
    await database.$transaction(tx => writeState(tx, closedState));
    await database.classInLesson.create({ data: { lessonId: closedLoop.id, courseId: "10", classId: "31", teacherUid: "400", studentUid: "300" } });
    const closedAttendance = { ...attendance, _id: randomUUID(), ClassID: "31" };
    await controller.receive(closedAttendance);
    const arrived = await readState();
    assert.equal(arrived.lessons.find(l => l.id === closedLoop.id)!.status, "待确认");
    const initialBalance = arrived.students.find(s => s.id === target.studentId)!.balance;
    const deducted = transition(arrived, { type: "lesson.resolve", ids: [closedLoop.id], decision: "扣课", units: 1, reason: "回调后确认" }).data;
    await database.$transaction(tx => writeState(tx, deducted));
    assert.equal((await readState()).students.find(s => s.id === target.studentId)!.balance, initialBalance - 1);
    await controller.receive(closedAttendance);
    assert.equal((await readState()).students.find(s => s.id === target.studentId)!.balance, initialBalance - 1);
    const corrected = transition(await readState(), { type: "lesson.correct", id: closedLoop.id, deduct: false, reason: "核实后返还" }).data;
    await database.$transaction(tx => writeState(tx, corrected));
    assert.equal((await readState()).students.find(s => s.id === target.studentId)!.balance, initialBalance);
    console.log("PASS signed attendance callback -> confirmation deduction -> duplicate callback unchanged -> correction refund");

    await database.$transaction(async tx => {
      const before = await readState(tx);
      before.lessons = before.lessons.filter(l => l.id === target.id || l.id === closedLoop.id);
      const eligible = before.lessons.find(l => l.id === target.id)!;
      eligible.status = "未开始";
      await writeState(tx, before);
      const after = structuredClone(before);
      after.teachers.find(t => t.id === target.teacherId)!.classInUid = "401";
      await queueClassInChanges(tx, before, after);
      assert.equal(await tx.classInJob.count({ where: { lessonId: target.id, operation: "update", status: "pending" } }), 1);
      await writeState(tx, after);
    });
    await processClassInJob(async () => rebind);
    assert.equal((await database.classInLesson.findUniqueOrThrow({ where: { lessonId: target.id } })).teacherUid, "400");
    assert.equal((await database.classInJob.findFirstOrThrow({where:{lessonId:target.id,operation:"update"},orderBy:{createdAt:"desc"}})).status,"failed");
    await database.$transaction(async tx => {
      const before = await readState(tx);
      before.lessons = before.lessons.filter(item => item.id === target.id || item.id === closedLoop.id);
      before.lessons[0].date = "2099-01-01";
      before.lessons[0].status = "未开始";
      const command = { type: "student.lifecycle" as const, studentId: target.studentId, status: "退费" as const, reason: "验证未来课取消" };
      const after = transition(before, command).data;
      applyBusinessEffects(after, command);
      await queueClassInChanges(tx, before, after);
      assert.equal(after.students.find(item => item.id === target.studentId)!.serviceStopResults.find(item => item.step === "未来课程")!.status, "待同步");
      await writeState(tx, after);
    });
    await processClassInJob(async () => client);
    const refunded = (await readState()).students.find(item => item.id === target.studentId)!;
    assert.equal(refunded.serviceStopResults.find(item => item.step === "未来课程")!.status, "已完成");
    const cancellation = await database.classInJob.findFirstOrThrow({ where: { lessonId: target.id, operation: "cancel" } });
    await database.classInJob.update({ where: { id: cancellation.id }, data: { status: "pending" } });
    class FailedCancel extends Boundary { override async cancelLesson(): Promise<never> { throw new Error("mock cancellation rejected"); } }
    await processClassInJob(async () => new FailedCancel({ CLASSIN_API_BASE: "https://api.eeo.cn", CLASSIN_SID: "local", CLASSIN_SECRET: "local" }));
    assert.equal((await readState()).students.find(item => item.id === target.studentId)!.serviceStopResults.find(item => item.step === "未来课程")!.status, "待处理");
    await database.$transaction(async tx => {
      const before = await readState(tx);
      const resumed = transition(before, { type: "student.lifecycle", studentId: target.studentId, status: "在读", reason: "复课后再次退款" }).data;
      const command = { type: "student.lifecycle" as const, studentId: target.studentId, status: "退费" as const, reason: "再次退款不能隐藏旧取消失败" };
      const after = transition(resumed, command).data;
      applyBusinessEffects(after, command);
      await queueClassInChanges(tx, resumed, after);
      assert.equal(after.students.find(item => item.id === target.studentId)!.serviceStopResults.find(item => item.step === "未来课程")!.status, "待处理");
      await writeState(tx, after);
    });
    const zeroStudent = state.students.find(item => item.id !== target.studentId)!;
    await database.$transaction(async tx => {
      const before = await readState(tx);
      const command = { type: "student.lifecycle" as const, studentId: zeroStudent.id, status: "退费" as const, reason: "无未来课" };
      const after = transition(before, command).data;
      applyBusinessEffects(after, command);
      await queueClassInChanges(tx, before, after);
      assert.equal(after.students.find(item => item.id === zeroStudent.id)!.serviceStopResults.find(item => item.step === "未来课程")!.status, "已完成");
      await writeState(tx, after);
    });
    const localLesson = { ...target, id: randomUUID(), status: "已取消" as const };
    await database.classInJob.create({ data: { lessonId: localLesson.id, operation: "create", payload: { ...localLesson, status: "未开始" }, status: "superseded", attempts: 0 } });
    const localCancel = await database.classInJob.create({ data: { lessonId: localLesson.id, operation: "cancel", payload: localLesson } });
    await processClassInJob(async () => { throw new Error("local-only cancellation must not load external credentials"); });
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: localCancel.id } })).status, "completed");
    const partial = { ...localLesson, id: randomUUID() };
    await database.classInJob.create({ data: { lessonId: partial.id, operation: "create", payload: partial, status: "superseded", attempts: 1 } });
    const partialCancel = await database.classInJob.create({ data: { lessonId: partial.id, operation: "cancel", payload: partial } });
    await processClassInJob(async () => client);
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: partialCancel.id } })).status, "failed");
    const recoveryLesson = { ...target, id: randomUUID(), status: "未开始" as const };
    const recoveryState = await readState();
    recoveryState.lessons.push(recoveryLesson);
    await database.$transaction(tx => writeState(tx, recoveryState));
    const recoverJob = await database.classInJob.create({ data: { lessonId: recoveryLesson.id, operation: "create", payload: recoveryLesson } });
    const identities: string[] = [];
    let returnedOnce = false;
    class RecoveryBoundary extends ClassInClient {
      override async createCourse(_name: string, identity: string) {
        identities.push(identity);
        if (!returnedOnce) { returnedOnce = true; throw new ClassInUncertainError("response lost after creation"); }
        return "701";
      }
      override async call() { return undefined; }
      override async addCourseTeacher() {}
      override async callV2() { return { classId: 702, activityId: 703 }; }
    }
    const recoveryClient = new RecoveryBoundary({ CLASSIN_API_BASE: "https://api.eeo.cn", CLASSIN_SID: "local", CLASSIN_SECRET: "local" });
    await processClassInJob(async () => recoveryClient);
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: recoverJob.id } })).status, "uncertain");
    await database.$transaction(tx => retryClassInLesson(recoveryLesson.id, tx));
    await processClassInJob(async () => recoveryClient);
    assert.equal((await database.classInJob.findUniqueOrThrow({ where: { id: recoverJob.id } })).status, "completed");
    assert.equal(identities.length, 2);
    assert.equal(identities[0], identities[1]);
    assert.equal((await database.classInLesson.findUniqueOrThrow({ where: { lessonId: recoveryLesson.id } })).courseId, "701");
    await database.classInJob.update({ where: { id: recoverJob.id }, data: { status: "uncertain", payload: { ...recoveryLesson, classinStep: "lesson.create" } } });
    await assert.rejects(database.$transaction(tx => retryClassInLesson(recoveryLesson.id, tx)), /尚未核实/);
    assert.equal(identities.length, 2);
    console.log("PASS explicit course-create recovery reuses original unique identity and persists returned ID; unknown lesson creation remains blocked");
    console.log("PASS worker exclusive execution, crash recovery, uncertain predecessor blocks later writes, direct student/teacher UID mutation rejected; mapped callback replay exactly once; refund cancellation summary and zero lessons; never-started creation cancels locally, attempted creation requires verification");
  } finally {
    await database.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE');
    await database.$disconnect();
  }
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });
