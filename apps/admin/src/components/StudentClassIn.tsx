import { businessRequest, businessMode } from "@crazytalk/shared/react";
import { useRef, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { Badge, Button, Field, Modal, Panel, useToast } from "@crazytalk/ui";
import { sharedBalanceGroup, type Student } from "@crazytalk/shared";

export default function StudentClassIn({ student }: { student: Student }) {
  const { data, act, can, preview } = useDemo();
  const demo = !businessMode();
  const linked = data.classInAccounts?.find((a) =>
    a.studentIds.includes(student.id),
  );
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [password, setPassword] = useState("");
  const [uid, setUid] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const toast = useToast();
  const target = editing ? data.classInAccounts?.find(account => account.phone === phone.trim()) : undefined;
  const family = sharedBalanceGroup(data, student.id);
  const groupBinding = family.members.length > 1;
  const otherUsers = data.students.filter(s => s.id !== student.id && target?.studentIds.includes(s.id));
  const usedBalances = (data.orders ?? []).filter(pack => otherUsers.some(s => pack.studentIds.includes(s.id)));
  function open() {
    setPhone(linked?.phone || student.phone);
    setUid("");
    setError("");
    setNotice("");
    setConsent(false);
    setPassword("");
    setEditing(true);
  }
  function close() {
    request.current++;
    setBusy(false);
    setPassword("");
    setEditing(false);
  }
  async function lookup() {
    const sequence = ++request.current;
    setBusy(true);
    setUid("");
    setError("");
    setNotice("");
    try {
      const result = await businessRequest("/classin-account", "POST",
        demo ? { phone } : { phone, password, consent, role: "student" });
      if (sequence !== request.current) return;
      const simulated = demo && result.demo === true;
      const matchedUid = simulated && target?.uid ? target.uid : result.uid;
      if (!/^[1-9]\d*$/.test(String(matchedUid ?? ""))) throw new Error("未查询到有效 UID，无法绑定");
      setUid(matchedUid);
      setNotice("已匹配 UID，请核对后保存。");
    } catch (e) {
      if (sequence === request.current)
        setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }
  async function save() {
    try {
      if (!uid) throw new Error("请先查询并核实 ClassIn 账号");
      await act({ type: "student.bindClassIn", id: student.id, phone, uid });
      close();
      toast("账号关联已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  }
  return (
    <>
      <Panel
        title="ClassIn 账号"
        action={
          can("classin_account.link") && (
            <Button size="sm" disabled={preview} onClick={open}>
              {linked ? "编辑关联" : "关联账号"}
            </Button>
          )
        }
      >
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
        {linked && (
          <div className="profile-related">
            <span>关联学员</span>
            {data.students
              .filter((s) => linked.studentIds.includes(s.id))
              .map((s) => (
                <a key={s.id} href={"/students/" + s.id}>
                  {s.name}
                </a>
              ))}
          </div>
        )}
      </Panel>
      <Modal
        open={editing}
        title="关联 ClassIn 账号"
        onClose={close}
        width={480}
        footer={
          <>
            <Button onClick={close}>取消</Button>
            <Button
              variant="primary"
              disabled={busy || !uid}
              onClick={save}
            >
              {groupBinding ? `为 ${family.members.length} 位共用学员绑定` : "保存账号关联"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="ClassIn 账号" required>
            <div className="profile-phone-lookup">
              <input
                aria-label="ClassIn 账号"
                type="text"
                placeholder="请输入 ClassIn 注册手机号或邮箱"
                value={phone}
                onChange={(e) => {
                  request.current++;
                  setBusy(false);
                  setPhone(e.target.value);
                  setConsent(false);
                  setUid("");
                  setError("");
                  setNotice("");
                }}
              />
              <Button
                variant="primary"
                disabled={busy || (!demo && (!consent || password.length < 6 || password.length > 20)) || !(/^1\d{10}$/.test(phone.trim()) || (!demo && /^00\d{1,4}-\d+$/.test(phone.trim())) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phone.trim()))}
                onClick={lookup}
              >
                {busy ? "处理中…" : demo ? "查询 UID" : "注册/获取 UID"}
              </Button>
            </div>
          </Field>
          {!demo && <>
            <Field label="新账号初始密码" hint="6至20位，仅用于新账号；不会修改已有账号密码，本系统不保存此密码。">
              <input aria-label="新账号初始密码" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
            </Field>
            <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />已取得账号持有人同意：未注册时创建 ClassIn 账号，并加入本机构学生名单；已有账号获取 UID 并加入机构。</label>
          </>}
          <Field label={demo ? "ClassIn UID" : "已核实的 UID"} hint={demo ? "查询成功后自动填写 UID。" : "查询成功后才能绑定账号，UID 由查询结果自动填写。"}>
            <input value={uid} readOnly />
          </Field>
          {groupBinding && <div className="shared-credit-preview" role="status">
            <strong>本次绑定全部 {family.members.length} 位共用学员</strong>
            <p>{family.members.map(id => data.students.find(s => s.id === id)?.name ?? id).join("、")} · 共用 {family.balance} 课时</p>
            <p>ClassIn 账号：{phone || "待填写"} · UID：{uid || target?.uid || "待核实"}</p>
            <p>确认后全组使用此账号排课，课时余额保持不变。</p>
          </div>}
          {otherUsers.length > 0 && <div className="shared-credit-preview" role="status">
            <strong>此 ClassIn 账号已有学员使用</strong>
            <p>使用学员：{otherUsers.map(s => s.name).join("、")}</p>
            {usedBalances.map(pack => {
              const owners = data.students.filter(s => pack.studentIds.includes(s.id));
              const group = sharedBalanceGroup(data, student.id, pack.id);
              const canShare = (uid.trim() || target?.uid) && group.members.every(id => id === student.id || target?.studentIds.includes(id)) &&
                group.sources.every(source => (source.memberCount ?? source.studentIds.length) === source.studentIds.length);
              return <p key={pack.id}>{owners.map(s => s.name).join("、")} · 剩余 {pack.balance} 课时
                {pack.studentIds.includes(student.id) ? "（已共用）" : canShare ? `；确认共享后共 ${group.balance} 课时` : ""}</p>;
            })}
            {otherUsers.filter(s => !usedBalances.some(pack => pack.studentIds.includes(s.id))).map(s =>
              <p key={s.id}>{s.name} · {s.balanceKnown ? `剩余 ${s.balance} 课时` : "余额待核实"}</p>)}
            <p>保存只关联账号。核实 UID 后，可在「加课时 → 共享已有课时」确认共享。</p>
          </div>}
          {notice && (
            <p role="status" className="muted">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
