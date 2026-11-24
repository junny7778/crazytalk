import type { DemoState, Teacher } from "./model";
import { schedulingAccountIssue } from "./packageBalances";

export function teacherSchedulingAccountIssue(teacher: Pick<Teacher, "classInUid">) {
  return teacher.classInUid ? "" : "绑定老师 ClassIn 账号后才能排课。";
}

export function schedulingBookingIssue(data: DemoState, studentId: string, teacherIds: string[] = []) {
  const issue = schedulingAccountIssue(data, studentId);
  if (issue) return issue;
  const student = data.students.find(s => s.id === studentId);
  const owner = data.accounts.find(a => a.id === student?.ownerAccountId);
  if (!owner?.enabled || !owner.classInUid)
    return "请先选择负责教务并关联该教务的 ClassIn 账号";
  for (const id of new Set(teacherIds)) {
    const teacher = data.teachers.find(t => t.id === id);
    if (!teacher) return "请选择老师";
    if (teacherSchedulingAccountIssue(teacher)) return `${teacher.name}：绑定老师 ClassIn 账号后才能排课。`;
  }
  return "";
}
