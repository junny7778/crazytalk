// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";
function mount(path = "/schedule?teacher=t1&date=2026-11-23") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Schedule />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
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
  localStorage.clear();
  demoRepository.reset();
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
  it("老师点击单个可用空档立即打开排课面板并带入时间", () => {
    fixture();
    mount();
    fireEvent.click(
      screen.getByRole("button", {
        name: "T. Carol 2026-11-23 18:00 常规可排",
      }),
    );
    const ui = within(screen.getByRole("dialog"));
    expect(ui.getByLabelText("第1节上课日期").getAttribute("value")).toBe(
      "2026-11-23",
    );
    expect(ui.getByLabelText("第1节上课时间").getAttribute("value")).toBe(
      "18:00",
    );
  });
  it("修改意向并保存清理旧老师日历，再次查看使用新意向", () => {
    const { student } = fixture();
    mount(`/schedule?student=${student.id}`);
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    expect(screen.getByRole("region", { name: "学员固定课表" })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "返回方案",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "修改排课信息" }));
    fireEvent.change(screen.getByLabelText("意向1结束时间"), {
      target: { value: "20:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存意向并匹配老师" }));
    expect(screen.queryByText("常规可用时间")).toBeNull();
  });
  it("灵活排课尊重后续周冲突，生成不同每周时间且提交后退出待排", () => {
    const { student, data } = fixture();
    student.scheduleIntent = {
      mode: "flex",
      startDate: "2026-11-23",
      weeks: 2,
      duration: 25,
      frequency: 1,
      windows: [{ day: 1, start: "18:00", end: "19:00" }],
    };

    demoRepository.execute({
      type: "lesson.schedule",
      studentId: data.students[0].id,
      teacherId: "t1",
      slots: [{ date: "2026-11-30", time: "18:00" }],
      duration: 25,
      kind: "固定课",
      material: "test",
    });
    mount(`/schedule?student=${student.id}`);
    expect(screen.queryByRole("region", { name: "推荐老师" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /2026-11-23 18:00 可排课/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /T\. Carol.*SO/ }));
    fireEvent.click(screen.getByRole("button", { name: "加入课表" }));
    fireEvent.click(screen.getByRole("button", { name: "下一周" }));
    fireEvent.click(
      screen.getByRole("button", { name: /2026-11-30 18:25 可排课/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /T\. Carol.*SO/ }));
    fireEvent.click(screen.getByRole("button", { name: "加入课表" }));
    fireEvent.click(screen.getByRole("button", { name: /确认排课/ }));
    const made = demoRepository
      .read()
      .lessons.filter((l) => l.studentId === student.id);
    expect(made[0].time).toBe("18:00");
    expect(made[1].time >= "18:25" && made[1].time <= "18:35").toBe(true);
    expect(made.every((l) => l.kind === "临时课")).toBe(true);
    expect(screen.getByRole("dialog", { name: "排课完成" })).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: new RegExp(student.name + ".*已排"),
      }),
    ).toBeNull();
  });
  it("需老师确认的方案不能直接提交", () => {
    const { student, teacher } = fixture();
    teacher.needConfirm = true;
    mount(`/schedule?student=${student.id}`);
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    expect(
      screen
        .getByRole("button", { name: "确认已安排的 0 节" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      within(screen.getByRole("region", { name: "学员固定课表" })).getByRole(
        "button",
        { name: /2026-11-23 18:00 T\. Carol/ },
      ),
    );
    expect(
      screen.getByRole("checkbox", { name: "已与老师确认本节授课" }),
    ).toBeTruthy();
    expect(demoRepository.read().lessons).toHaveLength(0);
  });
  it("分钟级老师空档也能正确匹配，不被半小时采样遗漏", () => {
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
    mount(`/schedule?student=${student.id}`);
    expect(screen.getByRole("button", { name: "查看排课方案" })).toBeTruthy();
  });
});
