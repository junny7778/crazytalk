import {
  feedbackHistoryItems,
  feedbackHistoryTime,
  type FeedbackHistoryEntry,
} from "../lib/feedbackHistory";
import "./feedback-history.css";

function historyTitle(item: ReturnType<typeof feedbackHistoryItems>[number]) {
  if (item.changes) {
    if (item.section === "TM跟进") return "记录 TM 判定";
    if (item.section === "客服处理") {
      const progress = item.changes.find(
        (change) => change.field === "处理进度",
      )?.after;
      const titles: Record<string, string> = {
        处理中: "开始处理反馈",
        已处理: "记录处理结果",
        待TM判定: "提交 TM 判定",
        待回访: "转入回访跟进",
        已完成: "完成反馈处理",
      };
      return progress ? titles[progress] || "客服处理记录" : "补充处理信息";
    }
  }
  if (item.section === "客服处理")
    return item.content.startsWith("进度：") ? "客服处理记录" : "客服跟进";
  if (item.section === "TM跟进")
    return item.content.startsWith("客服&TM判定结果：")
      ? "TM 判定记录"
      : "TM 跟进";
  return item.section;
}
export default function FeedbackHistory({
  entries,
}: {
  entries: FeedbackHistoryEntry[];
}) {
  const items = feedbackHistoryItems(entries);
  return items.length ? (
    <ol className="feedback-follow-history" aria-label="跟进时间线">
      {items.map((item) => (
        <li key={item.id}>
          <strong className="feedback-follow-title">
            {historyTitle(item)}
          </strong>
          {item.changes ? (
            item.changes.map((change) => (
              <p key={change.field}>
                {change.field}：{change.after || "已清空"}
              </p>
            ))
          ) : (
            <p>{item.content}</p>
          )}
          <small className="feedback-follow-meta">
            {feedbackHistoryTime(item.date)} · {item.operator || "操作人未记录"}
          </small>
        </li>
      ))}
    </ol>
  ) : (
    <p className="muted">暂无跟进记录</p>
  );
}
