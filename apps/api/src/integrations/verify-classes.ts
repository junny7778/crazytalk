import "reflect-metadata";
import "dotenv/config";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  ClassInClient,
  ClassInApiError,
  ClassInUncertainError,
} from "./classin";
import { createSeed } from "../../../../packages/shared/src/seed";
import { transition } from "../../../../packages/shared/src/domain";

async function verify() {
  const schema = "verify_classes_" + randomUUID().replaceAll("-", "");
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "pipe",
    env: process.env,
  });
  const { database, readState, writeState } = await import("../store");
  const { queueClassInChanges } = await import("./outbox");
  const { processClassInJob, retryClassInLesson } = await import("./worker");
  const { applyClassInEvent } = await import("./webhook-events");
  const calls: {
    action: string;
    courseId?: string;
    uid?: string;
    name?: string;
  }[] = [];
  let next = 1000;
  class Boundary extends ClassInClient {
    override async createCourse(
      name: string,
      identity: string,
      owner?: string,
    ) {
      calls.push({ action: "createCourse", name, uid: owner });
      return String(++next);
    }
    override async addCourseTeacher(courseId: string, uid: string) {
      calls.push({ action: "addTeacher", courseId, uid });
    }
    override async call(action: string, p: Record<string, string>) {
      calls.push({
        action,
        courseId: p.courseId,
        uid: p.studentUid ?? p.mainTeacherUid,
      });
      return undefined;
    }
    override async callV2(
      path: string,
      p: Record<string, string | number | string[]>,
    ) {
      calls.push({ action: path, courseId: String(p.courseId) });
      return { classId: ++next, activityId: ++next };
    }
    override async cancelLesson(courseId: string) {
      calls.push({ action: "cancel", courseId });
    }
    override async editLesson(courseId: string) {
      calls.push({ action: "edit", courseId });
    }
  }
  const client = new Boundary({
    CLASSIN_API_BASE: "https://api.eeo.cn",
    CLASSIN_SID: "test",
    CLASSIN_SECRET: "test",
  });
  async function drain() {
    for (
      let i = 0;
      i < 30 &&
      (await database.classInJob.count({ where: { status: "pending" } }));
      i++
    )
      await processClassInJob(async () => client);
    await processClassInJob(async () => client);
  }
  async function apply(command: Parameters<typeof transition>[1]) {
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = transition(before, command).data;
      await queueClassInChanges(tx, before, after);
      await writeState(tx, after, before);
    });
  }
  try {
    let state = createSeed();
    const [a, b, c] = state.students;
    const owner = state.accounts.find((a) => a.roleId === "ops")!;
    owner.classInUid = "900";
    state.accounts.find((a) => a.id === "u4")!.classInUid = "902";
    for (const s of [a, b, c]) {
      s.ownerAccountId = owner.id;
      s.owner = owner.name;
    }
    const [t1, t2] = state.teachers;
    t1.classInUid = "400";
    t1.phone = "";
    t2.classInUid = "401";
    state.lessons = [];
    state.credits = [];
    state.orders = [];
    state.packageBalanceVersion = 2;
    for (const s of state.students) s.balance = 0;
    for (const id of [a.id, b.id])
      state = transition(state, {
        type: "student.bindClassIn",
        id,
        uid: "300",
        phone: "",
      }).data;
    state = transition(state, {
      type: "credit.add",
      studentId: a.id,
      units: 20,
      kind: "充值",
      note: "购课",
    }).data;
    state = transition(state, {
      type: "student.bindClassIn",
      id: c.id,
      uid: "301",
      phone: "",
    }).data;
    state = transition(state, {
      type: "credit.add",
      studentId: c.id,
      units: 10,
      kind: "充值",
      note: "已有余额",
    }).data;
    await database.$transaction((tx) => writeState(tx, state));
    const { ClassInClassesController } = await import("./classes.controller");
    const { tokenHash } = await import("../auth");
    const admin = new ClassInClassesController();
    await database.account.create({
      data: {
        id: "u1",
        login: "verify-admin",
        name: "核实管理员",
        passwordHash: "unused",
        roleId: "admin",
      },
    });
    await database.session.create({
      data: {
        id: tokenHash("verify-session"),
        accountId: "u1",
        csrfToken: "verify-csrf",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const request = new IncomingMessage(new Socket());
    request.headers = {
      cookie: "ct_session=verify-session",
      origin: (process.env.BUSINESS_ORIGIN || "http://127.0.0.1:5175").split(
        ",",
      )[0],
      "x-csrf-token": "verify-csrf",
    };
    const template = createSeed().lessons[0];
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const source = state.orders!.find((o) => o.studentIds.includes(a.id))!;
    for (const failure of ["owner", "name"]) {
      await assert.rejects(
        database.$transaction(async (tx) => {
          const before = await readState(tx);
          const after = structuredClone(before);
          if (failure === "owner")
            delete after.accounts.find((o) => o.id === owner.id)!.classInUid;
          else
            after.students.find((s) => s.id === a.id)!.chineseName =
              "长".repeat(91);
          after.lessons.push({
            ...template,
            id: ids[0],
            studentId: a.id,
            teacherId: t1.id,
            status: "未开始",
          });
          await queueClassInChanges(tx, before, after);
        }),
        failure === "owner" ? /教务/ : /90 字/,
      );
      assert.equal(await database.classInJob.count(), 0);
    }
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      after.lessons = ids.map((id, i) => ({
        ...template,
        id,
        studentId: i === 3 ? b.id : a.id,
        teacherId: i === 2 ? t2.id : t1.id,
        date: "2099-01-0" + (i + 2),
        time: "18:00",
        duration: 25,
        plannedUnits: 1,
        deducted: false,
        status: "未开始",
        orderId: source.id,
      }));
      await queueClassInChanges(tx, before, after);
      await writeState(tx, after, before);
    });
    await drain();
    assert.equal(await database.classInClass.count(), 3);
    assert.equal(
      await database.classInLesson.count({
        where: { activityId: { not: null } },
      }),
      4,
    );
    const [first, second, third, fourth] = await Promise.all(
      ids.map((lessonId) =>
        database.classInLesson.findUniqueOrThrow({ where: { lessonId } }),
      ),
    );
    assert.equal(first.courseId, second.courseId);
    assert.notEqual(first.courseId, third.courseId);
    assert.notEqual(first.courseId, fourth.courseId);
    assert.equal(calls.filter((c) => c.action === "createCourse").length, 3);
    assert(
      calls.find((c) => c.action === "createCourse")!.name!.includes(a.id),
    );
    assert(
      calls
        .filter((c) => c.action === "createCourse")
        .every((c) => c.uid === "900"),
    );
    assert.equal((await readState()).lessons[0].sync, "已同步");
    console.log(
      "PASS AC-10/11/13/16/18/21: shared UID, distinct students/teachers -> 3 classes, 4 activities; blank contact phone accepted",
    );

    const afterBook = await readState();
    const originalB = structuredClone(
      afterBook.lessons.find((l) => l.id === ids[3])!,
    );
    await apply({
      type: "lesson.changeTeacher",
      studentId: a.id,
      originalTeacherId: t1.id,
      reason: "更换老师",
    });
    await drain();
    const canceled = await readState();
    assert.equal(
      canceled.lessons.find((l) => l.id === ids[0])!.status,
      "已取消",
    );
    assert.equal(
      canceled.lessons.find((l) => l.id === ids[2])!.status,
      "未开始",
    );
    assert.deepEqual(
      canceled.lessons.find((l) => l.id === ids[3]),
      originalB,
    );
    assert.equal(await database.classInClass.count(), 3);
    assert.equal(
      (
        await database.classInLesson.findUniqueOrThrow({
          where: { lessonId: ids[0] },
        })
      ).classId,
      first.classId,
    );
    console.log(
      "PASS AC-28/29: only A + original teacher canceled, mappings and other teachers/B preserved",
    );

    await apply({
      type: "student.bindClassIn",
      id: a.id,
      uid: "301",
      phone: "",
    });
    assert(
      (await readState())
        .classInAccounts!.find((account) => account.uid === "300")!
        .studentIds.includes(a.id),
    );
    const callsBefore = calls.length;
    await drain();
    const rebound = await readState();
    assert.equal(rebound.students.find((s) => s.id === a.id)!.balance, 10);
    assert.equal(rebound.students.find((s) => s.id === b.id)!.balance, 20);
    assert.equal(
      rebound.students.find((s) => s.id === a.id)!.classInChange,
      undefined,
    );
    assert.deepEqual(
      rebound.lessons.find((l) => l.id === ids[3]),
      originalB,
    );
    assert(
      !calls
        .slice(callsBefore)
        .some(
          (call) =>
            call.action === "delCourseStudent" &&
            call.courseId === fourth.courseId,
        ),
    );
    assert.equal(
      (
        await database.classInLesson.findUniqueOrThrow({
          where: { lessonId: ids[0] },
        })
      ).studentUid,
      "300",
    );
    await drain();
    assert.equal(
      (await readState()).students.find((s) => s.id === b.id)!.balance,
      20,
    );
    console.log(
      "PASS AC-47/48/50/51: cancel before binding, shared balance retained, target balance preserved, only A classes replace member, history immutable",
    );

    const otherOwner = {
      ...owner,
      id: "ops-new",
      name: "新教务",
      classInUid: "901",
    };
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      after.accounts.push(otherOwner);
      const student = after.students.find((s) => s.id === b.id)!;
      student.owner = otherOwner.name;
      student.ownerAccountId = otherOwner.id;
      await queueClassInChanges(tx, before, after);
      await writeState(tx, after, before);
    });
    class UnknownHead extends Boundary {
      override async call(action: string, p: Record<string, string>) {
        if (action === "editCourse")
          throw new ClassInUncertainError("headteacher result lost");
        return super.call(action, p);
      }
    }
    await processClassInJob(
      async () =>
        new UnknownHead({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    const ownerJob = await database.classInJob.findFirstOrThrow({
      where: { operation: "course.owner", status: "uncertain" },
    });
    assert.equal(
      (
        await database.classInClass.findUniqueOrThrow({
          where: { courseId: fourth.courseId! },
        })
      ).ownerMode,
      "headteacher",
    );
    await admin.verify(request, {
      jobId: ownerJob.id,
      outcome: "not-applied",
      evidence: "测试平台确认班主任仍为原教务",
    });
    class MemberOnly extends Boundary {
      override async call(action: string, p: Record<string, string>) {
        if (action === "editCourse") throw new ClassInApiError(314);
        return super.call(action, p);
      }
    }
    await processClassInJob(
      async () =>
        new MemberOnly({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    assert.equal(
      (
        await database.classInClass.findUniqueOrThrow({
          where: { courseId: fourth.courseId! },
        })
      ).ownerMode,
      "member",
    );
    assert.deepEqual(
      (await readState()).lessons.find((l) => l.id === ids[3]),
      originalB,
    );
    console.log(
      "PASS AC-26: confirmed headteacher refusal keeps new owner as teacher member without moving lessons",
    );

    const notice = {
      Cmd: "eeoClassInfoChange",
      CourseId: fourth.courseId,
      ClassID: fourth.classId,
      opType: 3,
      opTime: 100,
      opData: {
        beginTime: Date.parse("2099-02-01T19:00:00+08:00") / 1000,
        endTime: Date.parse("2099-02-01T19:25:00+08:00") / 1000,
      },
    };
    const jobCount = await database.classInJob.count();
    await database.$transaction((tx) => applyClassInEvent(tx, notice));
    assert.equal(
      (await readState()).lessons.find((l) => l.id === ids[3])!.time,
      "19:00",
    );
    await database.$transaction((tx) =>
      applyClassInEvent(tx, {
        ...notice,
        opTime: 99,
        opData: { beginTime: Date.parse("2099-02-01T18:00:00+08:00") / 1000 },
      }),
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === ids[3])!.time,
      "19:00",
    );
    await database.$transaction((tx) =>
      applyClassInEvent(tx, { ...notice, opTime: 101, opType: 2, opData: {} }),
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === ids[3])!.status,
      "已取消",
    );
    assert.equal(await database.classInJob.count(), jobCount);
    console.log(
      "PASS AC-38/39/40: CourseId notification updates schedule/cancel, ignores stale time, creates no outbound echo",
    );

    const newId = randomUUID();
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      after.lessons.push({
        ...originalB,
        id: newId,
        studentId: c.id,
        teacherId: t2.id,
        date: "2099-03-01",
        status: "未开始",
        orderId: after.orders!.find((o) => o.studentIds.includes(c.id))!.id,
      });
      await queueClassInChanges(tx, before, after);
      await writeState(tx, after, before);
    });
    class FailedMember extends Boundary {
      override async addCourseTeacher(): Promise<never> {
        throw new ClassInApiError(387);
      }
    }
    await processClassInJob(
      async () =>
        new FailedMember({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    const failed = await database.classInJob.findFirstOrThrow({
      where: { lessonId: newId },
    });
    assert.equal(failed.status, "failed");
    const savedGroup = await database.classInLesson.findUniqueOrThrow({
      where: { lessonId: newId },
    });
    assert(savedGroup.courseId === null);
    const createdGroups = calls.filter(
      (c) => c.action === "createCourse",
    ).length;
    await database.$transaction((tx) => retryClassInLesson(newId, tx));
    class Unknown extends Boundary {
      override async callV2(): Promise<never> {
        throw new ClassInUncertainError("课堂返回丢失");
      }
    }
    await processClassInJob(
      async () =>
        new Unknown({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    assert.equal(
      (
        await database.classInJob.findFirstOrThrow({
          where: { lessonId: newId },
        })
      ).status,
      "uncertain",
    );
    await assert.rejects(
      database.$transaction((tx) => retryClassInLesson(newId, tx)),
      /尚未核实/,
    );
    assert.equal(
      calls.filter((c) => c.action === "createCourse").length,
      createdGroups,
    );
    const unknown = await database.classInJob.findFirstOrThrow({
      where: { lessonId: newId },
    });
    const map = await database.classInLesson.findUniqueOrThrow({
      where: { lessonId: newId },
    });
    await assert.rejects(
      admin.verify(request, {
        jobId: unknown.id,
        outcome: "applied",
        courseId: first.courseId,
        classId: first.classId,
        activityId: first.activityId,
        evidence: "错误归属",
      }),
      /原班级/,
    );
    await admin.verify(request, {
      jobId: unknown.id,
      outcome: "applied",
      courseId: map.courseId,
      classId: "9991",
      activityId: "9992",
      evidence: "模拟平台实际课堂回执",
    });
    assert.equal(
      (
        await database.classInLesson.findUniqueOrThrow({
          where: { lessonId: newId },
        })
      ).classId,
      "9991",
    );
    await assert.rejects(
      admin.verify(request, {
        jobId: unknown.id,
        outcome: "applied",
        courseId: map.courseId,
        classId: "9991",
        activityId: "9992",
        evidence: "重复",
      }),
      /状态已变化/,
    );
    console.log(
      "PASS AC-19/22/34/36: failed member stops creation, retry reuses class; unknown classroom requires evidence and rejects wrong mapping",
    );

    const changed = {
      Cmd: "eeoClassStudentChange",
      CourseId: map.courseId,
      ClassID: "9991",
      opType: 1,
      opTime: 200,
      opData: { studentInfos: [{ studentUid: "888" }] },
    };
    await database.$transaction((tx) => applyClassInEvent(tx, changed));
    await database.$transaction((tx) =>
      applyClassInEvent(tx, {
        ...changed,
        Cmd: "eeoClassInfoChange",
        opTime: 201,
        opData: {
          beginTime: Date.parse("2099-03-01T19:00:00+08:00") / 1000,
          endTime: Date.parse("2099-03-01T19:25:00+08:00") / 1000,
        },
      }),
    );
    assert.match(
      (await readState()).lessons.find((l) => l.id === newId)!.syncReason,
      /学员发生变更/,
    );
    await database.$transaction((tx) =>
      applyClassInEvent(tx, { ...changed, opType: 2, opTime: 202 }),
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === newId)!.syncReason,
      "",
    );
    await apply({
      type: "lesson.changeTeacher",
      studentId: c.id,
      originalTeacherId: t2.id,
      reason: "外部取消确认",
    });
    const cancelJob = await database.classInJob.findFirstOrThrow({
      where: { lessonId: newId, operation: "cancel" },
    });
    await database.classInJob.update({
      where: { id: cancelJob.id },
      data: { status: "uncertain" },
    });
    await database.$transaction((tx) =>
      applyClassInEvent(tx, {
        ...changed,
        Cmd: "eeoClassInfoChange",
        opType: 2,
        opTime: 203,
        opData: {},
      }),
    );
    assert.equal(
      (
        await database.classInJob.findUniqueOrThrow({
          where: { id: cancelJob.id },
        })
      ).status,
      "completed",
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === newId)!.syncState,
      "completed",
    );
    await admin.change(request, {
      action: "member",
      courseId: first.courseId,
      memberKey: "staff:u4",
    });
    await drain();
    const withTm = await database.classInClass.findUniqueOrThrow({
      where: { courseId: first.courseId! },
    });
    assert(withTm.teacherUids.includes("902"));
    assert.equal(withTm.mainTeacherUid, "900");
    assert(
      !(
        await database.classInClass.findUniqueOrThrow({
          where: { courseId: fourth.courseId! },
        })
      ).teacherUids.includes("902"),
    );
    await assert.rejects(
      admin.change(request, {
        action: "member",
        courseId: first.courseId,
        memberKey: "staff:u4",
      }),
      /已在班级/,
    );
    console.log(
      "PASS AC-24/25: add TM to selected class only, preserve headteacher, reject duplicate member",
    );
    const classList = await admin.list(request);
    assert.equal(classList.classes.length, 4);
    console.log(
      "PASS AC-40/41: unrelated time notice preserves identity warning; membership correction clears it; deletion notice confirms unknown cancellation",
    );
    const legacyId = randomUUID();
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      after.lessons.push({
        ...originalB,
        id: legacyId,
        studentId: b.id,
        teacherId: t1.id,
        date: "2099-05-01",
        time: "18:00",
        status: "未开始",
      });
      await writeState(tx, after, before);
      await tx.classInLesson.create({
        data: {
          lessonId: legacyId,
          courseId: "9001",
          classId: "9002",
          studentUid: "300",
          teacherUid: "400",
        },
      });
    });
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      after.lessons.find((l) => l.id === legacyId)!.time = "19:00";
      await queueClassInChanges(tx, before, after);
      await writeState(tx, after, before);
    });
    await drain();
    await apply({
      type: "lesson.cancel",
      id: legacyId,
      reason: "旧课取消验收",
      responsibility: "平台",
    });
    await drain();
    const legacy = await database.classInLesson.findUniqueOrThrow({
      where: { lessonId: legacyId },
    });
    assert.equal(legacy.courseId, "9001");
    assert.equal(legacy.classId, "9002");
    assert.equal(legacy.activityId, null);
    assert(calls.some((c) => c.action === "edit" && c.courseId === "9001"));
    assert(calls.some((c) => c.action === "cancel" && c.courseId === "9001"));
    assert.equal(await database.classInClass.count(), 4);
    assert(
      (await admin.list(request)).classes.find((g) => g.courseId === "9001")!
        .isLegacy,
    );
    console.log(
      "PASS AC-27/31/44: legacy classroom edits/cancels in original course, missing activityId stays historical, no replacement class",
    );
    const inFlightId = randomUUID();
    async function insertLessons(
      studentId: string,
      teacherId: string,
      lessonIds: string[],
    ) {
      await database.$transaction(async (tx) => {
        const before = await readState(tx);
        const after = structuredClone(before);
        after.lessons.push(
          ...lessonIds.map((id, index) => ({
            ...originalB,
            id,
            studentId,
            teacherId,
            date: `2099-06-${String(index + 10).padStart(2, "0")}`,
            status: "未开始" as const,
            orderId: after.orders!.find((o) =>
              o.studentIds.includes(studentId),
            )!.id,
          })),
        );
        await queueClassInChanges(tx, before, after);
        await writeState(tx, after, before);
      });
    }
    await insertLessons(b.id, t1.id, [inFlightId]);
    let started!: () => void, finish!: () => void;
    const hasStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const mayFinish = new Promise<void>((resolve) => {
      finish = resolve;
    });
    class SlowCreate extends Boundary {
      override async callV2(
        path: string,
        p: Record<string, string | number | string[]>,
      ) {
        started();
        await mayFinish;
        return super.callV2(path, p);
      }
    }
    const running = processClassInJob(
      async () =>
        new SlowCreate({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    await hasStarted;
    await apply({
      type: "lesson.changeTeacher",
      studentId: b.id,
      originalTeacherId: t1.id,
      reason: "创建途中取消",
    });
    finish();
    await running;
    assert.equal(
      (await readState()).lessons.find((l) => l.id === inFlightId)!.status,
      "已取消",
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === inFlightId)!.syncState,
      "pending",
    );
    await drain();
    assert.equal(
      (await readState()).lessons.find((l) => l.id === inFlightId)!.syncState,
      "completed",
    );
    console.log(
      "PASS AC-35: old in-flight creation cannot complete newer cancellation; cancellation uses returned original classroom mapping",
    );

    await insertLessons(c.id, t2.id, [randomUUID(), randomUUID()]);
    await drain();
    await apply({
      type: "student.bindClassIn",
      id: c.id,
      uid: "303",
      phone: "",
    });
    class FailedCancel extends Boundary {
      override async cancelLesson(): Promise<never> {
        throw new ClassInApiError(114);
      }
    }
    await processClassInJob(
      async () =>
        new FailedCancel({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    await drain();
    let changing = await readState();
    assert.equal(
      changing.students.find((s) => s.id === c.id)!.classInChange!.phase,
      "canceling",
    );
    assert(
      changing
        .classInAccounts!.find((a) => a.uid === "301")!
        .studentIds.includes(c.id),
    );
    const failedCancel = await database.classInJob.findFirstOrThrow({
      where: { operation: "cancel", status: "failed" },
    });
    await database.$transaction((tx) =>
      retryClassInLesson(failedCancel.lessonId!, tx),
    );
    await processClassInJob(async () => client);
    changing = await readState();
    assert.equal(
      changing.students.find((s) => s.id === c.id)!.classInChange!.phase,
      "members",
    );
    class FailedReplacement extends Boundary {
      override async call(action: string, p: Record<string, string>) {
        if (action === "delCourseStudent") throw new ClassInApiError(387);
        return super.call(action, p);
      }
    }
    await processClassInJob(
      async () =>
        new FailedReplacement({
          CLASSIN_API_BASE: "https://api.eeo.cn",
          CLASSIN_SID: "test",
          CLASSIN_SECRET: "test",
        }),
    );
    changing = await readState();
    assert.equal(changing.students.find((s) => s.id === c.id)!.balance, 0);
    assert.equal(changing.students.find((s) => s.id === a.id)!.balance, 10);
    assert.equal(
      changing.students.find((s) => s.id === c.id)!.classInChange!.phase,
      "members",
    );
    const failedMember = await database.classInJob.findFirstOrThrow({
      where: { operation: "course.student", status: "failed" },
    });
    await admin.change(request, { action: "retry", jobId: failedMember.id });
    await drain();
    changing = await readState();
    assert.equal(
      changing.students.find((s) => s.id === c.id)!.classInChange,
      undefined,
    );
    assert.equal(changing.students.find((s) => s.id === c.id)!.balance, 0);
    assert.equal(changing.students.find((s) => s.id === a.id)!.balance, 10);
    console.log(
      "PASS AC-50: partial cancel failure keeps old binding; student-member failure keeps committed balance; retry completes without second transfer",
    );

    const lastId = randomUUID();
    await insertLessons(b.id, t1.id, [lastId]);
    await drain();
    const lastMapping = await database.classInLesson.findUniqueOrThrow({
      where: { lessonId: lastId },
    });
    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      after.lessons.find((l) => l.id === lastId)!.time = "19:00";
      await queueClassInChanges(tx, before, after);
      await writeState(tx, after, before);
    });
    const oldNotice = {
      Cmd: "eeoClassInfoChange",
      CourseId: lastMapping.courseId,
      ClassID: lastMapping.classId,
      opTime: 100,
      opType: 3,
      opData: {
        beginTime: Date.parse("2099-06-10T18:00:00+08:00") / 1000,
        endTime: Date.parse("2099-06-10T18:25:00+08:00") / 1000,
      },
    };
    await database.$transaction((tx) => applyClassInEvent(tx, oldNotice));
    assert.equal(
      (await readState()).lessons.find((l) => l.id === lastId)!.time,
      "19:00",
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === lastId)!.syncState,
      "pending",
    );
    await drain();
    await apply({
      type: "lesson.changeTeacher",
      studentId: b.id,
      originalTeacherId: t1.id,
      reason: "取消途中通知",
    });
    await database.$transaction((tx) =>
      applyClassInEvent(tx, { ...oldNotice, opTime: 101 }),
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === lastId)!.syncState,
      "pending",
    );
    await database.$transaction((tx) =>
      applyClassInEvent(tx, {
        ...oldNotice,
        opTime: 102,
        opType: 2,
        opData: { teacherInfo: { teacherUid: "888" } },
      }),
    );
    assert.equal(
      (await readState()).lessons.find((l) => l.id === lastId)!.syncState,
      "completed",
    );
    console.log(
      "PASS AC-35/39/40: old time notices preserve newer targets; a time notice cannot confirm cancellation; confirmed deletion clears obsolete identity conflict",
    );

    await database.$transaction(async (tx) => {
      const before = await readState(tx);
      const after = structuredClone(before);
      Object.assign(after.accounts.find((a) => a.id === otherOwner.id)!, {
        team: "B队",
        group: "一组",
      });
      after.roles.push({
        id: "class-operator",
        name: "班级专项",
        scope: "本组",
        description: "",
        permissions: ["lesson.view", "student.reschedule", "sync.retry"],
      });
      after.accounts.push({
        id: "class-operator",
        name: "范围测试",
        phone: "",
        roleId: "class-operator",
        scope: "本组",
        enabled: true,
        team: "A队",
        group: "二组",
      });
      await writeState(tx, after, before);
    });
    await database.account.create({
      data: {
        id: "class-operator",
        login: "class-operator",
        name: "范围测试",
        passwordHash: "unused",
        roleId: "class-operator",
      },
    });
    await database.session.create({
      data: {
        id: tokenHash("scoped-session"),
        accountId: "class-operator",
        csrfToken: "verify-csrf",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const scopedRequest = new IncomingMessage(new Socket());
    scopedRequest.headers = {
      ...request.headers,
      cookie: "ct_session=scoped-session",
    };
    const scopedClasses = await admin.list(scopedRequest);
    assert(!scopedClasses.classes.some((g) => g.studentId === b.id));
    assert(!scopedClasses.candidates.some((member) => member.uid === "901"));
    await assert.rejects(
      admin.change(scopedRequest, {
        action: "member",
        courseId: fourth.courseId,
        memberKey: "staff:u4",
      }),
      /Forbidden/,
    );
    const foreignJob = await database.classInJob.create({
      data: {
        operation: "course.member",
        classLocalId: fourth.classLocalId,
        status: "uncertain",
        payload: {
          courseId: fourth.courseId,
          studentId: b.id,
          memberUid: "902",
          classinStep: "teacher.add",
        },
      },
    });
    assert(
      !(await admin.jobs(scopedRequest)).jobs.some(
        (j) => j.id === foreignJob.id,
      ),
    );
    await assert.rejects(
      admin.verify(scopedRequest, {
        jobId: foreignJob.id,
        outcome: "not-applied",
        evidence: "越权测试",
      }),
      /Forbidden/,
    );
    await database.classInJob.delete({ where: { id: foreignJob.id } });
    console.log(
      "PASS AC-43: scoped class API hides other-team classes/staff/jobs and rejects direct member/verification writes",
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
