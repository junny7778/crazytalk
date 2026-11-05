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

describe("学生反馈表数字化专项", () => {
  it("列表分别展示客服与TM信息，搜索覆盖原话，显示列可调整", () => {
    mount();
    expect(screen.getByRole("columnheader", { name: "客服处理进度" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "TM 判定" })).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "搜索学员、老师、反馈或跟进内容" }),
      { target: { value: "麦克风" } },
    );
    expect(screen.getByText("共 1 条反馈")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "教务" }));
    expect(screen.getByRole("columnheader", { name: "教务" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "教务" }));
    expect(screen.queryByRole("columnheader", { name: "教务" })).toBeNull();
  });
  it("详情完整包含原表21项，客服和TM分别保存，失败结论不等同未完成，跟进可追加", async () => {
    const record = demoRepository.read().feedback[0];
    mount(`/feedback/${record.id}`);
    for (const label of ["反馈日期", "项目／渠道", "教务", "学员编号", "老师", "SO", "学员反馈（原话）"])
      expect(screen.getAllByText(label, { exact: true }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "更新客服处理" }));
    expect(screen.queryByRole("button", { name: "提交责任判定" })).toBeNull();
    choose("客服处理进度", "处理中");
    choose("客服处理结果", "处理失败");
    fireEvent.change(screen.getByRole("textbox", { name: "客服备注" }), {
      target: { value: "先核对课堂视频，等待家长补充信息" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存客服处理" }));
    await waitFor(() =>
      expect(demoRepository.read().feedback[0].customerResult).toBe("处理失败"),
    );
    expect(demoRepository.read().feedback[0].status).toBe("处理中");
    fireEvent.click(screen.getByRole("button", { name: "更新 TM 判定" }));
    choose("客服与 TM 判定等级", "三星");
    choose("TM处理结果", "处理失败");
    fireEvent.change(screen.getByLabelText("TM处理日期", { exact: true }), {
      target: { value: "2026-10-27" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "TM判定说明" }), {
      target: { value: "核实为学员端网络波动，已说明原因" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 TM 判定" }));
    await waitFor(() =>
      expect(demoRepository.read().feedback[0].tmNote).toContain("学员端网络"),
    );
    expect(demoRepository.read().feedback[0].status).toBe("处理中");
    fireEvent.click(screen.getByRole("button", { name: "添加跟进" }));
    fireEvent.change(screen.getByRole("textbox", { name: "追加跟进内容" }), {
      target: { value: "家长已收到说明，约定下次课后再回访" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存跟进" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .feedback[0].followUps.some((item) =>
            item.content.includes("约定下次"),
          ),
      ).toBe(true),
    );
  });
  it("登记保存反馈日期、阶段、等级、多项分类，并可在详情编辑补充", async () => {
    mount("/feedback?new=1");
    choose("学员", "Jayden · Crazy Talk 学习群");
    fireEvent.change(screen.getByLabelText("反馈日期", { exact: true }), {
      target: { value: "2026-10-13" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "项目／渠道" }), {
      target: { value: "黄子妈妈" },
    });
    choose("反馈阶段", "首月");
    choose("反馈等级", "二星");
    const paths = demoRepository
      .read()
      .catalog.filter((item) => item.type === "反馈分类" && item.enabled)
      .slice(0, 2)
      .map((item) => item.name.split(/\s*\/\s*/));
    for (const path of paths) {
      for (let index = 0; index < path.length; index++)
        choose(["一级分类", "二级分类", "三级分类"][index], path[index]);
      fireEvent.click(screen.getByRole("button", { name: "添加分类" }));
    }
    fireEvent.change(
      screen.getByRole("textbox", { name: "学员反馈（原话）" }),
      { target: { value: "请增加孩子开口练习的时间" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "保存反馈" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "登记反馈" })).toBeNull(),
    );
    const saved = demoRepository
      .read()
      .feedback.find((item) => item.content === "请增加孩子开口练习的时间")!;
    expect(saved).toMatchObject({
      date: "2026-10-13",
      source: "黄子妈妈",
      stage: "首月",
      grade: "二星",
    });
    expect(saved.categories).toHaveLength(2);
    fireEvent.click(
      within(
        screen.getByRole("row", { name: /请增加孩子开口练习的时间/ }),
      ).getByRole("link", { name: "查看 Jayden 的反馈" }),
    );
    await screen.findByRole("heading", { name: /Jayden 的反馈/ });
    fireEvent.click(screen.getByRole("button", { name: "编辑反馈资料" }));
    const drawer = within(screen.getByRole("dialog", { name: "编辑反馈资料" }));
    expect(
      drawer
        .getByRole("textbox", { name: "学员反馈（原话）" })
        .getAttribute("placeholder"),
    ).toBeTruthy();
    fireEvent.change(
      drawer.getByRole("textbox", { name: "学员反馈（原话）" }),
      { target: { value: "已补充家长的具体诉求" } },
    );
    fireEvent.click(drawer.getByRole("button", { name: "保存反馈" }));
    await waitFor(() =>
      expect(
        demoRepository.read().feedback.find((item) => item.id === saved.id)
          ?.content,
      ).toBe("已补充家长的具体诉求"),
    );
  });
  it("已归档好评可以追加鼓励措施，不强制走老师责任判定", async () => {
    const record = demoRepository
      .read()
      .feedback.find((item) => item.rating === "好评")!;
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "添加处理措施" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "提醒" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "鼓励" }));
    fireEvent.change(screen.getByRole("textbox", { name: "措施说明" }), {
      target: { value: "已向老师转达表扬，邀请分享教学经验" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存处理措施" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .actions.some(
            (item) => item.feedbackId === record.id && item.type === "鼓励",
          ),
      ).toBe(true),
    );
    expect(
      demoRepository.read().feedback.find((item) => item.id === record.id)
        ?.status,
    ).toBe("已完成");
  });
});
