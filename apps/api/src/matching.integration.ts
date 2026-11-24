import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { addDays, emptyStudentProfile, type DemoState } from "../../../packages/shared/src/model";

export async function verifyMatching(origin: string, headers: Record<string, string>) {
  const read = async (): Promise<DemoState> => {
    const response = await fetch(origin + "/api/state", { headers });
    assert.equal(response.status, 200);
    return response.json();
  };
  const send = async (command: unknown, status = 201) => {
    const response = await fetch(origin + "/api/commands", {
      method: "POST", headers,
      body: JSON.stringify({ command, requestId: randomUUID() }),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify({ command, result }));
    return result;
  };
  const initial = await read();
  assert.ok(initial.catalog.some(c => c.id === "tt-34" && c.type === "老师标签"), "standard library persists through API state");
  const customTag = { id: randomUUID(), type: "老师标签", name: "API专项特色" + randomUUID().slice(0, 8), detail: "专项匹配验证", enabled: true, tagColor: "purple", tagCategory: "特色兴趣" };
  await send({ type: "catalog.save", entry: customTag });
  assert.equal((await read()).catalog.find(c => c.id === customTag.id)?.name, customTag.name);
  const teacher = {
    ...initial.teachers[0], id: randomUUID(), name: "匹配专项老师" + randomUUID().slice(0, 8),
    phone: "13911110101", classInUid: "998101", status: "在职", trained: true,
    materialIds: ["m1"], tags: ["tt-34", "tt-64", customTag.id], availabilityFrom: "", needConfirm: false,
    categories: ["少儿", "成人"],
    availability: [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: "09:00", end: "22:00" })),
  };
  await send({ type: "teacher.save", teacher });
  assert.deepEqual((await read()).teachers.find(t => t.id === teacher.id)?.tags, teacher.tags);
  const name = "匹配专项学员" + randomUUID().slice(0, 8);
  await send({ type: "student.create", student: { ...emptyStudentProfile(), name, chineseName: name, level: "L1",material:"Power Up 1",materialIds:["m1"],owner:initial.accounts.find(a=>a.roleId === "ops" && a.classInUid)!.name,ownerAccountId:initial.accounts.find(a=>a.roleId === "ops" && a.classInUid)!.id } });
  const student = (await read()).students.find(s => s.name === name)!;
  await send({ type: "credit.add", studentId: student.id, units: 12, kind: "购买", note: "匹配专项课时" });
  await send({ type: "student.bindClassIn", id: student.id, phone: "13911110102", uid: "998102" });
  const command = {
    type: "lesson.schedule", studentId: student.id, teacherId: teacher.id,
    slots: [{ date: addDays(new Date().toISOString().slice(0, 10), 35), time: "14:00" }],
    duration: 25, kind: "临时课", material: "Power Up 1", confirmedTeacher: true,
  };
  const denied = await send({ ...command, selectionMode: "recommended" }, 400);
  assert.match(JSON.stringify(denied), /暂停自动排课/);
  assert.equal((await read()).lessons.filter(l => l.studentId === student.id).length, 0);
  await send({ ...command, selectionMode: "manual" });
  assert.equal((await read()).lessons.filter(l => l.studentId === student.id).length, 1);
  const conflict = await send({ ...command, selectionMode: "manual" }, 400);
  assert.match(JSON.stringify(conflict), /冲突|已经有课|已有|已排|占用/);
  assert.equal((await read()).lessons.filter(l => l.studentId === student.id).length, 1);
  console.log("PASS matching tag library persisted, custom tag and teacher IDs roundtrip, automatic risk blocked, manual selection allowed, occupied slot rejected");
}
