import type { Lesson } from "@crazytalk/shared";
import { isOverdueLesson } from "./lessonOrder";

export function lessonRecordStatus(lesson: Lesson, now: number) {
  return isOverdueLesson(lesson, now) ? "待确认" : lesson.status;
}

// Persisted legacy values remain readable; the records page uses course lifecycle labels.
export function lessonStatusLabel(status: string): string {
  return status === "已完成" || status === "缺席" ? "已结束" : status;
}
