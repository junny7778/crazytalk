import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { emptyStudentProfile } from "./model";

it("两个孩子绑定同一登录账号，冲突 UID 不会覆盖原账号", () => {
  let data = createSeed();
  const [a, b] = data.students;
  const bind = (id: string, uid: string) =>
    transition(data, {
      type: "student.bindClassIn",
      id,
      phone: "13900001234",
      uid,
    }).data;
  expect(() => bind(a.id, "")).toThrow("请先查询");
  data = bind(a.id, "101");
  data = bind(b.id, "101");
  data = bind(a.id, "101");
  expect(data.classInAccounts).toHaveLength(1);
  expect(data.classInAccounts![0].studentIds.sort()).toEqual(
    [a.id, b.id].sort(),
  );
  expect(() => bind(a.id, "102")).toThrow("不一致");
});
it("同手机号新增两个独立学员，重放批次不再发号", () => {
  const row = {
    ...emptyStudentProfile(),
    importStudentId: "",
    name: "甲",
    phone: "13900001234",
  };
  const command = {
    type: "student.import" as const,
    mode: "skip" as const,
    students: [row, { ...row, name: "乙" }],
    batchId: "test",
  };
  const seed = createSeed(),
    data = transition(seed, command).data;
  expect(data.students.length).toBe(seed.students.length + 2);
  expect(new Set(data.students.map((s) => s.id)).size).toBe(
    data.students.length,
  );
  expect(transition(data, command).data.students).toEqual(data.students);
});

it("共享要求相同的已核实 UID，保存绑定不合并余额，共享后不能单独换号", () => {
  let data = createSeed();
  const [a, b] = data.students;
  data = transition(data, {
    type: "order.buy",
    id: "family",
    studentId: a.id,
    studentIds: [a.id],
    units: 72,
    kind: "新购",
    date: "2026-10-31",
    note: "",
  }).data;
  const join = {
    type: "order.join" as const,
    studentId: b.id,
    orderId: "family",
  };
  const bind = (id: string, phone: string, uid: string) => {
    data = transition(data, {
      type: "student.bindClassIn",
      id,
      phone,
      uid,
    }).data;
  };
  expect(
    transition(data, join).data.orders!.find((pack) => pack.id === "family")!
      .studentIds,
  ).toContain(b.id);
  bind(a.id, "13900000001", "101");
  expect(() => bind(b.id, "13900000002", "")).toThrow("核实 ClassIn UID");
  expect(() => transition(data, join)).toThrow("请确认");
  bind(b.id, "13900000002", "102");
  expect(() => transition(data, join)).toThrow("同一 ClassIn UID");
  bind(b.id, "13900000001", "101");
  expect(data.orders!.find((o) => o.id === "family")!.studentIds).toEqual([
    a.id,
  ]);
  data = transition(data, join).data;
  expect(() => bind(b.id, "13900000002", "102")).toThrow("共享余额");
});

it("邮箱账号必须取得 UID 后才能关联", () => {
  let data = createSeed();
  const id = data.students[0].id;
  expect(() =>
    transition(data, {
      type: "student.bindClassIn",
      id,
      phone: "student@example.com",
      uid: "",
    }),
  ).toThrow("请先查询");
  data = transition(data, {
    type: "student.bindClassIn",
    id,
    phone: "student@example.com",
    uid: "123",
  }).data;
  expect(
    data.classInAccounts?.find((a) => a.studentIds.includes(id))?.uid,
  ).toBe("123");
});
