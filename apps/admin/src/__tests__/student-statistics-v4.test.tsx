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
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentStatistics from "../components/StudentStatistics";
import StudentCourses from "../components/StudentCourses";
import StudentCredits from "../components/StudentCredits";
const openLesson = vi.fn(),
  openFeedback = vi.fn(),
  openCredit = vi.fn();
function Page({ mode }: { mode: "statistics" | "courses" | "credits" }) {
  const { data } = useDemo();
  const student = data.students[0];
  return mode === "statistics" ? (
    <StudentStatistics
      student={student}
      onOpenLesson={openLesson}
      onOpenFeedback={openFeedback}
      onOpenCredit={openCredit}
    />
  ) : mode === "courses" ? (
    <StudentCourses
      student={student}
      onReschedule={() => {}}
      onOpenLesson={openLesson}
    />
  ) : (
    <StudentCredits
      student={student}
      onAction={() => {}}
      onOpen={() => {}}
      onTasks={() => {}}
    />
  );
}
function mount(mode: "statistics" | "courses" | "credits") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter>
            <Page mode={mode} />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  openLesson.mockClear();
  openCredit.mockClear();
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
  vi.unstubAllGlobals();
});
describe("学员事件统计界面", () => {
  it("明确年月的历史记录与零条课程明细分别展示，空值不冒充零", () => {
    const student = demoRepository.read().students[0];
    student.monthlyRecords = [
      {
        id: "dated-month",
        month: "2026-07",
        planned: 8,
        actual: null,
        note: "旧台账",
      },
      {
        id: "unknown-year",
        month: "7月（原表，年份未注明）",
        planned: 12,
        actual: 10,
        note: "年份未知",
      },
    ];
    mount("courses");
    fireEvent.change(screen.getByLabelText("统计月份"), {
      target: { value: "2026-07" },
    });
    expect(screen.queryByText("本月已排，取消课程不计")).toBeNull();
    expect(screen.getAllByText("暂无课程")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "查看月应上课课程" }),
    ).toBeNull();
    const history = screen
      .getByText(/查看该月历史导入数据 · 应上 8 节，实上 未提供/)
      .closest("details");
    if (!history) throw new Error("未显示该月历史");
    fireEvent.click(within(history).getByText(/查看该月历史导入数据/));
    expect(within(history).getByText("月应上课：8 节")).toBeTruthy();
    expect(within(history).getByText("实际上课：未提供")).toBeTruthy();
    expect(within(history).queryByText("年份未知")).toBeNull();
    fireEvent.change(screen.getByLabelText("统计月份"), {
      target: { value: "2026-08" },
    });
    expect(screen.queryByText(/查看该月历史导入数据/)).toBeNull();
  });
  it("购课摘要不混入补偿，也不把未知覆盖范围的历史与新记录直接相加", () => {
    const student = demoRepository.read().students[0];
    student.totalUnits = 24;
    demoRepository.execute({
      type: "credit.add",
      studentId: student.id,
      units: 3,
      kind: "充值",
      note: "新购课",
    });
    demoRepository.execute({
      type: "credit.add",
      studentId: student.id,
      units: 2,
      kind: "补偿",
      note: "额外补偿",
    });
    mount("credits");
    const panel = screen
      .getByRole("heading", { name: "课时与续课信息" })
      .closest("section");
    if (!panel) throw new Error("没有课时摘要");
    expect(within(panel).getByText("待核实")).toBeTruthy();
    expect(within(panel).getByText("历史总课时")).toBeTruthy();
    expect(within(panel).getByText("3 课时")).toBeTruthy();
    expect(within(panel).queryByText("29")).toBeNull();
  });

  it("当前学习进度优先课后记录，不被档案旧值覆盖", () => {
    const data = demoRepository.read(),
      student = data.students[0];
    const lesson = data.lessons.find(
      (item) => item.studentId === student.id && item.status === "已完成",
    );
    if (!lesson) throw new Error("没有课程");
    student.material = "旧教材";
    student.unit = "旧页码";
    data.reports.push({
      id: "test-progress",
      studentId: student.id,
      teacherId: lesson.teacherId,
      lessonId: lesson.id,
      date: lesson.date,
      material: "最新教材",
      from: "10",
      to: "24",
      rating: 0,
      comment: "",
      suggestedLevel: "",
    });
    mount("courses");
    const panel = screen
      .getByRole("heading", { name: "教材与学习进度" })
      .closest("section");
    if (!panel) throw new Error("没有学习进度模块");
    expect(within(panel).getByText("最新教材 / 24")).toBeTruthy();
    expect(within(panel).queryByText("旧教材")).toBeNull();
  });

  it("投诉统计可下钻真实差评，不重复计跟进", () => {
    const data = demoRepository.read(),
      student = data.students[0];
    const feedback = data.feedback.find(
      (record) => record.studentId === student.id && record.rating === "差评",
    );
    if (!feedback) throw new Error("没有差评样例");
    mount("statistics");
    fireEvent.click(screen.getByRole("button", { name: /^投诉次数/ }));
    const drawer = screen.getByRole("dialog", { name: "投诉次数" });
    const buttons = within(drawer).getAllByRole("button", { name: "查看反馈" });
    fireEvent.click(buttons[0]);
    expect(openFeedback).toHaveBeenCalledWith(feedback.id);
  });
  it("一笔3课时补偿只算一次且进入对应流水", () => {
    const student = demoRepository.read().students[0];
    demoRepository.execute({
      type: "credit.add",
      studentId: student.id,
      units: 3,
      kind: "补偿",
      note: "一次三课时",
    });
    const credit = demoRepository.read().credits[0];
    mount("statistics");
    fireEvent.click(screen.getByRole("button", { name: /^补偿次数/ }));
    const drawer = screen.getByRole("dialog", { name: "补偿次数" });
    expect(within(drawer).getByText(/补偿 3 课时/)).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "查看补偿" }));
    expect(openCredit).toHaveBeenCalledWith(credit.id);
  });
  it("月统计按实际月份下钻，展示来源课程", () => {
    const student = demoRepository.read().students[0];
    const data = demoRepository.read();
    const base = data.lessons.find((lesson) => lesson.studentId === student.id);
    if (!base) throw new Error("缺少课程样本");
    for (let i = 0; i < 6; i++)
      data.lessons.push({
        ...base,
        id: `monthly-extra-${i}`,
        date: `2026-11-${20 + i}`,
        status: "未开始",
      });
    const expected = demoRepository
      .read()
      .lessons.filter(
        (lesson) =>
          lesson.studentId === student.id &&
          lesson.date.startsWith("2026-11") &&
          lesson.status !== "已取消",
      );
    mount("courses");
    fireEvent.change(screen.getByLabelText("统计月份"), {
      target: { value: "2026-11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查看月应上课课程" }));
    const details = screen.getByRole("region", { name: "月度课程明细" });
    expect(within(details).getAllByRole("row")).toHaveLength(
      Math.min(5, expected.length) + 1,
    );
    expect(
      within(details).queryByRole("button", { name: /查看详情|查看月度课程/ }),
    ).toBeNull();
    expect(openLesson).not.toHaveBeenCalled();
    if (expected.length > 5) {
      fireEvent.click(
        within(details).getByRole("button", { name: /展开全部/ }),
      );
      expect(within(details).getAllByRole("row")).toHaveLength(
        expected.length + 1,
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "收起月应上课课程" }));
    expect(screen.queryByRole("region", { name: "月度课程明细" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看月应上课课程" }));
    fireEvent.change(screen.getByLabelText("统计月份"), {
      target: { value: "2026-07" },
    });
    expect(screen.queryByRole("region", { name: "月度课程明细" })).toBeNull();
    fireEvent.change(screen.getByLabelText("统计月份"), {
      target: { value: "2026-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查看月应上课课程" }));
    fireEvent.click(screen.getByRole("button", { name: "查看实际上课课程" }));
    expect(
      screen
        .getByRole("button", { name: "查看月应上课课程" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "收起实际上课课程" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getAllByRole("region", { name: "月度课程明细" }),
    ).toHaveLength(1);
  });
});
