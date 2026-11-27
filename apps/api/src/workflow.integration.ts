import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  emptyStudentProfile,
  type DemoState,
} from "../../../packages/shared/src/model";
import { payrollBreakdown } from "../../../packages/shared/src/payroll";
import { getScheduleCredits } from "../../../packages/shared/src/scheduleCredits";

export async function verifyWorkflows(
  origin: string,
  admin: Record<string, string>,
  teacher: Record<string, string>,
) {
  const read = async (headers = admin): Promise<DemoState> =>
    (await fetch(origin + "/api/state", { headers })).json();
  const send = async (command: unknown, headers = admin, status = 201) => {
    const response = await fetch(origin + "/api/commands", {
      method: "POST",
      headers,
      body: JSON.stringify({ command, requestId: randomUUID() }),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  };
  const initial = await read();
  const officeSettlement = initial.settlements!.find(s => s.month === "2026-11")!;
  const officeTerms = initial.payTerms!.find(t => t.teacherId === officeSettlement.teacherId && t.month === officeSettlement.month)!;
  await send({ type: "pay.terms", terms: { ...officeTerms, hourly: officeTerms.hourly! + 100 } }, admin, 400);
  assert.deepEqual((await read()).settlements!.find(s => s.teacherId === officeSettlement.teacherId && s.month === officeSettlement.month), officeSettlement);
  let existing = initial.students.find((s) => s.chineseName === "验收乙")!;
  const sibling = initial.students.find(s => s.chineseName === "验收甲")!;
  const firstLesson = initial.lessons.find(l => l.studentId === sibling.id)!;
  const available = getScheduleCredits(initial, existing.id, 1, 1).available;
  const second = await send({ type: "lesson.schedule", studentId: existing.id, teacherId: firstLesson.teacherId,
    slots: [{ date: firstLesson.date, time: "10:00" }], duration: 25, kind: "固定课", material: firstLesson.material, confirmedTeacher: true });
  const secondLesson = (second.data as DemoState).lessons.find(l => l.studentId === existing.id)!;
  assert.equal(getScheduleCredits(await read(), sibling.id, 1, 1).available, available - 1);
  await send({ type: "lesson.cancel", id: secondLesson.id, reason: "提前取消验收", responsibility: "学员", kind: "学员请假" });
  assert.equal(getScheduleCredits(await read(), existing.id, 1, 1).available, available - 1, "外部取消未确认前保留原课时占用");
  for (const [studentId, time] of [[existing.id, "11:00"], [sibling.id, "12:00"]])
    await send({ type: "lesson.schedule", studentId, teacherId: firstLesson.teacherId,
      slots: [{ date: firstLesson.date, time }], duration: 25, kind: "临时课", material: firstLesson.material, confirmedTeacher: true });
  const beforeRefund = await read();
  await send({ type: "student.lifecycle", studentId: existing.id, status: "退费", reason: "只验证停用流程不执行资金退款" });
  const refunded = await read();
  assert.equal(refunded.students.find(s => s.id === existing.id)!.balance, 0);
  assert.equal(refunded.credits.length, beforeRefund.credits.length + (existing.balance !== 0 ? 1 : 0));
  assert.equal(refunded.students.find(s => s.id === sibling.id)!.balance, 0);
  assert.equal(refunded.students.find(s => s.id === sibling.id)!.status, "退费");
  const canceled = refunded.lessons.filter(l => l.date === firstLesson.date && (
    (l.studentId === existing.id && l.time === "11:00") ||
    (l.studentId === sibling.id && l.time === "12:00")
  ));
  assert.equal(canceled.length, 2);
  assert.ok(canceled.every(l => l.status === "已取消" && l.sync === "处理中"));
  await send({ type: "student.lifecycle", studentId: sibling.id, status: "退费", reason: "重复退款" }, admin, 400);
  assert.equal((await read()).credits.length, refunded.credits.length);
  await send({ type: "student.lifecycle", studentId: existing.id, status: "在读", reason: "复课验收" });
  assert.equal((await read()).lessons.find(l => l.id === secondLesson.id)!.status, "已取消");
  existing = (await read()).students.find(s => s.id === existing.id)!;
  const imported = {
    ...emptyStudentProfile(),
    openingBalance: 0, orderStatus: "正常",
    name: "批量新增",
    chineseName: "批量新增",
  };
  const batch = {
    type: "student.import",
    mode: "update",
    batchId: randomUUID(),
    students: [
      {
        ...existing,
        importStudentId: existing.id,
        personality: "导入更新画像",
      },
      imported,
    ],
  };
  await send(batch);
  await send(batch);
  let state = await read();
  assert.equal(state.students.length, initial.students.length + 1);
  assert.equal(
    state.students.find((s) => s.id === existing.id)!.personality,
    "导入更新画像",
  );
  assert.equal(
    state.students.filter((s) => s.chineseName === imported.chineseName).length,
    1,
  );
  await send(
    {
      ...batch,
      batchId: randomUUID(),
      students: [
        { ...imported, chineseName: "失败批次不得新增" },
        { ...existing, importStudentId: "nonexistent-student" },
      ],
    },
    admin,
    400,
  );
  assert.equal((await read()).students.length, state.students.length);

  const teacherState = await read(teacher);
  const lesson = teacherState.lessons
    .filter((l) => l.status === "已完成")
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  assert.ok(lesson, "completed teacher lesson fixture");
  const picture =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nZsAAAAASUVORK5CYII=";
  const upload = await fetch(origin + "/api/files", {
    method: "POST",
    headers: teacher,
    body: JSON.stringify({ data: picture }),
  });
  assert.equal(upload.status, 201);
  const file = await upload.json();
  const balance = state.students.find(
    (s) => s.id === lesson.studentId,
  )!.balance;
  await send(
    {
      type: "report.save",
      report: {
        lessonId: lesson.id,
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        date: lesson.date,
        material: "跨端验收教材",
        from: "p1",
        to: "p12",
        rating: 5,
        comment: "课堂报告验收",
        suggestedLevel: "",
        screenshot: file.url,
      },
    },
    teacher,
  );
  state = await read();
  assert.equal(
    state.reports.find((r) => r.lessonId === lesson.id)!.screenshot,
    file.url,
  );
  assert.equal(
    state.students.find((s) => s.id === lesson.studentId)!.unit,
    "p12",
  );
  assert.equal(
    state.students.find((s) => s.id === lesson.studentId)!.balance,
    balance,
  );
  const adminImage = await fetch(origin + file.url, { headers: admin });
  assert.equal(adminImage.status, 200);
  assert.deepEqual(
    Buffer.from(await adminImage.arrayBuffer()),
    Buffer.from(picture.split(",")[1], "base64"),
  );

  const payroll = state.payroll.find((p) => p.status === "待确认")!;
  assert.ok(payroll);
  await send({ type: "payroll.status", ids: [payroll.id], status: "已确认" });
  const frozen = payrollBreakdown(await read(), payroll.id);
  const tutor = state.teachers.find((t) => t.id === payroll.teacherId)!;
  await send({
    type: "teacher.save",
    teacher: { ...tutor, rate: tutor.rate + 100 },
  });
  assert.deepEqual(payrollBreakdown(await read(), payroll.id), frozen);
  await send({ type: "payroll.status", ids: [payroll.id], status: "已发放" });
  assert.equal(
    (await read()).payroll.find((p) => p.id === payroll.id)!.status,
    "已发放",
  );
  const editorRole = randomUUID(),
    editorLogin = randomUUID(),
    editorPassword = "Test1!" + randomUUID().slice(0, 8);
  await send({
    type: "role.save",
    role: {
      id: editorRole,
      name: "资料编辑验收",
      description: "",
      permissions: ["teacher.view", "teacher.edit"],
      scope: "全部",
    },
  });
  await send({
    type: "account.save",
    account: {
      id: randomUUID(),
      name: "无薪资权限编辑",
      phone: editorLogin,
      roleId: editorRole,
      scope: "全部",
      enabled: true,
    },
    initialPassword: editorPassword,
  });
  const editorSession = await fetch(origin + "/api/session", {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ login: editorLogin, password: editorPassword }),
  });
  assert.equal(editorSession.status, 201);
  const editorIdentity = await editorSession.json();
  const editorHeaders = {
    ...admin,
    cookie: editorSession.headers.get("set-cookie")!.split(";")[0],
    "x-csrf-token": editorIdentity.csrfToken,
  };
  const maskedTeacher = (await read(editorHeaders)).teachers.find(
    (t) => t.id === tutor.id,
  )!;
  assert.equal(maskedTeacher.rate, 0);
  await send(
    {
      type: "teacher.save",
      teacher: { ...maskedTeacher, notes: "普通资料修改不覆盖真实费率" },
    },
    editorHeaders,
  );
  const actualTeacher = (await read()).teachers.find((t) => t.id === tutor.id)!;
  assert.equal(actualTeacher.rate, tutor.rate + 100);
  assert.equal(actualTeacher.notes, "普通资料修改不覆盖真实费率");
  console.log(
    "PASS import batch idempotency/mixed updates/rollback, teacher report image shared with admin, confirmed payroll frozen after rate change and payment status",
  );
}
