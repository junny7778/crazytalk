import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import { transferableAbortController } from "node:util";
import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";
function setup(windowEnd = "19:25", frequency = 1, weeks = 2, dailyLimit = 1) {
  const d = demoRepository.read();
  d.lessons = [];
  d.leaves = [];
  d.teachers = d.teachers.slice(0, 2);
  d.teachers.forEach((t) => {
    t.status = "在职";
    t.trained = true;
    t.needConfirm = false;
    t.team = "B队";
    t.group = "一组";
    t.categories = ["少儿"];
    t.availabilityFrom = "";
    t.availability = [{ day: 1, start: "19:00", end: "21:00" }];
  });
  const s = d.students[3];
  s.status = "待排课";
  s.scheduleIntent = {
    mode: "fixed",
    startDate: "2026-11-23",
    weeks,
    frequency, dailyLimit,
    duration: 25,
    windows: [{ day: 1, start: "19:00", end: windowEnd }],
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <RouterProvider router={createMemoryRouter([{path:"*",element:<Schedule/>}],{initialEntries:[`/schedule?student=${s.id}`]})}/>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", {name:"一键排课"}));
  return { d, s };
}
async function openPlan(index = 0) {
  await testAct(async () => { fireEvent.click(screen.getByRole("button", {name:"生成排课方案"})); });
  await testAct(async () => { fireEvent.click(screen.getAllByRole("button", {name:"查看排课方案"})[index]); });
}
async function review() { await testAct(async () => {fireEvent.click(screen.getByRole("button",{name:"核对排课"}));}); }
beforeEach(() => {
  vi.stubGlobal("AbortController", class { constructor(){return transferableAbortController();} });
  localStorage.clear();
  demoRepository.reset();
 bindSchedulingStaff(demoRepository.read());
  demoRepository.read().classInAccounts = demoRepository.read().students.map((student,index) => ({id:"verified-"+student.id,phone:"",uid:String(990000+index),studentIds:[student.id]}));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("新固定入口只展示完整方案与负荷，进入学生日历不写数据", async () => {
  setup();
  expect(screen.queryByRole("button", { name: "查看可用时间" })).toBeNull();
  expect(screen.queryByRole("combobox",{name:"排课方式"})).toBeNull();
  await openPlan();
  expect(screen.getByRole("region", { name: "学员固定课表" })).toBeTruthy();
  expect(screen.getByText("系统推荐方案 · 尚未确认")).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
});
it("打开方案和切换周时定位到晚课，查看课块保留手动滚动位置", async () => {
  const { d } = setup();
  for (const teacher of d.teachers) teacher.availability[0].start = "10:00";
  await openPlan();
  const calendar = screen.getByRole("region", {name:"学员固定课表"});
  const scroll = calendar.parentElement!;
  // Grid starts at 09:30. Show 18:30 directly above the 19:00 course.
  expect(scroll.scrollTop).toBe(18 * 48);
  scroll.scrollTop = 96;
  fireEvent.click(within(calendar).getByRole("button", {name:/2026-11-23 19:00 T\./}));
  expect(scroll.scrollTop).toBe(96);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name:"关闭"}));
  fireEvent.click(screen.getByRole("button", {name:"下一周"}));
  expect(scroll.scrollTop).toBe(18 * 48);
  fireEvent.click(screen.getByRole("button", {name:"下一周"}));
  expect(scroll.scrollTop).toBe(0);
});

it("同周展示一节已有课和两节拟排课，只提交新增课次", async () => {
  const { d, s } = setup("20:00", 2, 1, 2);
  demoRepository.execute({type:"lesson.schedule", studentId:s.id, teacherId:d.teachers[0].id,
    slots:[{date:"2026-11-23",time:"20:00"}], duration:25, kind:"临时课", material:s.material});
  const originalId = demoRepository.read().lessons[0].id;
  await openPlan();
  const calendar = within(screen.getByRole("region", {name:"学员固定课表"}));
  expect(screen.queryByRole("tab", {name:"查看课表"})).toBeNull();
  expect(calendar.getAllByText("拟安排")).toHaveLength(2);
  fireEvent.click(calendar.getByRole("button", {name:/20:00–20:25.*已排课/}));
  const drawer = within(screen.getByRole("dialog", {name:"课程详情"}));
  fireEvent.click(drawer.getAllByRole("button", {name:"关闭"})[0]);
  await review();
  const preview = within(screen.getByRole("region", {name:"本次排课核对"}));
  expect(preview.getAllByRole("row")).toHaveLength(3);
  expect(preview.queryByText(/20:00/)).toBeNull();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", {name:"确认排课"})); });
  expect(demoRepository.read().lessons).toHaveLength(3);
  expect(demoRepository.read().lessons.filter(l => l.id === originalId)).toHaveLength(1);
});
it("单节换师只影响本节，最终确认一次创建双老师课程", async () => {
  const { d } = setup();
  const primary = d.teachers[0],
    other = d.teachers[1];
  await openPlan();
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  await testAct(async () => { fireEvent.click(
    calendar.getByRole("button", {
      name: new RegExp(`2026-11-23 19:00 ${primary.name}`),
    }),
  ); });
  const details = () => within(screen.getByRole("dialog", {name:"本节课程详情"}));
  const picker = () => within(screen.getByRole("dialog", {name:"更换授课老师"}));
  expect(details().getByText(primary.name)).toBeTruthy();
  expect(details().getByText(/19:00–19:25/)).toBeTruthy();
  expect(details().queryByText(other.name)).toBeNull();
  fireEvent.click(details().getByRole("button", {name:"更换老师"}));
  fireEvent.click(picker().getByRole("button", {name:new RegExp(other.name)}));
  fireEvent.click(picker().getByRole("button", {name:"取消"}));
  expect(details().getByText(primary.name)).toBeTruthy();
  fireEvent.click(details().getByRole("button", {name:"更换老师"}));
  fireEvent.click(picker().getByRole("button", {name:new RegExp(other.name)}));
  fireEvent.click(picker().getByRole("button", {name:"确认更换"}));
  expect(details().getByText(other.name)).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
  fireEvent.click(details().getByRole("button", {name:"关闭"}));
  expect(screen.getByText("教务手动调整 · 尚未确认")).toBeTruthy();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "下一周" })); });
  expect(
    within(screen.getByRole("region", { name: "学员固定课表" })).getByRole(
      "button",
      { name: new RegExp(`2026-11-30 19:00 ${primary.name}`) },
    ),
  ).toBeTruthy();
  await review();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "确认排课" })); });
  expect(demoRepository.read().lessons.map((l) => l.teacherId)).toEqual([
    other.id,
    primary.id,
  ]);
});
it("主动勾选后才把新老师应用到后续同一时段", async () => {
  const {d} = setup();
  await openPlan();
  fireEvent.click(screen.getByRole("button", {name:`2026-11-23 19:00 ${d.teachers[0].name}`}));
  fireEvent.click(screen.getByRole("button", {name:"更换老师"}));
  const picker = within(screen.getByRole("dialog", {name:"更换授课老师"}));
  fireEvent.click(picker.getByRole("button", {name:new RegExp(d.teachers[1].name)}));
  fireEvent.click(picker.getByRole("checkbox", {name:/同时更换后续/}));
  fireEvent.click(picker.getByRole("button", {name:"确认更换"}));
  fireEvent.click(screen.getByRole("button", {name:"关闭"}));
  fireEvent.click(screen.getByRole("button", {name:"下一周"}));
  expect(screen.getByRole("button", {name:`2026-11-30 19:00 ${d.teachers[1].name}`})).toBeTruthy();
});
it("取消本节释放时段，部分提交后可在空档补排且不重复创建", async () => {
  const { d } = setup();
  await openPlan();
  await testAct(async () => { fireEvent.click(
    within(screen.getByRole("region", { name: "学员固定课表" })).getByRole(
      "button",
      { name: new RegExp(`2026-11-23 19:00 ${d.teachers[0].name}`) },
    ),
  ); });
  fireEvent.click(screen.getByRole("button", {name:"取消本节安排"}));
  expect(screen.queryByRole("dialog")).toBeNull();
  const openSlot = () => screen.getByRole("button", {name:"2026-11-23 19:00 可排课"});
  expect(openSlot()).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
  await review();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "确认已安排的 1 节" })); });
  expect(demoRepository.read().lessons).toHaveLength(1);
  await testAct(async () => { fireEvent.click(openSlot()); });
  await testAct(async () => { fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: new RegExp(d.teachers[0].name),
    }),
  ); });
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "加入课表" })); });
  await review();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "确认排课" })); });
  expect(demoRepository.read().lessons).toHaveLength(2);
});

it("手动加课可超出自动方案的每日上限、意向时间和排课周期", async () => {
  const {d} = setup("19:25", 1, 1, 1);
  d.teachers[1].availability.push({day:2, start:"08:00", end:"09:00"});
  Object.assign(d.teachers[1], {needConfirm:true, trained:false, categories:["成人"]});
  await openPlan();
  const calendar = within(screen.getByRole("region", {name:"学员固定课表"}));
  const add = () => fireEvent.click(calendar.getByRole("button", {name:"2026-11-23 19:30 可排课"}));
  add();
  const dialog = () => within(screen.getByRole("dialog", {name:"选择授课老师"}));
  fireEvent.click(dialog().getByRole("button", {name:"取消"}));
  add();
  fireEvent.click(dialog().getByRole("button", {name:new RegExp(d.teachers[0].name)}));
  expect(dialog().getByRole("button", {name:"加入课表"}).hasAttribute("disabled")).toBe(false);
  fireEvent.click(dialog().getByRole("button", {name:"加入课表"}));
  expect(calendar.getAllByText(/单次加课/)).toHaveLength(1);
  expect(demoRepository.read().lessons).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", {name:"下一周"}));
  fireEvent.click(calendar.getByRole("button", {name:"2026-12-01 08:00 可排课"}));
  fireEvent.click(dialog().getByRole("button", {name:new RegExp(d.teachers[1].name)}));
  fireEvent.click(dialog().getByRole("button", {name:"加入课表"}));
  await review();
  expect(within(screen.getByRole("region",{name:"本次排课核对"})).getAllByText(/19:30/)).toHaveLength(1);
  await testAct(async () => {fireEvent.click(screen.getByRole("button", {name:"确认排课"}));});
  expect(demoRepository.read().lessons.map(l => [l.date, l.time])).toEqual([
    ["2026-11-23", "19:00"], ["2026-11-23", "19:30"], ["2026-12-01", "08:00"],
  ]);
});
it("可排时段区分展示，拖动只调整本节并保留固定计划归属", async () => {
  const { d, s } = setup("21:00", 2, 2, 2);
  d.teachers.forEach(t => t.availability.push({day:2,start:"19:00",end:"21:00"}));
  d.students[3].scheduleIntent!.windows.push({day:2,start:"19:00",end:"21:00"});
  await openPlan();
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  expect(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }).className,
  ).toContain("available");
  expect(
    calendar
      .getByRole("button", { name: "2026-11-25 19:30 不可排课" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  const source = calendar.getByRole("button", {
    name: `2026-11-23 19:00 ${d.teachers[0].name}`,
  });
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  await testAct(async () => { fireEvent.dragStart(source, { dataTransfer }); });
  await testAct(async () => { fireEvent.dragOver(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }),
    { dataTransfer },
  ); });
  await testAct(async () => { fireEvent.drop(
    calendar.getByRole("button", { name: "2026-11-23 19:30 可排课" }),
    { dataTransfer },
  ); });
  expect(
    calendar.getByRole("button", {
      name: `2026-11-23 19:30 ${d.teachers[0].name}`,
    }),
  ).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
  await review();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "确认排课" })); });
  const made = demoRepository
    .read()
    .lessons.filter((l) => l.studentId === s.id);
  expect(made).toHaveLength(4);
  expect(made.find((l) => l.date === "2026-11-23")).toMatchObject({
    time: "19:30",
    fixedOrigin: { date: "2026-11-23", time: "19:00" },
  });
  expect(made.find((l) => l.date === "2026-11-30")?.time).toBe("19:00");
});
it("拖入没有可用老师的时段时保留原课次", async () => {
  const { d } = setup("21:00");
  await openPlan();
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  const name = `2026-11-23 19:00 ${d.teachers[0].name}`;
  await testAct(async () => { fireEvent.dragStart(calendar.getByRole("button", { name }), {
    dataTransfer: { setData: vi.fn() },
  }); });
  await testAct(async () => { fireEvent.drop(
    calendar.getByRole("button", { name: "2026-11-24 19:30 不可排课" }),
  ); });
  expect(calendar.getByRole("button", { name })).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("课程未移动");
  expect(demoRepository.read().lessons).toHaveLength(0);
});

it("拖动后原老师不可用时要求选择可用老师，不静默换师", async () => {
  const { d } = setup("21:00");
  d.teachers[0].availability = [{ day: 1, start: "19:00", end: "19:25" }];
  d.teachers[1].availability.push({day:2,start:"19:00",end:"20:00"});
  await openPlan();
  const calendar = within(screen.getByRole("region", { name: "学员固定课表" }));
  await testAct(async () => { fireEvent.dragStart(
    calendar.getByRole("button", {
      name: `2026-11-23 19:00 ${d.teachers[0].name}`,
    }),
    { dataTransfer: { setData: vi.fn() } },
  ); });
  await testAct(async () => { fireEvent.drop(
    calendar.getByRole("button", { name: "2026-11-24 19:30 可排课" }),
  ); });
  const editor = within(screen.getByRole("dialog", { name: "选择授课老师" }));
  expect(
    editor.getByText("原老师在新时间不可用，请选择本节可用老师。"),
  ).toBeTruthy();
  expect(
    editor.queryByRole("button", { name: new RegExp(d.teachers[0].name) }),
  ).toBeNull();
  await testAct(async () => { fireEvent.click(editor.getByRole("button", { name: new RegExp(d.teachers[1].name) })); });
  await testAct(async () => { fireEvent.click(editor.getByRole("button", { name: "确认选择" })); });
  fireEvent.click(within(screen.getByRole("dialog", {name:"本节课程详情"})).getByRole("button", {name:"关闭"}));
  expect(
    calendar.getByRole("button", {
      name: `2026-11-24 19:30 ${d.teachers[1].name}`,
    }),
  ).toBeTruthy();
});

it("推荐卡片直接预览，返回仍可比较全部方案", async () => {
  const {d}=setup();
  await openPlan(1);
  expect(within(screen.getByRole("region",{name:"学员固定课表"})).getByRole("button",{name:new RegExp(`2026-11-23 19:00 ${d.teachers[1].name}`)})).toBeTruthy();
  await testAct(async()=>{fireEvent.click(screen.getByRole("button",{name:"返回调整"}));});
  expect(screen.getAllByRole("button",{name:"查看排课方案"})).toHaveLength(2);
  expect(demoRepository.read().lessons).toHaveLength(0);
});

it("固定方案换老师时，未绑定的备选不可选且可快捷绑定", async()=>{
 const {d}=setup();delete d.teachers[1].classInUid;
 await openPlan();
 await testAct(async()=>{fireEvent.click(screen.getByRole("button",{name:new RegExp(`2026-11-23 19:00 ${d.teachers[0].name}`)}));});
 fireEvent.click(screen.getByRole("button",{name:"更换老师"}));
 const editor=within(screen.getByRole("dialog"));
 expect(editor.getByRole("button",{name:`${d.teachers[1].name} · 未绑定 ClassIn`}).hasAttribute("disabled")).toBe(true);
 expect(editor.getByRole("button",{name:"绑定账号"})).toBeTruthy();
 expect(demoRepository.read().lessons).toHaveLength(0);
});
