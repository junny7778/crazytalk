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
import {
  stateSchema,
  isRegularTime,
  transition,
  createSeed,
} from "@crazytalk/shared";
import Schedule from "../pages/Schedule";

function mount(path = "/schedule?student=s4&teacher=t1&date=2026-11-02") {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
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

describe("独立验收：教师时间与排课", () => {
  it("推荐检查第5至8周的占用，缩短到4周后准确重新推荐", () => {
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
      startDate: "2026-11-02",
      weeks: 8,
      duration: 25,
      frequency: 1,
      windows: [{ day: 1, start: "19:00", end: "19:25" }],
    };
    demoRepository.execute({
      type: "lesson.schedule",
      studentId: data.students[0].id,
      teacherId: "t1",
      slots: [{ date: "2026-11-30", time: "19:00" }],
      duration: 25,
      kind: "固定课",
      material: "test",
    });
    mount();
    expect(screen.queryByRole("button", { name: "生成排课预览" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "修改排课信息" }));
    fireEvent.click(screen.getByRole("combobox", { name: "排课周期" }));
    fireEvent.click(screen.getByRole("option", { name: "4 周" }));
    fireEvent.click(screen.getByRole("button", { name: "保存意向并匹配老师" }));
    expect(screen.getByText("全部排满")).toBeTruthy();
  });
  it("未开放时间不会自动推荐，手动协调必须经老师确认", () => {
    const data = demoRepository.read();
    data.lessons = [];
    data.teachers = [data.teachers[0]];
    data.teachers[0].availability = [];
    data.students[3].scheduleIntent = {
      mode: "flex",
      startDate: "2026-11-02",
      weeks: 1,
      duration: 25,
      frequency: 1,
      windows: [{ day: 1, start: "19:00", end: "20:00" }],
    };
    mount();
    expect(screen.queryByRole("button", { name: "生成排课预览" })).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "显示无法匹配的老师及原因" }),
    );
    expect(screen.getByText(/不在老师的可上课时间内/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "老师排课" }));
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("checkbox", {
        name: "已与老师确认，可以安排以上时间",
      }),
    ).toBeTruthy();
  });

  it("排课成功定位新日期并展示课程，重复安排被阻止", () => {
    mount("/schedule?teacher=t1&date=2026-11-02");
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    const ui = within(screen.getByRole("dialog"));
    fireEvent.click(ui.getByLabelText("学员"));
    fireEvent.click(screen.getByRole("option", { name: /Lucy/ }));
    fireEvent.change(ui.getByLabelText("第1节上课日期"), {
      target: { value: "2026-12-04" },
    });
    fireEvent.change(ui.getByLabelText("第1节上课时间"), {
      target: { value: "15:35" },
    });
    fireEvent.click(ui.getByRole("button", { name: "确认排课" }));
    expect(screen.getByRole("dialog", { name: "排课完成" })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    expect(screen.getByText("11月30日 — 12月06日")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Lucy 15:35–16:00" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    const next = within(screen.getByRole("dialog"));
    fireEvent.change(next.getByLabelText("第1节上课时间"), {
      target: { value: "15:35" },
    });
    expect(
      next.getByRole("button", { name: "确认排课" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(next.getAllByText(/老师这个时间已经有课/)[0]).toBeTruthy();
  });

  it("旧数据迁移保留余额、课程与原有分钟时段，不把新时间覆盖旧设置", () => {
    const data = createSeed();
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
    expect(isRegularTime(loaded.teachers[0], "2026-11-02", "19:30", 120)).toBe(
      true,
    );
    expect(isRegularTime(loaded.teachers[0], "2026-11-02", "19:29", 25)).toBe(
      false,
    );
  });

  it("老师已确认也不能把临时课安排到部分请假区间", () => {
    const data = createSeed();
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
        material: "test",
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
        material: "test",
        confirmedTeacher: true,
      }).data.lessons,
    ).toHaveLength(1);
  });
});
