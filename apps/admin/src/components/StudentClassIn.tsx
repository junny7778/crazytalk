import { useRef, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { Badge, Button, Field, Modal, Panel, useToast } from "@crazytalk/ui";
import type { Student } from "@crazytalk/shared";

export default function StudentClassIn({ student }: { student: Student }) {
  const { data, act, can, preview } = useDemo();
  const linked = data.classInAccounts?.find((a) =>
    a.studentIds.includes(student.id),
  );
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [uid, setUid] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const toast = useToast();
  function open() {
    setPhone(linked?.phone || student.phone);
    setUid(linked?.uid || "");
    setError("");
    setNotice("");
    setEditing(true);
  }
  function close() {
    request.current++;
    setBusy(false);
    setEditing(false);
  }
  async function lookup() {
    const sequence = ++request.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/classin-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json();
      if (sequence !== request.current) return;
      if (!response.ok) throw new Error(result.error);
      setUid(result.uid);
      setNotice("已匹配 UID，请核对后保存。");
    } catch (e) {
      if (sequence === request.current)
        setError(e instanceof Error ? e.message : "查询失败");
    } finally {
      if (sequence === request.current) setBusy(false);
    }
  }
  function save() {
    try {
      act({ type: "student.bindClassIn", id: student.id, phone, uid });
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
            <dt>注册手机号</dt>
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
              disabled={busy || !phone.trim()}
              onClick={save}
            >
              保存账号关联
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="ClassIn 注册手机号" required>
            <div className="profile-phone-lookup">
              <input
                aria-label="ClassIn 注册手机号"
                type="tel"
                value={phone}
                onChange={(e) => {
                  request.current++;
                  setBusy(false);
                  setPhone(e.target.value);
                  setUid("");
                  setError("");
                  setNotice("");
                }}
              />
              <Button
                disabled={busy || !/^1\d{10}$/.test(phone)}
                onClick={lookup}
              >
                {busy ? "查询中…" : "查询 UID"}
              </Button>
            </div>
          </Field>
          <Field label="已核实的 UID" hint="暂未取得 UID 时，可先保存手机号。">
            <input value={uid} onChange={(e) => setUid(e.target.value)} />
          </Field>
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
