import type { Lesson } from "@crazytalk/shared";
export function lessonStart(lesson: Lesson): number {
  return Date.parse(`${lesson.date}T${lesson.time}:00+08:00`);
}
export function isOverdueLesson(lesson: Lesson, now: number): boolean {
  return (
    lesson.status === "未开始" &&
    lessonStart(lesson) + lesson.duration * 60_000 <= now
  );
}
export function compareLessonRecords(
  a: Lesson,
  b: Lesson,
  now: number,
): number {
  const aFuture = a.status === "未开始" && lessonStart(a) > now;
  const bFuture = b.status === "未开始" && lessonStart(b) > now;
  if (aFuture !== bFuture) return aFuture ? 1 : -1;
  const chronological = lessonStart(a) - lessonStart(b);
  return (aFuture ? chronological : -chronological) || a.id.localeCompare(b.id);
}
