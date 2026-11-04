// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { createSeed } from "@crazytalk/shared";
import { CoursePlanEditor } from "../components/scheduling/CoursePlanEditor";
function fixture() {
  const data = demoRepository.read();
  data.lessons = [];
  data.leaves = [];
  data.teachers = data.teachers.slice(0, 2);
  data.teachers.forEach((t) => {
    t.status = "在职";
    t.trained = true;
    t.needConfirm = false;
    t.categories = ["少儿"];
    t.availabilityFrom = "";
    t.availability = Array.from({ length: 7 }, (_, day) => ({
      day,
      start: "18:00",
      end: "21:00",
    }));
  });
  data.students[3].status = "待排课";
  return {
    data,
    student: data.students[3],
    a: data.teachers[0],
    b: data.teachers[1],
  };
}
function mount(
  slots: { date: string; time: string; teacherId?: string }[],
  kind: "固定课" | "临时课" = "固定课",
) {
  const { student, a } = fixture();
  const complete = vi.fn();
  const result = render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <CoursePlanEditor
            studentId={student.id}
            teacherId={a.id}
            slots={slots}
            kind={kind}
            duration={25}
            generated
            onClose={() => {}}
            onComplete={complete}
          />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  return { ...result, complete };
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
describe("多老师课程计划", () => {
  it("固定时间保持不变，补齐第二位老师并一次确认", () => {
    const { data, a, b } = fixture();
    data.lessons.push({
      ...createSeed().lessons[0],
      id: "busy",
      studentId: "other",
      teacherId: a.id,
      date: "2026-11-30",
      time: "19:00",
      duration: 25,
      status: "未开始",
    });
    // mount without rebuilding the fixture, preserving the conflict.
    const complete = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DemoProvider>
          <ToastProvider>
            <CoursePlanEditor
              studentId={data.students[3].id}
              teacherId={a.id}
              slots={[
                { date: "2026-11-23", time: "19:00", teacherId: a.id },
                { date: "2026-11-30", time: "19:00", teacherId: "" },
              ]}
              kind="固定课"
              duration={25}
              generated
              onClose={() => {}}
              onComplete={complete}
            />
          </ToastProvider>
        </DemoProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByLabelText("第1节上课时间").hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "补齐剩余老师" }));
    fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
    const made = demoRepository
      .read()
      .lessons.filter((l) => l.studentId === data.students[3].id);
    expect(made.map((l) => l.teacherId)).toEqual([a.id, b.id]);
    expect(made.map((l) => l.time)).toEqual(["19:00", "19:00"]);
    expect(complete).toHaveBeenCalledOnce();
  });
  it("部分确认只写已安排课次，缺口保留并可补齐，不重复排课", () => {
    const { a } = fixture();
    const { complete } = mount([
      { date: "2026-11-23", time: "19:00", teacherId: a.id },
      { date: "2026-11-30", time: "19:00", teacherId: "" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "确认已安排的 1 节" }));
    expect(demoRepository.read().lessons).toHaveLength(1);
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByText("课程预览 · 共 1 节")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "补齐剩余老师" }));
    fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
    expect(demoRepository.read().lessons).toHaveLength(2);
  });
  it("灵活计划可逐节换老师并提交不同日期和时间", () => {
    const { a, b } = fixture();
    const { complete } = mount(
      [
        { date: "2026-11-23", time: "18:00", teacherId: a.id },
        { date: "2026-11-27", time: "20:00", teacherId: a.id },
      ],
      "临时课",
    );
    fireEvent.click(screen.getByLabelText("第2节老师"));
    fireEvent.click(screen.getByRole("option", { name: b.name }));
    fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
    expect(
      demoRepository.read().lessons.map((l) => [l.date, l.time, l.teacherId]),
    ).toEqual([
      ["2026-11-23", "18:00", a.id],
      ["2026-11-27", "20:00", b.id],
    ]);
    expect(complete).toHaveBeenCalledOnce();
  });
  it("相互重叠的计划不能提交，移除冲突课后可提交", () => {
    const { a } = fixture();
    mount(
      [
        { date: "2026-11-23", time: "18:00", teacherId: a.id },
        { date: "2026-11-23", time: "18:10", teacherId: a.id },
      ],
      "临时课",
    );
    expect(
      screen.getByRole("button", { name: "确认排课" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      within(screen.getByRole("region", { name: "第2节课程" })).getByRole(
        "button",
        { name: "移除" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
    expect(demoRepository.read().lessons).toHaveLength(1);
  });
  it("返回后可以恢复草稿，恢复的老师确认需要重新核实", () => {
    const { a } = fixture();
    const first = mount(
      [{ date: "2026-11-23", time: "18:00", teacherId: a.id }],
      "临时课",
    );
    fireEvent.change(screen.getByLabelText("第1节上课时间"), {
      target: { value: "20:00" },
    });
    first.unmount();
    mount([], "临时课");
    fireEvent.click(screen.getByRole("button", { name: "继续上次编排" }));
    expect(screen.getByLabelText<HTMLInputElement>("第1节上课时间").value).toBe(
      "20:00",
    );
  });
});

it("灵活排课从具体日期范围匹配整节课程并提交", () => {
  mount([], "临时课");
  fireEvent.change(screen.getByLabelText("查找课程日期"), {
    target: { value: "2026-11-24" },
  });
  fireEvent.change(screen.getByLabelText("最早上课时间"), {
    target: { value: "18:15" },
  });
  fireEvent.change(screen.getByLabelText("最晚上课结束时间"), {
    target: { value: "18:40" },
  });
  fireEvent.click(screen.getByRole("button", { name: "匹配并添加一节" }));
  expect(screen.getByLabelText<HTMLInputElement>("第1节上课时间").value).toBe(
    "18:15",
  );
  fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
  expect(demoRepository.read().lessons[0]).toMatchObject({
    date: "2026-11-24",
    time: "18:15",
    duration: 25,
  });
});
it("周日历点击具体日期添加待确认课程，预览不写入", () => {
  mount([], "临时课");
  const calendar = within(screen.getByRole("region", { name: "学员周日历" }));
  fireEvent.click(calendar.getAllByRole("button", { name: /\+$/ })[1]);
  expect(screen.getByText("课程预览 · 共 1 节")).toBeTruthy();
  expect(demoRepository.read().lessons).toHaveLength(0);
});
