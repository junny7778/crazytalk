// Persisted legacy values remain readable; the records page uses course lifecycle labels.
export function lessonStatusLabel(status: string): string {
  return status === "已完成" || status === "缺席" ? "已结束" : status;
}
