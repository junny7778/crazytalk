import { describe, it, expect } from "vitest";
import { demoRepository } from "../../../../packages/shared/src/repository";
import {
  attendanceLabels,
  attendanceOptions,
  attendanceIssue,
  personAttendance,
} from "../lib/lessonAttendance";
describe("考勤展示口径", () => {
  const base = demoRepository.read().lessons[0];
  it("未开始与已取消不能显示正常", () => {
    expect(
      attendanceLabels({ ...base, status: "未开始", attendance: "正常" }),
    ).toEqual([]);
    expect(
      attendanceLabels({ ...base, status: "已取消", attendance: "正常" }),
    ).toEqual([]);
  });
  it("独立展示双方迟到早退，不丢失组合异常", () => {
    expect(
      attendanceLabels({
        ...base,
        status: "待确认",
        attendance: "正常",
        teacherAttendance: ["迟到", "早退"],
        studentAttendance: ["迟到"],
      }),
    ).toEqual(["老师迟到", "老师早退", "学员迟到"]);
  });
  it("记录不完整时待核实，筛选选项不依赖现有数据", () => {
    expect(
      attendanceLabels({
        ...base,
        status: "待确认",
        attendance: "正常",
        teacherAttendance: undefined,
        studentAttendance: undefined,
        studentOut: "",
      }),
    ).toEqual(["待核实"]);
    expect(attendanceOptions).toContain("学员早退");
  });
});

it("数据问题统一为待核实，原因独立保留", () => {
  const base = demoRepository.read().lessons[0];
  for (const attendance of ["无数据", "账号待关联"] as const) {
    const lesson = { ...base, status: "待确认" as const, attendance };
    expect(attendanceLabels(lesson)).toEqual(["待核实"]);
    expect(attendanceIssue(lesson)).toBeTruthy();
  }
  expect(attendanceOptions).toHaveLength(8);
});
it("双方缺席可组合，一方待核实不会判为正常", () => {
  const base = {
    ...demoRepository.read().lessons[0],
    status: "待确认" as const,
    attendance: "正常" as const,
  };
  expect(
    attendanceLabels({
      ...base,
      teacherAttendance: ["缺席"],
      studentAttendance: ["缺席"],
    }),
  ).toEqual(["老师缺席", "学员缺席"]);
  const lesson = {
    ...base,
    teacherAttendance: ["正常"] as ["正常"],
    studentAttendance: ["待核实"] as ["待核实"],
  };
  expect(attendanceLabels(lesson)).toEqual(["待核实"]);
  expect(personAttendance(lesson, "老师")).toEqual(["正常"]);
  expect(personAttendance(lesson, "学员")).toEqual(["待核实"]);
});
