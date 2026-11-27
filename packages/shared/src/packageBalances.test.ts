// @vitest-environment jsdom
import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { migratePackageBalances } from "./packageBalances";
import { stateSchema } from "./model";
import { getScheduleCredits } from "./scheduleCredits";

it("旧余额转入期初套餐一次，历史流水和课程仍属于原使用者，保留原共享订单", () => {
  const data = createSeed();
  const [a, b, c] = data.students;
  Object.assign(a, { balance: 17 });
  Object.assign(b, { balance: 2 });
  Object.assign(c, { balance: 0 });
  data.students = [a, b, c];
  data.orders = [
    {
      id: "shared",
      studentIds: [a.id, b.id],
      units: 72,
      balance: 65,
      date: "2026-11-01",
      kind: "新购",
      channel: "",
      project: "",
    },
  ];
  const lesson = {
    ...data.lessons[0],
    studentId: a.id,
    deducted: false,
    status: "未开始" as const,
    duration: 25,
  };
  data.lessons = [
    lesson,
    { ...lesson, id: "shared-lesson", orderId: "shared" },
  ];
  data.credits = [
    {
      id: "old",
      studentId: a.id,
      units: -1,
      balance: 17,
      type: "上课扣课",
      date: "2026-11-01",
      operator: "教务",
      note: "",
    },
  ];
  expect(migratePackageBalances(data)).toBe(true);
  const opening = data.orders.find(
    (order) => order.kind === "期初余额" && order.studentIds.includes(a.id),
  )!;
  expect(opening.balance).toBe(17);
  expect(data.lessons.map((item) => item.orderId)).toEqual([
    opening.id,
    "shared",
  ]);
  expect(data.credits[0].orderId).toBe(opening.id);
  expect(data.orders).toHaveLength(3);
  expect([a.balance, b.balance, c.balance]).toEqual([82, 67, 0]);
  expect(getScheduleCredits(data, a.id, 1, 1).available).toBe(80);
  const restored = stateSchema.parse(JSON.parse(JSON.stringify(data)));
  expect(migratePackageBalances(restored)).toBe(false);
  expect(restored.orders).toEqual(data.orders);
});

it("载入旧存档后可共享、扣课和撤销，刷新后仍使用原套餐", async () => {
  const { demoRepository, DEMO_STORAGE_KEY } = await import("./repository");
  const data = createSeed();
  const [a, b] = data.students;
  Object.assign(a, {balance: 17 });
  Object.assign(b, {balance: 0 });
  data.lessons = [
    {
      ...data.lessons[0],
      studentId: a.id,
      status: "待确认",
      autoSettlementPaused: true,
      deducted: false,
      confirmedUnits: 1,
    },
  ];
  data.credits = [];
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  const restored = demoRepository.refresh();
  const lesson = restored.lessons[0];
  const packageId = lesson.orderId!;
  const member = restored.students.find((student) => student.name === b.name)!;
  for (const id of [lesson.studentId, member.id]) demoRepository.execute({type:"student.bindClassIn",id,phone:"13900001234",uid:"101"});
  demoRepository.execute({
    type: "order.join",
    studentId: member.id,
    orderId: packageId,
  });
  const check = () =>
    demoRepository.refresh().orders!.find((order) => order.id === packageId)!;
  expect(check().balance).toBe(17);
  const result = demoRepository.execute({
    type: "lesson.resolve",
    ids: [lesson.id],
    decision: "扣课",
    reason: "已确认",
  });
  expect(check().balance).toBe(16);
  result.undo!();
  expect(check().balance).toBe(17);
  expect(
    demoRepository.read().students.find((s) => s.id === member.id)!.balance,
  ).toBe(17);
  expect(demoRepository.read().credits[0].orderId).toBe(packageId);
});

it("旧版相同成员的两笔购买合成一份余额，成员不同的余额保留待核对", () => {
  const data = createSeed();
  const [a, b] = data.students;
  const pack = {id:"first", studentIds:[a.id], units:72, balance:70, date:"2026-10-01", kind:"新购", channel:"", project:""};
  data.packageBalanceVersion = 1;
  data.orders = [pack, {...pack,id:"second",balance:72,kind:"续费"}, {...pack,id:"mixed",studentIds:[a.id,b.id],balance:10}];
  data.lessons[0].orderId = "second";
  migratePackageBalances(data);
  expect(data.orders.map(p => [p.id, p.balance])).toEqual([["first",142],["mixed",10]]);
  expect(data.lessons[0].orderId).toBe("first");
  expect(data.credits.filter(c => c.orderId === "first").map(c => c.purchaseId).sort()).toEqual(["first","second"]);
  expect(migratePackageBalances(data)).toBe(false);
});
