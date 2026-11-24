import { useState } from "react";
import { Button, Modal } from "@crazytalk/ui";
import ClassInLinkForm from "../ClassInLinkForm";
import { useDemo } from "@crazytalk/shared/react";
import { schedulingBookingIssue, teacherSchedulingAccountIssue, type Student, type Teacher } from "@crazytalk/shared";
import StudentClassIn from "../StudentClassIn";

export function SchedulingAccountNotice({ student }: { student: Student }) {
  const { data } = useDemo();
  const issue = schedulingBookingIssue(data, student.id);
  if (!issue) return null;
  const bound = data.classInAccounts?.some(account => account.uid && account.studentIds.includes(student.id));
  return <div className="schedule-account-hint row wrap" role="status">
    <span>{bound || student.classInChange ? issue : "绑定 ClassIn 账号后才能排课。"}</span>
    {bound && issue.includes("负责教务") && <a href={`/students/${student.id}`}>查看学员负责教务</a>}
    {!bound && !student.classInChange && <StudentClassIn key={student.id} student={student} shortcut />}
  </div>;
}

export function TeacherSchedulingAccountNotice({teacher}: {teacher: Teacher}) {
 const {act,can,preview}=useDemo();
 const [open,setOpen]=useState(false);
 const issue=teacherSchedulingAccountIssue(teacher);
 if(!issue)return null;
 return <div className="schedule-account-hint row wrap" role="status"><span>{issue}</span>
 {can("teacher.edit") && !preview ? <Button size="sm" variant="ghost" onClick={()=>setOpen(true)}>绑定账号</Button> : <span>请联系有老师编辑权限的管理员绑定。</span>}
 {open && <Modal open title="关联 ClassIn 账号" width={480} onClose={()=>setOpen(false)}><ClassInLinkForm targetId={teacher.id} name={teacher.name} role="teacher" phone={teacher.classInAccount || teacher.phone} uid={teacher.classInUid} onSave={async(uid,account)=>{await act({type:"teacher.save",teacher:{...teacher,classInUid:uid,classInAccount:account}});setOpen(false);}}/></Modal>}
 </div>;
}
