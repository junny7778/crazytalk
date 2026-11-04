import { describe, it, expect } from "vitest";
import { createSeed, type Lesson } from "@crazytalk/shared";
import { attendanceSummary, periodRange } from "./dashboard";
const base = createSeed().lessons[0];
function lesson(patch: Partial<Lesson>): Lesson {
  return {
    ...base,
    date: "2026-10-30",
    time: "18:00",
    status: "已完成",
    attendance: "正常",
    studentIn: "18:00",
    ...patch,
  };
}
describe("看板统计口径", () => {
  it("出勤率剔除取消、未来与未知考勤，按人次统计", () => {
    const result = attendanceSummary([
      lesson({}),
      lesson({ time: "19:00", attendance: "学员缺席", studentIn: "" }),
      lesson({ status: "已取消" }),
      lesson({ date: "2026-11-01", status: "未开始" }),
      lesson({ attendance: "无数据", studentIn: "" }),
    ]);
    expect(result).toMatchObject({
      present: 1,
      expected: 2,
      absent: 1,
      absentStudents: 1,
      rate: 50,
      unknown: 1,
    });
  });
  it("连续缺勤取最近两节，未知考勤或恢复出勤会中断连续判定", () => {
    const missed = lesson({ attendance: "学员缺席", studentIn: "" });
    expect(
      attendanceSummary([missed, { ...missed, time: "19:00" }]).consecutive,
    ).toEqual([base.studentId]);
    expect(
      attendanceSummary([
        missed,
        { ...missed, time: "19:00" },
        lesson({ time: "20:00" }),
      ]).consecutive,
    ).toEqual([]);
    expect(
      attendanceSummary([
        missed,
        { ...missed, time: "19:00" },
        lesson({ time: "20:00", attendance: "无数据", studentIn: "" }),
      ]).consecutive,
    ).toEqual([]);
  });
  it("无有效考勤显示无数据而非 0%", () => {
    expect(attendanceSummary([]).rate).toBeNull();
  });
  it("周期范围覆盖完整排班周期", () => {
    expect(periodRange("本周")).toEqual({
      start: "2026-10-26",
      end: "2026-11-01",
    });
    expect(periodRange("本月")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(periodRange("今天")).toEqual({
      start: "2026-10-31",
      end: "2026-10-31",
    });
  });
});
