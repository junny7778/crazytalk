import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import {clickSchedule, selectSchedule, startTeacherStudent, selectStudentCard, addCalendarLesson} from "./schedulingTestActions";
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
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";
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
describe("独立验收：新增排课工作流", () => {
  it("老师点击单个可用空档立即打开排课面板并带入时间", async()=>{
 const {student}=fixture();await mount();await clickSchedule("为该老师排课");
 const calendar = document.querySelector(".fixed-calendar-scroll")!;
 expect(calendar.scrollTop).toBe(35 * 48);
 calendar.scrollTop = 640;
 await clickSchedule(/2026-11-23 18:00 可排课/);
 expect(calendar.scrollTop).toBe(640);
 expect(screen.queryByRole("dialog")).toBeNull();await clickSchedule("确认时段");await selectStudentCard(student.name,student.id);
 expect(screen.getByRole("dialog").textContent).toContain("2026-11-23");expect(screen.getByRole("dialog").textContent).toContain("18:00");

});
  it("老师未登记教材时点击空档说明原因", async () => {
    const {teacher} = fixture();
    teacher.materialIds = [];
    await mount();
    await clickSchedule("为该老师排课");
    await clickSchedule(/2026-11-23 18:00 可排课/);
    expect(screen.getByText("请先设置老师的可授教材")).toBeTruthy();
    expect(screen.queryByText(/· 已选时段/)).toBeNull();
    const book = demoRepository.read().catalog.find(c => c.enabled && c.type === "教材")!;
    await selectSchedule("可授教材", book.name);
    expect(demoRepository.read().teachers.find(t => t.id === teacher.id)?.materialIds).toEqual([book.id]);
    await clickSchedule(/2026-11-23 18:00 可排课/);
    await clickSchedule("确认时段");
    expect(screen.getByRole("dialog", {name:"选择学员"})).toBeTruthy();
  });
  it("修改意向并保存清理旧老师日历，再次查看使用新意向", async () => {
    const { student } = fixture();
    await mount(`/schedule?student=${student.id}`);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    expect(screen.getByRole("region", { name: "学员固定课表" })).toBeTruthy();
    await testAct(async () => { fireEvent.click(
      within(document.querySelector(".schedule-main")!).getByRole("button", {
        name: "返回调整",
      }),
    ); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "修改排课信息" })); });
    await testAct(async () => { fireEvent.change(screen.getByLabelText("意向1结束时间"), {
      target: { value: "20:00" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "生成排课方案" })); });
    expect(screen.queryByText("常规可用时间")).toBeNull();
  });
  it("自定义排课尊重后续周冲突，确认不同每周时间后返回概况", async()=>{
 const {student,data}=fixture();student.scheduleIntent={mode:"flex",startDate:"2026-11-23",weeks:2,duration:25,frequency:1,windows:[{day:1,start:"18:00",end:"19:00"}]};
 demoRepository.execute({type:"lesson.schedule",studentId:data.students[0].id,teacherId:"t1",slots:[{date:"2026-11-30",time:"18:00"}],duration:25,kind:"固定课",material:data.students[0].material});
 await mount(`/schedule?student=${student.id}&date=2026-11-23`);await clickSchedule("返回概况");await clickSchedule("自定义排课");await addCalendarLesson("2026-11-23","18:00");
 await clickSchedule("下一周");expect(screen.queryByRole("button",{name:/2026-11-30 18:00 可排课/})).toBeNull();await addCalendarLesson("2026-11-30","18:25");
 await clickSchedule("预览排课");expect(demoRepository.read().lessons.filter(l=>l.studentId===student.id)).toHaveLength(0);await clickSchedule("确认排课");
 const made=demoRepository.read().lessons.filter(l=>l.studentId===student.id);expect(made.map(l=>l.time)).toEqual(["18:00","18:25"]);expect(made.every(l=>l.kind==="临时课")).toBe(true);expect(screen.getByText(/课程已保存，可在下方查看同步状态/)).toBeTruthy();

});
  it("需老师确认的方案不能直接提交", async () => {
    const { student, teacher } = fixture();
    teacher.needConfirm = true;
    await mount(`/schedule?student=${student.id}`);
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "查看排课方案" })); });
    expect(
      screen
        .getByRole("button", { name: "核对排课" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await testAct(async () => { fireEvent.click(
      within(screen.getByRole("region", { name: "学员固定课表" })).getByRole(
        "button",
        { name: /2026-11-23 18:00 T\. Carol/ },
      ),
    ); });
    expect(
      screen.getByRole("checkbox", { name: "已与老师确认本节授课" }),
    ).toBeTruthy();
    expect(demoRepository.read().lessons).toHaveLength(0);
  });
  it("分钟级老师空档也能正确匹配，不被半小时采样遗漏", async () => {
    const { student, teacher } = fixture();
    teacher.availability = [{ day: 1, start: "19:15", end: "19:40" }];
    student.scheduleIntent = {
      mode: "fixed",
      startDate: "2026-11-23",
      weeks: 2,
      duration: 25,
      frequency: 1,
      windows: [{ day: 1, start: "19:00", end: "19:45" }],
    };
    await mount(`/schedule?student=${student.id}`);
    expect(screen.getByRole("button", { name: "查看排课方案" })).toBeTruthy();
  });
});

it("按老师排课的多选时段全部带入自定义预览",async()=>{
 const {student}=fixture();await mount();await clickSchedule("为该老师排课");await startTeacherStudent(student.name,student.id);await testAct(async()=>{fireEvent.click(screen.getByLabelText("多选上课时间"));});
 await clickSchedule(/2026-11-23 18:00 可排课/);await clickSchedule(/2026-11-23 19:00 可排课/);await clickSchedule("为选中时段选择老师");
 await testAct(async()=>{fireEvent.click(document.querySelector("[role=dialog] .flex-teacher-choice")!);});await clickSchedule("加入课表");await clickSchedule("预览排课");
 const review=screen.getByRole("region",{name:"自定义排课预览"});expect(within(review).getAllByRole("row")).toHaveLength(3);expect(review.textContent).toContain("18:00");expect(review.textContent).toContain("19:00");expect(demoRepository.read().lessons).toHaveLength(0);
});
