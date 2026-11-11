import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { getScheduleCredits } from "./scheduleCredits";

describe("排课课时余额与占用", () => {
  it("余额8课时不能安排预计消耗10课时的课程", () => {
    const data = createSeed();
    data.lessons = [];
    data.students[3].balance = 8;
    const result = getScheduleCredits(data, "s4", 10, 1);
    expect(result.available).toBe(8);
    expect(result.required).toBe(10);
    expect(result.error).toContain("不足");
  });
  it("先扣除已排未扣课占用，取消和完成不扣课程不占用", () => {
    const data = createSeed();
    const base = data.lessons[0];
    data.students[3].balance = 8;
    data.lessons = [
      {
        ...base,
        id: "a",
        duration: 50,
        studentId: "s4",
        status: "未开始",
        deducted: false,
        plannedUnits: 2,
      },
      {
        ...base,
        id: "b",
        duration: 25,
        studentId: "s4",
        status: "待确认",
        deducted: false,
        plannedUnits: 1,
      },
      {
        ...base,
        id: "c",
        studentId: "s4",
        status: "已取消",
        deducted: false,
        plannedUnits: 5,
      },
      {
        ...base,
        id: "d",
        studentId: "s4",
        status: "已完成",
        deducted: false,
        plannedUnits: 5,
      },
    ];
    const result = getScheduleCredits(data, "s4", 6, 1);
    expect(result.reserved).toBe(3);
    expect(result.available).toBe(5);
    expect(result.error).toContain("不足");
  });
  it("已扣课课程不重复占用余额", () => {
    const data = createSeed();
    const base = data.lessons[0];
    data.students[3].balance = 6;
    data.lessons = [
      {
        ...base,
        studentId: "s4",
        status: "已完成",
        deducted: true,
        plannedUnits: 2,
      },
    ];
    expect(getScheduleCredits(data, "s4", 6, 1).error).toBe("");
  });
  it("余额未核实、预计课时无效时不可排课", () => {
    const data = createSeed();
    data.lessons = [];
    data.students[3].balanceKnown = false;
    expect(getScheduleCredits(data, "s4", 1, 1).error).toContain("核实");
    data.students[3].balanceKnown = true;
    expect(getScheduleCredits(data, "s4", 1, 0).error).toContain("预计");
  });
});

import { transition } from "./domain";
import { addDays, type Command } from "./model";
function booking(
  count: number,
  duration = 25,
  plannedUnits?: number,
): Extract<Command, { type: "lesson.schedule" }> {
  return {
    type: "lesson.schedule",
    studentId: "s4",
    teacherId: "t1",
    slots: Array.from({ length: count }, (_, i) => ({
      date: addDays("2026-11-09", i * 7),
      time: "19:00",
    })),
    kind: "固定课",
    material: "test",
    duration,
    plannedUnits,
  };
}
function creditsFixture() {
  const data = createSeed();
  data.lessons = [];
  data.leaves = [];
  data.students[3].balance = 8;
  data.students[3].balanceKnown = true;
  data.teachers[0].availability = [{ day: 1, start: "17:00", end: "22:00" }];
  return data;
}
describe("排课提交余额拦截", () => {
  describe.each(["固定课", "临时课"] as const)("%s标准课时", (kind) => {
    it.each([[25, 1], [50, 2]])("%i 分钟占用并结算 %i 课时", (duration, units) => {
      const scheduled = transition(creditsFixture(), {
        ...booking(1, duration),
        kind,
        confirmedTeacher: true,
      }).data;
      const lesson = scheduled.lessons[0];
      expect(lesson.plannedUnits).toBe(units);
      expect(getScheduleCredits(scheduled, "s4", 1, units)).toMatchObject({
        balance: 8, reserved: units, available: 8 - units,
      });
      lesson.status = "待确认";
      const settled = transition(scheduled, {
        type: "lesson.resolve", ids: [lesson.id], decision: "扣课", units, reason: "正常完课",
      }).data;
      expect(getScheduleCredits(settled, "s4", 1, units)).toMatchObject({
        balance: 8 - units, reserved: 0, available: 8 - units,
      });
    });
  });
  it("余额8时拒绝10节25分钟课程，原数据不变", () => {
    const data = creditsFixture();
    expect(() => transition(data, booking(10))).toThrow(/不足/);
    expect(data.lessons).toHaveLength(0);
  });
  it("50分钟每节占2课时，不能覆盖为1", () => {
    expect(() => transition(creditsFixture(), booking(5, 50, 1))).toThrow(
      /不足/,
    );
  });
  it("其余时长必须填写，按填写量占用", () => {
    expect(() => transition(creditsFixture(), booking(1, 55))).toThrow(/预计/);
    const next = transition(creditsFixture(), booking(4, 55, 2)).data;
    expect(next.lessons.every((l) => l.plannedUnits === 2)).toBe(true);
  });
  it("精确用完余额可成功，重复排课不能绕过占用，取消释放占用", () => {
    const data = transition(creditsFixture(), booking(8)).data;
    expect(data.students[3].balance).toBe(8);
    const extra = {
      ...booking(1),
      slots: [{ date: "2027-01-11", time: "19:00" }],
    };
    expect(() => transition(data, extra)).toThrow(/不足/);
    const released = transition(data, {
      type: "lesson.cancel",
      id: data.lessons[0].id,
      reason: "测试取消",
      responsibility: "学员",
    }).data;
    expect(
      transition(released, extra).data.lessons.filter(
        (l) => l.status !== "已取消",
      ),
    ).toHaveLength(8);
  });
  it("历史其他时长需核实占用，核实后按预计课时计入", () => {
    let data = transition(creditsFixture(), booking(1, 55, 2)).data;
    delete data.lessons[0].plannedUnits;
    expect(() =>
      transition(data, {
        ...booking(1),
        slots: [{ date: "2026-11-16", time: "19:00" }],
      }),
    ).toThrow(/核实占用/);
    data = transition(data, {
      type: "lesson.plannedUnits.update",
      id: data.lessons[0].id,
      plannedUnits: 2,
    }).data;
    expect(getScheduleCredits(data, "s4", 7, 1).available).toBe(6);
    expect(getScheduleCredits(data, "s4", 7, 1).error).toContain("不足");
  });
  it("实际扣课后余额减少，原占用解除，不会重复计算", () => {
    let data = transition(creditsFixture(), booking(2)).data;
    const lesson = data.lessons[0];
    lesson.status = "待确认";
    data = transition(data, {
      type: "lesson.resolve",
      ids: [lesson.id],
      decision: "扣课",
      units: 1,
      reason: "正常上课",
    }).data;
    const summary = getScheduleCredits(data, "s4", 6, 1);
    expect(summary.balance).toBe(7);
    expect(summary.reserved).toBe(1);
    expect(summary.available).toBe(6);
    expect(summary.error).toBe("");
  });
});
