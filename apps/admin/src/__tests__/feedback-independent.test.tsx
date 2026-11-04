// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { createSeed } from "../../../../packages/shared/src/seed";
import { transition } from "../../../../packages/shared/src/domain";
import Feedback from "../pages/operations/Feedback";
import { exportCsv } from "../pages/operations/common";

vi.mock("../pages/operations/common", async (original) => ({
  ...(await original<typeof import("../pages/operations/common")>()),
  exportCsv: vi.fn(),
}));
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

describe("独立反馈验收：关键边界", () => {
  it("追加跟进可从列表全文搜索定位", () => {
    const record = demoRepository.read().feedback[0];
    demoRepository.execute({
      type: "feedback.followUp",
      id: record.id,
      section: "客服处理",
      content: "独立验收回访暗号 ZebraQ72",
    });
    mount();
    fireEvent.change(
      screen.getByRole("textbox", { name: "搜索学员、老师、反馈或跟进内容" }),
      { target: { value: "ZebraQ72" } },
    );
    expect(screen.getByText("共 1 条反馈")).toBeTruthy();
  });
  it("项目筛选采用反馈保存的历史快照，不随学员当前项目漂移", () => {
    const data = demoRepository.read();
    const record = data.feedback[0];
    const student = data.students.find((s) => s.id === record.studentId)!;
    student.project = "独立验收新项目";
    expect(record.source).not.toBe("独立验收新项目");
    mount("/feedback?project=" + encodeURIComponent("独立验收新项目"));
    expect(screen.getByText("共 0 条反馈")).toBeTruthy();
  });
  it("编辑已有资料时保留明确空白的教务字段，不从学员补写", async () => {
    const record = demoRepository.read().feedback[0];
    record.owner = "";
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "编辑反馈资料" }));
    expect(screen.getByRole("combobox", { name: "教务" }).textContent).toBe(
      "选择教务",
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "学员反馈（原话）" }),
      { target: { value: "仅补充原话，教务保持未填写" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "保存反馈" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "编辑反馈资料" })).toBeNull(),
    );
    const saved = demoRepository
      .refresh()
      .feedback.find((f) => f.id === record.id)!;
    expect(saved.owner).toBe("");
    expect(saved.content).toBe("仅补充原话，教务保持未填写");
  });
  it("截图通过文件输入保存，刷新数据后详情可再次预览图片内容", async () => {
    const record = demoRepository.read().feedback[0];
    const jpeg = "data:image/jpeg;base64,/9j/2Q==";
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 1600, height: 800, close }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(jpeg);
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "编辑反馈资料" }));
    fireEvent.change(screen.getByLabelText("反馈截图"), {
      target: {
        files: [
          new File(["image payload"], "独立课堂.png", { type: "image/png" }),
        ],
      },
    });
    await screen.findByRole("button", { name: "预览 独立课堂.png" });
    expect(close).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "保存反馈" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "编辑反馈资料" })).toBeNull(),
    );
    expect(
      demoRepository.refresh().feedback.find((f) => f.id === record.id)
        ?.screenshots,
    ).toEqual([
      expect.objectContaining({ name: "独立课堂.png", dataUrl: jpeg }),
    ]);
    cleanup();
    mount(`/feedback/${record.id}`);
    expect(
      screen.getByRole("img", { name: "独立课堂.png" }).getAttribute("src"),
    ).toBe(jpeg);
    fireEvent.click(screen.getByRole("button", { name: "预览 独立课堂.png" }));
    expect(
      screen.getByRole("img", { name: "反馈截图预览" }).getAttribute("src"),
    ).toBe(jpeg);
  });
  it("拒绝不支持截图格式且不改变已有截图", async () => {
    const record = demoRepository.read().feedback[0];
    mount(`/feedback/${record.id}`);
    fireEvent.click(screen.getByRole("button", { name: "编辑反馈资料" }));
    fireEvent.change(screen.getByLabelText("反馈截图"), {
      target: {
        files: [new File(["<svg/>"], "不支持.svg", { type: "image/svg+xml" })],
      },
    });
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("JPG、PNG 或 WebP");
    expect(
      demoRepository.read().feedback.find((f) => f.id === record.id)
        ?.screenshots,
    ).toEqual([]);
  });
  it("导出保持原表A:U顺序，客服进度/结果与两类TM字段独立输出", () => {
    const record = demoRepository.read().feedback[0];
    demoRepository.execute({
      type: "feedback.customer",
      id: record.id,
      progress: "已处理",
      result: "处理失败",
      note: "客服原始备注",
    });
    demoRepository.execute({
      type: "feedback.tm",
      id: record.id,
      jointVerdict: "三星",
      result: "处理成功",
      date: "2026-10-30",
      note: "TM原始记录",
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "导出数据" }));
    const rows = vi.mocked(exportCsv).mock.calls.at(-1)![1];
    expect(rows[0]).toEqual([
      "反馈日期",
      "项目/渠道",
      "教务",
      "学员名称",
      "反馈阶段",
      "反馈等级",
      "一级分类",
      "二级分类",
      "三级分类",
      "评价分类",
      "学员反馈（原话）",
      "老师名字 Tutor Name",
      "SO",
      "客服处理进度",
      "客服备注",
      "客服处理结果",
      "截图",
      "客服&TM判定结果",
      "TM判定",
      "TM处理日期",
      "TM跟进记录",
    ]);
    const row = rows.find((r) => r[14] === "客服原始备注")!;
    expect(row).toHaveLength(21);
    expect(row.slice(13)).toEqual([
      "已处理",
      "客服原始备注",
      "处理失败",
      "",
      "三星",
      "处理成功",
      "2026-10-30",
      "TM原始记录",
    ]);
  });
  it("重复事件扣款不会重复累计，非扣款措施仍可追加且历史不覆盖", () => {
    let data = createSeed();
    const f = data.feedback[0];
    data.actions = [];
    const command = {
      type: "feedback.measures" as const,
      id: f.id,
      measures: ["扣款", "培训"],
      amount: 50,
      deductionConfirmed: false,
      separateDeduction: false,
      note: "首轮处理",
    };
    data = transition(data, command).data;
    data = transition(data, { ...command, note: "第二轮补充" }).data;
    expect(data.actions.filter((a) => a.type === "扣款")).toHaveLength(1);
    expect(data.actions.filter((a) => a.type === "培训")).toHaveLength(2);
    const saved = data.feedback.find((r) => r.id === f.id)!;
    expect(saved.followUps.map((h) => h.content).join("\n")).toContain(
      "首轮处理",
    );
    expect(saved.followUps.map((h) => h.content).join("\n")).toContain(
      "第二轮补充",
    );
    expect(
      saved.followUps.every(
        (h) => h.operator && Number.isFinite(Date.parse(h.date)),
      ),
    ).toBe(true);
    data = transition(data, {
      ...command,
      separateDeduction: true,
      note: "确认另一个事件",
    }).data;
    expect(data.actions.filter((a) => a.type === "扣款")).toHaveLength(2);
  });
  it("课程入口预填当前课程和老师，同时提供完整原始资料表单", () => {
    const data = demoRepository.read();
    const lesson = data.lessons[0];
    mount(`/feedback?new=1&student=${lesson.studentId}&lesson=${lesson.id}`);
    expect(screen.getByRole("dialog", { name: "登记反馈" })).toBeTruthy();
    for (const label of [
      "反馈日期",
      "项目／渠道",
      "教务",
      "学员",
      "老师",
      "SO",
      "关联课程",
      "反馈阶段",
      "反馈等级",
      "评价分类",
      "一级分类",
      "二级分类",
      "三级分类",
      "学员反馈（原话）",
      "截图",
    ])
      expect(
        screen.getAllByText(label, { exact: true }).length,
      ).toBeGreaterThan(0);
    const course = screen.getByRole("combobox", { name: "关联课程" });
    expect(course.textContent).toContain(lesson.date);
    expect(course.textContent).toContain(lesson.time);
  });
});
