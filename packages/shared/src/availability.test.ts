import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { teacherSchema, stateSchema, type Command } from "./model";
import { isAvailable, transition } from "./domain";
import {
  availableMinutesOnDate,
  availabilitySummary,
  isRegularTime,
} from "./availability";

function fixture() {
  const data = createSeed();
  data.lessons = [];
  data.leaves = [];
  const teacher = data.teachers[0];
  teacher.needConfirm = false;
  teacher.availability = [
    { day: 1, start: "17:00", end: "18:00" },
    { day: 1, start: "19:00", end: "21:55" },
    { day: 6, start: "10:00", end: "14:00" },
  ];
  teacher.availabilityFrom = "";
  return { data, teacher };
}
function schedule(
  overrides: Partial<Extract<Command, { type: "lesson.schedule" }>> = {},
): Extract<Command, { type: "lesson.schedule" }> {
  return {
    type: "lesson.schedule",
    studentId: "s4",
    teacherId: "t1",
    slots: [{ date: "2026-11-02", time: "19:00" }],
    duration: 55,
    kind: "固定课",
    material: "Power Up 3",
    ...overrides,
  };
}

describe("教师可用时间与临时排课", () => {
  it("按星期多段和分钟边界判断整节课，不跨休息间隔", () => {
    const { teacher } = fixture();
    expect(isRegularTime(teacher, "2026-11-02", "21:00", 55)).toBe(true);
    expect(isRegularTime(teacher, "2026-11-02", "21:01", 55)).toBe(false);
    expect(isRegularTime(teacher, "2026-11-02", "17:30", 55)).toBe(false);
    expect(isRegularTime(teacher, "2026-11-03", "19:00", 25)).toBe(false);
    expect(isRegularTime(teacher, "2026-11-07", "10:00", 120)).toBe(true);
    expect(availableMinutesOnDate(teacher, "2026-11-02")).toBe(235);
    expect(availabilitySummary(teacher)).toContain("21:55");
  });
  it("生效日期之前和未录入的时间不作为常规推荐", () => {
    const { teacher } = fixture();
    teacher.availabilityFrom = "2026-11-09";
    expect(isRegularTime(teacher, "2026-11-02", "19:00", 25)).toBe(false);
    expect(availableMinutesOnDate(teacher, "2026-11-02")).toBe(0);
    expect(isRegularTime(teacher, "2026-11-09", "19:00", 25)).toBe(true);
    teacher.availability = [];
    expect(isRegularTime(teacher, "2026-11-09", "19:00", 25)).toBe(false);
    expect(availabilitySummary(teacher)).toBe("可用时间待完善");
  });
  it("相邻区间视为连续可用，仍不能跨真实休息间隔", () => {
    const { teacher } = fixture();
    teacher.availability = [
      { day: 1, start: "17:00", end: "18:00" },
      { day: 1, start: "18:00", end: "19:00" },
    ];
    expect(isRegularTime(teacher, "2026-11-02", "17:45", 50)).toBe(true);
    teacher.availability[1].start = "18:01";
    expect(isRegularTime(teacher, "2026-11-02", "17:45", 50)).toBe(false);
  });
  it("正在填写的空日期和时间安全返回不可用", () => {
    const { data, teacher } = fixture();
    expect(isRegularTime(teacher, "", "", 25)).toBe(false);
    expect(isRegularTime(teacher, "2026-02-31", "17:00", 25)).toBe(false);
    expect(
      isAvailable(data, teacher.id, "", "", 25, "s4", undefined, true),
    ).toContain("请选择有效的上课日期");
    expect(
      isAvailable(
        data,
        teacher.id,
        "2026-11-02",
        "23:50",
        25,
        "s4",
        undefined,
        true,
      ),
    ).toContain("请选择有效的上课时间和时长");
  });
  it("常规固定课直接安排，未提前扣课", () => {
    const { data } = fixture();
    const result = transition(data, schedule()).data;
    expect(result.lessons[0]).toMatchObject({
      status: "未开始",
      deducted: false,
      kind: "固定课",
    });
    expect(result.lessons[0].confirmation).toBeUndefined();
  });
  it("非常规时间两种模式均需确认，保留确认记录而不改常规时间", () => {
    const { data, teacher } = fixture();
    const slots = [{ date: "2026-11-02", time: "18:00" }];
    expect(() => transition(data, schedule({ slots }))).toThrow("先与老师确认");
    expect(
      transition(data, schedule({ slots, confirmedTeacher: true })).data
        .lessons,
    ).toHaveLength(1);
    expect(() => transition(data, schedule({ slots, kind: "临时课" }))).toThrow(
      "先与老师确认",
    );
    const result = transition(
      data,
      schedule({
        slots,
        kind: "临时课",
        confirmedTeacher: true,
        operator: "Roma",
        confirmationNote: "已电话确认",
      }),
    ).data;
    expect(result.lessons[0].confirmation).toMatchObject({
      operator: "Roma",
      note: "已电话确认",
    });
    expect(result.lessons[0].confirmation?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.teachers[0].availability).toEqual(teacher.availability);
  });
  it("没有常规资料也必须在确认后安排", () => {
    const { data, teacher } = fixture();
    teacher.availability = [];
    expect(() => transition(data, schedule())).toThrow("先与老师确认");
    expect(
      transition(data, schedule({ kind: "临时课", confirmedTeacher: true }))
        .data.lessons,
    ).toHaveLength(1);
  });
  it("原表生效日期不完整的老师保留说明，核实前不开放常规时间", () => {
    const teacher = createSeed().teachers.find(
      (item) => item.name === "T. Jasshiel",
    );
    expect(teacher?.availability).toEqual([]);
    expect(teacher?.availabilityNote).toContain("20号开始");
    expect(teacher?.availabilitySource).toBe("reference");
  });
  it("常规时间仍保留老师额外确认要求", () => {
    const { data, teacher } = fixture();
    teacher.needConfirm = true;
    expect(() => transition(data, schedule())).toThrow("请先与老师确认");
    expect(
      transition(data, schedule({ confirmedTeacher: true })).data.lessons[0]
        .confirmation,
    ).toBeDefined();
  });
  it("临时确认不能绕过老师和学员冲突、请假和培训", () => {
    const { data } = fixture();
    const command = schedule({
      slots: [{ date: "2026-11-02", time: "18:00" }],
      kind: "临时课",
      confirmedTeacher: true,
    });
    const booked = transition(data, command).data;
    expect(() => transition(booked, { ...command, studentId: "s5" })).toThrow(
      "老师这个时间已经有课",
    );
    expect(() => transition(booked, { ...command, teacherId: "t3" })).toThrow(
      "学员这个时间已经有课",
    );
    const leave = transition(data, {
      type: "teacher.leave",
      teacherId: "t1",
      start: "2026-11-02T18:00",
      end: "2026-11-02T19:00",
      reason: "有事",
      cancelLessons: false,
    }).data;
    expect(() => transition(leave, command)).toThrow("请假");
    data.teachers[0].trained = false;
    expect(() => transition(data, command)).toThrow("培训");
  });
  it("固定课覆盖完整所有日期，一节不可用整批不写入", () => {
    const { data } = fixture();
    const before = structuredClone(data);
    expect(() =>
      transition(
        data,
        schedule({
          slots: [
            { date: "2026-11-02", time: "19:00" },
            { date: "2026-11-03", time: "19:00" },
          ],
        }),
      ),
    ).toThrow("先与老师确认");
    expect(data).toEqual(before);
  });
  it("调课超出常规需重新确认，转为单节临时课", () => {
    const { data } = fixture();
    const booked = transition(data, schedule()).data;
    const command: Extract<Command, { type: "lesson.reschedule" }> = {
      type: "lesson.reschedule",
      id: booked.lessons[0].id,
      date: "2026-11-03",
      time: "19:00",
      teacherId: "t1",
      reason: "协商改期",
    };
    expect(() => transition(booked, command)).toThrow("先与老师确认");
    const result = transition(booked, {
      ...command,
      confirmedTeacher: true,
    }).data;
    expect(result.lessons[0]).toMatchObject({
      kind: "临时课",
      date: "2026-11-03",
    });
    expect(result.lessons[0].confirmation).toBeDefined();
  });
  it("批量换师不能通过勾选把固定课放到非常规时间，临时课可确认换师", () => {
    const { data } = fixture();
    data.teachers[1].availability = [];
    data.teachers[1].needConfirm = false;
    const booked = transition(data, schedule()).data;
    const command: Extract<Command, { type: "lesson.changeTeacher" }> = {
      type: "lesson.changeTeacher",
      studentId: "s4",
      teacherId: "t2",
      from: "2026-11-02",
      reason: "家长要求",
      confirmedTeacher: true,
    };
    expect(() => transition(booked, command)).toThrow("常规时间无法覆盖固定课");
    booked.lessons[0].kind = "临时课";
    const result = transition(booked, command).data;
    expect(result.lessons[0].teacherId).toBe("t2");
    expect(result.lessons[0].confirmation).toBeDefined();
  });
  it("保存时间拦截重叠区间，合法缩减时间保留已有课程并提示冲突", () => {
    const { data, teacher } = fixture();
    const booked = transition(data, schedule()).data;
    expect(() =>
      transition(booked, {
        type: "teacher.save",
        teacher: {
          ...teacher,
          availability: [
            { day: 1, start: "19:00", end: "20:00" },
            { day: 1, start: "19:30", end: "21:00" },
          ],
        },
      }),
    ).toThrow("重叠");
    const result = transition(booked, {
      type: "teacher.save",
      teacher: { ...teacher, availability: [] },
    }).data;
    expect(result.lessons[0]).toMatchObject({
      status: "未开始",
      conflict: true,
    });
  });
  it("旧存储转为分日时间且保留原资料与课程，不重置演示数据", () => {
    const { data, teacher } = fixture();
    const {
      availability: _availability,
      availabilityFrom: _from,
      availabilityNote: _note,
      availabilitySource: _source,
      ...original
    } = teacher;
    const old = {
      ...original,
      openDays: [1, 3],
      openStart: 19.5,
      openEnd: 21.5,
    };
    const migrated = teacherSchema.parse(old);
    expect(migrated.availability).toEqual([
      { day: 1, start: "19:30", end: "21:30" },
      { day: 3, start: "19:30", end: "21:30" },
    ]);
    expect(migrated.availabilitySource).toBe("legacy");
    expect(migrated.name).toBe(teacher.name);
    expect(
      stateSchema.parse({ ...data, teachers: [old] }).students,
    ).toHaveLength(data.students.length);
  });
});
