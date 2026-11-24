import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { describe, it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import {
  cancelForRebooking,
  finishStudentAccountChange,
} from "./classInChanges";
import { getScheduleCredits } from "./scheduleCredits";
import { packagePurchases } from "./packagePurchases";
import { migrateStudentOwners, studentInScope } from "./organization";
import { assertCommandAccess } from "./access";

function fixture(shared = true) {
  let state = bindSchedulingStaff(createSeed());
  const [a, b, c] = state.students;
  state.lessons = [];
  state.credits = [];
  state.orders = [];
  state.packageBalanceVersion = 2;
  for (const s of state.students) s.balance = 0;
  for (const id of shared ? [a.id, b.id] : [a.id])
    state = transition(state, {
      type: "student.bindClassIn",
      id,
      uid: "101",
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
    uid: "202",
    phone: "",
  }).data;
  state = transition(state, {
    type: "credit.add",
    studentId: c.id,
    units: 10,
    kind: "充值",
    note: "已有余额",
  }).data;
  const source = state.orders!.find((o) => o.studentIds.includes(a.id))!;
  const template = bindSchedulingStaff(createSeed()).lessons[0];
  state.lessons = [
    {
      ...template,
      id: "a-future",
      studentId: a.id,
      teacherId: "t1",
      date: "2099-01-02",
      status: "未开始",
      duration: 50,
      plannedUnits: 2,
      deducted: false,
      orderId: source.id,
    },
    {
      ...template,
      id: "b-future",
      studentId: b.id,
      teacherId: "t2",
      date: "2099-01-03",
      status: "未开始",
      duration: 55,
      plannedUnits: 4,
      deducted: false,
      orderId: source.id,
    },
  ];
  return { state, a, b, c, source };
}

describe("ClassIn 取消后重新排课", () => {
  it("AC-52 换号须覆盖原账号和目标账号成员权限，结算采用处理期间的最新余额", () => {
    const { state, a, b, c } = fixture();
    const actor = state.accounts.find(
      (o) => o.id === state.students.find((s) => s.id === a.id)!.ownerAccountId,
    )!;
    const identity = {
      accountId: actor.id,
      roleId: actor.roleId,
      name: actor.name,
    };
    const command = {
      type: "student.bindClassIn" as const,
      id: a.id,
      uid: "202",
      phone: "",
    };
    expect(() => assertCommandAccess(state, identity, command)).toThrow(
      "数据范围",
    );
    for (const id of [a.id, b.id, c.id])
      Object.assign(state.students.find((s) => s.id === id)!, {
        owner: actor.name,
        ownerAccountId: actor.id,
      });
    expect(() => assertCommandAccess(state, identity, command)).not.toThrow();
    let pending = transition(state, command).data;
    pending = transition(pending, {
      type: "credit.deduct",
      studentId: b.id,
      units: 3,
      reason: "B 在换号处理期间正常消费",
    }).data;
    finishStudentAccountChange(pending, a.id);
    expect(pending.students.find((s) => s.id === b.id)!.balance).toBe(17);
    expect(pending.students.find((s) => s.id === a.id)!.balance).toBe(10);
  });
  it("AC-28/29 只取消 A 与原老师的预约和锁，保留其他老师、B、已上记录", () => {
    const { state, a } = fixture();
    state.lessons.push(
      { ...state.lessons[0], id: "a-other", teacherId: "t2" },
      { ...state.lessons[0], id: "a-history", status: "已完成" },
    );
    state.slotLocks = [
      {
        studentId: a.id,
        teacherId: "t1",
        date: "2099-01-02",
        time: "18:00",
        duration: 25,
        operator: "教务",
        expiresAt: "2099-01-03",
      },
      {
        studentId: a.id,
        teacherId: "t2",
        date: "2099-01-04",
        time: "18:00",
        duration: 25,
        operator: "教务",
        expiresAt: "2099-01-05",
      },
    ];
    const after = transition(state, {
      type: "lesson.changeTeacher",
      studentId: a.id,
      originalTeacherId: "t1",
      reason: "重新匹配",
    }).data;
    expect(after.lessons.find((l) => l.id === "a-future")!.status).toBe(
      "已取消",
    );
    expect(after.lessons.filter((l) => l.id !== "a-future")).toEqual(
      state.lessons.filter((l) => l.id !== "a-future"),
    );
    expect(after.slotLocks).toEqual([state.slotLocks[1]]);
    expect(after.teachers).toEqual(state.teachers);
    expect(after.students.find((s) => s.id === a.id)!.scheduleRevision).toBe(1);
  });
  it("AC-47/48 A 离开共享账号时，20 课时留给 B，目标原有 10 课时保留", () => {
    const { state, a, b, c, source } = fixture();
    const purchases = packagePurchases(state);
    const beforeB = structuredClone(state.lessons[1]);
    const pending = transition(state, {
      type: "student.bindClassIn",
      id: a.id,
      uid: "202",
      phone: "",
    }).data;
    expect(
      pending.classInAccounts!.find((a) => a.uid === "101")!.studentIds,
    ).toContain(a.id);
    expect(pending.lessons[0].status).toBe("已取消");
    finishStudentAccountChange(pending, a.id);
    expect(pending.students.find((s) => s.id === a.id)!.balance).toBe(10);
    expect(pending.students.find((s) => s.id === b.id)!.balance).toBe(20);
    expect(pending.students.find((s) => s.id === c.id)!.balance).toBe(10);
    expect(pending.lessons[1]).toEqual(beforeB);
    expect(pending.lessons[0].orderId).toBe(source.id);
    expect(getScheduleCredits(pending, b.id, 0, 1).available).toBe(16);
    expect(packagePurchases(pending)).toEqual(purchases);
    finishStudentAccountChange(pending, a.id);
    expect(pending.orders!.find((o) => o.id === source.id)!.balance).toBe(20);
  });
  it("AC-49/51 独享账号转入目标一次，原消费来源和购课记录保留", () => {
    const { state, a, c, source } = fixture(false);
    state.lessons = state.lessons.filter((l) => l.studentId === a.id);
    const history = {
      ...state.lessons[0],
      id: "history",
      status: "已完成" as const,
      deducted: true,
      confirmedUnits: 1,
    };
    state.lessons.push(history);
    const purchases = packagePurchases(state);
    const pending = transition(state, {
      type: "student.bindClassIn",
      id: a.id,
      uid: "202",
      phone: "",
    }).data;
    finishStudentAccountChange(pending, a.id);
    finishStudentAccountChange(pending, a.id);
    expect(pending.students.find((s) => s.id === c.id)!.balance).toBe(30);
    expect(pending.orders!.find((o) => o.id === source.id)!.balance).toBe(0);
    expect(packagePurchases(pending)).toEqual(purchases);
    delete pending.students.find((s) => s.id === a.id)!.classInChange;
    const corrected = transition(pending, {
      type: "lesson.correct",
      id: "history",
      deduct: false,
      reason: "历史返还",
    }).data;
    expect(corrected.orders!.find((o) => o.id === source.id)!.balance).toBe(1);
    expect(corrected.students.find((s) => s.id === a.id)!.balance).toBe(30);
  });
  it("AC-07/08 同名教务不猜归属，账号 ID 控制队组范围", () => {
    const { state, a } = fixture();
    state.accounts = [
      {
        id: "x",
        name: "同名",
        phone: "",
        roleId: "ops",
        team: "A",
        group: "1",
        scope: "本组",
        enabled: true,
      },
      {
        id: "y",
        name: "同名",
        phone: "",
        roleId: "ops",
        team: "B",
        group: "1",
        scope: "本组",
        enabled: true,
      },
    ];
    a.owner = "同名";
    delete a.ownerAccountId;
    state.students = [a];
    migrateStudentOwners(state);
    expect(a.ownerAccountId).toBeUndefined();
    a.ownerAccountId = "y";
    expect(studentInScope(state, a, "本组", state.accounts[0])).toBe(false);
    expect(studentInScope(state, a, "本组", state.accounts[1])).toBe(true);
  });
  it("AC-30 取消待同步时禁止重新排课，原草稿版本失效", () => {
    const { state, a } = fixture();
    cancelForRebooking(state, a.id, "换师", "t1");
    state.lessons[0].syncState = "pending";
    const command = {
      type: "lesson.schedule" as const,
      studentId: a.id,
      teacherId: "t2",
      slots: [{ date: "2099-01-04", time: "18:00" }],
      duration: 25,
      kind: "临时课" as const,
      material: "",
      confirmedTeacher: true,
    };
    expect(() => transition(state, command)).toThrow("取消尚未确认");
    state.lessons[0].syncState = "completed";
    expect(() => transition(state, command)).toThrow("重新生成课程计划");
  });
});
