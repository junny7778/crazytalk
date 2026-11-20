import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { getScheduleCredits } from "./scheduleCredits";
function newFamily() {
  const data = createSeed();
  const [a, b] = data.students.slice(0, 2).map((student, i) => ({
    ...student, id: String(90000001 + i), balance: 0,
  }));
  data.students.unshift(a, b);
  data.classInAccounts = [{id:"family-login",phone:"13900001234",uid:"101",studentIds:[a.id,b.id]}];
  return data;
}
it("兄妹共用一笔订单。排课占用、取消释放、实际消耗和更正均原路核算", () => {
  let d = newFamily();
  const [a, b] = d.students;
  const buy = {
    type: "order.buy" as const,
    id: "o1",
    studentId: a.id,
    studentIds: [a.id, b.id],
    units: 144 as const,
    date: "2026-10-31",
    kind: "新购",
    note: "",
  };
  d = transition(d, buy).data;
  d = transition(d, buy).data;
  expect(d.orders!.filter(o => o.studentIds.includes(a.id))).toHaveLength(1);
  const l = {
    ...d.lessons[0],
    id: "test",
    studentId: a.id,
    orderId: "o1",
    duration: 25,
    deducted: false,
    status: "未开始" as const,
  };
  d.lessons.push(l);
  expect(getScheduleCredits(d, b.id, 1, 1).available).toBe(143);
  l.status = "已取消" as typeof l.status;
  expect(getScheduleCredits(d, b.id, 1, 1).available).toBe(144);
  l.status = "待确认" as typeof l.status;
  l.confirmedUnits = 1;
  d = transition(d, {
    type: "lesson.resolve",
    ids: [l.id],
    decision: "扣课",
    reason: "确认完课",
  }).data;
  expect(d.orders!.find(o => o.id === buy.id)!.balance).toBe(143);
  expect(d.credits[0].orderId).toBe("o1");
  expect(d.students[0].balance).toBe(143);
});

it("后加入的学员共享原订单余量，重复加入不会新增流水或重复分配", () => {
  let data = newFamily();
  const [a, b] = data.students;
  data = transition(data, { type: "order.buy", id: "family", studentId: a.id,
    studentIds: [a.id], units: 72, date: "2026-10-31", kind: "新购", note: "" }).data;
  data = transition(data, { type: "credit.deduct", studentId: a.id, units: 2, reason: "纠正" }).data;
  const credits = data.credits;
  const join = { type: "order.join" as const, orderId: "family", studentId: b.id };
  data = transition(transition(data, join).data, join).data;
  expect(data.orders!.filter(o => o.studentIds.includes(b.id))).toHaveLength(1);
  expect(data.orders!.find(o => o.id === "family")).toMatchObject({ studentIds: [a.id, b.id], balance: 70 });
  expect(data.credits).toEqual(credits);
  expect(getScheduleCredits(data, b.id, 1, 1).available).toBe(70);
});

it("后续续费及补赠进入同一套餐，购买保留当时成员快照，重复续费不会重复入账", () => {
  let data = newFamily();
  const [a, b] = data.students;
  data = transition(data, { type: "order.buy", id: "family", studentId: a.id, studentIds: [a.id],
    units: 72, date: "2026-10-31", kind: "新购", note: "" }).data;
  data = transition(data, { type: "order.join", orderId: "family", studentId: b.id }).data;
  const renewal = { type: "credit.add" as const, kind: "续费", studentId: b.id, units: 72,
    note: "", purchaseId: "renewal-2" };
  data = transition(transition(data, renewal).data, renewal).data;
  expect(data.credits.filter(c => c.purchaseId === "renewal-2")).toHaveLength(1);
  expect(data.credits[0]).toMatchObject({ orderId: "family", purchaseStudentIds: [a.id,b.id] });
  expect(data.credits.find(c => c.purchaseId === "family")!.purchaseStudentIds).toEqual([a.id,b.id]);
  for (const kind of ["补偿", "赠送"])
    data = transition(data, { type: "credit.add", kind, studentId: a.id, units: 1, note: "服务跟进" }).data;
  expect(data.students.slice(0, 2).map(s => s.balance)).toEqual([146,146]);
  expect(data.orders!.find(o => o.id === "family")!.balance).toBe(146);
});

it("同账号多次购买合入一个余额，其他账号不能扣减", () => {
  let data = newFamily();
  const [a,b,c] = data.students;
  for (const id of ["first","second"]) data = transition(data,{type:"order.buy",id,studentId:a.id,studentIds:[a.id],units:72,date:"2026-10-31",kind:"新购",note:""}).data;
  data = transition(data,{type:"credit.deduct",studentId:b.id,units:1,reason:"更正"}).data;
  expect(data.orders!.filter(order=>order.studentIds.includes(a.id)).map(order=>order.balance)).toEqual([143]);
  expect(()=>transition(data,{type:"credit.deduct",studentId:c.id,orderId:"first",units:1,reason:"更正"})).toThrow("不属于");
});
