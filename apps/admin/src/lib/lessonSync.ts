import type { Lesson } from "@crazytalk/shared";

export const unsyncedLessonsPath = "/lessons?tab=all&view=unsynced";

export function lessonSyncReason(lesson: Pick<Lesson, "syncReason">): string {
  return lesson.syncReason.trim() || "课程尚未同步到 ClassIn";
}
