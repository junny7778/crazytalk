import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  addDays,
  emptyStudentProfile,
  type DemoState,
} from "../../../packages/shared/src/model";

export async function verifyScopedScheduling(
  origin: string,
  admin: Record<string, string>,
  db: PrismaClient,
) {
  const read = async (headers = admin): Promise<DemoState> => {
    const response = await fetch(origin + "/api/state", { headers });
    assert.equal(response.status, 200);
    return response.json();
  };
  const send = async (command: unknown, headers = admin) => {
    const response = await fetch(origin + "/api/commands", {
      method: "POST",
      headers,
      body: JSON.stringify({ command, requestId: randomUUID() }),
    });
    return { status: response.status, result: await response.json() };
  };
  const ok = async (command: unknown, headers = admin) => {
    const response = await send(command, headers);
    assert.equal(response.status, 201, JSON.stringify(response.result));
    return response.result;
  };
  const suffix = randomUUID().slice(0, 8);
  const roleId = "scoped-" + suffix;
  await ok({
    type: "role.save",
    role: {
      id: roleId,
      name: "同名组验收",
      description: "",
      scope: "本组",
      permissions: [
        "student.view",
        "student.edit",
        "schedule.view",
        "schedule.create",
        "lesson.view",
      ],
    },
  });
  const operators: { name: string; ownerId:string; headers: Record<string, string> }[] = [];
  for (const team of ["A队", "B队"]) {
    const parent=(await read()).catalog.find(c=>c.type==="队伍"&&c.name===team)!;
    await ok({type:"catalog.save",entry:{id:randomUUID(),type:"组别",name:"同名组",parentId:parent.id,enabled:true,detail:""}});
    const password = "Test1!" + randomUUID().slice(0, 8),
      login = "scope-" + team + "-" + suffix,
      name = "验收教务" + team + suffix;
    await ok({
      type: "account.save",
      account: {
        id: randomUUID(),
        name,
        phone: login,
        roleId,
        scope: "本组",
        team,
        group: "同名组",
        enabled: true,
      },
      initialPassword: password,
    });
    const response = await fetch(origin + "/api/session", {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ login, password }),
    });
    assert.equal(response.status, 201);
    const identity = await response.json();
    const ownerId=randomUUID();
    await ok({type:"account.save",account:{id:ownerId,name:name+"负责人",phone:login+"-owner",roleId:"ops",scope:"本组",team,group:"同名组",enabled:true,classInUid:"998003"},initialPassword:password});
    operators.push({
      name,ownerId,
      headers: {
        ...admin,
        cookie: response.headers.get("set-cookie")!.split(";")[0],
        "x-csrf-token": identity.csrfToken,
      },
    });
  }
  const children: DemoState["students"] = [];
  for (const [index, operator] of operators.entries()) {
    const name = "同手机号孩子" + index + suffix;
    const result = await ok({
      type: "student.create",
      student: {
        ...emptyStudentProfile(),
        name,
        chineseName: name,
        owner: operator.name+"负责人",
        ownerAccountId:operator.ownerId,
        phone: "13812345678",
        preferences: "仅该教务可见的画像" + index,
      },
    });
    const student = (result.data as DemoState).students.find(
      (item) => item.name === name,
    )!;
    children.push(student);
    await ok({
      type: "student.bindClassIn",
      id: student.id,
      phone: "13812345678",
      uid: "919191",
    });
  }
  const orderId = randomUUID();
  await ok({
    type: "order.buy",
    id: orderId,
    studentId: children[0].id,
    studentIds: children.map((child) => child.id),
    units: 144,
    date: new Date().toISOString().slice(0, 10),
    kind: "新购",
    note: "同手机号两个独立档案",
  });
  for (const [index, operator] of operators.entries()) {
    const state = await read(operator.headers);
    assert.deepEqual(
      state.students.map((student) => student.id),
      [children[index].id],
      "same group label across different teams must not broaden scope",
    );
    assert.deepEqual(
      state.orders?.find((order) => order.id === orderId)?.studentIds,
      [children[index].id],
    );
    assert.deepEqual(
      state.classInAccounts?.find((account) => account.uid === "919191")
        ?.studentIds,
      [children[index].id],
    );
    const denied = await send(
      {
        type: "student.details.update",
        id: children[1 - index].id,
        patch: { personality: "越权修改" },
        expected: { personality: children[1 - index].personality },
      },
      operator.headers,
    );
    assert.ok(
      [400, 403].includes(denied.status),
      JSON.stringify(denied.result),
    );
    assert.equal(
      (await read()).students.find(
        (student) => student.id === children[1 - index].id,
      )?.personality,
      children[1 - index].personality,
    );
  }
  const initial = await read();
  const teacher = {
    ...initial.teachers[0],
    id: randomUUID(),
    name: "抢档验收老师" + suffix,
    classInUid:"998004",
    status: "在职",
    trained: true,
    availabilityFrom: "",
    availability: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      start: "09:00",
      end: "22:00",
    })),
  };
  await ok({ type: "teacher.save", teacher });
  const date = addDays(new Date().toISOString().slice(0, 10), 45),
    time = "14:00";
  const results = await Promise.all(
    operators.map((operator, index) =>
      send(
        {
          type: "lesson.schedule",
          studentId: children[index].id,
          teacherId: teacher.id,
          slots: [{ date, time }],
          duration: 25,
          kind: "临时课",
          material: "并发档期验收",
        },
        operator.headers,
      ),
    ),
  );
  assert.deepEqual(
    results.map((response) => response.status).sort(),
    [201, 400],
    JSON.stringify(results),
  );
  assert.equal(
    await db.lesson.count({ where: { teacherId: teacher.id, date, time } }),
    1,
  );
  const final = await read();
  assert.equal(
    final.lessons.filter(
      (lesson) =>
        lesson.teacherId === teacher.id &&
        lesson.date === date &&
        lesson.time === time,
    ).length,
    1,
  );
  console.log(
    "PASS different teams with identical group names, same-phone children scoped independently, direct unauthorized command denied, concurrent slot contention creates one lesson",
  );
}
