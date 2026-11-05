import { describe, it, expect } from "vitest";
import { createSeed, type Lesson } from "@crazytalk/shared";
import { bookingSummary, attendanceSummary, courseAnomalies, periodRange } from "./dashboard";
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

describe("课程异常", () => {
  it("分别统计双方多项异常，同类标签不重复计数", () => {
    const result = courseAnomalies([
      lesson({ teacherAttendance: ["迟到", "早退"], studentAttendance: ["迟到", "早退"] }),
      lesson({ teacherAttendance: ["缺席"], studentAttendance: ["缺席", "缺席"] }),
      lesson({ status: "已取消", teacherAttendance: ["迟到"] }),
      lesson({ date: "2026-11-01", status: "未开始", attendance: "老师迟到" }),
    ]);
    expect(result.anomalies.map(({ name, count }) => [name, count])).toEqual([
      ["课程取消", 1], ["学员缺席", 1], ["学员迟到", 1], ["学员早退", 1],
      ["老师缺席", 1], ["老师迟到", 1], ["老师早退", 1],
    ]);
    expect(result.pending).toBe(0);
  });
  it("兼容旧考勤字段，将缺失数据、账号未关联和逾期课程列为待核实", () => {
    const result = courseAnomalies([
      lesson({ attendance: "老师早退", teacherAttendance: undefined, studentAttendance: ["正常"] }),
      lesson({ attendance: "无数据" }),
      lesson({ attendance: "账号待关联" }),
      lesson({ status: "未开始" }),
      lesson({ status: "已取消", attendance: "无数据" }),
    ], Date.parse("2026-10-31T12:00:00+08:00"));
    expect(result.anomalies.find((item) => item.name === "老师早退")?.count).toBe(1);
    expect(result.pending).toBe(3);
  });
});

describe("约课统计", () => {
  it("按完整上课日期周期统计所有状态，包含未来课程和取消记录", () => {
    const result = bookingSummary([
      lesson({ status: "未开始", date: "2026-11-01" }),
      lesson({ status: "已完成" }),
      lesson({ status: "待确认" }),
      lesson({ status: "已取消" }),
      lesson({ status: "缺席" }),
      lesson({ date: "2026-10-25" }),
      lesson({ date: "2026-11-02" }),
    ], "2026-10-26", "2026-11-01");
    expect(result).toEqual({ total: 5, upcoming: 1, completed: 1, pending: 1, absent: 1, cancelled: 1, cancellationRate: 20 });
  });
  it("无约课不显示取消率，非空时保留一位小数", () => {
    expect(bookingSummary([], "2026-10-26", "2026-11-01").cancellationRate).toBeNull();
    expect(bookingSummary([lesson({ status: "已取消" }), lesson({}), lesson({})], "2026-10-26", "2026-11-01").cancellationRate).toBe(33.3);
  });
});
