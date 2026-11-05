import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { autoSettleLessons } from "./autoLessonSettlement";
import { transition } from "./domain";
import type { DemoState } from "./model";
let data: DemoState;
const now = Date.parse("2026-11-05T20:00:00+08:00");
beforeEach(() => {
  data = createSeed();
  data.lessons = [data.lessons[0]];
  Object.assign(data.lessons[0], {
    status: "待确认",
    deducted: false,
    date: "2026-11-05",
    time: "19:00",
    duration: 25,
    attendance: "正常",
    teacherAttendance: ["正常"],
    studentAttendance: ["正常"],
    confirmedUnits: 1.5,
  });
  data.students.find((s) => s.id === data.lessons[0].studentId)!.balanceKnown =
    true;
});
describe("正常课程自动扣课", () => {
  it("按配置扣课并记录流水，重复执行不重复扣除", () => {
    const lesson = data.lessons[0];
    const student = data.students.find((s) => s.id === lesson.studentId)!;
    const result = autoSettleLessons(data, now);
    expect(result.lessons[0]).toMatchObject({
      status: "已完成",
      deducted: true,
      confirmedUnits: 1.5,
    });
    expect(result.students.find((s) => s.id === student.id)!.balance).toBe(
      student.balance - 1.5,
    );
    expect(result.credits[0]).toMatchObject({
      lessonId: lesson.id,
      units: -1.5,
      operator: "系统自动扣课",
    });
    expect(autoSettleLessons(result, now)).toBe(result);
  });
  it.each(["未开始", "已取消", "已完成"] as const)(
    "不自动处理%s课程",
    (status) => {
      data.lessons[0].status = status;
      expect(autoSettleLessons(data, now)).toBe(data);
    },
  );
  it.each(["无数据", "账号待关联", "老师缺席", "学员迟到"] as const)(
    "%s保持待处理",
    (attendance) => {
      data.lessons[0].attendance = attendance;
      delete data.lessons[0].teacherAttendance;
      delete data.lessons[0].studentAttendance;
      expect(autoSettleLessons(data, now)).toBe(data);
    },
  );
  it("缺少数量、未到结束时间、余额未核实都不扣课", () => {
    delete data.lessons[0].confirmedUnits;
    expect(autoSettleLessons(data, now)).toBe(data);
    data.lessons[0].confirmedUnits = 1;
    expect(autoSettleLessons(data, now - 3600000)).toBe(data);
    data.students.find(
      (s) => s.id === data.lessons[0].studentId,
    )!.balanceKnown = false;
    expect(autoSettleLessons(data, now)).toBe(data);
  });
  it("人工更正不扣后不被再次自动扣回", () => {
    const result = autoSettleLessons(data, now);
    const corrected = transition(result, {
      type: "lesson.correct",
      id: result.lessons[0].id,
      deduct: false,
      reason: "人工确认不扣",
    }).data;
    expect(autoSettleLessons(corrected, now)).toBe(corrected);
  });
});
