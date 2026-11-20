import { verifyMatching } from "./matching.integration";
import { verifyModules } from "./modules.integration";
import "dotenv/config";
import { verifyIntake } from "./integrations/intake.integration";
import { verifyScopedScheduling } from "./scope.integration";
import { verifyWorkflows } from "./workflow.integration";
import { rm } from "node:fs/promises";
import { verifyFileStreaming } from "./integrations/files.integration";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  emptyStudentProfile,
  addDays,
  type DemoState,
} from "../../../packages/shared/src/model";
import { createSeed } from "../../../packages/shared/src/seed";
import { database, writeState, readState } from "./store";
import { passwordHash } from "./auth";
import { once } from "node:events";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const schema = "verify_" + randomUUID().replaceAll("-", "");
  url.searchParams.set("schema", schema);
  const verification = new PrismaClient({ datasourceUrl: url.href });
  const migration = spawn("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.href },
    stdio: "pipe",
  });
  const [exit] = await once(migration, "exit");
  assert.equal(exit, 0, "test schema migration");
  const password = "Test1!" + randomUUID().slice(0, 8);
  const identity = await verification.account.create({
    data: {
      login: "verification",
      name: "验收管理员",
      roleId: "admin",
      passwordHash: passwordHash(password),
    },
  });
  const state = createSeed();
  for (const lesson of state.lessons) lesson.autoSettlementPaused = true;
  state.accounts.push({
    id: identity.id,
    name: identity.name,
    phone: identity.login,
    roleId: "admin",
    scope: "全部",
    enabled: true,
  });
  const emptyState = await readState(verification);
  emptyState.accounts.push(state.accounts[state.accounts.length - 1]);
  await verification.$transaction((tx) => writeState(tx, emptyState));
  const server = spawn("pnpm", ["exec", "tsx", "src/integration-server.ts"], {
    env: {
      ...process.env,
      DATABASE_URL: url.href,
      API_PORT: "3191",
      NODE_ENV: "test",
      CLASSIN_API_BASE: "http://127.0.0.1:1",
      CLASSIN_SID: "test",
      CLASSIN_SECRET: "test",
      CLASSIN_DATA_DIRECTORY: ".data/" + schema,
      UPLOAD_DIRECTORY: ".data/" + schema + "/uploads",
      BUSINESS_ORIGIN: "http://127.0.0.1:5175",
    },
    stdio: "pipe",
  });
  let serverOutput = "";
  server.stdout?.on("data", (chunk) => {
    serverOutput += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    serverOutput += String(chunk);
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch("http://127.0.0.1:3191/api/health")).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal((await fetch("http://127.0.0.1:3191/api/state")).status, 401);
    const login = await fetch("http://127.0.0.1:3191/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5175",
      },
      body: JSON.stringify({ login: "verification", password }),
    });
    assert.equal(login.status, 201);
    const me = await login.json();
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const headers = {
      "content-type": "application/json",
      origin: "http://127.0.0.1:5175",
      cookie,
      "x-csrf-token": me.csrfToken,
    };
    const initialState = await (
      await fetch("http://127.0.0.1:3191/api/state", { headers })
    ).json();
    assert.equal(initialState.students.length, 0);
    const firstCreate = await fetch("http://127.0.0.1:3191/api/commands", {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: randomUUID(),
        command: {
          type: "student.create",
          student: {
            ...emptyStudentProfile(),
            name: "空库建档",
            chineseName: "空库建档",
          },
        },
      }),
    });
    const firstResult = await firstCreate.json();
    assert.equal(firstCreate.status, 201, JSON.stringify(firstResult));
    assert.equal(firstResult.data.students.length, 1);
    assert.equal(await verification.student.count(), 1);
    await verification.$transaction((tx) => writeState(tx, state), {
      timeout: 60000,
    });
    const teacherBootstrap = spawn(
      "pnpm",
      ["exec", "tsx", "src/create-teacher-account.ts"],
      {
        env: {
          ...process.env,
          DATABASE_URL: url.href,
          TEACHER_ID: state.teachers[0].id,
          ACCOUNT_LOGIN: "verification-teacher",
          ACCOUNT_PASSWORD: password,
        },
        stdio: "pipe",
      },
    );
    assert.equal(
      (await once(teacherBootstrap, "exit"))[0],
      0,
      "teacher account initialization",
    );
    await verifyFileStreaming("http://127.0.0.1:3191", headers);
    const requestId = randomUUID();
    const command = {
      type: "task.add",
      studentId: state.students[0].id,
      title: "数据库验收",
      owner: identity.name,
      note: "专项验证",
    };
    const send = () =>
      fetch("http://127.0.0.1:3191/api/commands", {
        method: "POST",
        headers,
        body: JSON.stringify({ requestId, command }),
      });
    const responses = await Promise.all([send(), send()]);
    for (const response of responses)
      assert.equal(response.status, 201, await response.text());
    const rows = await verification.task.findMany();
    assert.equal(
      rows.filter(
        (row) => (row.data as { title?: string }).title === "数据库验收",
      ).length,
      1,
    );
    const invoke = async (command: unknown) => {
      const response = await fetch("http://127.0.0.1:3191/api/commands", {
        method: "POST",
        headers,
        body: JSON.stringify({ requestId: randomUUID(), command }),
      });
      const result = await response.json();
      assert.equal(response.status, 201, JSON.stringify(result));
      return result;
    };
    await invoke({
      type: "role.save",
      role: {
        id: "verification-reader",
        name: "验收只读",
        description: "",
        permissions: ["student.view"],
        scope: "全部",
      },
    });
    const newAccountId = randomUUID();
    const newAccount = {
      id: newAccountId,
      name: "新账号验收",
      phone: "13900009999",
      roleId: "verification-reader",
      scope: "全部",
      enabled: true,
    };
    await invoke({
      type: "account.save",
      account: newAccount,
      initialPassword: password,
    });
    const createdLogin = await fetch("http://127.0.0.1:3191/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5175",
      },
      body: JSON.stringify({ login: newAccount.phone, password }),
    });
    assert.equal(createdLogin.status, 201);
    const commandRows = await verification.appliedCommand.findMany();
    assert.ok(
      commandRows.every(
        (row) => !JSON.stringify(row.command).includes(password),
      ),
      "plaintext passwords never persisted in commands",
    );
    const bookingOwner = {...state.accounts.find(a=>a.roleId === "ops")!,id:randomUUID(),name:"排课验收教务",phone:"verify-booking-owner",scope:"全部",classInUid:"998001"};
    await invoke({type:"account.save",account:bookingOwner,initialPassword:password});
    const createChild = async (name: string) => {
      const result = await invoke({
        type: "student.create",
        student: { ...emptyStudentProfile(), name, chineseName: name, owner:bookingOwner.name,ownerAccountId:bookingOwner.id },
      });
      return (result.data as DemoState).students.find(
        (student) => student.chineseName === name,
      )!;
    };
    const childA = await createChild("验收甲"),
      childB = await createChild("验收乙");
    for (const child of [childA, childB])
      await invoke({
        type: "student.bindClassIn",
        id: child.id,
        phone: "13900001234",
        uid: "101",
      });
    const orderId = randomUUID();
    await invoke({
      type: "order.buy",
      id: orderId,
      studentId: childA.id,
      studentIds: [childA.id],
      units: 144,
      date: "2026-11-18",
      kind: "新购",
      note: "真实入库验收",
    });
    await invoke({ type: "order.join", studentId: childB.id, orderId });
    await Promise.all(
      [childA, childB].map((child) =>
        invoke({
          type: "credit.add",
          studentId: child.id,
          units: 72,
          kind: "续费",
          purchaseId: randomUUID(),
          note: "并发续费",
        }),
      ),
    );
    assert.equal(
      (
        (await verification.order.findUniqueOrThrow({ where: { id: orderId } }))
          .data as { balance: number }
      ).balance,
      288,
    );
    assert.equal(
      await verification.orderMember.count({ where: { orderId } }),
      2,
    );
    const teacher = {
      ...state.teachers[0],
      trained: true,
      classInUid: state.teachers[0].classInUid || "998002",
      availabilityFrom: "",
      categories: ["少儿"],
      availability: Array.from({ length: 7 }, (_, day) => ({
        day,
        start: "08:00",
        end: "22:00",
      })),
    };
    await invoke({ type: "teacher.save", teacher });
    const future = addDays(
      new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10),
      10,
    );
    const schedule = {
      type: "lesson.schedule",
      studentId: childA.id,
      teacherId: teacher.id,
      slots: [{ date: future, time: "09:00" }],
      duration: 25,
      kind: "固定课",
      material: "Book",
      confirmedTeacher: true,
    };
    const scheduled = await invoke(schedule);
    const scheduledLesson = (scheduled.data as DemoState).lessons.find(
      (item) => item.studentId === childA.id && item.date === future,
    )!;
    assert.equal(scheduledLesson.sync, "处理中");
    assert.equal(
      await verification.classInJob.count({
        where: { lessonId: scheduledLesson.id },
      }),
      1,
    );
    const conflict = await fetch("http://127.0.0.1:3191/api/commands", {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: randomUUID(),
        command: { ...schedule, studentId: childB.id },
      }),
    });
    assert.equal(conflict.status, 400);
    const feedback = state.feedback[0];
    await invoke({
      type: "feedback.customer",
      id: feedback.id,
      progress: "待TM判定",
      result: "处理成功",
      note: "客服核实",
    });
    await invoke({
      type: "feedback.tm",
      id: feedback.id,
      result: "处理成功",
      jointVerdict: "二星",
      date: "2026-11-18",
      note: "TM核实",
    });
    const terms = {
      teacherId: teacher.id,
      month: "2026-11",
      so: teacher.so,
      mode: "OP",
      hourly: 90,
      soHourly: 30,
      paidMinutes: 30,
      praise: 10,
      complaint: 15,
      renewal: null,
      fullAttendance: 0,
      confirmed: [{ date: "2026-11-18", time: "09:00", minutes: 30 }],
      soAdjustment: 0,
      teacherAdjustment: 0,
      adjustmentNote: "",
    };
    await invoke({ type: "pay.terms", terms });
    await invoke({
      type: "pay.freeze",
      teacherId: teacher.id,
      month: terms.month,
    });
    assert.ok(
      await verification.settlement.findUnique({
        where: { id: teacher.id + "|" + terms.month },
      }),
    );
    const lesson = state.lessons.find(
      (item) => item.status === "待确认" && item.attendance === "正常",
    )!;
    const resolved = await invoke({
      type: "lesson.resolve",
      ids: [lesson.id],
      decision: "不扣",
      reason: "验收撤销",
    });
    assert.ok(resolved.undoToken);
    const undo = await fetch("http://127.0.0.1:3191/api/undo", {
      method: "POST",
      headers,
      body: JSON.stringify({ token: resolved.undoToken }),
    });
    assert.equal(undo.status, 201, await undo.text());
    assert.equal(
      (
        (
          await verification.lesson.findUniqueOrThrow({
            where: { id: lesson.id },
          })
        ).data as { status: string }
      ).status,
      lesson.status,
    );
    const repeatedUndo = await fetch("http://127.0.0.1:3191/api/undo", {
      method: "POST",
      headers,
      body: JSON.stringify({ token: resolved.undoToken }),
    });
    assert.equal(repeatedUndo.status, 400);
    const oldCreditCount = await verification.credit.count();
    await invoke({
      type: "credit.add",
      studentId: lesson.studentId,
      units: 1,
      kind: "补偿",
      date: "2026-11-18",
      note: "验收入账",
    });
    assert.equal(await verification.credit.count(), oldCreditCount + 1);
    const observer = await verification.account.create({
      data: {
        login: "observer",
        name: "只读验收",
        roleId: "observer",
        passwordHash: passwordHash(password),
      },
    });
    const observerLogin = await fetch("http://127.0.0.1:3191/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5175",
      },
      body: JSON.stringify({ login: "observer", password }),
    });
    const observerMe = await observerLogin.json();
    const denied = await fetch("http://127.0.0.1:3191/api/commands", {
      method: "POST",
      headers: {
        ...headers,
        cookie: observerLogin.headers.get("set-cookie")!.split(";")[0],
        "x-csrf-token": observerMe.csrfToken,
      },
      body: JSON.stringify({ requestId: randomUUID(), command }),
    });
    assert.notEqual(denied.status, 201);
    const teacherLogin = await fetch("http://127.0.0.1:3191/api/session", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://127.0.0.1:5175",
      },
      body: JSON.stringify({ login: "verification-teacher", password }),
    });
    const teacherIdentity = await teacherLogin.json();
    assert.equal(teacherIdentity.teacherId, state.teachers[0].id);
    const teacherHeaders = {
      ...headers,
      cookie: teacherLogin.headers.get("set-cookie")!.split(";")[0],
      "x-csrf-token": teacherIdentity.csrfToken,
    };
    const teacherState: DemoState = await (
      await fetch("http://127.0.0.1:3191/api/state", {
        headers: teacherHeaders,
      })
    ).json();
    assert.deepEqual(
      teacherState.teachers.map((item) => item.id),
      [teacherIdentity.teacherId],
    );
    assert.ok(
      teacherState.lessons.every(
        (item) => item.teacherId === teacherIdentity.teacherId,
      ),
    );
    assert.equal(teacherState.credits.length, 0);
    const teacherLanguage = await fetch("http://127.0.0.1:3191/api/commands", {
      method: "POST",
      headers: teacherHeaders,
      body: JSON.stringify({
        requestId: randomUUID(),
        command: { type: "language.set", language: "en" },
      }),
    });
    assert.equal(teacherLanguage.status, 201);
    assert.equal((await teacherLanguage.json()).data.language, "en");
    const adminLanguage = await fetch("http://127.0.0.1:3191/api/state", {
      headers,
    });
    assert.equal((await adminLanguage.json()).language, "zh");
    const teacherLanguageReload = await fetch(
      "http://127.0.0.1:3191/api/state",
      { headers: teacherHeaders },
    );
    assert.equal((await teacherLanguageReload.json()).language, "en");
    const forbiddenTeacher = await fetch("http://127.0.0.1:3191/api/commands", {
      method: "POST",
      headers: teacherHeaders,
      body: JSON.stringify({
        requestId: randomUUID(),
        command: {
          type: "credit.add",
          studentId: childA.id,
          units: 72,
          kind: "新购",
          note: "",
        },
      }),
    });
    assert.notEqual(forbiddenTeacher.status, 201);
    await verifyMatching("http://127.0.0.1:3191", headers);
    if (process.argv.includes("--matching-only")) return;
    await verifyModules("http://127.0.0.1:3191", headers, teacherHeaders);
    await verifyWorkflows("http://127.0.0.1:3191", headers, teacherHeaders);
    await verifyIntake(
      "http://127.0.0.1:3191",
      headers,
      verification,
      state.students[0].id,
    );
    const readerIdentity = await createdLogin.json();
    const readerHeaders = {
      ...headers,
      cookie: createdLogin.headers.get("set-cookie")!.split(";")[0],
      "x-csrf-token": readerIdentity.csrfToken,
    };
    const invalidChange = await fetch("http://127.0.0.1:3191/api/password", {
      method: "POST",
      headers: readerHeaders,
      body: JSON.stringify({ current: password, next: "Test1234" }),
    });
    assert.equal(invalidChange.status, 400);
    const changedPassword = "New1!" + randomUUID().slice(0, 8);
    const changePassword = await fetch("http://127.0.0.1:3191/api/password", {
      method: "POST",
      headers: readerHeaders,
      body: JSON.stringify({ current: password, next: changedPassword }),
    });
    assert.equal(changePassword.status, 201);
    const oldPasswordLogin = await fetch("http://127.0.0.1:3191/api/session", {
      method: "POST",
      headers,
      body: JSON.stringify({ login: newAccount.phone, password }),
    });
    assert.equal(oldPasswordLogin.status, 401);
    await invoke({
      type: "role.save",
      role: {
        id: "verification-denied",
        name: "撤权验收",
        description: "",
        permissions: [],
        scope: "全部",
      },
    });
    await invoke({
      type: "account.save",
      account: { ...newAccount, roleId: "verification-denied" },
    });
    const changedIdentity = await fetch("http://127.0.0.1:3191/api/me", {
      headers: readerHeaders,
    });
    assert.equal((await changedIdentity.json()).roleId, "verification-denied");
    const resetUrl = "http://127.0.0.1:3191/api/accounts/" + newAccountId + "/password";
    const invalidReset = await fetch(resetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ next: "Reset1!😀" }),
    });
    assert.equal(invalidReset.status, 400);
    const reset = await fetch(
      resetUrl,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ next: "Reset1!" + randomUUID().slice(0, 8) }),
      },
    );
    assert.equal(reset.status, 201);
    assert.equal(
      (await fetch("http://127.0.0.1:3191/api/me", { headers: readerHeaders }))
        .status,
      401,
    );
    process.stdout.write(
      "PASS password change rejects old password, role change reflected in current session, administrator reset revokes sessions\n",
    );
    await verifyScopedScheduling("http://127.0.0.1:3191", headers, verification);
    const wrongOrigin = await fetch("http://127.0.0.1:3191/api/commands", {
      method: "POST",
      headers: { ...headers, origin: "http://example.invalid" },
      body: JSON.stringify({ requestId: randomUUID(), command }),
    });
    assert.equal(wrongOrigin.status, 403);
    const prefs = await fetch("http://127.0.0.1:3191/api/preferences", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ trainingDone: true }),
    });
    assert.equal(prefs.status, 200);
    assert.equal(
      (
        await verification.account.findUniqueOrThrow({
          where: { id: identity.id },
        })
      ).preferences && (await prefs.json()).trainingDone,
      true,
    );
    process.stdout.write(
      "PASS authentication, CSRF, transactional concurrent idempotency, persisted preferences, credit ledger, undo, permission denial, new students, shared orders, concurrent purchases, scheduling conflict/outbox, feedback, payroll freeze\n",
    );
  } catch (error) {
    process.stderr.write(serverOutput.slice(-4000));
    throw error;
  } finally {
    server.kill("SIGTERM");
    await verification.$disconnect();
    await rm(".data/" + schema, { recursive: true, force: true });
    await database.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE');
    await database.$disconnect();
  }
}
main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack : String(error)) + "\n");
  process.exitCode = 1;
});
