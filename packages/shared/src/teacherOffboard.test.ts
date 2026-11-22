import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition, isAvailable } from "./domain";
import {
  teacherOffboardImpact,
  refreshOffboardRebooking,
} from "./teacherOffboard";
import { getStudentSummary } from "./studentSummary";
import { stateSchema } from "./model";
import { schedulingAccountIssue } from "./packageBalances";
import { getScheduleCredits } from "./scheduleCredits";

function fixture() {
  const data = createSeed();
  data.students = data.students.slice(0, 3);
  data.tasks = [];
  data.leaves = [];
  for (const s of data.students) {
    s.teacherId = "t1";
    s.teacherName = "Carol";
    s.status = "在读";
    s.scheduleIntent = null;
  }
  data.classInAccounts = data.students.map((s, index) => ({
    id: `a${index}`,
    uid: `${index + 101}`,
    phone: "",
    studentIds: [s.id],
  }));
  const [a, b] = data.students;
  const sample = data.lessons[0];
  data.lessons = [
    {
      ...sample,
      id: "a1",
      studentId: a.id,
      teacherId: "t1",
      date: "2099-01-02",
      time: "19:00",
      duration: 25,
      status: "未开始",
      deducted: false,
    },
    {
      ...sample,
      id: "a2",
      studentId: a.id,
      teacherId: "t1",
      date: "2099-01-03",
      time: "19:00",
      duration: 25,
      status: "未开始",
      deducted: false,
    },
    {
      ...sample,
      id: "b-other",
      studentId: b.id,
      teacherId: "t2",
      date: "2099-01-04",
      time: "19:00",
      duration: 25,
      status: "未开始",
      deducted: false,
    },
    {
      ...sample,
      id: "history",
      studentId: a.id,
      teacherId: "t1",
      date: "2026-01-01",
      status: "已完成",
    },
  ];
  data.slotLocks = ["t1", "t2"].map((teacherId) => ({
    studentId: b.id,
    teacherId,
    date: "2099-01-05",
    time: "19:00",
    duration: 25,
    operator: "教务",
    expiresAt: "2099-01-06",
  }));
  return data;
}
const offboard = (data: ReturnType<typeof fixture>) =>
  transition(data, {
    type: "teacher.offboard",
    teacherId: "t1",
    reason: "个人原因",
  }).data;

it("离职覆盖仅绑定、固定占位及多老师学员，保留其他老师与历史并可重复提交", () => {
  const before = fixture();
  expect(teacherOffboardImpact(before, "t1").students).toHaveLength(3);
  expect(teacherOffboardImpact(before, "t1").lessons).toHaveLength(2);
  const after = offboard(before);
  expect(after.students.map((s) => s.teacherId)).toEqual(["", "", ""]);
  expect(after.students.map((s) => s.status)).toEqual([
    "待排课",
    "在读",
    "待排课",
  ]);
  expect(after.lessons.slice(0, 2).map((l) => l.status)).toEqual([
    "已取消",
    "已取消",
  ]);
  expect(after.lessons.slice(2)).toEqual(before.lessons.slice(2));
  expect(after.slotLocks).toEqual([before.slotLocks![1]]);
  expect(after.tasks).toHaveLength(3);
  expect(getStudentSummary(after, after.students[1].id).teacher.id).toBe("t2");
  expect(getStudentSummary(after, after.students[0].id).scheduleText).toBe("");
  expect(after.students.map((s) => s.balance)).toEqual(
    before.students.map((s) => s.balance),
  );
  expect(stateSchema.parse(after).tasks).toEqual(after.tasks);
  expect(offboard(after)).toMatchObject({
    tasks: after.tasks,
    students: after.students,
    lessons: after.lessons,
  });
});

it.each(["停课", "结课", "退费"] as const)(
  "%s学员清理关系但不自动恢复学习",
  (status) => {
    const data = fixture();
    data.students.forEach((s) => (s.status = status));
    const after = offboard(data);
    expect(
      after.students.every((s) => s.status === status && !s.teacherId),
    ).toBe(true);
    expect(after.tasks).toHaveLength(0);
    expect(after.lessons[0].status).toBe("已取消");
  },
);

it("无学员无课程时统计为空；绑定未预约也属于影响范围", () => {
  const data = fixture();
  data.lessons = [];
  data.slotLocks = [];
  expect(teacherOffboardImpact(data, "t1").students).toHaveLength(3);
  data.students.forEach((s) => (s.teacherId = ""));
  expect(teacherOffboardImpact(data, "t1")).toEqual({
    students: [],
    lessons: [],
  });
});

it("取消失败仍保留占位及预约额度，取消确认后才允许重新预约", () => {
  const data = offboard(fixture());
  data.lessons[0].syncState = "failed";
  const s = data.students[0];
  expect(schedulingAccountIssue(data, s.id)).toContain("取消尚未确认");
  expect(
    isAvailable(
      data,
      "t2",
      "2099-01-02",
      "19:00",
      25,
      s.id,
      undefined,
      true,
      true,
    ),
  ).toContain("学员这个时间已经有课");
  const pending = getScheduleCredits(data, s.id, 0, 1).available;
  data.lessons[0].syncState = "completed";
  expect(schedulingAccountIssue(data, s.id)).toBe("");
  expect(getScheduleCredits(data, s.id, 0, 1).available).toBeGreaterThan(
    pending,
  );
});

it("补排两节不会只约一节就结束，需全部同步成功才完成待办", () => {
  let data = offboard(fixture());
  const s = data.students[0];
  const teacher = data.teachers.find((t) => t.id === "t2")!;
  teacher.status = "在职";
  teacher.trained = true;
  teacher.availabilityFrom = "";
  const schedule = (date: string) => {
    data = transition(data, {
      type: "lesson.schedule",
      studentId: s.id,
      teacherId: "t2",
      scheduleRevision: 1,
      slots: [{ date, time: "20:00" }],
      duration: 25,
      kind: "临时课",
      schedulingMode: "flex",
      material: s.material,
      confirmedTeacher: true,
    }).data;
  };
  schedule("2099-01-10");
  expect(data.tasks.find((t) => t.studentId === s.id)?.status).toBe("待处理");
  schedule("2099-01-11");
  const replacement = data.lessons.at(-1)!;
  replacement.syncState = "failed";
  refreshOffboardRebooking(data);
  expect(data.tasks.find((t) => t.studentId === s.id)?.status).toBe("待处理");
  replacement.syncState = "completed";
  refreshOffboardRebooking(data);
  expect(data.tasks.find((t) => t.studentId === s.id)?.status).toBe("已完成");
  expect(data.students[0].status).toBe("在读");
  expect(getStudentSummary(data, s.id).teacher.id).toBe("t2");
});
