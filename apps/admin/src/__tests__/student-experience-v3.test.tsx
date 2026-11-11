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
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { DEMO_TODAY } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import App from "../App";
import { studentActivities } from "../lib/studentActivity";
function Path() {
  const location = useLocation();
  return (
    <output data-testid="path">
      {location.pathname}
      {location.search}
    </output>
  );
}
function mount(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
            <Path />
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
describe("学员档案内操作联动", () => {
  it("课时登记在统一记录只出现一次，打开明细不离开档案", async () => {
    const student = demoRepository.read().students[0];
    demoRepository.execute({
      type: "credit.add",
      studentId: student.id,
      units: 1.5,
      kind: "充值",
      note: "本次补充记录",
      date: DEMO_TODAY,
    });
    mount(`/students/${student.id}?tab=service`);
    const title = await screen.findByText("充值", { exact: true });
    expect(screen.getAllByText("充值", { exact: true })).toHaveLength(1);
    const article = title.closest("article");
    if (!article) throw new Error("没有服务记录");
    fireEvent.click(within(article).getByRole("button", { name: "查看详情" }));
    const drawer = await screen.findByRole("dialog", { name: "充值记录" });
    expect(within(drawer).getByText("+1.5 课时")).toBeTruthy();
    expect(within(drawer).getByText("19.5 课时")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "关闭" }));
    expect(screen.getByTestId("path").textContent).toBe(
      `/students/${student.id}?tab=service`,
    );
  });
  it("在档案内登记反馈、查看并发起关联补偿，保持原页签", async () => {
    const student = demoRepository.read().students[0];
    mount(`/students/${student.id}?tab=service`);
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "登记反馈" }))[0],
    );
    const editor = await screen.findByRole("dialog", { name: "登记反馈" });
    expect(
      (
        within(editor).getByRole("combobox", {
          name: "学员",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.change(
      within(editor).getByRole("textbox", { name: "学员反馈（原话）" }),
      { target: { value: "档案内反馈测试" } },
    );
    fireEvent.click(within(editor).getByRole("button", { name: "保存反馈" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "登记反馈" })).toBeNull(),
    );
    const record = demoRepository
      .read()
      .feedback.find((item) => item.content === "档案内反馈测试");
    expect(record?.studentId).toBe(student.id);
    const text = await screen.findByText("档案内反馈测试", { exact: true });
    const article = text.closest("article");
    if (!article) throw new Error("没有反馈记录");
    fireEvent.click(within(article).getByRole("button", { name: "查看详情" }));
    const detail = await screen.findByRole("dialog", { name: "反馈详情" });
    fireEvent.click(within(detail).getByRole("button", { name: "登记补偿" }));
    const compensation = await screen.findByRole("dialog", {
      name: "登记补偿课时",
    });
    expect(
      within(compensation).getByRole("combobox", { name: "关联反馈" })
        .textContent,
    ).toContain("档案内反馈测试");
    change("课时数", "2");
    change("备注 / 原因", "沟通后补偿");
    fireEvent.click(
      within(compensation).getByRole("button", { name: "确认加 2 课时" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "登记补偿课时" })).toBeNull(),
    );
    expect(demoRepository.read().credits[0]).toMatchObject({
      feedbackId: record?.id,
      type: "补偿",
      units: 2,
    });
    expect(screen.getByTestId("path").textContent).toBe(
      `/students/${student.id}?tab=service`,
    );
  });
  it("隐藏转介绍入口，历史关联流水仍可追溯", async () => {
    const [student, referrer] = demoRepository.read().students;
    demoRepository.execute({
      type: "referral.add",
      studentId: student.id,
      referrerStudentId: referrer.id,
      date: DEMO_TODAY,
      note: "已登记介绍关系",
    });
    const referral = demoRepository.read().referrals[0];
    demoRepository.execute({
      type: "credit.add",
      studentId: referrer.id,
      units: 3,
      kind: "充值",
      note: "关系关联充值",
      referralId: referral.id,
      date: DEMO_TODAY,
    });
    mount(`/students/${student.id}?tab=credits`);
    await screen.findByRole("tab",{name:"课时与续费"});
    expect(screen.queryByRole("button",{name:"登记转介绍"})).toBeNull();
    expect(demoRepository.read().credits.find(c=>c.referralId===referral.id)?.units).toBe(3);
  });
  it("新换师记录不会隐藏原表换师历史，操作记录也不重复", () => {
    const data = demoRepository.read();
    const student = data.students[0];
    student.teacherChanges = [
      {
        id: "old",
        date: "2025-06-01",
        fromTeacher: "历史老师甲",
        toTeacher: "历史老师乙",
        reason: "原表记录",
      },
      {
        id: "new",
        date: DEMO_TODAY,
        fromTeacher: "历史老师乙",
        toTeacher: "现任老师",
        reason: "本次沟通",
      },
    ];
    data.events.push({
      id: "teacher-event",
      date: DEMO_TODAY,
      type: "换老师",
      content: "由 现任老师 接手 2 节课，本次沟通",
      operator: "Rita",
      studentId: student.id,
      teacherId: "",
    });
    const activities = studentActivities(data, student.id).filter(
      (item) => item.type === "换老师",
    );
    expect(activities).toHaveLength(2);
    expect(activities.some((item) => item.content.includes("原表记录"))).toBe(
      true,
    );
    expect(activities.some((item) => item.content.includes("本次沟通"))).toBe(
      true,
    );
  });
  it("详情内切日历并打开课程，关闭后仍保留日历", async () => {
    mount("/students/s1?tab=courses");
    fireEvent.click(await screen.findByRole("button", { name: "日历" }));
    const courses = screen.getAllByRole("button", { name: /^查看课程/ });
    fireEvent.click(courses[0]);
    const detail = await screen.findByRole("dialog", { name: "课程详情" });
    expect(within(detail).getByText("上课时间")).toBeTruthy();
    fireEvent.click(within(detail).getAllByRole("button", { name: "关闭" })[0]);
    expect(
      screen.getByRole("button", { name: "日历" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("path").textContent).toBe(
      "/students/s1?tab=courses",
    );
  });
});
