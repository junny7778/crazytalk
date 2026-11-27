import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import {clickSchedule, selectSchedule, selectStudentCard, addCalendarLesson} from "./schedulingTestActions";
import { transferableAbortController } from "node:util";
import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { DEMO_STORAGE_KEY, demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";
import { transition, DEMO_TODAY, addDays } from "@crazytalk/shared";
async function mount(path = "/schedule?teacher=t1&date=2026-11-23") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <RouterProvider router={createMemoryRouter([{path:"*",element:<Schedule/>}],{initialEntries:[path]})}/>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  if (path.includes("student=")) {
    await clickSchedule("一键排课");
    const generate = screen.getByRole("button",{name:"生成排课方案"});
    if (!generate.hasAttribute("disabled")) await clickSchedule("生成排课方案");
  }
}
function fixture() {
  const data = demoRepository.read();
  data.lessons = [];
  data.leaves = [];
  const teacher = data.teachers[0];
  data.teachers = [teacher];
  teacher.availability = [{ day: 1, start: "18:00", end: "21:00" }];
  teacher.availabilityFrom = "";
  teacher.trained = true;
  teacher.needConfirm = false;
  teacher.categories = ["少儿"];
  teacher.status = "在职";
  const student = data.students[3];
  student.name = "排课专项学员";
  student.chineseName = "排课专项学员";
  student.scheduleIntent = {
    mode: "fixed",
    startDate: "2026-11-23",
    weeks: 2,
    duration: 50,
    frequency: 1,
    windows: [{ day: 1, start: "18:00", end: "19:00" }],
  };
  return { data, student, teacher };
}
beforeEach(() => {
  vi.stubGlobal("AbortController", class { constructor(){return transferableAbortController();} });
  localStorage.clear();
  demoRepository.reset();
  bindSchedulingStaff(demoRepository.read());
  demoRepository.read().classInAccounts = demoRepository.read().students.map((student, index) => ({ id: `verified-${student.id}`, phone: "", uid: String(123456 + index), studentIds: [student.id] }));
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
describe("排课双工作流", () => {
  it("其他时长需填写预计扣课，超过余额置灰，填写可用额度后允许确认", async()=>{
 const {student}=fixture();student.balance=1;for(const order of demoRepository.read().orders||[])if(order.studentIds.includes(student.id))order.balance=1;
 await mount();await clickSchedule("为该老师排课");await selectSchedule("每节时长","55 分钟");
 await clickSchedule(/2026-11-23 18:00 可排课/);
 expect(screen.getByRole("button",{name:"确认时段"}).hasAttribute("disabled")).toBe(true);
 fireEvent.change(screen.getByLabelText("每节预计扣课数"),{target:{value:"2"}});
 await clickSchedule("确认时段");expect(within(screen.getByRole("dialog")).queryByText(student.name)).toBeNull();await clickSchedule("关闭");
 fireEvent.change(screen.getByLabelText("每节预计扣课数"),{target:{value:"1"}});
 await clickSchedule("确认时段");await selectStudentCard(student.name);await clickSchedule("确定排课");expect(demoRepository.read().lessons[0].plannedUnits).toBe(1);expect(demoRepository.read().students.find(s=>s.id===student.id)?.balance).toBe(1);

});
  it.each([1,4])("老师跨 %i 周选时段，确认后保存实际所选课节",async(weeks)=>{
    const {student}=fixture();await mount();await clickSchedule("为该老师排课");
    expect(screen.queryByRole("combobox",{name:"重复安排"})).toBeNull();
    for(let i=0;i<weeks;i++){
      if(i) await clickSchedule("下一周");
      await clickSchedule(new RegExp(addDays("2026-11-23",7*i)+" 18:00 可排课"));
    }
    await clickSchedule("确认时段");await selectStudentCard(student.name);
    await clickSchedule("确定排课");
    expect(demoRepository.read().lessons).toHaveLength(weeks);
  });
  it("计划周六开始时，方案周历默认展示首节拟排课所在的下一周", async () => {
    const { student } = fixture();
    student.scheduleIntent!.startDate = "2026-11-21";
    await mount(`/schedule?student=${student.id}`);
    await clickSchedule("查看排课方案");
    expect(screen.queryByRole("tab", {name: "日视图"})).toBeNull();
    expect(screen.getByText("2026/11/23 - 2026/11/29")).toBeTruthy();
  });
  it("老师资料关闭保留搜索，方案返回后不重复展开周期", async () => {
    const { student } = fixture();
    await mount(`/schedule?student=${student.id}`);
    await testAct(async () => { fireEvent.change(screen.getByLabelText("搜索推荐老师"), {
      target: { value: "Carol" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看老师资料" })); });
    await testAct(async () => { fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    ); });
    expect(screen.getByLabelText<HTMLInputElement>("搜索推荐老师").value).toBe(
      "Carol",
    );
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回调整" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    await clickSubmit();
    expect(demoRepository.read().lessons).toHaveLength(2);
  });
  it("意向时间必填，删除全部或填写无效范围时不可保存", async () => {
    const { student } = fixture();
    student.scheduleIntent = null;
    await mount(`/schedule?student=${student.id}`);
    const save = screen.getByRole("button", { name: "生成排课方案" });
    expect(screen.queryByRole("heading", { name: "上课意向" })).toBeNull();
    expect(save.hasAttribute("disabled")).toBe(true);
    await selectSchedule("每节时长","50 分钟");
    await clickSchedule("周一 19:00");
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("时间范围需至少容纳 50 分钟课程")).toBeTruthy();
    await clickSchedule("周一 19:30");
    expect(save.hasAttribute("disabled")).toBe(false);
    await clickSchedule("按星期填写");
    await clickSchedule("周一");
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("多选上课日显示对应时间，取消其中一天保留其他时间并正确保存", async () => {
    const { student } = fixture();
    student.scheduleIntent = null;
    await mount(`/schedule?student=${student.id}`);
    await clickSchedule("按星期填写");
    await clickSchedule("周三");
    await clickSchedule("周一");
    expect(screen.getByLabelText("周一 开始时间 1")).toBeTruthy();
    await clickSchedule("周一");
    expect(screen.queryByLabelText("周一 开始时间 1")).toBeNull();
    expect(screen.getByLabelText("周三 开始时间 1")).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "生成排课方案" })); });
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.scheduleIntent?.windows,
    ).toEqual([{ day: 3, start: "17:00", end: "22:00" }]);
  });
  it("切换待排课学员时默认选中列表第一位并展示详情", async () => {
    const { student } = fixture();
    await mount();
    await testAct(async () => { fireEvent.click(screen.getByRole("tab", { name: "按学员排课" })); });
    const first = within(screen.getByRole("complementary")).getAllByRole(
      "button",
    )[0];
    expect(first.classList.contains("selected")).toBe(true);
    expect(first.textContent).toContain(dataFirstName());
    expect(
      screen.getByRole("heading", { name: dataFirstName() }),
    ).toBeTruthy();
    expect(screen.queryByText("请选择待排课学员")).toBeNull();
  });
  it("在读的多老师学员仍展示离职补排需求", async () => {
    const { data, student } = fixture();
    data.students.forEach(s => { s.status="在读"; s.scheduleIntent=null; s.teacherId=""; });
    student.teacherId="t1";
    data.slotLocks=[{studentId:student.id,teacherId:"t2",date:"2099-01-02",time:"19:00",duration:25,operator:"教务",expiresAt:"2099-01-03"}];
    Object.assign(data, transition(data,{type:"teacher.offboard",teacherId:"t1",reason:"离职"}).data);
    expect(data.students.find(s=>s.id===student.id)?.status).toBe("在读");
    await mount();
    await testAct(async () => { fireEvent.click(screen.getByRole("tab", { name: "按学员排课" })); });
    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button",{name:new RegExp(student.name)}));
    expect(screen.getByText(/原老师 .* 已离职，需要重新安排老师/)).toBeTruthy();
  });
  it("没有待排计划时仍展示全部学员及概况", async () => {
    const { data } = fixture();
    data.students.forEach((student) => {
      student.status = "在读";
      student.scheduleIntent = null;
    });
    await mount();
    await testAct(async () => { fireEvent.click(screen.getByRole("tab", { name: "按学员排课" })); });
    expect(within(screen.getByRole("complementary")).getAllByRole("button")).toHaveLength(data.students.length);
    expect(screen.getByLabelText("排课概况")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "学员排课意向" })).toBeNull();
  });
  it("老师模式无需学员即可查看空档，排课必须显式选择学员", async()=>{
 fixture();await mount();await clickSchedule("为该老师排课");
 expect(screen.getByRole("button",{name:/2026-11-23 18:00 可排课/}).hasAttribute("disabled")).toBe(false);expect(screen.queryByRole("button",{name:"预览排课"})).toBeNull();expect(screen.queryByRole("heading",{name:"选择学员"})).toBeNull();

});
  it("待排课先展示学员需求，点老师后才展示日历，预览不会写课程", async () => {
    const { student } = fixture();
    await mount(`/schedule?student=${student.id}`);
    expect(screen.getByRole("region", { name: "学员排课意向" })).toBeTruthy();
    expect(screen.queryByText("常规可用时间")).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    expect(demoRepository.read().lessons).toHaveLength(0);
    const dialog = within(document.querySelector(".schedule-main")!);
    expect(dialog.getByText("系统推荐方案 · 尚未确认")).toBeTruthy();
    await clickSchedule("核对排课");
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "确认排课" })); });
    expect(demoRepository.read().lessons).toHaveLength(2);
    expect(new Set(demoRepository.read().lessons.map((l) => l.date))).toEqual(
      new Set(["2026-11-23", "2026-11-30"]),
    );
  });
  it("已有一节固定课时仅补排缺口，不重复展开周期", async () => {
    const { student } = fixture();
    demoRepository.execute({
      type: "lesson.schedule",
      studentId: student.id,
      teacherId: "t1",
      slots: [{ date: "2026-11-23", time: "18:00" }],
      duration: 50,
      kind: "固定课",
      material: student.material,
    });
    await mount(`/schedule?student=${student.id}`);
    expect(screen.getByText("已安排 1/2 节")).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    const dialog = within(document.querySelector(".schedule-main")!);
    expect(dialog.getByText(/目标 2 节 · 拟安排 1 节/)).toBeTruthy();
    await clickSchedule("核对排课");
    await testAct(async () => { fireEvent.click(dialog.getByRole("button", { name: "确认排课" })); });
    expect(demoRepository.read().lessons).toHaveLength(2);
  });
  it("切换学员不沿用意向和老师；切换模式清空选择", async () => {
    const { student, data } = fixture();
    await mount(`/schedule?student=${student.id}`);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    await testAct(async () => { fireEvent.click(
      within(document.querySelector(".schedule-main")!).getByRole("button", {
        name: "返回调整",
      }),
    ); });
    const other = data.students.find(
      (s) => s.status === "待排课" && s.id !== student.id,
    );
    if (!other) throw Error("missing fixture");
    await testAct(async () => { fireEvent.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: new RegExp(other.name + ".*" + other.id + "$"),
      }),
    ); });
    if(screen.queryByRole("dialog",{name:"放弃本次修改？"})) await testAct(async()=>{fireEvent.click(screen.getByRole("button",{name:"放弃本次修改"}));});
    fireEvent.click(screen.getByRole("button",{name:"一键排课"}));
    const generate = screen.getByRole("button", { name: "生成排课方案" });
    await clickSchedule("按星期填写");
    const weekdays = within(screen.getByRole("group", { name: "每周上课日" }));
    expect(generate.hasAttribute("disabled")).toBe(true);
    expect(weekdays.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "推荐老师" })).toBeNull();
    expect(screen.queryByText("常规可用时间")).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("tab", { name: "按老师排课" })); });
    expect(screen.queryByRole("region", { name: "学员排课意向" })).toBeNull();
  });
  it("意向修改并保存后持久化，只更新当前学员", async () => {
    const { student, data } = fixture();
    await mount(`/schedule?student=${student.id}`);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "修改排课信息" })); });
    await clickSchedule("周一 19:00");
    await clickSchedule("周一 18:00");
    expect(screen.queryByRole("button",{name:"预览排课"})).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "生成排课方案" })); });
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.scheduleIntent?.windows[0].start,
    ).toBe("18:30");
    expect(
      demoRepository.read().students.find((s) => s.id === data.students[0].id)
        ?.scheduleIntent,
    ).toBeUndefined();
    expect(
      JSON.parse(
        localStorage.getItem(DEMO_STORAGE_KEY) || "{}",
      ).students.find((s: { id: string }) => s.id === student.id).scheduleIntent
        .windows[0].start,
    ).toBe("18:30");
  });
});

it("老师资料使用独立标签内容布局，待排学员侧栏不显示操作提示", async () => {
  const { student, teacher } = fixture();
  teacher.teachingPhilosophy = "耐心、有亲和力，善于引导学员表达。";
  await mount(`/schedule?student=${student.id}`);
  expect(
    screen.queryByText("选择学员，保存意向后匹配老师并生成预览。"),
  ).toBeNull();
  await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看老师资料" })); });
  const details = screen
    .getByRole("dialog")
    .querySelector(".schedule-teacher-profile-fields");
  expect(details?.querySelectorAll("dt")).toHaveLength(7);
  expect(details?.querySelectorAll("dd")).toHaveLength(7);
  expect(
    within(screen.getByRole("dialog")).getByText(teacher.teachingPhilosophy),
  ).toBeTruthy();
});

it("老师排课日历按周翻页，可快捷返回本周", async () => {
  fixture();
  await mount();
  await clickSchedule("为该老师排课");
  await clickSchedule("下一周");
  expect(screen.getByText("2026/11/30 - 2026/12/06")).toBeTruthy();
  expect(screen.queryByRole("tab", {name: "日视图"})).toBeNull();
  await clickSchedule("本周");
  const weekday = new Date(DEMO_TODAY + "T12:00:00Z").getUTCDay();
  const monday = addDays(DEMO_TODAY, -((weekday + 6) % 7));
  expect(screen.getByText(monday.replaceAll("-", "/") + " - " + addDays(monday, 6).replaceAll("-", "/"))).toBeTruthy();
  expect(document.querySelector(".roster-person.selected")?.textContent).toContain("T. Carol");
});

async function submitButton(name = "确认排课") {
  const next = screen.queryByRole("button", {name:"核对排课"}) || screen.queryByRole("button", {name:"预览排课"});
  if (next) await testAct(async()=>{fireEvent.click(next);});
  return screen.getByRole("button", {name});
}

function dataFirstName(){return document.querySelector(".roster-person.selected strong")!.textContent!;}

async function clickSubmit(name = "确认排课") { const button = await submitButton(name); await testAct(async()=>{fireEvent.click(button);}); }
