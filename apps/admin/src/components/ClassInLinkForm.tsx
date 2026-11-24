import "./ClassInLinkForm.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { businessRequest } from "@crazytalk/shared/react";
import { Button, Field, useToast } from "@crazytalk/ui";
import { z } from "zod";

const linkResult = z.object({
 uid: z.coerce.string().regex(/^[1-9]\d*$/),
 addedToInstitution: z.boolean(),
});

export default function ClassInLinkForm({phone,name,uid,role,targetId,onSave,onAccountChange,children,saveLabel,saveDisabled=false,roleLabel}:{phone:string;name:string;uid?:string;role:"teacher"|"student"|"staff";targetId:string;onSave:(uid:string,account:string)=>Promise<void|string>;onAccountChange?:(uid:string,account:string)=>void;children?:ReactNode;saveLabel?:string;saveDisabled?:boolean;roleLabel?:string}) {
 const [account,setAccount]=useState(phone),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [obtained,setObtained]=useState<z.infer<typeof linkResult> | null>(null);
 const toast=useToast();
 const sequence=useRef(0);useEffect(()=>()=>{sequence.current++;},[]);
 const identity=role==="student" ? "学员" : role === "staff" ? "团队成员" : "老师";
 const changed=!!uid && !!obtained && uid!==obtained.uid;
 const submitLock=useRef(false);
 async function submit(){
   if(submitLock.current)return;
   submitLock.current=true;
   const current=++sequence.current;setBusy(true);setError("");let resolved=obtained;
   try {
     if(!resolved){
       resolved=linkResult.parse(await businessRequest("/classin-account","POST",{phone:account.trim(),name,role,targetId}));
       if(current!==sequence.current)return;
       setObtained(resolved);onAccountChange?.(resolved.uid,account.trim());
       if(role === "student") return;
       if(uid && uid!==resolved.uid){setConfirmed(false);setError("将更换原有关联，请确认后保存；已有课程不会自动迁移。");return;}
     }
     const savedMessage = await onSave(resolved.uid,account.trim());
     toast(savedMessage || (resolved.addedToInstitution ? `关联成功，${identity}已加入 ClassIn 机构` : "关联成功"));
   }catch(e){if(current===sequence.current)setError((e instanceof Error ? e.message : "操作未完成，请核实账号状态。"));}
   finally{submitLock.current=false;if(current===sequence.current)setBusy(false);}
 }
 const validAccount=/^1\d{10}$/.test(account.trim()) || /^00\d{1,4}-\d+$/.test(account.trim()) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.trim());
 return <div className="stack">
  <Field label="姓名"><input className="classin-link-readonly" value={name} disabled /></Field>
  {role === "staff" && <Field label="角色"><input className="classin-link-readonly" value={roleLabel} disabled /></Field>}
  <Field label="ClassIn 账号" required><input disabled={busy||!!obtained} placeholder="手机号或邮箱" value={account} onChange={e=>{setAccount(e.target.value);onAccountChange?.("",e.target.value);}}/></Field>
  {!obtained && <p className="muted">{role === "staff" ? "填写已注册的 ClassIn 手机号或邮箱，可与后台登录账号不同。关联后，后台角色不变。" : "请填写已注册的 ClassIn 手机号或邮箱，并核对账号是否正确。关联成功后，该账号将加入本机构。"}</p>}
  {obtained && role !== "staff" && <p role="status">已取得 UID：{obtained.uid}</p>}
  {children}
  {changed && <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>确认更换原 UID {uid} 的关联{role === "student" ? "，先取消当前学员的未开始预约，再按预览处理课时并重新排课" : "，已有课程不会自动迁移"}</label>}
  <div className="stack">
  <Button loading={busy} variant="primary" disabled={busy||(!!obtained&&saveDisabled)||(!obtained&&!validAccount)||(changed&&!confirmed)} onClick={submit}>{busy?(changed&&role === "student"?"正在更换账号":"正在关联"):obtained?(saveLabel || "确认关联"):role === "student"?"核实账号":"确认关联"}</Button>
  </div>
  {error && <p role="alert" className="danger">{error}</p>}
 </div>;
}
