import type { DemoState } from "../../packages/shared/src/model";

export function bindSchedulingStaff(data: DemoState) {
  data.teachers.forEach((teacher, index) => { teacher.classInUid = String(880000 + index); });
  data.accounts.forEach((account, index) => { account.classInUid = String(770000 + index); });
  const owner = data.accounts.find(account => account.roleId === "ops" && account.enabled)!;
  data.students.forEach(student => { student.ownerAccountId ||= owner.id; });
  return data;
}
