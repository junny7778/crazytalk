import { expect, it } from "vitest";
import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { schedulingBookingIssue } from "./schedulingAccounts";
import type { Command } from "./model";

function fixture() {
  const data = createSeed();
  bindSchedulingStaff(data);
  data.lessons = [];
  data.leaves = [];
  const student = data.students[3], teacher = data.teachers[0];
  data.classInAccounts = [{ id: "verified", phone: "", uid: "991001", studentIds: [student.id] }];
  student.materialIds = ["m1"];
  Object.assign(teacher, { materialIds: ["m1"], trained: true, needConfirm: false, tags: [], categories: ["少儿", "成人"], availabilityFrom: "", availability: [{ day: 1, start: "19:00", end: "21:00" }] });
  const command: Extract<Command, { type: "lesson.schedule" }> = {
    type: "lesson.schedule", studentId: student.id, teacherId: teacher.id,
    slots: [{ date: "2026-11-23", time: "19:00" }], duration: 25, kind: "临时课", material: "Power Up 1",
  };
  return { data, student, teacher, command };
}

it.each(["recommended", "manual"] as const)("%s 排课校验双方绑定；补齐绑定后可提交", selectionMode => {
  const { data, student, teacher, command } = fixture();
  delete teacher.classInUid;
  expect(() => transition(data, { ...command, selectionMode })).toThrow("绑定老师 ClassIn");
  teacher.classInUid = "889001";
  data.classInAccounts = [];
  expect(() => transition(data, { ...command, selectionMode })).toThrow("绑定 ClassIn");
  data.classInAccounts = [{ id: "verified", phone: "", uid: "991001", studentIds: [student.id] }];
  expect(transition(data, { ...command, selectionMode }).data.lessons).toHaveLength(1);
});

it("批量提交逐一校验实际授课老师，任一未绑定整批不写入", () => {
  const { data, teacher, command } = fixture();
  const other = { ...teacher, id: "unbound" };
  delete other.classInUid;
  data.teachers.push(other);
  expect(() => transition(data, { ...command, slots: [...command.slots, { date: "2026-11-23", time: "20:00", teacherId: other.id }] })).toThrow("绑定老师 ClassIn");
  expect(data.lessons).toEqual([]);
});

it("负责教务缺失、停用或未绑定时不能排课", () => {
  const { data, student, command } = fixture();
  const owner = data.accounts.find(a => a.id === student.ownerAccountId)!;
  delete owner.classInUid;
  expect(() => transition(data, command)).toThrow("负责教务");
  owner.classInUid = "771001";
  owner.enabled = false;
  expect(schedulingBookingIssue(data, student.id)).toContain("负责教务");
  owner.enabled = true;
  student.ownerAccountId = "";
  expect(schedulingBookingIssue(data, student.id)).toContain("负责教务");
});

it.each(["teacher", "student", "owner"] as const)("已排课程改期也复核 %s 绑定；取消不受影响", actor => {
  const { data, student, command } = fixture();
  const next = transition(data, command).data;
  const lesson = next.lessons[0];
  if (actor === "teacher") delete next.teachers[0].classInUid;
  if (actor === "student") next.classInAccounts = [];
  if (actor === "owner") delete next.accounts.find(a => a.id === student.ownerAccountId)!.classInUid;
  expect(() => transition(next, { type: "lesson.reschedule", id: lesson.id, teacherId: lesson.teacherId, date: lesson.date, time: "20:00", reason: "调整时间" })).toThrow("ClassIn");
  expect(next.lessons[0].time).toBe("19:00");
  expect(transition(next, { type: "lesson.cancel", id: lesson.id, reason: "取消预约", responsibility: "平台" }).data.lessons[0].status).toBe("已取消");
});
