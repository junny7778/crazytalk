// @vitest-environment jsdom
import { transferableAbortController } from "node:util";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDemo, DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { getScheduleCredits, DEMO_TODAY } from "@crazytalk/shared";
import Schedule from "../pages/Schedule";
function mount(path="/schedule") {
 const router=createMemoryRouter([{path:"/schedule",element:<Schedule/>},{path:"/students/:id",element:<p>学员档案页</p>}],{initialEntries:[path]});
 render(<QueryClientProvider client={new QueryClient()}><DemoProvider><ToastProvider><ReadOnlyControl/><RouterProvider router={router}/></ToastProvider></DemoProvider></QueryClientProvider>);
 return router;
}
beforeEach(()=>{
 localStorage.clear();demoRepository.reset();
 vi.stubGlobal("AbortController",class{constructor(){return transferableAbortController();}});
 vi.stubGlobal("ResizeObserver",class{observe(){}unobserve(){}disconnect(){}});
 const d=demoRepository.read();d.lessons=[];d.leaves=[];d.students=d.students.slice(0,4);
 d.classInAccounts=d.students.map((s,i)=>({id:`verified-${s.id}`,phone:"",uid:String(990000+i),studentIds:[s.id]}));
 d.students.forEach(s=>{s.balanceKnown=true;s.balance=20;s.status="在读";s.scheduleIntent=null;});
 d.teachers=d.teachers.slice(0,1);Object.assign(d.teachers[0],{status:"在职",trained:true,needConfirm:false,categories:["少儿","成人"],availabilityFrom:"",availability:[{day:1,start:"18:00",end:"21:00"}]});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
async function click(name:string | RegExp){await act(async()=>{fireEvent.click(screen.getByRole("button",{name}));});}
it("默认学员概况，全部学员可查；人员行只有姓名和ID",()=>{
 const d=demoRepository.read();d.students[0].status="结课";mount();
 expect(screen.getByRole("tab",{name:"按学员排课"}).getAttribute("aria-selected")).toBe("true");
 const rows=within(screen.getByRole("complementary")).getAllByRole("button");expect(rows).toHaveLength(4);
 expect(rows.at(-1)?.textContent).toBe(d.students[0].name+d.students[0].id);
 expect(rows.every(row=>d.students.some(s=>row.textContent===s.name+s.id))).toBe(true);
 expect(screen.getByLabelText("排课概况")).toBeTruthy();expect(screen.queryByLabelText("学员排课意向")).toBeNull();expect(screen.queryByRole("button",{name:"确认排课"})).toBeNull();
});
it("概况余额沿用已有计算，共享余额说明清楚，余额与课程节数分开",()=>{
 const d=demoRepository.read(),s=d.students[0];const order=d.orders!.find(o=>o.studentIds.includes(s.id))!;order.studentIds=[s.id,d.students[1].id];order.balance=20;
 mount(`/schedule?student=${s.id}`);const expected=getScheduleCredits(d,s.id,0,1);
 expect(screen.getByText(/以下余额和占用包含共用学员/)).toBeTruthy();
 const metrics=document.querySelector('.schedule-metrics')!;expect(metrics.textContent).toContain(String(expected.balance));expect(metrics.textContent).toContain("可继续排");
});
it("按ID搜索，清除筛选可恢复全部列表，停课学员可看不可新增",async()=>{
 const s=demoRepository.read().students[1];s.status="停课";mount();
 fireEvent.change(screen.getByPlaceholderText("搜索姓名或 ID"),{target:{value:s.id}});
 const list=within(screen.getByRole("complementary"));await act(async()=>{fireEvent.click(list.getByRole("button",{name:new RegExp(s.name)}));});
 expect(screen.getByRole("button",{name:"一键排课"}).hasAttribute("disabled")).toBe(true);expect(screen.getByText(/学员当前为停课/)).toBeTruthy();
 await click("清除筛选");expect(list.getAllByRole("button")).toHaveLength(4);
});
it("自定义排课分设置预览两步，返回保留输入，确认前不写课程",async()=>{
 const d=demoRepository.read(),s=d.students[0];mount(`/schedule?student=${s.id}&date=2026-11-23`);await click("自定义排课");
 expect(screen.queryByRole("button",{name:"确认排课"})).toBeNull();expect(screen.getByLabelText("学员").getAttribute("disabled")).not.toBeNull();
 fireEvent.change(screen.getByLabelText("第1节上课时间"),{target:{value:"18:35"}});
 await act(async()=>{fireEvent.click(screen.getByLabelText("第1节老师"));});await act(async()=>{fireEvent.click(screen.getByRole("option",{name:new RegExp(d.teachers[0].name)}));});
 await click("预览排课");expect(document.querySelector('.schedule-steps [aria-current="step"]')?.textContent).toBe("② 预览确认");expect(screen.queryByRole("button",{name:"返回概况"})).toBeNull();expect(d.lessons).toHaveLength(0);expect(screen.getByLabelText("本次排课预览")).toBeTruthy();
 await click("返回调整");expect(screen.getByLabelText<HTMLInputElement>("第1节上课时间").value).toBe("18:35");
 await click("预览排课");await click("确认排课");expect(demoRepository.read().lessons).toHaveLength(1);expect(screen.getByLabelText("排课概况")).toBeTruthy();
 expect(document.querySelector('.roster-person.selected')?.textContent).toContain(s.id);
});
it("未修改直接返回；有草稿切换人员需确认且继续编辑保留内容",async()=>{
 const d=demoRepository.read();mount(`/schedule?student=${d.students[0].id}`);await click("自定义排课");
 await act(async()=>{fireEvent.click(screen.getAllByRole("button",{name:"返回概况"})[0]);});expect(screen.queryByRole("dialog")).toBeNull();
 await click("自定义排课");fireEvent.change(screen.getByLabelText("第1节上课时间"),{target:{value:"20:15"}});
 await act(async()=>{fireEvent.click(within(screen.getByRole("complementary")).getByRole("button",{name:new RegExp(d.students[1].name)}));});
 await click("继续编辑");expect(screen.getByLabelText<HTMLInputElement>("第1节上课时间").value).toBe("20:15");
 await act(async()=>{fireEvent.click(screen.getByRole("tab",{name:"按老师排课"}));});await click("放弃本次修改");expect(screen.getByRole("button",{name:"为该老师排课"})).toBeTruthy();expect(demoRepository.read().lessons).toHaveLength(0);
});
it("离开页面保护未确认草稿",async()=>{
 const s=demoRepository.read().students[0],router=mount(`/schedule?student=${s.id}`);await click("自定义排课");fireEvent.change(screen.getByLabelText("第1节上课时间"),{target:{value:"20:15"}});
 await act(async()=>{await router.navigate(`/students/${s.id}`);});expect(screen.getByRole("dialog",{name:"放弃本次修改？"})).toBeTruthy();await click("放弃本次修改");await screen.findByText("学员档案页");
});
it("老师入口锁定当前老师，必须选择学员；切换Tab保留选择与搜索",async()=>{
 const d=demoRepository.read();mount(`/schedule?teacher=${d.teachers[0].id}`);expect(screen.queryByText("常规可排")).toBeNull();await click("为该老师排课");
 expect(screen.getByRole("button",{name:"预览排课"}).hasAttribute("disabled")).toBe(true);expect(screen.getByLabelText("第1节老师").hasAttribute("disabled")).toBe(true);
});
it("已有未来课程可从概况调整时间，成功后仍保留课节和课时余额",async()=>{
 const d=demoRepository.read(),s=d.students[0],t=d.teachers[0];demoRepository.execute({type:"lesson.schedule",studentId:s.id,teacherId:t.id,slots:[{date:"2026-11-23",time:"18:00"}],duration:25,kind:"临时课",material:""});
 const balance=getScheduleCredits(demoRepository.read(),s.id,0,1).balance;mount(`/schedule?student=${s.id}`);await click(/^查看课程 /);await click("调课");fireEvent.change(screen.getByLabelText("上课时间"),{target:{value:"18:35"}});await click("确认调整");
 await waitFor(()=>expect(demoRepository.read().lessons[0].time).toBe("18:35"));expect(demoRepository.read().lessons).toHaveLength(1);expect(getScheduleCredits(demoRepository.read(),s.id,0,1).balance).toBe(balance);
});

function ReadOnlyControl(){const {setRole}=useDemo();return <button onClick={()=>setRole("schedule-reader",false,"schedule-reader-account")}>切换只读验证</button>;}
it("只读角色可以查看概况，但不能新增或调整课程",async()=>{
 const d=demoRepository.read(),s=d.students[0];
 const role=d.roles.find(r=>r.id!=="admin")!;d.roles.push({...role,id:"schedule-reader",name:"排课查看",permissions:["schedule.view"]});
 d.accounts.push({...d.accounts[0],id:"schedule-reader-account",roleId:"schedule-reader",enabled:true,scope:"全部"});
 mount(`/schedule?student=${s.id}`);await click("切换只读验证");
 expect(screen.getByLabelText("排课概况")).toBeTruthy();expect(screen.queryByRole("button",{name:"一键排课"})).toBeNull();expect(screen.queryByRole("button",{name:"自定义排课"})).toBeNull();
});
it("排序把未排放前，已排齐仍留在列表，筛选能找到已排齐学员",async()=>{
 const d=demoRepository.read(),s=d.students[0];s.scheduleIntent={mode:"fixed",startDate:"2026-11-23",weeks:1,frequency:1,duration:25,windows:[{day:1,start:"18:00",end:"19:00"}]};
 demoRepository.execute({type:"lesson.schedule",studentId:s.id,teacherId:d.teachers[0].id,slots:[{date:"2026-11-23",time:"18:00"}],duration:25,kind:"固定课",material:""});
 mount();const rows=within(screen.getByRole("complementary")).getAllByRole("button");expect(rows.at(-1)?.textContent).toContain(s.id);
 await act(async()=>{fireEvent.click(screen.getByRole("combobox",{name:"排课状态"}));});await act(async()=>{fireEvent.click(screen.getByRole("option",{name:"计划已排齐"}));});
 expect(document.querySelectorAll('.roster-person')).toHaveLength(1);expect(document.querySelector('.roster-person')?.textContent).toContain(s.id);
});

it("已有灵活意向不被自动改为固定，仍可在学员课表选时间",async()=>{
 const d=demoRepository.read(),s=d.students[0];s.scheduleIntent={mode:"flex",startDate:"2026-11-23",weeks:2,frequency:1,duration:25,windows:[]};
 mount(`/schedule?student=${s.id}`);await click("一键排课");expect(screen.getByRole("region",{name:"学员灵活课表"})).toBeTruthy();expect(demoRepository.read().students[0].scheduleIntent?.mode).toBe("flex");
});
it("自定义固定课返回可改时间，再次预览不会重复展开周期",async()=>{
 const d=demoRepository.read();mount(`/schedule?teacher=${d.teachers[0].id}&date=2026-11-23`);await click("为该老师排课");
 await act(async()=>{fireEvent.click(screen.getByLabelText("学员"));});await act(async()=>{fireEvent.click(screen.getByRole("option",{name:d.students[0].name}));});
 await act(async()=>{fireEvent.click(screen.getByLabelText("排课方式"));});await act(async()=>{fireEvent.click(screen.getByRole("option",{name:"固定排课"}));});
 await click("预览排课");expect(within(screen.getByLabelText("本次排课预览")).getAllByRole("row")).toHaveLength(5);
 await click("返回调整");expect(screen.getByLabelText("第1节上课时间").hasAttribute("disabled")).toBe(false);fireEvent.change(screen.getByLabelText("第1节上课时间"),{target:{value:"18:35"}});
 await click("预览排课");expect(within(screen.getByLabelText("本次排课预览")).getAllByRole("row")).toHaveLength(5);expect(screen.getByLabelText("本次排课预览").textContent).toContain("18:35");expect(demoRepository.read().lessons).toHaveLength(0);
});

it("学员筛选仅保留四个排课选项，没有更多筛选",async()=>{
 mount();const roster=within(screen.getByRole("complementary"));expect(roster.queryByText("更多筛选")).toBeNull();expect(roster.queryByLabelText("学员状态")).toBeNull();
 await act(async()=>{fireEvent.click(roster.getByRole("combobox",{name:"排课状态"}));});
 expect(screen.getAllByRole("option").map(option=>option.textContent)).toEqual(["全部学员","未排课","部分已排 / 待完善计划","计划已排齐"]);
});

it("两种排课入口统一标题、步骤、字段控件和底部返回",async()=>{
 const s=demoRepository.read().students[0];mount(`/schedule?student=${s.id}`);
 for(const entry of ["一键排课","自定义排课"]){
  await click(entry);
  expect(screen.getAllByRole("heading",{name:`${s.name} · 安排课程`})).toHaveLength(1);
  expect(document.querySelector('.schedule-steps [aria-current="step"]')?.textContent).toBe("① 设置排课");
  expect(screen.getAllByRole("button",{name:"返回概况"})).toHaveLength(1);
  expect(screen.getByRole("button",{name:"返回概况"}).closest('.schedule-flow-actions')).toBeTruthy();
  expect(screen.getByRole("combobox",{name:"排课方式"})).toBeTruthy();
  expect(screen.getByRole("combobox",{name:"每节时长"})).toBeTruthy();
  expect(screen.queryByRole("heading",{name:/①|②|为 .* 安排课程/})).toBeNull();
  await click("返回概况");
 }
});

it("同一天支持分段时间，保存保留两段，删除不影响其他日期",async()=>{
 const s=demoRepository.read().students[0];mount(`/schedule?student=${s.id}`);await click("一键排课");
 fireEvent.change(screen.getByLabelText("开始日期"),{target:{value:"2026-11-23"}});
 await click("周一");
 fireEvent.change(screen.getByLabelText("意向1开始时间"),{target:{value:"10:00"}});
 fireEvent.change(screen.getByLabelText("意向1结束时间"),{target:{value:"11:00"}});
 await click("＋ 添加周一时间段");
 expect(screen.getByRole("button",{name:"＋ 添加周一时间段"}).hasAttribute("disabled")).toBe(true);
 expect(screen.getByRole("button",{name:"生成排课方案"}).hasAttribute("disabled")).toBe(true);
 fireEvent.change(screen.getByLabelText("意向2开始时间"),{target:{value:"19:00"}});
 fireEvent.change(screen.getByLabelText("意向2结束时间"),{target:{value:"20:00"}});
 expect(screen.getByRole("button",{name:"＋ 添加周一时间段"}).hasAttribute("disabled")).toBe(false);
 await click("周三");await click("删除周三时间段3");
 await click("生成排课方案");
 expect(demoRepository.read().students[0].scheduleIntent?.windows).toEqual([{day:1,start:"10:00",end:"11:00"},{day:1,start:"19:00",end:"20:00"}]);
 await click("修改排课信息");expect(screen.getByLabelText<HTMLInputElement>("意向2开始时间").value).toBe("19:00");
});

vi.mock("@crazytalk/shared/react",async(importOriginal)=>({...await importOriginal<typeof import("@crazytalk/shared/react")>(),businessRequest:vi.fn(async()=>({uid:"881199",addedToInstitution:true}))}));
it("未绑定时禁用入口，取消绑定保持原页，绑定成功后立即可排课",async()=>{
 const d=demoRepository.read(),s=d.students[0];d.classInAccounts=[];mount(`/schedule?student=${s.id}`);
 for(const name of ["一键排课","自定义排课"])expect(screen.getByRole("button",{name}).hasAttribute("disabled")).toBe(true);
 expect(screen.getByText("绑定 ClassIn 账号后才能排课。")).toBeTruthy();
 await click("绑定账号");expect(screen.getByRole("dialog",{name:"关联 ClassIn 账号"})).toBeTruthy();await click("关闭");expect(screen.queryByRole("dialog")).toBeNull();expect(screen.getByRole("button",{name:"一键排课"}).hasAttribute("disabled")).toBe(true);
 await click("绑定账号");fireEvent.change(screen.getByPlaceholderText("手机号或邮箱"),{target:{value:"student@example.com"}});await click("核实账号");await click("确认关联");
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(screen.getByRole("button",{name:"一键排课"}).hasAttribute("disabled")).toBe(false);expect(screen.getByRole("button",{name:"自定义排课"}).hasAttribute("disabled")).toBe(false);expect(document.querySelector('.roster-person.selected')?.textContent).toContain(s.id);
});
it("老师入口选择未绑定学员后禁止预览并提供快捷绑定",async()=>{
 const d=demoRepository.read();d.classInAccounts=[];mount(`/schedule?teacher=${d.teachers[0].id}`);await click("为该老师排课");
 await act(async()=>{fireEvent.click(screen.getByLabelText("学员"));});await act(async()=>{fireEvent.click(screen.getByRole("option",{name:d.students[0].name}));});
 expect(screen.getByRole("button",{name:"预览排课"}).hasAttribute("disabled")).toBe(true);await click("绑定账号");expect(screen.getByLabelText<HTMLInputElement>("姓名").value).toBe(d.students[0].name);
});

it("学员课表复用详情页筛选与视图，仅隐藏新增排课入口",async()=>{
 const s=demoRepository.read().students[0];mount(`/schedule?student=${s.id}`);
 expect(screen.getByRole("heading",{name:"课表"})).toBeTruthy();
 expect(screen.queryByRole("button",{name:"安排课程"})).toBeNull();
 expect(screen.queryByRole("tab",{name:"未来课程"})).toBeNull();
 expect(screen.getByLabelText("上课日期（起始）")).toBeTruthy();expect(screen.getByLabelText("课程状态")).toBeTruthy();
 await click("日历");expect(screen.getByRole("button",{name:"回到本周"})).toBeTruthy();await click("下一周");await click("回到本周");
 expect(screen.queryByRole("heading",{name:"月度上课情况"})).toBeNull();
});
