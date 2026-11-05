import type { Lesson } from "@crazytalk/shared";
import { lessonStart } from "./lessonOrder";
export const syncManagementPath = "/settings?tab=classin";
export function lessonSyncPath(id: string) {
  return `${syncManagementPath}&lesson=${encodeURIComponent(id)}`;
}
export function missingAttendanceData(
  lesson: Lesson,
  now = Date.now(),
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
