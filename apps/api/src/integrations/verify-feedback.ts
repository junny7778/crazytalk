import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  ClassInClient,
  ClassInTransportError,
  ClassInApiError,
} from "./classin";
import { createSeed } from "../../../../packages/shared/src/seed";
import { isAvailable } from "../../../../packages/shared/src/domain";
import { getScheduleCredits } from "../../../../packages/shared/src/scheduleCredits";

async function verify() {
  const schema = "verify_feedback_" + randomUUID().replaceAll("-", "");
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: process.env,
  });
  const { database, writeState, readState } = await import("../store");
  const { processClassInJob } = await import("./worker");
  const { commandOperationResult, resumeCommandOperation } = await import(
    "./operation-result"
  );
  let count = 0;
  let mode: "recover" | "always" | "business" | "success" = "recover";
  class Boundary extends ClassInClient {
    override async cancelLesson() {
      count++;
      if (mode === "business") throw new ClassInApiError(114);
      if (mode === "always" || (mode === "recover" && count === 1))
        throw new ClassInTransportError("网络暂时不可用");
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
    state.lessons = [];
    const [student] = state.students;
    const [teacher] = state.teachers;
    const actor = state.accounts.find((a) => a.roleId === "admin")!;
    await database.$transaction((tx) => writeState(tx, state));
    async function task() {
      Object.assign(state, await readState());
      const lesson = {
        ...createSeed().lessons[0],
        id: randomUUID(),
        studentId: student.id,
        teacherId: teacher.id,
        status: "已取消" as const,
        sync: "处理中" as const,
        syncState: "pending" as const,
        date: "2099-01-05",
        time: "18:00",
      };
      state.lessons.push(lesson);
      await database.$transaction((tx) => writeState(tx, state));
      await database.classInLesson.create({
        data: { lessonId: lesson.id, courseId: "10", classId: randomUUID() },
      });
      const command = await database.appliedCommand.create({
        data: {
          id: randomUUID(),
          accountId: actor.id,
          command: {
            type: "lesson.cancel",
            id: lesson.id,
            reason: "测试",
            responsibility: "平台",
          },
          message: "local queued",
        },
      });
      const job = await database.classInJob.create({
        data: {
          operationId: command.id,
          lessonId: lesson.id,
          operation: "cancel",
          payload: lesson,
        },
      });
      return { job, command, lesson };
    }
    const first = await task();
    assert.equal(
      (await commandOperationResult(database, first.command, await readState()))
        .status,
      "processing",
    );
    assert(
      isAvailable(
        await readState(),
        teacher.id,
        first.lesson.date,
        "18:00",
        25,
        undefined,
        undefined,
        true,
      ).includes("老师这个时间已经有课"),
    );
    await processClassInJob(async () => client);
    let pending = await database.classInJob.findUniqueOrThrow({
      where: { id: first.job.id },
    });
    assert.equal(pending.status, "pending");
    assert.equal(pending.attempts, 1);
    assert(pending.retryAt);
    await processClassInJob(async () => client);
    assert.equal(count, 1, "retry delay must persist");
    await database.classInJob.update({
      where: { id: first.job.id },
      data: { retryAt: new Date(0) },
    });
    await processClassInJob(async () => client);
    assert.equal(count, 2);
    assert.equal(
      (await commandOperationResult(database, first.command, await readState()))
        .status,
      "completed",
    );
    assert(
      !isAvailable(
        await readState(),
        teacher.id,
        first.lesson.date,
        "18:00",
        25,
        undefined,
        undefined,
        true,
      ).includes("老师这个时间已经有课"),
    );
    console.log(
      "PASS transient cancellation retries after persisted delay, actual completion ends loading and releases slot",
    );

    mode = "always";
    count = 0;
    const exhausted = await task();
    for (let i = 0; i < 3; i++) {
      await database.classInJob.update({
        where: { id: exhausted.job.id },
        data: { retryAt: new Date(0) },
      });
      await processClassInJob(async () => client);
    }
    await processClassInJob(async () => client);
    const stopped = await database.classInJob.findUniqueOrThrow({
      where: { id: exhausted.job.id },
    });
    assert.equal(count, 3);
    assert.equal(stopped.attempts, 3);
    assert.equal(stopped.status, "uncertain");
    assert.equal(
      (
        await commandOperationResult(
          database,
          exhausted.command,
          await readState(),
        )
      ).status,
      "failed",
    );
    console.log(
      "PASS maximum three attempts survives separate worker invocations; final failure stops loading",
    );

    mode = "business";
    count = 0;
    const refused = await task();
    await processClassInJob(async () => client);
    await processClassInJob(async () => client);
    assert.equal(count, 1);
    assert.equal(
      (
        await database.classInJob.findUniqueOrThrow({
          where: { id: refused.job.id },
        })
      ).status,
      "failed",
    );
    // A partial batch must only repeat its failed item, never confirmed cancellation or local effects.
    await database.classInJob.update({
      where: { id: first.job.id },
      data: { operationId: refused.command.id },
    });
    const before = await readState();
    await database.$transaction((tx) =>
      resumeCommandOperation(tx, refused.command, before, {
        accountId: actor.id,
        roleId: actor.roleId,
        name: actor.name,
      }),
    );
    assert.equal(
      (
        await database.classInJob.findUniqueOrThrow({
          where: { id: first.job.id },
        })
      ).status,
      "completed",
    );
    mode = "success";
    await processClassInJob(async () => client);
    assert.equal(count, 2);
    assert.equal(
      (
        await commandOperationResult(
          database,
          refused.command,
          await readState(),
        )
      ).status,
      "completed",
    );
    assert.deepEqual((await readState()).credits, before.credits);
    console.log(
      "PASS business refusal is attempted once; explicit continuation reuses failed job, confirmed item and ledger remain unchanged",
    );

    const { tokenHash } = await import("../auth");
    const { BusinessController } = await import("../controllers");
    await database.account.create({
      data: {
        id: actor.id,
        login: "feedback-admin",
        name: actor.name,
        roleId: "admin",
        passwordHash: "unused",
      },
    });
    await database.session.create({
      data: {
        id: tokenHash("feedback-session"),
        accountId: actor.id,
        csrfToken: "feedback-csrf",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const request = new IncomingMessage(new Socket());
    request.headers = {
      cookie: "ct_session=feedback-session",
      origin: (process.env.BUSINESS_ORIGIN || "http://127.0.0.1:5175").split(
        ",",
      )[0],
      "x-csrf-token": "feedback-csrf",
    };
    const controller = new BusinessController();
    assert.equal(
      (await controller.commandResult(request, refused.command.id)).status,
      "completed",
    );
    assert(
      (await controller.operations(request)).some(
        (o) => o.id === exhausted.command.id && o.status === "failed",
      ),
    );
    const countBefore = await database.classInJob.count();
    await controller.command(request, {
      requestId: refused.command.id,
      command: refused.command.command,
    });
    assert.equal(
      await database.classInJob.count(),
      countBefore,
      "same request after refresh must not create new jobs",
    );
    await database.account.create({
      data: {
        id: "other-admin",
        login: "other-admin",
        name: "Other",
        roleId: "admin",
        passwordHash: "unused",
      },
    });
    await database.session.create({
      data: {
        id: tokenHash("other-session"),
        accountId: "other-admin",
        csrfToken: "other-csrf",
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const other = new IncomingMessage(new Socket());
    other.headers = {
      ...request.headers,
      cookie: "ct_session=other-session",
      "x-csrf-token": "other-csrf",
    };
    await assert.rejects(
      controller.commandResult(other, refused.command.id),
      /Forbidden/,
    );
    await assert.rejects(
      controller.continueOperation(other, refused.command.id),
      /Forbidden/,
    );
    console.log(
      "PASS authenticated operation query restores final status; duplicate command reuses original batch; other account cannot read or resume it",
    );

    const createState = await readState();
    const createLesson = {
      ...first.lesson,
      id: randomUUID(),
      status: "未开始" as const,
    };
    createState.lessons.push(createLesson);
    createState.teachers.find((t) => t.id === teacher.id)!.classInUid = "400";
    createState.classInAccounts = [
      { id: "account", uid: "300", phone: "", studentIds: [student.id] },
    ];
    await database.$transaction((tx) => writeState(tx, createState));
    await database.classInLesson.create({
      data: { lessonId: createLesson.id, courseId: "10", studentUid: "300" },
    });
    const creation = await database.classInJob.create({
      data: {
        lessonId: createLesson.id,
        operation: "create",
        payload: createLesson,
      },
    });
    let creates = 0;
    class UnknownCreation extends Boundary {
      override async callV2() {
        creates++;
        throw new ClassInTransportError("timeout after create");
      }
    }
    const unknown = new UnknownCreation({
      CLASSIN_API_BASE: "https://api.eeo.cn",
      CLASSIN_SID: "test",
      CLASSIN_SECRET: "test",
    });
    await processClassInJob(async () => unknown);
    await processClassInJob(async () => unknown);
    assert.equal(creates, 1);
    assert.equal(
      (
        await database.classInJob.findUniqueOrThrow({
          where: { id: creation.id },
        })
      ).status,
      "uncertain",
    );
    console.log("PASS classroom creation timeout is never blindly retried");

    const snapshot = await readState();
    const moved = {
      ...first.lesson,
      id: randomUUID(),
      status: "未开始" as const,
      time: "20:00",
      classInPreviousSlot: {
        date: first.lesson.date,
        time: "19:00",
        duration: 25,
        teacherId: teacher.id,
      },
    };
    snapshot.lessons = [moved];
    assert(
      isAvailable(
        snapshot,
        teacher.id,
        moved.date,
        "19:00",
        25,
        undefined,
        undefined,
        true,
      ).includes("老师这个时间已经有课"),
    );
    assert(
      isAvailable(
        snapshot,
        teacher.id,
        moved.date,
        "20:00",
        25,
        undefined,
        undefined,
        true,
      ).includes("老师这个时间已经有课"),
    );
    snapshot.lessons = [
      { ...first.lesson, deducted: false, orderId: undefined },
    ];
    snapshot.orders = [];
    assert.equal(getScheduleCredits(snapshot, student.id, 0, 1).reserved, 1);
    console.log(
      "PASS unconfirmed cancellation retains credit reservation; pending move retains old and requested slots",
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
