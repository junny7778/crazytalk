import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { migratePackageBalances } from "./packageBalances";
import { transition } from "./domain";

it("手动扣减更新余额、流水与审计记录，不修改课程和购课记录", () => {
  const data = createSeed();
  const student = data.students[0];
  student.balance = 3.5; student.status = "在读";
  data.lessons = data.lessons.map(lesson => ({ ...lesson, status: "已取消", syncState: undefined }));
  migratePackageBalances(data);
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
  student.balance = 3; student.status = "在读";
  expect(() => transition(data, { type: "credit.deduct", studentId: student.id, units, reason: "纠正" })).toThrow();
});
it("必须填写原因、核实余额，且不可操作冻结课包", () => {
  const data = createSeed(); const student = data.students[0];
  student.balance = 3; student.status = "在读";
  const command = { type: "credit.deduct" as const, studentId: student.id, units: 1, reason: "" };
  expect(() => transition(data, command)).toThrow("原因");
  command.reason = "纠正";
  student.balance = 0;
  expect(() => transition(data, command)).toThrow("可排课余额");
  student.status = "退费";
  expect(() => transition(data, command)).toThrow("冻结");
});
it("允许扣至零，保留小数精度", () => {
  const data = createSeed(); const student = data.students[0];
  student.balance = 0.3; student.status = "在读";
  data.lessons = [];
  const first = transition(data, {type:"credit.deduct",studentId:student.id,units:0.1,reason:"纠正"}).data;
  expect(first.students[0].balance).toBe(0.2);
  const last = transition(first, {type:"credit.deduct",studentId:student.id,units:0.2,reason:"纠正"}).data;
  expect(last.students[0].balance).toBe(0);
});

it.each(["可见预约", "隐藏预约", "另外有课包"])(
  "扣减保留目标共享课包的预约占用（%s）",
  (scenario) => {
    const hidden = scenario === "隐藏预约";
    const otherPackBalance = scenario === "另外有课包" ? 5 : 0;
    const data = createSeed();
    const [student, other] = data.students;
    student.balance = 2 + otherPackBalance;
    other.balance = 2;
    student.status = "在读";
    const order = {
      id: "shared",
      studentIds: [student.id, other.id],
      balance: 2,
      units: 2,
      kind: "新购",
      date: "2026-10-31",
      channel: "",
      project: "",
      ...(hidden ? { hiddenReservations: { units: 2, unknownCount: 0 } } : {}),
    };
    data.packageBalanceVersion = 2;
    data.orders = [order, ...(data.orders ?? []).filter(
      (existing) => !existing.studentIds.some((id) => order.studentIds.includes(id)),
    )];
    if (otherPackBalance)
      data.orders.push({
        ...order, id: "other-pack", studentIds: [student.id], balance: otherPackBalance,
      });
    data.lessons = hidden ? [] : [{
      ...data.lessons[0],
      orderId: order.id,
      studentId: other.id,
      duration: 50,
      status: "未开始",
      deducted: false,
    }];
    const credits = data.credits.slice();
    const command = {
      type: "credit.deduct" as const,
      studentId: student.id,
      orderId: order.id,
      units: 1,
      reason: "纠正",
    };

    expect(() => transition(data, command)).toThrow(/可排课余额/);
    expect(data.credits).toEqual(credits);
    expect(order.balance).toBe(2);

    order.balance = 3;
    student.balance = 3 + otherPackBalance;
    other.balance = 3;
    const result = transition(data, command).data;
    expect(result.orders?.[0].balance).toBe(2);
    expect(result.students.slice(0, 2).map((member) => member.balance))
      .toEqual([2 + otherPackBalance, 2]);
    expect(result.credits[0]).toMatchObject({ type: "手动扣减", units: -1, orderId: order.id });
    expect(result.lessons).toEqual(data.lessons);
  },
);
