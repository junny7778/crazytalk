import { useEffect, useRef, useState } from "react";
import { businessRequest } from "@crazytalk/shared/react";
import { Button, Field } from "@crazytalk/ui";

export default function TeacherClassInRegistration({ phone, uid, onRegistered }: {
  phone: string; uid?: string; onRegistered: (uid: string) => void;
}) {
  const request = useRef(0);
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { request.current++; setBusy(false); setConsent(false); setPassword(""); setError(""); return () => { request.current++; }; }, [phone]);
  async function register() {
    const sequence = ++request.current;
    setBusy(true); setError("");
    try {
      const result = await businessRequest("/classin-account", "POST", { phone, password, consent, role: "teacher" });
      if (sequence !== request.current) return;
      onRegistered(result.uid);
      setPassword("");
    } catch (error) { if (sequence === request.current) setError(error instanceof Error ? error.message : "注册未完成"); }
    finally { if (sequence === request.current) setBusy(false); }
  }
  return <div className="stack">
    <p>ClassIn UID：{uid || "尚未关联"}。使用上方联系手机或邮箱注册/获取 UID，完成后保存老师资料。</p>
    <Field label="ClassIn 新账号初始密码" hint="6至20位，仅新账号生效；不修改已有密码，本系统不保存密码。">
      <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
    </Field>
    <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />已取得老师本人同意：未注册时创建 ClassIn 账号，并加入本机构老师名单；已有账号获取 UID 并加入机构。</label>
    <Button disabled={busy || !phone || !consent || password.length < 6 || password.length > 20} onClick={register}>{busy ? "处理中…" : "注册/获取老师 UID"}</Button>
    {error && <p role="alert" className="danger">{error}</p>}
  </div>;
}
