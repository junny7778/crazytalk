import type { DemoState } from "./model";

// One-time recovery requested for this local demo record; never reset unrelated data.
export function restoreLessonSyncNotice(data: DemoState): boolean {
  const matches = data.lessons.filter(
    (lesson) =>
      lesson.date === "2026-10-27" &&
      lesson.time === "19:30" &&
      data.students.some(
        (student) =>
          student.id === lesson.studentId && student.name === "Nancy",
      ) &&
      data.teachers.some(
        (teacher) =>
          teacher.id === lesson.teacherId && teacher.name === "T. Carol",
      ),
  );
  if (matches.length !== 1) return false;
  matches[0].sync = "未同步";
  matches[0].syncReason = "课程时间还未更新到 ClassIn，请重新更新。";
  return true;
}
