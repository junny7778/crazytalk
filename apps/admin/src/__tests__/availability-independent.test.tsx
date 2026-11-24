import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import {clickSchedule, selectSchedule, startTeacherStudent, addCalendarLesson} from "./schedulingTestActions";
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
import {
  demoRepository,
  DEMO_STORAGE_KEY,
} from "../../../../packages/shared/src/repository";
import {
  stateSchema,
  isRegularTime,
  transition,
  createSeed,
} from "@crazytalk/shared";
import Schedule from "../pages/Schedule";

function mount(path = "/schedule?student=s4&teacher=t1&date=2026-11-23") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <RouterProvider router={createMemoryRouter([{path:"*",element:<Schedule/>}],{initialEntries:[path]})}/>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  if(path.includes("student="))fireEvent.click(screen.getByRole("button",{name:"一键排课"}));
}
beforeEach(() => {
vi.stubGlobal("AbortController",class{constructor(){return transferableAbortController();}});
  localStorage.clear();
  demoRepository.reset();
  bindSchedulingStaff(demoRepository.read());
  demoRepository.read().classInAccounts = demoRepository.read().students.map((student,index)=>({id:`verified-${student.id}`,phone:"",uid:String(123456+index),studentIds:[student.id]}));
  const fixture = demoRepository.read();
  fixture.students[2].name = "排课测试学员";
  fixture.students[2].chineseName = "排课测试学员";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fixture));
  demoRepository.refresh();
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

describe("独立验收：教师时间与排课", () => {
  it("推荐检查第5至8周的占用，缩短到4周后准确重新推荐", async () => {
    const data = demoRepository.read();
    data.lessons = [];
    data.leaves = [];
    const teacher = data.teachers[0];
    data.teachers = [teacher];
    teacher.availability = [{ day: 1, start: "19:00", end: "19:25" }];
    teacher.availabilityFrom = "";
    teacher.trained = true;
    const student = data.students[3];
    student.scheduleIntent = {
      mode: "fixed",
      startDate: "2026-11-23",
      weeks: 8,
      duration: 25,
      frequency: 1,
      windows: [{ day: 1, start: "19:00", end: "19:25" }],
    };
    demoRepository.execute({
      type: "lesson.schedule",
      studentId: data.students[0].id,
      teacherId: "t1",
      slots: [{ date: "2026-12-21", time: "19:00" }],
      duration: 25,
      kind: "固定课",
      material: "Power Up 3",
    });
    mount();
    await clickSchedule("生成排课方案");
    expect(screen.getByText("方案可排 7/8 节")).toBeTruthy();
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "修改排课信息" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "排课周期" }));
    });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("option", { name: "4 周" }));
    });
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "生成排课方案" }),
      );
    });
    expect(screen.getByText("方案可排 4/4 节")).toBeTruthy();
  });
  it("未开放时间不会自动推荐，手动协调必须经老师确认", async()=>{
 const data=demoRepository.read();data.lessons=[];data.teachers=[data.teachers[0]];data.teachers[0].availability=[];data.students[3].scheduleIntent={mode:"fixed",startDate:"2026-11-23",weeks:1,duration:25,frequency:1,windows:[{day:1,start:"19:00",end:"20:00"}]};
 mount();await clickSchedule("生成排课方案");expect(screen.getByRole("button",{name:"查看排课方案"}).hasAttribute("disabled")).toBe(true);await clickSchedule("返回概况");await clickSchedule("自定义排课");expect(document.querySelectorAll('.flex-time-cell.available')).toHaveLength(0);

});

  it("排课成功定位新日期并展示课程，重复安排被阻止", async()=>{
 const d=demoRepository.read();d.lessons=[];d.leaves=[];d.teachers[0].availability=[{day:1,start:"18:00",end:"21:00"}];d.teachers[0].availabilityFrom="";
 mount("/schedule?teacher=t1&date=2026-11-23");await clickSchedule("为该老师排课");await startTeacherStudent("排课测试学员");await addCalendarLesson("2026-11-23","18:30");await clickSchedule("预览排课");await clickSchedule("确认排课");expect(screen.getByText(/课程已保存，可在下方查看同步状态/)).toBeTruthy();expect(screen.getByRole("region",{name:"已安排课程"}).textContent).toContain("18:30");
 await clickSchedule("为该老师排课");await startTeacherStudent("排课测试学员");expect(screen.queryByRole("button",{name:/2026-11-23 18:30 可排课/})).toBeNull();expect(screen.getByRole("button",{name:"预览排课"}).hasAttribute("disabled")).toBe(true);

});

  it("旧数据迁移保留余额、课程与原有分钟时段，不把新时间覆盖旧设置", () => {
    const data = bindSchedulingStaff(createSeed());
    data.classInAccounts = data.students.map((student,index)=>({id:`verified-${student.id}`,phone:"",uid:String(123456+index),studentIds:[student.id]}));
    const teacher = data.teachers[0];
    const {
      availability: _a,
      availabilityFrom: _f,
      availabilityNote: _n,
      availabilitySource: _s,
      ...rest
    } = teacher;
    const loaded = stateSchema.parse({
      ...data,
      teachers: [{ ...rest, openDays: [1, 5], openStart: 19.5, openEnd: 21.5 }],
    });
    expect(loaded.lessons).toEqual(data.lessons);
    expect(loaded.students).toEqual(data.students);
    expect(loaded.teachers[0].availabilitySource).toBe("legacy");
    expect(isRegularTime(loaded.teachers[0], "2026-11-23", "19:30", 120)).toBe(
      true,
    );
    expect(isRegularTime(loaded.teachers[0], "2026-11-23", "19:29", 25)).toBe(
      false,
    );
  });

  it("老师已确认也不能把临时课安排到部分请假区间", () => {
    const data = bindSchedulingStaff(createSeed());
    data.classInAccounts = data.students.map((student,index)=>({id:`verified-${student.id}`,phone:"",uid:String(123456+index),studentIds:[student.id]}));
    data.lessons = [];
    const teacher = data.teachers[0];
    teacher.availability = [];
    const leave = transition(data, {
      type: "teacher.leave",
      teacherId: teacher.id,
      start: "2026-11-09T18:20",
      end: "2026-11-09T18:40",
      reason: "临时有事",
      cancelLessons: false,
    }).data;
    expect(() =>
      transition(leave, {
        type: "lesson.schedule",
        studentId: "s4",
        teacherId: teacher.id,
        slots: [{ date: "2026-11-09", time: "18:00" }],
        duration: 25,
        kind: "临时课",
        material: data.students.find(s => s.id === "s4")!.material,
        confirmedTeacher: true,
      }),
    ).toThrow(/请假/);
    expect(
      transition(leave, {
        type: "lesson.schedule",
        studentId: "s4",
        teacherId: teacher.id,
        slots: [{ date: "2026-11-09", time: "18:40" }],
        duration: 25,
        kind: "临时课",
        material: data.students.find(s => s.id === "s4")!.material,
        confirmedTeacher: true,
      }).data.lessons,
    ).toHaveLength(1);
  });
});
