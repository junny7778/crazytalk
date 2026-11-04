import type { Feedback } from "@crazytalk/shared";
export type FeedbackHistoryEntry = Feedback["followUps"][number];
export type FeedbackHistoryChange = NonNullable<
  FeedbackHistoryEntry["changes"]
>[number];

// Only recognize complete snapshots produced by the previous implementation.
function legacyChanges(
  entry: FeedbackHistoryEntry,
): FeedbackHistoryChange[] | undefined {
  const customer = entry.section === "客服处理";
  if (!customer && entry.section !== "TM跟进") return;
  const separator = customer ? " → 进度：" : " → 客服&TM判定结果：";
  const parts = entry.content.split(separator);
  if (parts.length !== 2) return;
  const prefix = customer ? "进度：" : "客服&TM判定结果：";
  const pattern = customer
    ? /^进度：([^；\n]*)；结果：([^；\n]*)；备注：([\s\S]*)$/
    : /^客服&TM判定结果：([^；\n]*)；TM判定：([^；\n]*)；日期：([^；\n]*)；跟进：([\s\S]*)$/;
  const before = parts[0].match(pattern);
  const after = (prefix + parts[1]).match(pattern);
  if (!before || !after) return;
  const fields = customer
    ? ["处理进度", "处理结果", "客服备注"]
    : ["客服&TM判定结果", "TM判定", "TM处理日期", "TM跟进"];
  return fields
    .map((field, index) => ({
      field,
      before: before[index + 1],
      after: after[index + 1],
    }))
    .filter((change) => change.before !== change.after);
}
export function feedbackHistoryItems(entries: FeedbackHistoryEntry[]) {
  return entries
    .flatMap((entry, index) => {
      const changes =
        entry.changes?.filter((change) => change.before !== change.after) ??
        legacyChanges(entry);
      if (changes && !changes.length) return [];
      return [{ ...entry, changes, index }];
    })
    .sort((a, b) => {
      const left = Date.parse(a.date),
        right = Date.parse(b.date);
      return Number.isFinite(left) && Number.isFinite(right)
        ? right - left || b.index - a.index
        : b.index - a.index;
    });
}
export function feedbackHistoryTime(value: string) {
  if (!value) return "时间未记录";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
