import { bindSchedulingStaff } from "../../../../tests/fixtures/scheduling";
import { transferableAbortController } from "node:util";
import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import {
  demoRepository,
  DEMO_STORAGE_KEY,
} from "../../../../packages/shared/src/repository";
import { clickSchedule, startTeacherStudent, addCalendarLesson } from "./schedulingTestActions";
import Schedule from "../pages/Schedule";

function mount(path = "/schedule?teacher=t1&date=2026-11-20") {
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
  if (path.includes("student=")) fireEvent.click(screen.getByRole("button",{name:"一键排课"}));
}
beforeEach(() => {
  vi.stubGlobal("AbortController", class { constructor(){return transferableAbortController();} });
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

describe("可用时间与临时排课", () => {
  it("学员未填写意向时不推荐老师，清空开始日期不能保存", async () => {
    mount("/schedule?student=s4&date=2026-11-20");
    expect(screen.queryByRole("region", { name: "推荐老师" })).toBeNull();
    await testAct(async () => {
      fireEvent.change(screen.getByLabelText("开始日期"), {
        target: { value: "" },
      });
    });
    await testAct(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "生成排课方案" }),
      );
    });
    expect(
      screen
        .getByRole("button", { name: "生成排课方案" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("老师自定义排课只开放可授时段，支持分钟级起点", async () => {
    const data = demoRepository.read();
    const teacher = data.teachers[0];
    const student = data.students[2];
    teacher.availability = [{ day: 5, start: "16:35", end: "17:00" }];
    teacher.availabilityFrom = "";
    data.lessons = [];
    data.leaves = [];
    mount();
    await clickSchedule("为该老师排课");
    await startTeacherStudent(student.name);
    const outside = screen.getByRole("button", { name: /2026-11-20 19:00 不可安排/ });
    expect(outside.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(outside);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "预览排课" }).hasAttribute("disabled")).toBe(true);
    await addCalendarLesson("2026-11-20", "16:35");
    await clickSchedule("预览排课");
    expect(demoRepository.read().lessons).toHaveLength(0);
    await clickSchedule("确认排课");
    expect(demoRepository.read().lessons).toMatchObject([{
      date: "2026-11-20", time: "16:35", studentId: student.id,
      teacherId: teacher.id, kind: "临时课", status: "未开始",
    }]);
    expect(demoRepository.read().teachers[0].availability).toEqual(teacher.availability);
  });
});
