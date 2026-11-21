import { useDemo } from "@crazytalk/shared/react";
import { schedulingAccountIssue, type Student } from "@crazytalk/shared";
import StudentClassIn from "../StudentClassIn";

export function SchedulingAccountNotice({ student }: { student: Student }) {
  const { data } = useDemo();
  const issue = schedulingAccountIssue(data, student.id);
  if (!issue) return null;
  const bound = data.classInAccounts?.some(account => account.uid && account.studentIds.includes(student.id));
  return <div className="schedule-account-hint row wrap" role="status">
    <span>{bound || student.classInChange ? issue : "绑定 ClassIn 账号后才能排课。"}</span>
    {!bound && !student.classInChange && <StudentClassIn key={student.id} student={student} shortcut />}
  </div>;
}
