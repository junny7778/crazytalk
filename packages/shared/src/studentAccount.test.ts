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
  data = bind(a.id, "");
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
