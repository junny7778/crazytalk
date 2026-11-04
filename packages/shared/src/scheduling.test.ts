import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { type ScheduleIntent } from "./model";
import {
  getTeacherScheduleMatch,
  getStudentScheduleProgress,
} from "./scheduling";
function fixture() {
  const data = createSeed();
  data.lessons = [];
  data.leaves = [];
  const teacher = data.teachers[0];
  teacher.status = "在职";
  teacher.trained = true;
  teacher.needConfirm = false;
  teacher.categories = ["少儿"];
  teacher.availabilityFrom = "";
  teacher.availability = [
    { day: 1, start: "18:00", end: "21:00" },
    { day: 3, start: "18:00", end: "21:00" },
  ];
  const student = data.students[3];
  student.status = "待排课";
  const intent: ScheduleIntent = {
    mode: "fixed",
    startDate: "2026-11-23",
    weeks: 2,
    duration: 50,
    frequency: 2,
    windows: [
      { day: 1, start: "18:00", end: "20:00" },
      { day: 3, start: "18:00", end: "20:00" },
    ],
  };
  return { data, teacher, student, intent };
}
describe("独立学员排课意向与自动匹配", () => {
  it("保存意向只更新对应学员，后续transition仍保留", () => {
    const { data, student, intent } = fixture();
    const result = transition(data, {
      type: "student.scheduleIntent.update",
      studentId: student.id,
      intent,
    });
    expect(
      result.data.students.find((s) => s.id === student.id)?.scheduleIntent,
    ).toEqual(intent);
    expect(result.data.students[0].scheduleIntent).toBeUndefined();
    expect(data.students[3].scheduleIntent).toBeUndefined();
  });
  it("拒绝空时间和不足一节课的范围", () => {
    const { data, student, intent } = fixture();
    expect(() =>
      transition(data, {
        type: "student.scheduleIntent.update",
        studentId: student.id,
        intent: { ...intent, windows: [] },
      }),
    ).toThrow();
    expect(() =>
      transition(data, {
        type: "student.scheduleIntent.update",
        studentId: student.id,
        intent: {
          ...intent,
          windows: [{ day: 1, start: "18:00", end: "18:10" }],
        },
      }),
    ).toThrow();
  });
  it("固定安排检查全部周，生成无重叠且整节在范围内的课程", () => {
    const { data, teacher, student, intent } = fixture();
    const match = getTeacherScheduleMatch(data, teacher.id, student.id, intent);
    expect(match.complete).toBe(true);
    expect(match.slots).toHaveLength(4);
    expect(match.slots).toContainEqual({ date: "2026-11-23", time: "18:00" });
    expect(match.slots).toContainEqual({ date: "2026-11-30", time: "18:00" });
    expect(match.slots.some((s) => s.time === "18:30")).toBe(false);
  });
  it("固定课排除后续周请假，灵活课可选其他时间", () => {
    const { data, teacher, student, intent } = fixture();
    // Existing lessons provide a genuine teacher conflict in the later week.
    const base = createSeed().lessons[0];
    data.lessons = [
      {
        ...base,
        id: "conflict",
        teacherId: teacher.id,
        studentId: "other",
        date: "2026-11-30",
        time: "18:00",
        duration: 120,
        status: "未开始",
      },
    ];
    const narrow = { ...intent, frequency: 1, windows: [intent.windows[0]] };
    expect(
      getTeacherScheduleMatch(data, teacher.id, student.id, narrow).complete,
    ).toBe(false);
    expect(
      getTeacherScheduleMatch(data, teacher.id, student.id, {
        ...narrow,
        mode: "flex",
      }).matchedCount,
    ).toBe(1);
  });
  it("已有一节课只算部分完成；匹配不重复排已有课程", () => {
    const { data, teacher, student, intent } = fixture();
    const base = createSeed().lessons[0];
    data.lessons = [
      {
        ...base,
        id: "existing",
        teacherId: teacher.id,
        studentId: student.id,
        date: "2026-11-23",
        time: "18:00",
        duration: 50,
        status: "未开始",
      },
    ];
    expect(getStudentScheduleProgress(data, student.id, intent)).toEqual({
      requiredCount: 4,
      scheduledCount: 1,
      complete: false,
    });
    const match = getTeacherScheduleMatch(data, teacher.id, student.id, intent);
    expect(match.complete).toBe(true);
    expect(match.slots).toHaveLength(3);
    expect(match.slots).not.toContainEqual({
      date: "2026-11-23",
      time: "18:00",
    });
  });
  it("不把常规范围外的空档或不适合少儿的老师作为可自动安排", () => {
    const { data, teacher, student, intent } = fixture();
    teacher.availability = [];
    expect(
      getTeacherScheduleMatch(data, teacher.id, student.id, intent)
        .matchedCount,
    ).toBe(0);
    teacher.categories = [];
    student.age = 8;
    expect(
      getTeacherScheduleMatch(data, teacher.id, student.id, intent).reasons,
    ).toContain("暂不教授少儿课程");
  });
  it("历史周期内课程仍计入进度，不会随今天推进重新待排", () => {
    const { data, teacher, student, intent } = fixture();
    const historical = { ...intent, startDate: "2026-10-19", frequency: 1 };
    const base = createSeed().lessons[0];
    data.lessons = ["2026-10-19", "2026-10-26"].map((date, i) => ({
      ...base,
      id: `past-${i}`,
      teacherId: teacher.id,
      studentId: student.id,
      date,
      time: "18:00",
      duration: 50,
      status: "已完成",
    }));
    expect(getStudentScheduleProgress(data, student.id, historical)).toEqual({
      requiredCount: 2,
      scheduledCount: 2,
      complete: true,
    });
  });
  it("固定补排优先延续已有时间，不因较早空档改变后续时间", () => {
    const { data, teacher, student, intent } = fixture();
    const base = createSeed().lessons[0];
    data.lessons = [
      {
        ...base,
        id: "existing",
        teacherId: teacher.id,
        studentId: student.id,
        date: "2026-11-23",
        time: "19:00",
        duration: 50,
        status: "未开始",
      },
    ];
    const match = getTeacherScheduleMatch(data, teacher.id, student.id, {
      ...intent,
      frequency: 1,
    });
    expect(match.complete).toBe(true);
    expect(match.slots).toEqual([{ date: "2026-11-30", time: "19:00" }]);
  });
  it("已有不同的每周上课时间不能被称为固定课已完成或自动固定补排", () => {
    const { data, teacher, student, intent } = fixture();
    const base = createSeed().lessons[0];
    data.lessons = [
      { date: "2026-11-23", time: "18:00" },
      { date: "2026-11-30", time: "19:00" },
    ].map((slot, i) => ({
      ...base,
      ...slot,
      id: `varied-${i}`,
      teacherId: teacher.id,
      studentId: student.id,
      duration: 50,
      status: "未开始",
    }));
    const fixed = { ...intent, frequency: 1 };
    expect(getStudentScheduleProgress(data, student.id, fixed).complete).toBe(
      false,
    );
    expect(
      getTeacherScheduleMatch(data, teacher.id, student.id, fixed).complete,
    ).toBe(false);
    expect(
      getStudentScheduleProgress(data, student.id, { ...fixed, mode: "flex" })
        .complete,
    ).toBe(true);
  });
});

describe("跨老师计划与提交边界", () => {
  it("单老师只能覆盖部分周时保留固定时间缺口", () => {
    const { data, teacher, student, intent } = fixture();
    data.lessons = [
      {
        ...createSeed().lessons[0],
        id: "busy",
        studentId: "other",
        teacherId: teacher.id,
        date: "2026-11-30",
        time: "18:00",
        duration: 120,
        status: "未开始",
      },
    ];
    const match = getTeacherScheduleMatch(data, teacher.id, student.id, {
      ...intent,
      frequency: 1,
      windows: [intent.windows[0]],
    });
    expect(match.slots).toEqual([{ date: "2026-11-23", time: "18:00" }]);
    expect(match.plan).toEqual([
      { date: "2026-11-23", time: "18:00" },
      { date: "2026-11-30", time: "18:00" },
    ]);
    expect(match.complete).toBe(false);
  });
  it("多老师批次中的后续课程冲突时整批不写入", () => {
    const { data, teacher, student } = fixture();
    const second = { ...structuredClone(teacher), id: "second" };
    data.teachers.push(second);
    data.lessons = [
      {
        ...createSeed().lessons[0],
        id: "busy",
        studentId: "other",
        teacherId: second.id,
        date: "2026-11-30",
        time: "18:00",
        duration: 50,
        status: "未开始",
      },
    ];
    expect(() =>
      transition(data, {
        type: "lesson.schedule",
        studentId: student.id,
        teacherId: teacher.id,
        slots: [
          { date: "2026-11-23", time: "18:00", teacherId: teacher.id },
          { date: "2026-11-30", time: "18:00", teacherId: second.id },
        ],
        duration: 50,
        kind: "固定课",
        material: student.material,
      }),
    ).toThrow("已经有课");
    expect(data.lessons).toHaveLength(1);
  });
  it("逐节确认不能替另一位老师确认，也不能绕过学生跨老师时间冲突", () => {
    const { data, teacher, student } = fixture();
    const second = {
      ...structuredClone(teacher),
      id: "second",
      needConfirm: true,
    };
    data.teachers.push(second);
    const command = {
      type: "lesson.schedule" as const,
      studentId: student.id,
      teacherId: teacher.id,
      slots: [
        {
          date: "2026-11-23",
          time: "18:00",
          teacherId: teacher.id,
          confirmedTeacher: true,
        },
        {
          date: "2026-11-23",
          time: "18:25",
          teacherId: second.id,
          confirmedTeacher: false,
        },
      ],
      duration: 50,
      kind: "固定课" as const,
      material: student.material,
    };
    expect(() => transition(data, command)).toThrow("请先与老师确认");
    command.slots[1].confirmedTeacher = true;
    expect(() => transition(data, command)).toThrow("学员这个时间已经有课");
    expect(data.lessons).toHaveLength(0);
  });
});

it("固定课单次调课保留原计划位置，不误判缺口或重复补排", () => {
  const { data, teacher, student, intent } = fixture();
  const target = { ...intent, frequency: 1, windows: [intent.windows[0]] };
  const booked = transition(data, {
    type: "lesson.schedule",
    studentId: student.id,
    teacherId: teacher.id,
    slots: [
      { date: "2026-11-23", time: "18:00" },
      { date: "2026-11-30", time: "18:00" },
    ],
    duration: 50,
    kind: "固定课",
    material: student.material,
  }).data;
  const moved = transition(booked, {
    type: "lesson.reschedule",
    id: booked.lessons[0].id,
    teacherId: teacher.id,
    date: "2026-11-25",
    time: "19:00",
    reason: "本周临时调整",
  }).data;
  expect(getStudentScheduleProgress(moved, student.id, target).complete).toBe(
    true,
  );
  expect(
    getTeacherScheduleMatch(moved, teacher.id, student.id, target).slots,
  ).toEqual([]);
});
