import type { Lesson } from "./model";
import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { payrollBreakdown } from "./payroll";
import { transition } from "./domain";

it("pending totals follow traceable lessons while historical opening stays fixed", () => {
 const data = createSeed();
 const p = data.payroll.find(p => p.status === "待确认")!;
 const before = payrollBreakdown(data,p.id);
 const lesson: Lesson = {...data.lessons[0], id:"salary-new", teacherId:p.teacherId, date:p.month+"-12", status:"已完成", attendance:"正常", teacherAttendance:["正常"], studentAttendance:["正常"], duration:50};
 data.lessons.push(lesson);
 const after=payrollBreakdown(data,p.id);
 expect(after.opening).toEqual(before.opening);
 expect(after.units).toBe(before.units+2);
 expect(after.base-before.base).toBe(data.teachers.find(t=>t.id===p.teacherId)!.rate*2);
 lesson.status="已取消";
 expect(payrollBreakdown(data,p.id).base).toBe(before.base);
});
it("confirmed snapshot freezes rate, rows, deductions and adjustments", () => {
 let data=createSeed();
 const p=data.payroll.find(p=>p.status==="待确认")!;
 data.actions=data.actions.filter(a=>a.teacherId!==p.teacherId);
 data=transition(data,{type:"payroll.status",ids:[p.id],status:"已确认"}).data;
 const before=payrollBreakdown(data,p.id);
 data.teachers.find(t=>t.id===p.teacherId)!.rate=999;
 data.lessons=[];
 data.payroll.find(x=>x.id===p.id)!.adjustment=999;
 expect(payrollBreakdown(data,p.id)).toEqual(before);
 expect(before.frozen).toBe(true);
});
it("legacy locked salary reports historical source instead of invented lesson detail",()=>{
 const data=createSeed();
 const p=data.payroll.find(p=>p.status==="已确认")!;
 const result=payrollBreakdown(data,p.id);
 expect(result.rows).toEqual([]);
 expect(result.opening.amount).toBe(result.base);
 expect(result.opening.source).toContain("未留存");
});
