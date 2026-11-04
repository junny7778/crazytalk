// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { StudentLessonDrawer } from "../components/StudentLessonDrawer";
import App from "../App";

function mount(path: string, child: React.ReactNode = <App />) {
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

describe("学员事件驱动档案体验", () => {
  it("学员反馈侧栏只读，处理入口直接打开同一条反馈", async () => {
    const feedback = demoRepository
      .read()
      .feedback.find((item) => item.rating === "差评")!;
    mount(`/students/${feedback.studentId}?tab=service`);
    const activity = (await screen.findByText(feedback.content)).closest(
      "article",
    )!;
    fireEvent.click(within(activity).getByRole("button", { name: "查看详情" }));
    const detail = await screen.findByRole("dialog", { name: "反馈详情" });
    expect(within(detail).getByText(feedback.content)).toBeTruthy();
    expect(within(detail).queryByRole("textbox")).toBeNull();
    expect(
      within(detail).queryByRole("button", { name: "编辑反馈" }),
    ).toBeNull();
    expect(
      within(detail).queryByRole("button", { name: "登记补偿" }),
    ).toBeNull();
    expect(
      within(detail).queryByRole("button", { name: "保存客服处理" }),
    ).toBeNull();
    expect(
      within(detail).getByRole("region", { name: "反馈基本信息" }),
    ).toBeTruthy();
    const processing = within(detail).getByRole("region", { name: "处理跟进" });
    expect(within(processing).getByText("客服处理进度")).toBeTruthy();
    const history = within(detail).getByRole("button", { name: "跟进历史" });
    expect(history.getAttribute("aria-expanded")).toBe("false");
    expect(
      within(detail).queryByRole("region", { name: "跟进历史" }),
    ).toBeNull();
    fireEvent.click(history);
    expect(history.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(detail).getByRole("region", { name: "跟进历史" }),
    ).toBeTruthy();
    fireEvent.click(history);
    expect(
      within(detail).queryByRole("region", { name: "跟进历史" }),
    ).toBeNull();
    fireEvent.click(
      within(detail).getByRole("button", { name: "前往反馈处理" }),
    );
    await screen.findByRole("button", { name: "保存客服处理" });
    expect(screen.queryByRole("dialog", { name: "反馈详情" })).toBeNull();
    expect(screen.getAllByText(feedback.content).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "返回反馈列表" })).toBeTruthy();
  });
  it("服务记录按可见明细计数，点击分类筛选并可恢复全部", async () => {
    const data = demoRepository.read();
    const feedback = data.feedback.find((item) => item.rating === "差评")!;
    data.feedback.push({
      ...feedback,
      id: "service-scope-praise",
      rating: "好评",
      content: "服务范围测试好评",
    });
    mount(`/students/${feedback.studentId}?tab=service`);
    const filters = await screen.findByRole("group", { name: "服务记录筛选" });
    const feedbackCount = data.feedback.filter(
      (item) => item.studentId === feedback.studentId,
    ).length;
    expect(
      within(filters).getByRole("button", { name: `反馈 ${feedbackCount} 次` }),
    ).toBeTruthy();
    expect(
      within(filters).queryByRole("button", { name: /^投诉 / }),
    ).toBeNull();
    fireEvent.click(within(filters).getByRole("button", { name: /^反馈 / }));
    expect(screen.getByText("服务范围测试好评")).toBeTruthy();
    expect(screen.getAllByText("学员反馈").length).toBeGreaterThan(0);
    expect(screen.queryByText("初始课时登记")).toBeNull();
    expect(
      screen.getAllByText(`负责教务：${feedback.owner}`).length,
    ).toBeGreaterThan(0);
    if (
      data.events.some(
        (item) => item.studentId === feedback.studentId && item.type === "回访",
      )
    ) {
      fireEvent.click(within(filters).getByRole("button", { name: /^回访 / }));
      expect(screen.queryByText("学员反馈")).toBeNull();
      expect(screen.getByText("回访记录")).toBeTruthy();
    } else {
      expect(
        within(filters).queryByRole("button", { name: /^回访 / }),
      ).toBeNull();
    }
    fireEvent.click(within(filters).getByRole("button", { name: /^全部 / }));
    expect(screen.getAllByText("学员反馈").length).toBeGreaterThan(0);
    expect(screen.queryByText("初始课时登记")).toBeNull();
    expect(
      within(filters).queryByRole("button", { name: /^老师缺席 / }),
    ).toBeNull();
    expect(
      within(filters).queryByRole("button", { name: / 0 次$/ }),
    ).toBeNull();
  });
  it("页头标注渠道并将状态放在姓名旁，业务操作集中在对应模块", async () => {
    const learner = demoRepository.read().students[0];
    mount(`/students/${learner.id}`);
    const heading = await screen.findByRole("heading", {
      name: learner.name,
      level: 1,
    });
    const header = heading.closest("header");
    if (!header) throw new Error("缺少学员页头");
    expect(heading.parentElement?.textContent).toContain("正常");
    expect(header.textContent).toContain(`渠道：${learner.channel}`);
    expect(header.textContent).toContain(`负责教务：${learner.owner}`);
    expect(
      within(header).getByRole("button", { name: "编辑资料" }),
    ).toBeTruthy();
    for (const name of ["调课", "登记反馈", "加课时", "换老师", "记录回访"])
      expect(within(header).queryByRole("button", { name })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "课程与教材进度" }));
    expect(screen.getByRole("button", { name: "换老师" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "安排课程" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
    expect(screen.queryByRole("button", { name: "换老师" })).toBeNull();
    expect(screen.getByRole("button", { name: "登记反馈" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "记录回访" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "课时、续费与转介绍" }));
    expect(screen.getByRole("button", { name: "加课时" })).toBeTruthy();
  });

  it("停课后完整查看档案与服务记录，展示原因并只提供复课入口", async () => {
    const learner = demoRepository.read().students[0];
    demoRepository.execute({
      type: "student.lifecycle",
      studentId: learner.id,
      status: "停课",
      reason: "家长申请休息两周",
    });
    demoRepository.execute({
      type: "student.lifecycle",
      studentId: learner.id,
      status: "在读",
      reason: "确认恢复",
    });
    demoRepository.execute({
      type: "student.lifecycle",
      studentId: learner.id,
      status: "停课",
      reason: "新的停课说明",
    });
    mount(`/students/${learner.id}`);
    expect(
      await screen.findByRole("heading", { name: learner.name, level: 1 }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("新的停课说明");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "办理复课" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "调课" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "服务跟进" }));
    expect(screen.getByRole("group", { name: "服务记录筛选" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "换老师" })).toBeNull();
  });

  it("档案可打开独立历史更正，不会把历史输入放回普通编辑", async () => {
    const learner = demoRepository.read().students[0];
    mount(`/students/${learner.id}`);
    fireEvent.click(await screen.findByText("更多操作"));
    fireEvent.click(
      await screen.findByRole("button", { name: "补录／更正历史资料" }),
    );
    const history = await screen.findByRole("dialog", {
      name: "补录／更正历史资料",
    });
    expect(within(history).getByLabelText("投诉记录（次数）")).toBeTruthy();
    fireEvent.click(within(history).getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    const editor = await screen.findByRole("dialog", { name: "编辑学员资料" });
    expect(within(editor).queryByLabelText("投诉记录（次数）")).toBeNull();
    expect(within(editor).queryByLabelText("总课时")).toBeNull();
  });

  it("课程内更正已有教材进度需要原因并同步当前进度，不改变余额或薪资", async () => {
    const data = demoRepository.read();
    const lesson = data.lessons.find((item) => item.status === "已完成");
    if (!lesson) throw new Error("缺少已完成课程");
    demoRepository.execute({
      type: "report.save",
      report: {
        lessonId: lesson.id,
        teacherId: lesson.teacherId,
        studentId: lesson.studentId,
        date: lesson.date,
        material: "Book",
        from: "p.1",
        to: "p.2",
        rating: 0,
        comment: "",
        suggestedLevel: "",
      },
    });
    const before = structuredClone(demoRepository.read());
    mount(
      "/students",
      <StudentLessonDrawer lessonId={lesson.id} onClose={() => {}} />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "更正教材进度" }),
    );
    fireEvent.change(screen.getByLabelText("结束页码／章节"), {
      target: { value: "p.6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存教材进度" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("进度更正原因"), {
      target: { value: "核对课堂记录" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存教材进度" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .reports.find((item) => item.lessonId === lesson.id)?.to,
      ).toBe("p.6"),
    );
    expect(demoRepository.read().students.map((item) => item.balance)).toEqual(
      before.students.map((item) => item.balance),
    );
    expect(demoRepository.read().payroll).toEqual(before.payroll);
  });
});
