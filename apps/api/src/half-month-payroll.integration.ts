import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { defaultPayRules } from "../../../packages/shared/src/halfMonthPayrollSchema";
import { addDays, configureBusinessClock, type DemoState } from "../../../packages/shared/src/model";
import { setTimeout as delay } from "node:timers/promises";
import { readState, writeState } from "./store";

export async function verifyHalfMonthPayroll(
  origin: string,
  headers: Record<string, string>,
  isolated: PrismaClient,
) {
  const read = async (): Promise<DemoState> =>
    (await fetch(origin + "/api/state", { headers })).json();
  const send = async (command: unknown, status = 201) => {
    const response = await fetch(origin + "/api/commands", {
      method: "POST",
      headers,
      body: JSON.stringify({ command, requestId: randomUUID() }),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
  };
  const period = "2025-01-1";
  const before = await readState(isolated);
  const state = structuredClone(before);
  const teacher = state.teachers[0];
  const student = state.students[0];
  const orderId = randomUUID();
  bindSchedulingStaff(state);
  state.lessons = [];
  state.packageBalanceVersion = 2;
  state.orders = [];
  state.classInAccounts = [
    { id: "payroll-student", uid: "853", phone: "", studentIds: [student.id] },
  ];
  student.materialIds = teacher.materialIds = ["m0"];
  teacher.availability = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    start: "19:00",
    end: "20:00",
  }));
  state.orders.push({
    id: orderId,
    studentIds: [student.id],
    units: 5,
    balance: 5,
    project: student.project,
    channel: student.channel,
    kind: "购课",
    date: "2025-01-01",
  });
  await isolated.$transaction((tx) => writeState(tx, state, before));
  await send({ type: "teacher.save", teacher: { ...teacher, payMode: "NP" } });
  const bookingDate = addDays(configureBusinessClock(), 1);
  await send({
    type: "lesson.schedule",
    studentId: student.id,
    teacherId: teacher.id,
    kind: "临时课",
    duration: 25,
    slots: [{ date: bookingDate, time: "19:00" }],
    material: "Power Up Starter",
    selectionMode: "manual",
  });
  const booked = await readState(isolated);
  const lesson = booked.lessons.find(
    (l) => l.studentId === student.id && l.date === bookingDate,
  )!;
  assert.equal(lesson.plannedUnits, 1);
  assert.equal(lesson.confirmedUnits, undefined);
  assert.equal(lesson.orderId, orderId);
  console.log("普通排课", lesson.id, bookingDate, lesson.time, "预计课时", lesson.plannedUnits);
  // Replay this booking in a closed half-month without waiting for a real payday.
  const historic = structuredClone(booked);
  historic.lessons.find((l) => l.id === lesson.id)!.date = "2025-01-06";
  await isolated.$transaction(async (tx) => {
    await writeState(tx, historic, booked);
    await tx.classInLesson.create({
      data: {
        lessonId: lesson.id,
        courseId: "850",
        classId: "851",
        teacherUid: "852",
        studentUid: "853",
      },
    });
  });
  await send({ type: "halfPay.teacherRate", teacherId: teacher.id, rate: 180 });
  await send({ type: "halfPay.officeRate", so: teacher.so, rate: 60 });
  await send({
    type: "halfPay.rules",
    values: { ...defaultPayRules, renewal: 1250 },
  });
  const preview = async () => {
    const response = await fetch(
      origin + "/api/payroll/half-month?period=" + period,
      { headers },
    );
    assert.equal(response.status, 200);
    return (await response.json())[teacher.id];
  };
  await send(
    { type: "halfPay.status", teacherId: teacher.id, period, status: "已确认" },
    400,
  );
  const start = Date.parse("2025-01-06T19:00:00+08:00") / 1000;
  const end = start + 25 * 60;
  const callback = async (event: Record<string, unknown>) => {
    const TimeStamp = Math.floor(Date.now() / 1000);
    const response = await fetch(origin + "/api/webhooks/classin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        SID: "test",
        TimeStamp,
        SafeKey: createHash("md5")
          .update("test" + TimeStamp)
          .digest("hex"),
        ClassID: "851",
        CourseID: "850",
        ...event,
      }),
    });
    assert.equal(response.status, 201, await response.text());
  };
  await callback({ Cmd: "End" });
  assert.equal(
    (await read()).lessons.find((l) => l.id === lesson.id)?.status,
    "待确认",
  );
  const attendance = {
    Cmd: "Attendance",
    ClassEndTime: end,
    Data: ["852", "853"].map((Uid, i) => ({
      Uid,
      Identity: i ? 1 : 3,
      AttendanceTime: 1500,
      FirstInTime: start,
      LastOutTime: end,
    })),
  };
  await callback(attendance);
  await callback(attendance);
  const deadline = Date.now() + 45000;
  let completed = await read();
  while (
    completed.lessons.find((l) => l.id === lesson.id)?.status !== "已完成" &&
    Date.now() < deadline
  ) {
    await delay(500);
    completed = await read();
  }
  assert.equal(
    completed.lessons.find((l) => l.id === lesson.id)?.status,
    "已完成",
  );
  assert.equal(completed.orders?.find((o) => o.id === orderId)?.balance, 4);
  assert.equal(
    completed.credits.filter(
      (c) => c.lessonId === lesson.id && c.type === "上课扣课",
    ).length,
    1,
  );
  await send({ type: "halfPay.teacherRate", teacherId: teacher.id, rate: 420 });
  await send({ type: "halfPay.officeRate", so: teacher.so, rate: 100 });
  await send({
    type: "halfPay.adjust",
    teacherId: teacher.id,
    period,
    side: "office",
    amount: 30,
    note: "半月薪资验收",
  });
  const draft = await preview();
  assert.equal(draft.rules.renewal, 1250);
  assert.equal(
    draft.rows.find((row: { source: string }) => row.source === lesson.id)
      .teacher,
    180,
  );
  assert.ok(
    draft.rows.some(
      (row: { office: number; detail: string }) =>
        row.office === 30 && row.detail.includes("验收管理员"),
    ),
  );
  const totals = draft.rows.reduce(
    (sum: number[], row: { teacher: number; office: number }) => [
      sum[0] + row.teacher,
      sum[1] + row.office,
    ],
    [0, 0],
  );
  assert.deepEqual(totals, [180, 90]);
  console.log("工资单", period, JSON.stringify(draft.rows.map(({key, teacher, office}: {key: string; teacher: number; office: number}) => ({key, teacher, office}))));
  await send({
    type: "halfPay.status",
    teacherId: teacher.id,
    period,
    status: "已确认",
  });
  await send({ type: "halfPay.teacherRate", teacherId: teacher.id, rate: 999 });
  await send({
    type: "halfPay.status",
    teacherId: teacher.id,
    period,
    status: "已发放",
  });
  assert.deepEqual(await preview(), draft);
  assert.equal(
    (await read()).halfMonthPayroll?.find(
      (item) => item.teacherId === teacher.id && item.period === period,
    )?.status,
    "已发放",
  );
  console.log(
    "PASS 排课 → End 待确认 → 双方正常考勤 → 自动完课；余额 5→4，扣课 1 次；老师 ₱180，SO ₱60 + ₱30 = ₱90；确认后改价重读一致，已发放",
  );
}
