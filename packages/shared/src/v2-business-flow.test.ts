import { describe, it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { getScheduleCredits } from "./scheduleCredits";
import { officePay } from "./officePay";
import { projectMetrics } from "./projectMetrics";
import type { Command, PayTerms } from "./model";
function scenario() {
  let data = createSeed();
  const [a, b] = data.students,
    t = data.teachers[0];
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
      material: "Book",
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
    expect(s.data.orders![0].balance).toBe(145);
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
    expect(s.data.orders![0].balance).toBe(142);
    const terms: PayTerms = {
      teacherId: s.t.id,
      month: "2026-11",
      so: s.t.so,
      mode: "NP",
      hourly: 90,
      soHourly: 30,
      paidMinutes: 30,
      praise: 10,
      complaint: 15,
      renewal: null,
      fullAttendance: null,
      confirmed: [],
      soAdjustment: 0,
      teacherAdjustment: 0,
      adjustmentNote: "",
    };
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
    expect(officePay(s.data, terms)).toHaveLength(1);
    s.run({
      type: "feedback.tm",
      id: f.id,
      result: "处理成功",
      jointVerdict: "二星",
      date: "2026-11-25",
      note: "TM 已核实",
    });
    s.run({ type: "pay.terms", terms });
    s.run({ type: "pay.freeze", teacherId: s.t.id, month: terms.month });
    const lines = s.data.settlements![0].lines;
    expect(lines.map((r) => [r.teacher, r.office])).toEqual([
      [22.5, 7.5],
      [-15, 0],
    ]);
    const metrics = projectMetrics(s.data, s.a, "2026-11");
    expect(metrics.used).toBeGreaterThanOrEqual(1);
    expect(metrics.present).toBe(0);
  });
});
