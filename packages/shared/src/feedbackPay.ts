import type { DemoState } from "./model";
export function feedbackPayItems(
  data: DemoState,
  teacherId: string,
  month: string,
) {
  const seen = new Set<string>();
  return data.feedback
    .filter(
      (f) =>
        f.teacherId === teacherId &&
        f.tmResult === "处理成功" &&
        (f.tmDate || f.date).startsWith(month),
    )
    .sort(
      (a, b) =>
        (a.tmDate || a.date).localeCompare(b.tmDate || b.date) ||
        a.id.localeCompare(b.id),
    )
    .filter((f) => {
      if (f.rating === "差评") return true;
      if (seen.has(f.studentId)) return false;
      seen.add(f.studentId);
      return true;
    });
}
