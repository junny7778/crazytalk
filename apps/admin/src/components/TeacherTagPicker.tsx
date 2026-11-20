import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogEntry } from "@crazytalk/shared";
import { teacherTagName } from "@crazytalk/shared";
import "./teacher-tags.css";

export function TeacherTags({catalog, values, showDetails=true}: {catalog:CatalogEntry[]; values:string[]; showDetails?:boolean}) {
 return <span className="teacher-tags">{values.map(id=>{
 const tag=catalog.find(t=>t.type==="老师标签" && t.id===id);
 return <span key={id} className={`teacher-tag teacher-tag-${tag?.tagColor || "yellow"}`} title={showDetails ? (tag ? [tag.tagMeaning,tag.tagExample,tag.tagAdvice].filter(Boolean).join("；") : "旧标签待整理") : undefined}>{teacherTagName(catalog,id)}{!tag ? "（待整理）" : !tag.enabled ? "（已停用）" : ""}</span>;
 })}{!values.length && "未填写"}</span>;
}
export default function TeacherTagPicker({catalog, values, onChange}: {catalog:CatalogEntry[];values:string[];onChange:(values:string[])=>void}) {
 const tooltipId=useId();
 const [preview,setPreview]=useState<{tag:CatalogEntry;anchor:DOMRect}|null>(null);
 const show=(id:string,element:HTMLElement)=>{
   const tag=catalog.find(t=>t.type==="老师标签" && t.id===id);
   if(tag) setPreview({tag,anchor:element.getBoundingClientRect()});
 };
 useEffect(()=>{
   if(!preview) return;
   const close=()=>setPreview(null);
   const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")close();};
   window.addEventListener("scroll",close,true);
   window.addEventListener("resize",close);
   window.addEventListener("keydown",escape);
   return ()=>{window.removeEventListener("scroll",close,true);window.removeEventListener("resize",close);window.removeEventListener("keydown",escape);};
 },[preview]);
 const width=Math.min(320,window.innerWidth-16);
 const above=preview && preview.anchor.top>window.innerHeight-preview.anchor.bottom;

 const tags=catalog.filter(t=>t.type==="老师标签" && t.enabled);
 const groups=[...new Set(tags.map(t=>t.tagCategory || "其他"))];
 return <div className="teacher-tag-picker" onMouseLeave={()=>setPreview(null)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setPreview(null);}}>
 <p className="teacher-tag-count">已选 {values.length} 个标签</p>
 <div className="teacher-tag-selected" aria-label="已选老师标签">{values.map(id=><button type="button" key={id} onMouseEnter={event=>show(id,event.currentTarget)} onFocus={event=>show(id,event.currentTarget)} onMouseLeave={()=>setPreview(null)} onBlur={()=>setPreview(null)} aria-describedby={preview?.tag.id===id ? tooltipId : undefined} aria-label={`移除标签 ${teacherTagName(catalog,id)}`} onClick={()=>onChange(values.filter(v=>v!==id))}><TeacherTags catalog={catalog} values={[id]} showDetails={false}/> <span aria-hidden="true">×</span></button>)}</div>
 <div className="teacher-tag-options">{groups.map(group=><fieldset key={group}><legend>{group}</legend><div className="teacher-tag-chip-list">{tags.filter(t=>(t.tagCategory || "其他")===group).map(t=><label key={t.id} onMouseEnter={event=>show(t.id,event.currentTarget)} onFocus={event=>show(t.id,event.currentTarget)} onMouseLeave={()=>setPreview(null)} onBlur={()=>setPreview(null)} className={`teacher-tag-choice teacher-tag-${t.tagColor || "yellow"}${values.includes(t.id) ? " is-selected" : ""}`}><input type="checkbox" aria-describedby={preview?.tag.id===t.id ? tooltipId : undefined} checked={values.includes(t.id)} onChange={e=>onChange(e.target.checked ? [...values,t.id] : values.filter(v=>v!==t.id))}/><TeacherTags catalog={catalog} values={[t.id]} showDetails={false}/>{values.includes(t.id) && <span aria-hidden="true" className="teacher-tag-check">✓</span>}</label>)}</div></fieldset>)}{!tags.length && <p className="teacher-tag-empty">没有匹配的可选标签</p>}</div>
 {preview && createPortal(<div id={tooltipId} role="tooltip" className="teacher-tag-tooltip" style={{width,left:Math.max(8,Math.min(preview.anchor.left,window.innerWidth-width-8)),...(above ? {bottom:window.innerHeight-preview.anchor.top+6} : {top:preview.anchor.bottom+6})}}>
   <strong>{preview.tag.name}</strong>
   <dl><dt>含义</dt><dd>{preview.tag.tagMeaning || "未填写"}</dd><dt>具体表现</dt><dd>{preview.tag.tagExample || "未填写"}</dd></dl>
 </div>,document.body)}
 </div>;
}
