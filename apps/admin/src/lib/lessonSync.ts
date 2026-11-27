import { operationsNow } from "@crazytalk/shared";
import type { Lesson } from "@crazytalk/shared";
import { lessonStart } from "./lessonOrder";
export const syncManagementPath = "/settings?tab=classin";
export const syncCategories = ["已确认课堂","取消已同步","同步中","同步失败","结果待核实","历史未核验"] as const;
export function lessonSyncCategory(lesson: Lesson): typeof syncCategories[number] {
  if (lesson.syncState === "completed") return lesson.status === "已取消" ? "取消已同步" : "已确认课堂";
  if (lesson.syncState === "uncertain" || lesson.syncState === "blocked") return "结果待核实";
  if (lesson.syncState === "pending" || lesson.sync === "处理中") return "同步中";
  if (lesson.syncState === "failed" || lesson.sync === "未同步") return "同步失败";
  return "历史未核验";
}
export function lessonSyncPath(id: string) {
  return `${syncManagementPath}&lesson=${encodeURIComponent(id)}`;
}
export function missingAttendanceData(
  lesson: Lesson,
  now = operationsNow(),
): boolean {
  return (
    lesson.status !== "已取消" &&
    lesson.attendance === "无数据" &&
    lessonStart(lesson) + lesson.duration * 60_000 <= now
  );
}
export function hasSyncIssue(lesson: Lesson): boolean {
  return lesson.sync === "未同步" || missingAttendanceData(lesson);
}
export function lessonSyncReason(lesson: Pick<Lesson, "syncReason">): string {
  return lesson.syncReason.trim() || "课程尚未同步到 ClassIn";
}
