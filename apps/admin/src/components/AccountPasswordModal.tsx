import { useState } from "react";
import { Button, Field, Modal, useToast } from "@crazytalk/ui";
import { changeDemoPassword, demoInitialPassword, passwordError, setDemoPassword } from "../lib/demoPasswords";

export default function AccountPasswordModal({ id, name, personal = false, onClose }: { id: string; name: string; personal?: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save() {
    setError(""); setBusy(true);
    try {
      if (personal) await changeDemoPassword(id, current, password);
      else await setDemoPassword(id, password);
      toast("密码已更新，仅在本次演示页面会话中生效");
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "密码更新失败"); }
    finally { setBusy(false); }
  }
  return <Modal open title={personal ? "修改密码" : `重置 ${name} 的密码`} onClose={() => { if (!busy) onClose(); }}
    footer={<><Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" disabled={busy || !!passwordError(password, confirmation) || (personal && !current)} onClick={save}>{busy ? "保存中…" : personal ? "确认修改" : "确认重置"}</Button></>}>
    <div className="stack">
      <p className="muted">仅模拟密码设置，不连接真实登录服务，刷新页面后恢复演示状态。现有演示账号初始密码：{demoInitialPassword}。</p>
      {personal && <Field label="当前密码" required><input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} /></Field>}
      <Field label="新密码" required hint="8–64 个字符，包含字母和数字"><input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Field label="确认新密码" required><input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></Field>
      {password && confirmation && passwordError(password, confirmation) && <p role="alert">{passwordError(password, confirmation)}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </Modal>;
}
