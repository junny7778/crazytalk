// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { DEMO_TODAY, addDays } from "@crazytalk/shared";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentTasks from "../components/StudentTasks";
import App from "../App";
import { useEffect } from "react";

const openLesson = vi.fn(),
  openFeedback = vi.fn();
function TaskPage() {
  const { data } = useDemo();
  return (
    <StudentTasks
      student={data.students[0]}
      onOpenLesson={openLesson}
      onOpenFeedback={openFeedback}
    />
  );
}
function mount(child = <TaskPage />, path = "/") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>{child}</MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  openLesson.mockClear();
  openFeedback.mockClear();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("学员待办简洁操作", () => {
  it("新增待办表单按需打开，期限可空，总结可空直接完成", async () => {
    mount();
    expect(screen.queryByLabelText("待办事项", { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "新增待办" }));
    change("待办事项", "联系本周课程");
    fireEvent.click(screen.getByRole("button", { name: "登记待办" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const article = screen
      .getByText("联系本周课程", { exact: true })
      .closest("article");
    if (!article) throw new Error("未显示新待办");
    expect(within(article).getByText(/期限未安排/)).toBeTruthy();
    fireEvent.click(within(article).getByRole("button", { name: "标记完成" }));
    fireEvent.click(screen.getByRole("button", { name: "确认完成" }));
    fireEvent.click(screen.getByRole("button", { name: /^已完成（/ }));
    expect(
      await screen.findByText("处理结果：已完成，未补充说明"),
    ).toBeTruthy();
    expect(demoRepository.read().tasks[0]).toMatchObject({
      status: "已完成",
      result: "",
    });
    expect(demoRepository.read().tasks[0].completedBy).toBeTruthy();
  });

  it("可选说明被保存，按已完成状态筛选不出现未完成项", async () => {
    const student = demoRepository.read().students[0];
    demoRepository.execute({
      type: "task.add",
      studentId: student.id,
      title: "确认下周安排",
      owner: "Roma",
    });
    mount();
    const article = screen
      .getByText("确认下周安排", { exact: true })
      .closest("article");
    if (!article) throw new Error("缺少待办");
    fireEvent.click(within(article).getByRole("button", { name: "标记完成" }));
    change("处理说明", "家长已确认");
    fireEvent.click(screen.getByRole("button", { name: "确认完成" }));
    fireEvent.click(screen.getByRole("button", { name: /^已完成（/ }));
    expect(await screen.findByText("处理结果：家长已确认")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "标记完成" })).toBeNull();
    expect(screen.getByText("确认下周安排", { exact: true })).toBeTruthy();
  });

  it("老师异动自动带入来源和课程，展开后可打开实际课程", () => {
    const data = demoRepository.read();
    demoRepository.execute({
      type: "teacher.leave",
      teacherId: data.teachers[0].id,
      start: DEMO_TODAY,
      end: addDays(DEMO_TODAY, 10),
      reason: "老师请假",
      cancelLessons: false,
    });
    mount();
    expect(screen.getByText("来源：老师异动", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByText(/关联 .* 节课程/));
    fireEvent.click(screen.getAllByRole("button", { name: "去处理" })[0]);
    const lessonId = openLesson.mock.calls[0][0];
    expect(
      demoRepository
        .read()
        .lessons.some(
          (lesson) =>
            lesson.id === lessonId && lesson.studentId === data.students[0].id,
        ),
    ).toBe(true);
  });

  it("空状态隐藏辅助筛选和演示工具，表单取消不写入记录", () => {
    demoRepository.read().tasks = [];
    mount();
    expect(screen.getByText("暂无待处理事项")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("演示提醒")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "新增待办" }));
    change("待办事项", "未保存的事项");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(demoRepository.read().tasks).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "新增待办" }));
    expect(screen.getByLabelText("待办事项").getAttribute("value")).toBe("");
  });
  it("待处理按期限排序，筛选无结果可清除，取消完成不改状态", () => {
    const data = demoRepository.read();
    data.tasks = [];
    for (const [title, dueDate, owner] of [
      ["无期限", "", "Roma"],
      ["较晚逾期", "2026-10-30", "Roma"],
      ["最早逾期", "2026-10-20", "Rita"],
      ["未来任务", "2026-12-20", "Roma"],
    ]) {
      demoRepository.execute({
        type: "task.add",
        studentId: data.students[0].id,
        title,
        dueDate,
        owner,
      });
    }
    const { container } = mount();
    expect(
      [...container.querySelectorAll("article > .row strong")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["最早逾期", "较晚逾期", "未来任务", "无期限"]);
    expect(screen.getAllByText("已逾期")).toHaveLength(2);
    choose("待办负责人筛选", "Rita");
    choose("待办期限", "未安排期限");
    expect(screen.getByText("没有符合条件的事项")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    fireEvent.click(screen.getAllByRole("button", { name: "标记完成" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(
      demoRepository.read().tasks.every((task) => task.status === "待处理"),
    ).toBe(true);
    expect(openLesson).not.toHaveBeenCalled();
  });
  it("停用结果进入对应服务记录，操作日志从更多操作打开，复课后保留历史快照", async () => {
    const student = demoRepository.read().students[0];
    demoRepository.execute({
      type: "student.lifecycle",
      studentId: student.id,
      status: "退费",
      reason: "测试退费",
    });
    const refund = demoRepository
      .read()
      .events.find(
        (event) => event.type === "退费" && event.studentId === student.id,
      );
    expect(refund?.serviceStopResults?.length).toBeGreaterThan(0);
    demoRepository.execute({
      type: "student.lifecycle",
      studentId: student.id,
      status: "在读",
      reason: "测试复课",
    });
    expect(demoRepository.read().students[0].serviceStopResults).toEqual([]);
    expect(
      demoRepository.read().events.find((event) => event.id === refund?.id)
        ?.serviceStopResults?.length,
    ).toBeGreaterThan(0);
    mount(<App />, `/students/${student.id}?tab=tasks`);
    expect(await screen.findByRole("tab", { name: "待办事项" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "服务停用进展" })).toBeNull();
    expect(
      screen.getByText("更多操作").closest("details")?.hasAttribute("open"),
    ).toBe(false);
    fireEvent.click(screen.getByText("更多操作"));
    fireEvent.click(screen.getByRole("button", { name: "查看操作记录" }));
    expect(screen.getByRole("dialog", { name: "操作记录" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
    const record = screen.getByText("测试退费").closest("article");
    if (!record) throw new Error("未找到退费事件");
    fireEvent.click(within(record).getByRole("button", { name: "查看详情" }));
    expect(screen.getByRole("dialog", { name: "退费记录" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "服务停用进展" })).toBeTruthy();
  });
  it("关联反馈提供去处理入口，但打开反馈不会自动完成待办", () => {
    const data = demoRepository.read();
    data.tasks = [];
    const student = data.students[0];
    const feedback = data.feedback.find(
      (item) => item.studentId === student.id,
    );
    if (!feedback) throw new Error("缺少反馈样本");
    demoRepository.execute({
      type: "task.add",
      studentId: student.id,
      title: "跟进反馈",
      owner: student.owner,
    });
    const task = demoRepository.read().tasks[0];
    task.sourceType = "feedback";
    task.sourceId = feedback.id;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "去处理" }));
    expect(openFeedback).toHaveBeenCalledWith(feedback.id);
    expect(demoRepository.read().tasks[0].status).toBe("待处理");
  });
  it("只读人员可以查看任务但没有新增和完成操作", () => {
    function ReadOnlyPage() {
      const { setRole, roleId } = useDemo();
      useEffect(() => setRole("finance"), [setRole]);
      return roleId === "finance" ? <TaskPage /> : null;
    }
    const data = demoRepository.read();
    data.tasks = [];
    demoRepository.execute({
      type: "task.add",
      studentId: data.students[0].id,
      title: "只读待办",
      owner: data.students[0].owner,
    });
    mount(<ReadOnlyPage />);
    expect(screen.getByText("只读待办")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "新增待办" })).toBeNull();
    expect(screen.queryByRole("button", { name: "标记完成" })).toBeNull();
  });
});
