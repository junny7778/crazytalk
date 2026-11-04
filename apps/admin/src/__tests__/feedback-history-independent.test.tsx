// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createSeed, transition, stateSchema } from "@crazytalk/shared";
import FeedbackHistory from "../components/FeedbackHistory";
import {
  feedbackHistoryItems,
  feedbackHistoryTime,
  type FeedbackHistoryEntry,
} from "../lib/feedbackHistory";
afterEach(cleanup);
const old = (
  content: string,
  section: FeedbackHistoryEntry["section"] = "客服处理",
): FeedbackHistoryEntry => ({
  id: "old",
  section,
  content,
  date: "2026-11-02T16:11:46.888Z",
  operator: "Original name",
});
describe("独立验收：反馈跟进历史", () => {
  it("客服/TM连续重复保存均不新增，变化只保留变化字段并持久化原操作人", () => {
    let data = createSeed();
    const record = data.feedback[0];
    const initialCount = record.followUps.length;
    const customer = {
      type: "feedback.customer" as const,
      id: record.id,
      progress: record.customerProgress,
      result: record.customerResult,
      note: record.processNote,
      operator: "验收客服",
    };
    data = transition(data, customer).data;
    expect(data.feedback[0].followUps).toHaveLength(initialCount);
    customer.note = "新的沟通说明";
    data = transition(data, customer).data;
    data = transition(data, customer).data;
    expect(data.feedback[0].followUps).toHaveLength(initialCount + 1);
    const entry = data.feedback[0].followUps.at(-1)!;
    expect(entry.operator).toBe("验收客服");
    expect(entry.changes).toEqual([
      { field: "客服备注", before: record.processNote, after: "新的沟通说明" },
    ]);
    const tm = {
      type: "feedback.tm" as const,
      id: record.id,
      jointVerdict: record.jointVerdict,
      result: record.tmResult,
      date: "",
      note: "TM新跟进",
      operator: "验收 TM",
    };
    data = transition(data, tm).data;
    const count = data.feedback[0].followUps.length;
    data = transition(data, tm).data;
    expect(data.feedback[0].followUps).toHaveLength(count);
    expect(data.feedback[0].followUps.at(-1)?.operator).toBe("验收 TM");
    expect(
      stateSchema.parse(JSON.parse(JSON.stringify(data))).feedback[0].followUps,
    ).toEqual(data.feedback[0].followUps);
  });
  it("追加原文/操作者保留，不把反馈负责人或 Rita 当作实际操作者", () => {
    const data = createSeed(),
      record = data.feedback[0];
    const result = transition(data, {
      type: "feedback.followUp",
      id: record.id,
      section: "客服处理",
      content: "沟通原话：\n家长同意观察一周。",
      operator: "当前客服",
    }).data;
    expect(result.feedback[0].followUps.at(-1)).toMatchObject({
      content: "沟通原话：\n家长同意观察一周。",
      operator: "当前客服",
    });
    expect(
      transition(data, {
        type: "feedback.followUp",
        id: record.id,
        section: "客服处理",
        content: "无账号记录",
      }).data.feedback[0].followUps.at(-1)?.operator,
    ).toBe("操作人未记录");
  });
  it("旧相同快照仅展示过滤、原数组保留；旧真实变更仅显示差异，未知格式原文保留", () => {
    const same = old(
      "进度：处理中；结果：未填写；备注：相同 → 进度：处理中；结果：未填写；备注：相同",
    );
    const changed = {
      ...old(
        "进度：未填写；结果：未填写；备注：旧备注 → 进度：处理中；结果：未填写；备注：新备注",
      ),
      id: "change",
    };
    const unknown = {
      ...old("无法识别的旧跟进 → 保留\n全部内容"),
      id: "unknown",
    };
    const source = [same, changed, unknown];
    const visible = feedbackHistoryItems(source);
    expect(source).toHaveLength(3);
    expect(visible).toHaveLength(2);
    expect(visible.find((x) => x.id === "change")?.changes).toEqual([
      { field: "处理进度", before: "未填写", after: "处理中" },
      { field: "客服备注", before: "旧备注", after: "新备注" },
    ]);
    expect(visible.find((x) => x.id === "unknown")?.content).toBe(
      unknown.content,
    );
    expect(visible.find((x) => x.id === "unknown")?.changes).toBeUndefined();
  });
  it("旧TM快照识别与歧义分隔符回退保持兼容", () => {
    const unchanged = old(
      "客服&TM判定结果：三星；TM判定：处理成功；日期：2026-10-31；跟进：旧备注 → 客服&TM判定结果：三星；TM判定：处理成功；日期：2026-10-31；跟进：旧备注",
      "TM跟进",
    );
    expect(feedbackHistoryItems([unchanged])).toHaveLength(0);
    const changed = {
      ...unchanged,
      content: unchanged.content.replace(/旧备注$/, "新备注"),
    };
    expect(feedbackHistoryItems([changed])[0].changes).toEqual([
      { field: "TM跟进", before: "旧备注", after: "新备注" },
    ]);
    const ambiguous = old(
      "进度：处理中；结果：未填写；备注：用户原话 → 进度：还未核实 → 进度：处理中；结果：未填写；备注：用户原话 → 进度：还未核实",
    );
    expect(feedbackHistoryItems([ambiguous])[0].changes).toBeUndefined();
    expect(feedbackHistoryItems([ambiguous])[0].content).toBe(
      ambiguous.content,
    );
    render(<FeedbackHistory entries={[old("仅追加沟通原文")]} />);
    expect(screen.getByText("客服跟进")).toBeTruthy();
    expect(screen.getByText("仅追加沟通原文")).toBeTruthy();
  });
  it("主区只显示更新后内容、友好标题及本地时间，不显示旧值对比", () => {
    render(
      <FeedbackHistory
        entries={[
          {
            ...old("legacy content should not display"),
            changes: [
              { field: "客服备注", before: "旧内容", after: "更新后内容" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByText("补充处理信息")).toBeTruthy();
    expect(
      screen.getByText("客服备注：更新后内容").closest("details"),
    ).toBeNull();
    expect(screen.queryByText("查看修改前内容")).toBeNull();
    expect(screen.queryByText("客服备注：旧内容")).toBeNull();
    expect(screen.getByText("2026-11-03 00:11 · Original name")).toBeTruthy();
    expect(screen.queryByText("legacy content should not display")).toBeNull();
    expect(feedbackHistoryTime("2026-11-02")).toBe("2026-11-02");
  });
  it("时间线按每次进度生成动作标题，仅展示当时新值并保留最新在上", () => {
    const initial = {
      ...old("not shown"),
      id: "first",
      changes: [{ field: "处理进度", before: "", after: "处理中" }],
    };
    const later = {
      ...old("not shown"),
      id: "last",
      date: "2026-11-03T07:29:00Z",
      changes: [
        { field: "处理进度", before: "处理中", after: "已处理" },
        { field: "处理结果", before: "", after: "处理成功" },
      ],
    };
    render(<FeedbackHistory entries={[initial, later]} />);
    const items = within(
      screen.getByRole("list", { name: "跟进时间线" }),
    ).getAllByRole("listitem");
    expect(within(items[0]).getByText("记录处理结果")).toBeTruthy();
    expect(within(items[0]).getByText("处理进度：已处理")).toBeTruthy();
    expect(within(items[0]).getByText("处理结果：处理成功")).toBeTruthy();
    expect(within(items[1]).getByText("开始处理反馈")).toBeTruthy();
    expect(within(items[1]).getByText("处理进度：处理中")).toBeTruthy();
    expect(screen.queryByText(/→/)).toBeNull();
    expect(screen.queryByText(/未填写/)).toBeNull();
  });
});
