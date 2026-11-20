import ClassInLinkForm from "./ClassInLinkForm";
import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { Badge, Button, Modal, Panel } from "@crazytalk/ui";
import { accountBalanceAlignmentIssue, accountBalanceReviewIssue, sharedBalanceGroup, type Student } from "@crazytalk/shared";

export default function StudentClassIn({ student }: { student: Student }) {
  const { data, act, can, preview } = useDemo();
  const linked = data.classInAccounts?.find((a) =>
    a.studentIds.includes(student.id),
  );
  const accountStudents = data.students.filter(s => linked?.studentIds.includes(s.id));
  const [editing,setEditing]=useState(false),[phone,setPhone]=useState(""),[uid,setUid]=useState("");
  const target = editing ? data.classInAccounts?.find(account => uid.trim() ? account.uid === uid.trim() : !!phone.trim() && account.phone === phone.trim()) : undefined;
  const family = sharedBalanceGroup(data, student.id);
  const changing = !!linked?.uid && !!uid && linked.uid !== uid;
  const groupBinding = !linked && family.members.length > 1;
  const otherUsers = data.students.filter(s => s.id !== student.id && target?.studentIds.includes(s.id));
  const reviewIssue = changing ? accountBalanceAlignmentIssue(data,student.id) || (target?.studentIds[0] ? accountBalanceAlignmentIssue(data,target.studentIds[0]) : "") : accountBalanceReviewIssue(data, [...new Set([...family.members, ...(target?.studentIds ?? [])])]);
  const usedBalances = (data.orders ?? []).filter(pack => otherUsers.some(s => pack.studentIds.includes(s.id)));
  function open(){setPhone("");setUid("");setEditing(true);}
  function close(){setEditing(false);}
  return (
    <>
      <Panel
        title="ClassIn 账号"
        action={
          can("classin_account.link") && (
            <Button size="sm" disabled={preview || !!student.classInChange} onClick={open}>
              {linked ? "编辑关联" : "关联账号"}
            </Button>
          )
        }
      >
        {student.classInChange && <p role="status">账号更换尚未完成，完成后可重新排课。</p>}
        <dl className="profile-summary-fields">
          <div>
            <dt>关联状态</dt>
            <dd>
              <Badge tone={linked?.uid ? "success" : "neutral"}>
                {linked?.uid ? "已关联" : linked ? "UID 待核实" : "待绑定"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>注册账号</dt>
            <dd>{linked?.phone || "—"}</dd>
          </div>
          <div>
            <dt>ClassIn UID</dt>
            <dd>{linked?.uid || "—"}</dd>
          </div>
        </dl>
        {accountStudents.length > 1 && (
          <div className="profile-related">
            <span>共有{accountStudents.length}位学员使用此账号：{accountStudents.map((s, index) => (
              <span key={s.id}>
                {index > 0 && "、"}
                {s.id === student.id ? `${s.name}（当前账号）` : (
                  <a href={"/students/" + s.id}>{s.name}</a>
                )}
              </span>
            ))}</span>
          </div>
        )}
      </Panel>
      <Modal
        open={editing}
        title="关联 ClassIn 账号"
        onClose={close}
        width={480}
      >
        {editing && <ClassInLinkForm targetId={student.id} name={student.name} phone={linked?.phone || student.phone} uid={linked?.uid} role="student" saveDisabled={!!reviewIssue} saveLabel={changing ? "确认取消原预约并更换账号" : otherUsers.length ? "确认关联并共享课时" : "确认关联"} onAccountChange={(uid,phone)=>{setUid(uid);setPhone(phone);}} onSave={async(uid,phone)=>{const result = await act({type:"student.bindClassIn",id:student.id,phone,uid});close();return result.message;}}>
          {reviewIssue && <p role="alert" className="danger">{reviewIssue}</p>}
          {changing && <div className="shared-credit-preview" role="status">
            <strong>仅更换 {student.name} 的账号</strong>
            <p>取消该学员所有老师名下的未开始预约，释放占位后重新排课。</p>
            <p>{linked.studentIds.length > 1 ? `原账号仍由其他学员使用，全部 ${family.balance} 课时留在原账号，本学员带走 0 课时。` : `原账号仅该学员使用，剩余 ${family.balance} 课时转入新账号。`}</p>
            <p>新账号已有余额 {usedBalances.reduce((n,p) => n+p.balance,0)} 课时，完成后余额 {usedBalances.reduce((n,p) => n+p.balance,0) + (linked.studentIds.length > 1 ? 0 : family.balance)} 课时。</p>
          </div>}
          {groupBinding && <div className="shared-credit-preview" role="status">
            <strong>本次绑定全部 {family.members.length} 位共用学员</strong>
            <p>{family.members.map(id => data.students.find(s => s.id === id)?.name ?? id).join("、")} · 共用 {family.balance} 课时</p>
            <p>ClassIn 账号：{phone || "待填写"} · UID：{uid || target?.uid || "待核实"}</p>
            <p>确认后全组使用此账号排课，课时余额保持不变。</p>
          </div>}
          {!changing && otherUsers.length > 0 && <div className="shared-credit-preview" role="status">
            <strong>此 ClassIn 账号已有学员使用</strong>
            <p>使用学员：{otherUsers.map(s => s.name).join("、")}</p>
            <p>账号现有余额：{usedBalances.reduce((sum, pack) => sum + pack.balance, 0)} 课时</p>
            <p>关联后共享余额：{reviewIssue ? "待核实" : (data.orders ?? []).filter(pack => pack.studentIds.some(id => id === student.id || target?.studentIds.includes(id))).reduce((sum, pack) => sum + pack.balance, 0)} 课时</p>
            <p>关联后，以上学员与当前学员共同使用剩余课时；任一学员上课都会扣减这份余额。</p>
          </div>}
        </ClassInLinkForm>}
      </Modal>
    </>
  );
}
