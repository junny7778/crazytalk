import { describe, expect, it } from "vitest";
import {
  feedbackHistoryItems,
  feedbackHistoryTime,
  type FeedbackHistoryEntry,
} from "./feedbackHistory";
const entry = (content: string): FeedbackHistoryEntry => ({
  id: "old",
  section: "客服处理",
  content,
  operator: "旧操作人",
  date: "2026-11-02T16:11:46.888Z",
});
describe("历史记录兼容展示", () => {
  it("隐藏完全相同的旧快照但不修改原数据，变化快照只取变化字段", () => {
    const same = entry(
      "进度：处理中；结果：未填写；备注：已核实 → 进度：处理中；结果：未填写；备注：已核实",
    );
    expect(feedbackHistoryItems([same])).toEqual([]);
    expect(same.content).toContain(" → ");
    const changed = entry(
      "进度：未填写；结果：未填写；备注：已核实 → 进度：处理中；结果：未填写；备注：已核实",
    );
    expect(feedbackHistoryItems([changed])[0].changes).toEqual([
      { field: "处理进度", before: "未填写", after: "处理中" },
    ]);
  });
  it("未知或有歧义的格式原样保留，操作人不被重写", () => {
    for (const raw of [
      "家长说：今天有进步 → 明天继续。",
      "进度：A；结果：B；备注：X → 进度：C → 进度：D；结果：E；备注：F",
    ]) {
      const source = entry(raw);
      expect(feedbackHistoryItems([source])[0]).toMatchObject({
        content: raw,
        operator: "旧操作人",
        changes: undefined,
      });
    }
  });
  it("跨天UTC时间转为本地时间，无毫秒，纯日期仍保留", () => {
    expect(feedbackHistoryTime("2026-11-02T16:11:46.888Z")).toBe(
      "2026-11-03 00:11",
    );
    expect(feedbackHistoryTime("2026-10-29")).toBe("2026-10-29");
  });
});
