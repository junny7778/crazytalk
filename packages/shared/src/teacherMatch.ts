import type { DemoState, Student, Teacher } from "./model";
import { standardTeacherTags, teacherTagName } from "./teacherTags";

export function studentMatchProfile(s: Student) {
  const primary: string[] = [], secondary: string[] = [], sources: {label:string; tags:string[]}[] = [];
  const level=s.level.match(/^L([123])(?:$|\b)/)?.[1];
  const tier=s.age == null ? (s.ageGroup ?? s.ageText).match(/^(幼儿|少儿|大童)/)?.[1] : s.age<3 ? undefined : s.age<=5 ? "幼儿" : s.age<=9 ? "少儿" : "大童";
  if(tier && level) {
    const tags=[tier==="幼儿"?"tt-38":tier==="少儿"?"tt-39":"tt-40", level==="1"?"tt-41":"tt-l"+level];
    primary.push(...tags);
    const extra=tier==="幼儿" ? (level==="1"?["tt-31","tt-47"]:[]) : tier==="少儿" ? level==="1"?["tt-27","tt-28"]:level==="2"?["tt-28"]:["tt-25"] : level==="1"?["tt-36","tt-27"]:level==="2"?["tt-25"]:["tt-25","tt-26"];
    secondary.push(...extra); sources.push({label:`年龄与基础：${tier} · L${level}`,tags:[...tags,...extra]});
  }
  if(/内向|慢热/.test(s.personality)) {primary.push("tt-34","tt-35");secondary.push("tt-29");sources.push({label:"性格：内向或慢热",tags:["tt-34","tt-35","tt-29"]});}
  else if(/活泼|外向|自来熟/.test(s.personality)) {primary.push("tt-32");secondary.push("tt-46");sources.push({label:"性格：活泼外向",tags:["tt-32","tt-46"]});}
  const interestRules: [RegExp,string[]][]=[[/奥特曼|蜘蛛侠|漫威/,["tt-43"]],[/迪士尼|公主|艾莎|芭比/,["tt-44"]],[/唱歌/,["tt-48"]],[/画画/,["tt-45"]],[/跳舞|积木|乐高|角色扮演/,["tt-46"]],[/毛绒|公仔/,["tt-47"]],[/汽车|飞机/,["tt-45","tt-46"]],[/手工|黏土|拼贴/,["tt-45"]],[/桌游|拼图|下棋|大富翁/,["tt-49"]],[/运动|足球|篮球|乒乓球|游泳/,["tt-51"]]];
  const interestTags=[...new Set(interestRules.filter(([p])=>p.test(s.interests||"")).flatMap(([,ids])=>ids))];
  primary.push(...interestTags);
  if(interestTags.length)sources.push({label:"兴趣："+s.interests,tags:interestTags});
  const unique=[...new Set(primary)];
  return {primary:unique,secondary:[...new Set(secondary)].filter(id=>!unique.includes(id)),sources,missingInfo:[!tier&&"年龄分组",!level&&"L1–L3基础",!s.personality&&"性格",!s.interests&&"兴趣"].filter((v):v is string=>!!v)};
}
export function recommendedTags(s: Student) {
  const profile=studentMatchProfile(s);
  return [...profile.primary,...profile.secondary].map(id=>teacherTagName(standardTeacherTags,id));
}
export function matchedTags(s:Student,t:Teacher) {
  const p=studentMatchProfile(s);
  return [...p.primary,...p.secondary].filter(id=>t.tags.includes(id)).map(id=>teacherTagName(standardTeacherTags,id));
}
export function teacherFit(data:DemoState,s:Student,t:Teacher) {
  const p=studentMatchProfile(s), tags=new Set(t.tags), blocked:string[]=[],warnings:string[]=[];
  const existing=s.teacherId===t.id || data.lessons.some(l=>l.studentId===s.id && l.teacherId===t.id && l.status!=="已取消");
  if(tags.has("tt-63")&&!existing)blocked.push("暂停接新：尚无授课关系");
  if(tags.has("tt-62")){if(!existing)blocked.push("待离职：不匹配新学员");else warnings.push("待离职：请尽快更换老师");}
  for(const id of ["tt-61","tt-64","tt-65","tt-66"])if(tags.has(id))blocked.push(teacherTagName(data.catalog,id)+"：暂停自动排课，问题解决后恢复");
  if(tags.has("tt-42")&&/^L1(?:$|\b)/.test(s.level))blocked.push("不适合教0基础：与L1适配规则冲突");
  for(const id of ["tt-60","tt-67","tt-53","tt-54","tt-55","tt-59","tt-20","tt-57"])if(tags.has(id))warnings.push(teacherTagName(data.catalog,id)+"："+(data.catalog.find(c=>c.id===id)?.tagAdvice||"请教务关注"));
  const names=(ids:string[])=>ids.map(id=>teacherTagName(data.catalog,id));
  return {primary:names(p.primary),secondary:names(p.secondary),matchedPrimary:names(p.primary.filter(id=>tags.has(id))),matchedSecondary:names(p.secondary.filter(id=>tags.has(id))),missing:names([...p.primary,...p.secondary].filter(id=>!tags.has(id))),warnings,blocked};
}
export function compareTeacherFit(data:DemoState,s:Student,a:Teacher,b:Teacher) {
  const x=teacherFit(data,s,a),y=teacherFit(data,s,b);
  return Number(!!x.blocked.length)-Number(!!y.blocked.length) || Number(a.tags.includes("tt-60"))-Number(b.tags.includes("tt-60")) || y.matchedPrimary.length-x.matchedPrimary.length || y.matchedSecondary.length-x.matchedSecondary.length;
}
