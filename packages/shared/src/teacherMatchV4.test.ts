import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { teacherFit, studentMatchProfile, compareTeacherFit } from "./teacherMatch";
import { initializeTeacherTags, teacherTagId } from "./teacherTags";
import { getFixedSchedulePlans } from "./fixedPlans";

it("同义归类去重、名称修改保留匹配、自定义标签不按名字推断",()=>{
 const d=bindSchedulingStaff(createSeed()),t=d.teachers[0],s=d.students[0];
 s.personality="内向";t.tags=["tt-35"];
 expect(teacherTagId("亲和力强")).toBe("tt-35");
 expect(teacherTagId("会简笔画")).toBe("tt-45");
 expect(teacherFit(d,s,t).matchedPrimary).toContain("有亲和力");
 d.catalog.find(c=>c.id==="tt-35")!.name="亲和教学";
 expect(teacherFit(d,s,t).matchedPrimary).toContain("亲和教学");
 t.tags=["亲和力强"];expect(teacherFit(d,s,t).matchedPrimary).toEqual([]);
 d.importedBatches=[];t.tags=["亲和力强","有亲和力","未识别旧标签"];
 initializeTeacherTags(d);expect(t.tags).toEqual(["tt-35","未识别旧标签"]);
 expect(initializeTeacherTags(d)).toBe(false);
});
it("九组年龄基础映射、性格兴趣与缺项遵循4.0",()=>{
 const s=bindSchedulingStaff(createSeed()).students[0];
 for(const [age,id] of [[4,"tt-38"],[7,"tt-39"],[11,"tt-40"]] as const) for(const level of ["L1","L2","L3"]){
  const p=studentMatchProfile({...s,age,level,personality:"内向",interests:"画画、汽车、运动"});
  expect(p.primary).toEqual(expect.arrayContaining([id,level==="L1"?"tt-41":"tt-l"+level.slice(1),"tt-35","tt-45","tt-51"]));
  expect(p.primary.filter(i=>i==="tt-45")).toHaveLength(1);
 }
 expect(studentMatchProfile({...s,age:null,ageText:"",level:"",personality:"",interests:""}).missingInfo).toHaveLength(4);
});
it("暂停接新按授课关系判断，风险规则不混同",()=>{
 const d=bindSchedulingStaff(createSeed()),s=d.students[0],t=d.teachers[0];
 s.teacherId="";d.lessons=[];t.tags=["tt-63"];
 expect(teacherFit(d,s,t).blocked[0]).toContain("尚无授课关系");
 s.teacherId=t.id;expect(teacherFit(d,s,t).blocked).toEqual([]);
 t.tags=["tt-65"];expect(teacherFit(d,s,t).blocked).toHaveLength(1);
 t.tags=["tt-67"];expect(teacherFit(d,s,t).blocked).toEqual([]);expect(teacherFit(d,s,t).warnings).toHaveLength(1);
 t.tags=["tt-60"];const other={...t,id:"other",tags:[]};expect(compareTeacherFit(d,s,t,other)).toBeGreaterThan(0);
});
it("固定方案保留无时间老师，排除暂停自动排课老师",()=>{
 const d=bindSchedulingStaff(createSeed()),s=d.students[0];d.rules.trainingRequired=false;d.lessons=[];d.leaves=[];s.age=7;s.status="在读";
 d.classInAccounts=[{id:"verified",phone:"",uid:"991001",studentIds:[s.id]}];
 for(const t of d.teachers){t.availability=[];t.categories=["少儿"];t.status="在职";}
 d.teachers[0].tags=["tt-64"];
 const plans=getFixedSchedulePlans(d,s.id,{mode:"fixed",materialIds:d.catalog.filter(c=>c.type==="教材"&&c.name===s.material).map(c=>c.id),startDate:"2026-12-07",weeks:1,frequency:1,duration:25,windows:[{day:1,start:"10:00",end:"11:00"}]});
 expect(plans.some(p=>p.primaryTeacherId===d.teachers[0].id)).toBe(false);
 expect(plans.length).toBeGreaterThan(0);expect(plans.every(p=>p.primaryCount===0)).toBe(true);
});
it("自动提交复核风险，手动可排但重复占用被拦截",()=>{
 const d=bindSchedulingStaff(createSeed()),s=d.students[0],t=d.teachers[0];d.rules.trainingRequired=false;d.lessons=[];d.leaves=[];
 s.status="在读";s.age=7;t.tags=["tt-64"];t.availability=[{day:1,start:"08:00",end:"22:00"}];t.availabilityFrom="";t.categories=["少儿"];t.needConfirm=false;
 d.classInAccounts=[{id:"linked",phone:s.phone,uid:"123",studentIds:[s.id]}];
 const command={type:"lesson.schedule" as const,studentId:s.id,teacherId:t.id,slots:[{date:"2026-12-07",time:"10:00"}],duration:25,kind:"固定课" as const,material:s.material,confirmedTeacher:true};
 expect(()=>transition(d,{...command,selectionMode:"recommended"})).toThrow("暂停");
 const next=transition(d,{...command,selectionMode:"manual"}).data;
 expect(next.lessons).toHaveLength(1);
 expect(()=>transition(next,{...command,selectionMode:"manual"})).toThrow();
});

it("没有具体年龄时使用现有问卷年龄分组，具体年龄可覆盖旧分组",()=>{
 const s=bindSchedulingStaff(createSeed()).students[0];
 for(const [ageText,id] of [["幼儿 (3-5岁)","tt-38"],["少儿(6-9岁)","tt-39"],["大童 (10-12岁+)","tt-40"]]) {
  expect(studentMatchProfile({...s,age:null,ageText,level:"L2"}).primary).toContain(id);
 }
 const p=studentMatchProfile({...s,age:7,ageText:"幼儿 (3-5岁)",level:"L2"});
 expect(p.primary).toContain("tt-39");expect(p.primary).not.toContain("tt-38");
});
it("暂停接新认可既有课节关系，不将仅取消的课程视为授课关系",()=>{
 const d=bindSchedulingStaff(createSeed()),s=d.students[0],t=d.teachers[0],lesson=d.lessons[0];
 s.teacherId="";t.tags=["tt-63"];
 d.lessons=[{...lesson,studentId:s.id,teacherId:t.id,status:"已取消"}];
 expect(teacherFit(d,s,t).blocked).toHaveLength(1);
 d.lessons[0].status="未开始";
 expect(teacherFit(d,s,t).blocked).toEqual([]);
});
