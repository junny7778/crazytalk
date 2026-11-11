import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { getScheduleCredits } from "./scheduleCredits";
it("兄妹共用一笔订单。排课占用、取消释放、实际消耗和更正均原路核算", () => {
  let d = createSeed();
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
  expect(d.orders).toHaveLength(1);
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
  expect(d.orders![0].balance).toBe(143);
  expect(d.credits[0].orderId).toBe("o1");
  expect(d.students[0].balance).toBe(a.balance);
});
