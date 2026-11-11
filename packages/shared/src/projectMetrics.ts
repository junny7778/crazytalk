import type { DemoState, Student } from "./model";
import { personAttendance } from "./lessonAttendance";
export function projectMetrics(
  data: DemoState,
  student: Student,
  month: string,
) {
  const history = student.monthlyRecords.find(
    (r) => r.month === month && r.planned !== null,
  );
  const project = data.catalog.find(
    (p) =>
      p.type === "项目" &&
      p.name === student.project &&
      data.catalog.some(
        (c) => c.id === p.parentId && c.name === student.channel,
      ),
  );
  const applicable = project?.targetHistory
    ?.filter((h) => h.at.slice(0, 7) <= month)
    .at(-1);
  const target =
    history?.planned ??
    applicable?.lessons ??
    (project?.targetHistory?.length ? null : (project?.monthlyLessons ?? null));
  const lessons = data.lessons.filter(
    (l) => l.studentId === student.id && l.date.startsWith(month),
  );
  const ended = lessons.filter((l) => ["已完成", "缺席"].includes(l.status));
  const present = ended.filter(
    (l) =>
      !personAttendance(l, "学员").some(
        (t) => t === "缺席" || t === "待核实",
      ) && personAttendance(l, "学员").length > 0,
  );
  const used = lessons
    .filter((l) => l.deducted)
    .reduce((n, l) => n + (l.confirmedUnits ?? 0), 0);
  return {
    id: student.id,
    name: student.name,
    target,
    used,
    expected: ended.length,
    present: present.length,
    lessons,
  };
}
