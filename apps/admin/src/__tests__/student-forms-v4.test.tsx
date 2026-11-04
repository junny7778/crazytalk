// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { emptyStudentProfile } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentProfileEditor from "../components/StudentProfileEditor";
import StudentHistoryEditor from "../components/StudentHistoryEditor";
import {
  StudentActionModal,
  type StudentAction,
} from "../components/StudentActions";
function Location() {
  return (
    <div data-testid="location">
      {useLocation().pathname}
      {useLocation().search}
    </div>
  );
}
function Action({
  action,
  studentId,
}: {
  action: StudentAction;
  studentId?: string;
}) {
  const { data } = useDemo();
  return (
    <StudentActionModal
      student={
        data.students.find((item) => item.id === studentId) ?? data.students[0]
      }
      action={action}
      onClose={() => {}}
    />
  );
}
function mount(child: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter>
            {child}
            <Location />
          </MemoryRouter>
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
describe("学员资料与历史分离 V4", () => {
  it("普通新建只需姓名，历史统计和业务结果不再手填，正常0余额建档", async () => {
    mount(<StudentProfileEditor onClose={() => {}} />);
    for (const label of [
      "序号",
      "订单状态",
      "总课时",
      "买单日期",
      "上课时间",
      "周上课频次",
      "第一节课",
      "投诉记录（次数）",
      "原老师",
    ])
      expect(screen.queryByLabelText(label, { exact: true })).toBeNull();
    expect(screen.queryByRole("button", { name: "添加月份" })).toBeNull();
    change("学生名字", "新资料建档");
    choose(
      "上课老师",
      `${demoRepository.read().teachers.find((item) => item.status === "在职")?.name} · ${demoRepository.read().teachers.find((item) => item.status === "在职")?.so}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .students.find((item) => item.name === "新资料建档"),
      ).toMatchObject({ balance: 0, balanceKnown: true, orderStatus: "正常" }),
    );
  });
  it("只保存变动资料，不用打开时的旧进度覆盖后续业务更新", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    change("学生群名", "仅编辑群名");
    demoRepository.execute({
      type: "student.edit",
      id: student.id,
      patch: { material: "最新教材", unit: "p.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === student.id),
      ).toMatchObject({
        groupName: "仅编辑群名",
        material: "最新教材",
        unit: "p.99",
      }),
    );
  });
  it("已有课后进度时，普通资料编辑不再提供教材和页码输入", () => {
    const data = demoRepository.read();
    const lesson = data.lessons.find((item) => item.status === "已完成");
    if (!lesson) throw new Error("缺少已结束课程");
    demoRepository.execute({
      type: "report.save",
      report: {
        lessonId: lesson.id,
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        date: lesson.date,
        material: "最新教材",
        from: "1",
        to: "8",
        rating: 0,
        comment: "",
        suggestedLevel: "",
      },
    });
    const student = demoRepository
      .read()
      .students.find((item) => item.id === lesson.studentId);
    if (!student) throw new Error("缺少学员");
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    expect(screen.queryByRole("textbox", { name: "教材" })).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "起始单元／页码" }),
    ).toBeNull();
    expect(screen.getByText(/教材进度已由课后记录维护/)).toBeTruthy();
  });
  it("相同资料被其他操作更改时，保存提示冲突并保留新值", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    mount(<StudentProfileEditor student={student} onClose={() => {}} />);
    change("学生名字", "我的编辑");
    demoRepository.execute({
      type: "student.details.update",
      id: student.id,
      patch: { name: "他人已修改" },
      expected: { name: student.name },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      demoRepository.read().students.find((item) => item.id === student.id)
        ?.name,
    ).toBe("他人已修改");
  });
  it("历史更正须说明原因，原月度/历史原文保留，未填写日期不假设统计起点", async () => {
    const student = structuredClone(demoRepository.read().students[0]);
    mount(<StudentHistoryEditor student={student} onClose={() => {}} />);
    change("投诉记录（次数）", "2");
    fireEvent.click(screen.getByRole("button", { name: "保存历史资料" }));
    expect(await screen.findByText("请填写本次补录或更正原因")).toBeTruthy();
    change("补录／更正原因", "核对旧表");
    fireEvent.click(screen.getByRole("button", { name: "保存历史资料" }));
    await waitFor(() =>
      expect(
        demoRepository.read().students.find((item) => item.id === student.id),
      ).toMatchObject({
        legacyComplaints: "2",
        monthlyRecords: student.monthlyRecords,
      }),
    );
    expect(
      demoRepository
        .read()
        .events.some(
          (event) =>
            event.studentId === student.id &&
            event.content.includes("核对旧表"),
        ),
    ).toBe(true);
  });
  it("历史填写后关闭可继续保留内容", async () => {
    const close = vi.fn();
    mount(
      <StudentHistoryEditor
        student={demoRepository.read().students[0]}
        onClose={close}
      />,
    );
    change("投诉记录（次数）", "4");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(
      screen.getByRole("dialog", { name: "放弃未保存的内容？" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续填写" }));
    expect(
      (screen.getByLabelText("投诉记录（次数）") as HTMLInputElement).value,
    ).toBe("4");
    expect(close).not.toHaveBeenCalled();
  });
});
