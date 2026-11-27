import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { describe, it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { getScheduleCredits } from "./scheduleCredits";
import { projectMetrics } from "./projectMetrics";
import type { Command } from "./model";
function scenario() {
  let data = bindSchedulingStaff(createSeed());
  const [a, b] = data.students.slice(0, 2).map((student, i) => ({
    ...student, id: String(90000001 + i), balance: 0,
  }));
  data.students.push(a, b);
  const t = data.teachers[0];
  t.availability = Array.from({ length: 7 }, (_, day) => ({
    day,
    start: "08:00",
    end: "22:00",
  }));
  t.availabilityFrom = "";
  t.trained = true;
  t.categories = ["少儿"];
  const run = (cmd: Command) => {
    data = transition(data, cmd).data;
  };
  run({
    type: "student.bindClassIn",
    id: a.id,
    phone: "13900001234",
    uid: "101",
  });
  run({
    type: "student.bindClassIn",
    id: b.id,
    phone: "13900001234",
    uid: "101",
  });
  run({
    type: "order.buy",
    id: "family-order",
    studentId: a.id,
    studentIds: [a.id, b.id],
    kind: "新购",
    units: 144,
    date: "2026-10-30",
    note: "",
  });
  const schedule = (id: string, date: string) => {
    run({
      type: "lesson.schedule",
      studentId: id,
      teacherId: t.id,
      slots: [{ date, time: "09:00" }],
      duration: 25,
      kind: "固定课",
      material: data.students.find(s => s.id === id)!.material,
      confirmedTeacher: true,
    });
    return data.lessons.at(-1)!;
  };
  return {
    get data() {
      return data;
    },
    run,
    schedule,
    a,
    b,
    t,
  };
}
describe("新版跨模块业务验收", () => {
  it("同账号多孩共享144节，锁课转预订，取消和补偿回到原权益账户", () => {
    const s = scenario();
    s.run({
      type: "slot.lock",
      studentId: s.a.id,
      slots: [{ date: "2026-11-23", time: "09:00", teacherId: s.t.id }],
      duration: 25,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    const lesson = s.schedule(s.a.id, "2026-11-23");
    s.schedule(s.b.id, "2026-11-24");
    expect(lesson.orderId).toBe("family-order");
    expect(s.data.slotLocks).toHaveLength(0);
    expect(getScheduleCredits(s.data, s.a.id, 1, 1).available).toBe(142);
    s.run({
      type: "lesson.cancel",
      id: lesson.id,
      kind: "学员请假",
      responsibility: "学员",
      reason: "提前请假",
      cancelledAt: "2026-11-22T12:00:00+08:00",
    });
    expect(getScheduleCredits(s.data, s.b.id, 1, 1).available).toBe(143);
    s.run({
      type: "credit.add",
      studentId: s.b.id,
      orderId: "family-order",
      kind: "补偿",
      units: 1,
      note: "课中问题",
    });
    expect(s.data.orders!.find(order => order.id === "family-order")!.balance).toBe(145);
    expect(s.data.credits[0]).toMatchObject({
      studentId: s.b.id,
      orderId: "family-order",
    });
  });
  it("同节课对学员用3小时、对老师用30分钟，TM结果进入双账单，出勤独立于扣课", () => {
    const s = scenario();
    const a = s.schedule(s.a.id, "2026-11-23"),
      b = s.schedule(s.b.id, "2026-11-24");
    s.run({
      type: "lesson.cancel",
      id: a.id,
      kind: "学员请假",
      responsibility: "学员",
      reason: "一小时前取消",
      cancelledAt: "2026-11-23T08:00:00+08:00",
    });
    s.run({
      type: "lesson.cancel",
      id: b.id,
      kind: "学员请假",
      responsibility: "学员",
      reason: "二十分钟前取消",
      cancelledAt: "2026-11-24T08:40:00+08:00",
    });
    expect(s.data.orders!.find(order => order.id === "family-order")!.balance).toBe(142);
    const f = s.data.feedback[0];
    f.teacherId = s.t.id;
    f.rating = "差评";
    f.tmResult = "";
    s.run({
      type: "feedback.customer",
      id: f.id,
      progress: "待TM判定",
      result: "处理成功",
      note: "客服核实",
    });
    s.run({
      type: "feedback.tm",
      id: f.id,
      result: "处理成功",
      jointVerdict: "二星",
      date: "2026-11-25",
      note: "TM 已核实",
    });
    const metrics = projectMetrics(s.data, s.a, "2026-11");
    expect(metrics.used).toBeGreaterThanOrEqual(1);
    expect(metrics.present).toBe(0);
  });
});
