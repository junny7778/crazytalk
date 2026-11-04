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
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { transition, type ScheduleIntent } from "@crazytalk/shared";
import { FlexStudentCalendar } from "../components/scheduling/FlexStudentCalendar";
function fixture() {
  const d = demoRepository.read();
  d.lessons = [];
  d.leaves = [];
  d.teachers = d.teachers.slice(0, 2);
  d.teachers.forEach((t, i) => {
    t.status = "在职";
    t.trained = false;
    t.needConfirm = true;
    t.categories = ["成人"];
    t.availabilityFrom = "";
    t.availability = [
      { day: 1, start: i ? "20:00" : "19:00", end: i ? "21:00" : "20:00" },
    ];
  });
  const s = d.students[3];
  s.age = 10;
  s.status = "待排课";
  const intent: ScheduleIntent = {
    mode: "flex",
    startDate: "2026-11-23",
    weeks: 2,
    frequency: 2,
    duration: 25,
    windows: [],
  };
  return { d, s, intent };
}
function mount() {
  const f = fixture();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <FlexStudentCalendar studentId={f.s.id} intent={f.intent} />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  return f;
}
function select(time: string, name: string) {
  fireEvent.click(
    screen.getByRole("button", { name: `2026-11-23 ${time} 可排课` }),
  );
  fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
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
it("空意向可排，未培训成人老师可为少儿安排且无需确认，提交后不能重复", () => {
  const { d } = mount();
  select("19:00", d.teachers[0].name);
  expect(demoRepository.read().lessons).toHaveLength(0);
  const submit = screen.getByRole("button", { name: /确认排课/ });
  fireEvent.click(submit);
  expect(demoRepository.read().lessons).toHaveLength(1);
  expect(submit.hasAttribute("disabled")).toBe(true);
});
it("意向外可排，取消选择不新增，移除待确认课程不写入", () => {
  const f = fixture();
  f.intent.windows = [{ day: 2, start: "18:00", end: "19:00" }];
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <FlexStudentCalendar studentId={f.s.id} intent={f.intent} />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "2026-11-23 19:00 可排课" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(screen.queryByRole("button", { name: /待确认 T\./ })).toBeNull();
  select("19:00", f.d.teachers[0].name);
  fireEvent.click(
    screen.getByRole("button", { name: /2026-11-23 19:00 待确认/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "移除本节" }));
  expect(demoRepository.read().lessons).toHaveLength(0);
});
it("拖动至原老师不可用时间，取消保留原课，选新老师后移动", () => {
  const { d } = mount();
  select("19:00", d.teachers[0].name);
  const transfer = { setData: vi.fn(), effectAllowed: "" };
  let source = screen.getByRole("button", { name: /2026-11-23 19:00 待确认/ });
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.drop(
    screen.getByRole("button", { name: "2026-11-23 20:00 可排课" }),
    { dataTransfer: transfer },
  );
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(
    screen.getByRole("button", { name: /2026-11-23 19:00 待确认/ }),
  ).toBeTruthy();
  source = screen.getByRole("button", { name: /2026-11-23 19:00 待确认/ });
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.drop(
    screen.getByRole("button", { name: "2026-11-23 20:00 可排课" }),
    { dataTransfer: transfer },
  );
  fireEvent.click(
    screen.getByRole("button", { name: new RegExp(d.teachers[1].name) }),
  );
  expect(
    screen.getByRole("button", {
      name: new RegExp(`2026-11-23 20:00 待确认 ${d.teachers[1].name}`),
    }),
  ).toBeTruthy();
});
it("灵活提交仍拦冲突、离职、过去和常规范围外；固定仍拦资格", () => {
  const { d, s } = fixture();
  const command = {
    type: "lesson.schedule" as const,
    schedulingMode: "flex" as const,
    kind: "临时课" as const,
    studentId: s.id,
    teacherId: d.teachers[0].id,
    slots: [{ date: "2026-11-23", time: "19:00" }],
    duration: 25,
    material: s.material,
  };
  const booked = transition(d, command).data;
  expect(() => transition(booked, command)).toThrow("已经有课");
  expect(() =>
    transition(d, {
      ...command,
      slots: [{ date: "2026-11-23", time: "18:00" }],
    }),
  ).toThrow();
  expect(() =>
    transition(d, {
      ...command,
      slots: [{ date: "2020-11-23", time: "19:00" }],
    }),
  ).toThrow();
  d.teachers[0].status = "已离职";
  expect(() => transition(d, command)).toThrow();
  d.teachers[0].status = "在职";
  expect(() =>
    transition(d, { ...command, schedulingMode: undefined, kind: "固定课" }),
  ).toThrow();
});
it("窄分钟窗口可见且支持08点前课程；请假仍拒绝", () => {
  const f = fixture();
  f.d.teachers[0].availability = [{ day: 1, start: "07:15", end: "07:40" }];
  f.d.teachers[1].availability = [];
  const started = performance.now();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <FlexStudentCalendar studentId={f.s.id} intent={f.intent} />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "2026-11-23 07:15 可排课" }),
  ).toBeTruthy();
  console.info(
    `灵活全天日历挂载 ${Math.round(performance.now() - started)}ms（2老师测试夹具）`,
  );
  const leave = transition(f.d, {
    type: "teacher.leave",
    teacherId: f.d.teachers[0].id,
    start: "2026-11-23T07:15",
    end: "2026-11-23T08:00",
    reason: "测试",
    cancelLessons: false,
  }).data;
  expect(() =>
    transition(leave, {
      type: "lesson.schedule",
      schedulingMode: "flex",
      kind: "临时课",
      studentId: f.s.id,
      teacherId: f.d.teachers[0].id,
      slots: [{ date: "2026-11-23", time: "07:15" }],
      duration: 25,
      material: f.s.material,
    }),
  ).toThrow("请假");
});
it("保存灵活空意向成功，固定空意向仍拒绝", () => {
  const { d, s, intent } = fixture();
  expect(
    transition(d, {
      type: "student.scheduleIntent.update",
      studentId: s.id,
      intent,
    }).data.students.find((x) => x.id === s.id)?.scheduleIntent?.windows,
  ).toEqual([]);
  expect(() =>
    transition(d, {
      type: "student.scheduleIntent.update",
      studentId: s.id,
      intent: { ...intent, mode: "fixed" },
    }),
  ).toThrow();
});
