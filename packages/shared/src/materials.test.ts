import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { studentMaterialIds, materialMatchIssue } from "./materials";
import { getFixedSchedulePlans } from "./fixedPlans";
import { commandSchema } from "./commandSchema";
import type { Command, ScheduleIntent } from "./model";
function fixture() {
  const data = createSeed();
  data.lessons = [];
  data.leaves = [];
  const student = data.students[3];
  student.status = "在读";
  student.materialIds = ["m1", "m2"];
  data.classInAccounts = [
    { id: "verified", phone: "", uid: "991001", studentIds: [student.id] },
  ];
  const teacher = data.teachers[0];
  teacher.materialIds = ["m1"];
  teacher.status = "在职";
  teacher.trained = true;
  teacher.needConfirm = false;
  teacher.tags = [];
  teacher.categories = ["少儿", "成人"];
  teacher.availabilityFrom = "";
  teacher.availability = [{ day: 1, start: "19:00", end: "21:00" }];
  const command: Extract<Command, { type: "lesson.schedule" }> = {
    type: "lesson.schedule",
    studentId: student.id,
    teacherId: teacher.id,
    slots: [{ date: "2026-11-23", time: "19:00" }],
    duration: 25,
    kind: "临时课",
    material: "Power Up 1",
  };
  return { data, student, teacher, command };
}
it("旧单教材只按目录精确映射；显式空多选不回填", () => {
  const { data, student } = fixture();
  delete student.materialIds;
  student.material = "Power Up 3";
  expect(studentMaterialIds(data, student)).toEqual(["m2"]);
  student.materialIds = [];
  expect(studentMaterialIds(data, student)).toEqual([]);
});
it("教材是硬条件，手动确认也不能绕过；拒绝未知、未登记和不能授课教材", () => {
  const { data, student, teacher, command } = fixture();
  expect(materialMatchIssue(data, student, teacher, "Power Up 1")).toBe("");
  for (const mode of ["recommended", "manual"] as const)
    expect(() =>
      transition(data, {
        ...command,
        selectionMode: mode,
        material: "Power Up 3",
        confirmedTeacher: true,
      }),
    ).toThrow("授课能力");
  expect(() =>
    transition(data, { ...command, material: "未登记教材" }),
  ).toThrow("教材目录");
  student.materialIds = ["m2"];
  expect(() => transition(data, command)).toThrow("学员资料");
});
it("按课次保存不同教材，任一教材失败整批不写入", () => {
  const { data, teacher, command } = fixture();
  teacher.materialIds = ["m1", "m2"];
  const mixed = {
    ...command,
    slots: [
      { date: "2026-11-23", time: "19:00", material: "Power Up 1" },
      { date: "2026-11-23", time: "20:00", material: "Power Up 3" },
    ],
  };
  const parsed = commandSchema.parse(mixed);
  expect(transition(data, parsed).data.lessons.map((l) => l.material)).toEqual([
    "Power Up 1",
    "Power Up 3",
  ]);
  teacher.materialIds = ["m1"];
  expect(() => transition(data, mixed)).toThrow("授课能力");
  expect(data.lessons).toHaveLength(0);
});
it("教材多选资料保存不覆盖原教材进度和其他字段", () => {
  const { data, student, teacher } = fixture();
  const next = transition(data, {
    type: "student.details.update",
    id: student.id,
    patch: { materialIds: ["m1"] },
    expected: { materialIds: student.materialIds },
  }).data;
  expect(next.students.find((s) => s.id === student.id)).toEqual({
    ...student,
    materialIds: ["m1"],
  });
  const saved = transition(data, {
    type: "teacher.save",
    teacher: { ...teacher, materialIds: ["m2"] },
  }).data.teachers.find((t) => t.id === teacher.id)!;
  expect(saved).toMatchObject({ ...teacher, materialIds: ["m2"] });
});
it("老师优先保留单老师缺口，时间优先生成组合；无教材资格不推荐", () => {
  const { data, student, teacher } = fixture();
  const other = {
    ...teacher,
    id: "second",
    name: "第二位老师",
    availability: [{ day: 3, start: "19:00", end: "21:00" }],
  };
  data.teachers = [teacher, other];
  const intent: ScheduleIntent = {
    mode: "fixed",
    materialIds: ["m1"],
    priority: "teacher",
    startDate: "2026-11-23",
    weeks: 1,
    frequency: 2,
    duration: 25,
    windows: [
      { day: 1, start: "19:00", end: "19:25" },
      { day: 3, start: "19:00", end: "19:25" },
    ],
  };
  const first = getFixedSchedulePlans(data, student.id, intent).find(
    (p) => p.primaryTeacherId === teacher.id,
  )!;
  expect(first.teacherCount).toBe(1);
  expect(first.coveredCount).toBe(1);
  const second = getFixedSchedulePlans(data, student.id, {
    ...intent,
    priority: "time",
  })[0];
  expect(second.coveredCount).toBe(2);
  expect(second.teacherCount).toBe(2);
  teacher.materialIds = [];
  expect(
    getFixedSchedulePlans(data, student.id, intent).some(
      (p) => p.primaryTeacherId === teacher.id,
    ),
  ).toBe(false);
  expect(
    getFixedSchedulePlans(data, student.id, { ...intent, materialIds: [] }),
  ).toEqual([]);
});
