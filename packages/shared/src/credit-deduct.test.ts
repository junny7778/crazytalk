import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";

it("手动扣减更新余额、流水与审计记录，不修改课程和购课记录", () => {
  const data = createSeed();
  const student = data.students[0];
  student.balanceKnown = true; student.balance = 3.5; student.status = "在读";
  const result = transition(data, { type: "credit.deduct", studentId: student.id, units: 1.25, reason: "纠正重复录入", operator: "测试教务" }).data;
  expect(result.students[0].balance).toBe(2.25);
  expect(result.credits[0]).toMatchObject({ type: "手动扣减", units: -1.25, balance: 2.25, note: "纠正重复录入", operator: "测试教务" });
  expect(result.events[0]).toMatchObject({ relatedType: "credit", relatedId: result.credits[0].id });
  expect(result.lessons).toEqual(data.lessons);
  expect(result.credits.slice(1)).toEqual(data.credits);
  expect(data.students[0].balance).toBe(3.5);
});
it.each([0, -1, NaN, Infinity, 4])("拒绝非法或超额扣减 %s", units => {
  const data = createSeed(); const student = data.students[0];
  student.balanceKnown = true; student.balance = 3; student.status = "在读";
  expect(() => transition(data, { type: "credit.deduct", studentId: student.id, units, reason: "纠正" })).toThrow();
});
it("必须填写原因、核实余额，且不可操作冻结课包", () => {
  const data = createSeed(); const student = data.students[0];
  student.balanceKnown = true; student.balance = 3; student.status = "在读";
  const command = { type: "credit.deduct" as const, studentId: student.id, units: 1, reason: "" };
  expect(() => transition(data, command)).toThrow("原因");
  command.reason = "纠正";
  student.balanceKnown = false;
  expect(() => transition(data, command)).toThrow("核实");
  student.balanceKnown = true; student.status = "退费";
  expect(() => transition(data, command)).toThrow("冻结");
});
it("允许扣至零，保留小数精度", () => {
  const data = createSeed(); const student = data.students[0];
  student.balanceKnown = true; student.balance = 0.3; student.status = "在读";
  const first = transition(data, {type:"credit.deduct",studentId:student.id,units:0.1,reason:"纠正"}).data;
  expect(first.students[0].balance).toBe(0.2);
  const last = transition(first, {type:"credit.deduct",studentId:student.id,units:0.2,reason:"纠正"}).data;
  expect(last.students[0].balance).toBe(0);
});
