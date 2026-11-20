import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  ClassInClient,
  ClassInApiError,
  ClassInTransportError,
} from "./classin";
import { createSeed } from "../../../../packages/shared/src/seed";
import { transition } from "../../../../packages/shared/src/domain";
import { schedulingAccountIssue } from "../../../../packages/shared/src/packageBalances";
async function verify() {
  const schema = "verify_offboard_" + randomUUID().replaceAll("-", "");
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: process.env,
  });
  const { database, readState, writeState } = await import("../store");
  const { queueClassInChanges } = await import("./outbox");
  const { processClassInJob } = await import("./worker");
  const { commandOperationResult } = await import("./operation-result");
  let calls = 0;
  let failure = true;
  class Boundary extends ClassInClient {
    override async cancelLesson(_courseId: string, classId: string) {
      calls++;
      if (classId === "temporary" && calls === 1)
        throw new ClassInTransportError("暂时断网");
      if (classId === "business" && failure) throw new ClassInApiError(114);
      return {};
    }
  }
  const client = new Boundary({
    CLASSIN_API_BASE: "https://api.eeo.cn",
    CLASSIN_SID: "test",
    CLASSIN_SECRET: "test",
  });
  try {
    const state = createSeed();
    state.tasks = [];
    state.slotLocks = [];
    state.students.forEach((s) => {
      s.teacherId = "";
    });
    const student = state.students[0];
    student.teacherId = "t1";
    student.status = "在读";
    state.lessons = ["temporary", "business"].map((id, index) => ({
      ...state.lessons[0],
      id,
      teacherId: "t1",
      studentId: student.id,
      date: `2099-01-0${index + 2}`,
      status: "未开始" as const,
    }));
    await database.$transaction((tx) => writeState(tx, state));
    for (const lesson of state.lessons)
      await database.classInLesson.create({
        data: { lessonId: lesson.id, courseId: "test", classId: lesson.id },
      });
    const command = {
      type: "teacher.offboard" as const,
      teacherId: "t1",
      reason: "离职专项",
    };
    const result = transition(state, command);
    const operation = await database.appliedCommand.create({
      data: {
        id: randomUUID(),
        accountId: state.accounts[0].id,
        command,
        message: result.message,
      },
    });
    await database.$transaction(async (tx) => {
      await queueClassInChanges(tx, state, result.data, operation.id);
      await writeState(tx, result.data, state);
    });
    assert.equal(await database.classInJob.count(), 2);
    let snapshot = await readState();
    assert.equal(snapshot.students[0].teacherId, "");
    assert.equal(snapshot.tasks.filter((t) => t.rebooking).length, 1);
    assert.equal(
      (await commandOperationResult(database, operation, snapshot)).status,
      "processing",
    );
    await processClassInJob(async () => client);
    assert.equal(
      (
        await database.classInJob.findFirstOrThrow({
          where: { lessonId: "temporary" },
        })
      ).status,
      "pending",
    );
    await database.classInJob.updateMany({
      where: { lessonId: "temporary" },
      data: { retryAt: new Date(0) },
    });
    await processClassInJob(async () => client);
    await processClassInJob(async () => client);
    snapshot = await readState();
    const failed = await commandOperationResult(database, operation, snapshot);
    assert.equal(failed.status, "failed");
    assert.match(failed.message, /老师已离职，部分课程尚未取消/);
    assert.equal(
      snapshot.teachers.find((t) => t.id === "t1")?.status,
      "已离职",
    );
    assert.match(schedulingAccountIssue(snapshot, student.id), /取消尚未确认/);
    const repeated = transition(snapshot, command);
    await database.$transaction(async (tx) => {
      await queueClassInChanges(tx, snapshot, repeated.data, randomUUID());
      await writeState(tx, repeated.data, snapshot);
    });
    assert.equal(await database.classInJob.count(), 2);
    assert.equal((await readState()).tasks.length, 1);
    failure = false;
    await database.classInJob.updateMany({
      where: { lessonId: "business" },
      data: { status: "pending" },
    });
    await processClassInJob(async () => client);
    snapshot = await readState();
    assert.equal(
      (await commandOperationResult(database, operation, snapshot)).status,
      "completed",
    );
    assert.equal(snapshot.tasks[0].status, "待处理");
    assert.ok(snapshot.lessons.every((l) => l.syncState === "completed"));
    console.log(
      "PASS 离职持久化、取消队列、临时故障重试、业务错误提示、重复提交幂等、取消结果确认；外部 ClassIn 使用测试替身",
    );
  } finally {
    await database.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE');
    await database.$disconnect();
  }
}
verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
