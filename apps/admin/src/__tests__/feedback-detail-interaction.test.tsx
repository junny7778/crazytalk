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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Feedback from "../pages/operations/Feedback";
function mount(path = "/feedback") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/feedback/:id" element={<Feedback />} />
            </Routes>
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}

describe("反馈详情交互专项", () => {
  it("课程可独立关联、查看和解除，保留反馈原话", async () => {
    const state = demoRepository.read();
    const record = state.feedback[0];
    const lesson = state.lessons[0];
    demoRepository.execute({
      type: "feedback.edit",
      id: record.id,
      feedback: {
        ...record,
        studentId: lesson.studentId,
        teacherId: lesson.teacherId,
        lessonId: "",
      },
    });
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "关联课程" }));
    expect(screen.getByRole("dialog", { name: "关联课程" })).toBeTruthy();
    choose(
      "选择课程",
      `${lesson.date} ${lesson.time} · ${lesson.material || "未填写教材"}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存关联" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(demoRepository.read().feedback[0].lessonId).toBe(lesson.id);
    expect(demoRepository.read().feedback[0].content).toBe(record.content);
    fireEvent.click(screen.getByRole("button", { name: "查看课程" }));
    expect(screen.getByRole("dialog", { name: "关联课程详情" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(screen.getByRole("button", { name: "更换关联" }));
    choose("选择课程", "不关联具体课程");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(demoRepository.read().feedback[0].lessonId).toBe(lesson.id);
    fireEvent.click(screen.getByRole("button", { name: "更换关联" }));
    choose("选择课程", "不关联具体课程");
    fireEvent.click(screen.getByRole("button", { name: "保存关联" }));
    await waitFor(() =>
      expect(demoRepository.read().feedback[0].lessonId).toBe(""),
    );
  });
  it("同老师历史只展示其他记录，空状态不可展开", () => {
    const state = demoRepository.read();
    const record = state.feedback[0];
    demoRepository.execute({
      type: "feedback.edit",
      id: record.id,
      feedback: { ...record, teacherId: state.feedback[1].teacherId },
    });
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: /其他反馈（/ }));
    const drawer = screen.getByRole("dialog", { name: "同老师的其他反馈" });
    expect(within(drawer).queryByText(record.content)).toBeNull();
    expect(within(drawer).getByText(state.feedback[1].content)).toBeTruthy();
    cleanup();
    demoRepository.reset();
    mount(`/feedback/${record.id}`);
    expect(screen.getByText("该老师暂无其他反馈")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /其他反馈（/ })).toBeNull();
  });

  it.each([
    ["更新客服处理", "客服备注"],
    ["更新 TM 判定", "TM判定说明"],
    ["添加跟进", "追加跟进内容"],
  ])("%s 在弹窗填写，关闭丢弃草稿", (button, field) => {
    const record = demoRepository.read().feedback[0];
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: button }));
    const dialog = screen.getByRole("dialog", { name: button });
    const input = within(dialog).getByRole("textbox", { name: field });
    const original = input.getAttribute("value") || input.textContent || "";
    fireEvent.change(input, { target: { value: "弹窗未保存内容" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: button }));
    expect(
      (
        within(screen.getByRole("dialog", { name: button })).getByRole(
          "textbox",
          { name: field },
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(original);
    expect(demoRepository.read().feedback[0]).toEqual(record);
  });

  it("默认阅读、信息去重且分类用路径展示", () => {
    const record = demoRepository.read().feedback[0];
    mount(`/feedback/${record.id}`);
    const studentLink = screen.getByRole("link", { name: record.studentId });
    expect(studentLink.getAttribute("href")).toBe(`/students/${record.studentId}`);
    expect(screen.getByText("学员 ID")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByText(record.content)).toHaveLength(1);
    expect(screen.queryByRole("columnheader", { name: "一级分类" })).toBeNull();
    expect(screen.getByRole("button", { name: "更新客服处理" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "更新 TM 判定" })).toBeTruthy();
  });
  it("客服取消丢弃草稿，保存后展示结果且收起", async () => {
    const record = demoRepository.read().feedback[0];
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "更新客服处理" }));
    fireEvent.change(screen.getByRole("textbox", { name: "客服备注" }), {
      target: { value: "未保存草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取消客服编辑" }));
    expect(demoRepository.read().feedback[0].processNote).toBe(
      record.processNote,
    );
    fireEvent.click(screen.getByRole("button", { name: "更新客服处理" }));
    expect(
      (screen.getByRole("textbox", { name: "客服备注" }) as HTMLTextAreaElement)
        .value,
    ).toBe(record.processNote);
    choose("客服处理进度", "处理中");
    fireEvent.change(screen.getByRole("textbox", { name: "客服备注" }), {
      target: { value: "已联系家长" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客服处理" }));
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "客服备注" })).toBeNull(),
    );
    expect(demoRepository.read().feedback[0].processNote).toBe("已联系家长");
    expect(demoRepository.read().feedback[0].customerProgress).toBe("处理中");
  });
  it("TM独立保存不自动完成反馈，跟进可取消和追加", async () => {
    const record = demoRepository.read().feedback[0];
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "更新 TM 判定" }));
    choose("TM处理结果", "处理成功");
    fireEvent.click(screen.getByRole("button", { name: "取消 TM 编辑" }));
    expect(demoRepository.read().feedback[0].tmResult).toBe(record.tmResult);
    fireEvent.click(screen.getByRole("button", { name: "更新 TM 判定" }));
    choose("TM处理结果", "处理成功");
    fireEvent.click(screen.getByRole("button", { name: "保存 TM 判定" }));
    await waitFor(() =>
      expect(screen.queryByRole("combobox", { name: "TM处理结果" })).toBeNull(),
    );
    expect(demoRepository.read().feedback[0].tmResult).toBe("处理成功");
    expect(demoRepository.read().feedback[0].status).toBe(record.status);
    fireEvent.click(screen.getByRole("button", { name: "添加跟进" }));
    expect(
      screen.getByRole("button", { name: "保存跟进" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "追加跟进内容" }), {
      target: { value: "取消的记录" },
    });
    fireEvent.click(screen.getByRole("button", { name: "取消添加" }));
    fireEvent.click(screen.getByRole("button", { name: "添加跟进" }));
    fireEvent.change(screen.getByRole("textbox", { name: "追加跟进内容" }), {
      target: { value: "再次沟通确认" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存跟进" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "追加跟进内容" }),
      ).toBeNull(),
    );
    expect(
      demoRepository
        .read()
        .feedback[0].followUps.some(
          (entry) => entry.content === "再次沟通确认",
        ),
    ).toBe(true);
    expect(
      demoRepository
        .read()
        .feedback[0].followUps.some((entry) => entry.content === "取消的记录"),
    ).toBe(false);
  });
});

it("列表的三项操作在原行办理并写入同一条反馈", async () => {
  mount();
  const row = screen.getAllByRole("row")[1];
  const link = within(row).getByRole("link");
  const id = link.getAttribute("href")!.split("/").pop();
  for (const [button, field, save] of [
    ["客服处理", "客服备注", "保存客服处理"],
    ["TM 判定", "TM判定说明", "保存 TM 判定"],
    ["添加跟进", "追加跟进内容", "保存跟进"],
  ]) {
    fireEvent.click(within(row).getByRole("button", {name: button}));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByRole("textbox", {name: field}), {target: {value: field}});
    fireEvent.click(dialog.getByRole("button", {name: save}));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }
  const record = demoRepository.read().feedback.find(item => item.id === id)!;
  expect(record.processNote).toBe("客服备注");
  expect(record.tmNote).toBe("TM判定说明");
  expect(record.followUps.some(entry => entry.content === "追加跟进内容")).toBe(true);
  expect(screen.getByRole("columnheader", {name: "操作"})).toBeTruthy();
});

it("先按待办优先级排序再分页，状态筛选保留搜索条件，办结后移出未完成", async () => {
  const state = demoRepository.read();
  const template = state.feedback[0];
  state.feedback = Array.from({length: 28}, (_, index) => ({
    ...template, id: 'filter-' + index, content: '筛选样例' + index,
    status: index === 27 ? "待处理" : index === 26 ? "处理中" : index === 25 ? "等待判定" : "已完成",
    date: index === 25 ? "2026-10-02" : index >= 26 ? "2026-10-01" : "2026-10-31",
    customerProgress: "",
  }));
  state.feedback.push({...template, id: "excluded", content: "其他记录", status: "待处理"});
  mount("/feedback?q=筛选样例");
  const records = () => screen.getAllByRole("row").slice(1);
  expect(screen.getByRole("combobox", {name: "反馈状态"}).textContent).toContain("全部反馈状态");
  expect(records().slice(0, 3).map(row => row.querySelector(".feedback-content-preview")?.textContent)).toEqual(["筛选样例27","筛选样例25","筛选样例26"]);
  fireEvent.click(screen.getByRole("button", {name: "下一页"}));
  choose("反馈状态", "未完成");
  expect(records()).toHaveLength(3);
  fireEvent.click(within(records()[0]).getByRole("button", {name: "客服处理"}));
  choose("客服处理进度", "已完成");
  fireEvent.click(screen.getByRole("button", {name: "保存客服处理"}));
  await waitFor(() => expect(records()).toHaveLength(2));
  choose("反馈状态", "已完成");
  expect(screen.getByText("共 26 条反馈")).toBeTruthy();
});

it("看板待处理入口显示实际状态", () => {
  mount("/feedback?view=等我处理");
  expect(screen.getByRole("combobox", {name: "反馈状态"}).textContent).toContain("待处理");
});
