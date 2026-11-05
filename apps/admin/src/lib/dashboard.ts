import { recordAttendance } from "./lessonAttendance";
import { addDays, DEMO_TODAY, type Lesson } from "@crazytalk/shared";

export function periodRange(period: string) {
  const day = new Date(`${DEMO_TODAY}T12:00:00Z`).getUTCDay();
  const start =
    period === "今天"
      ? DEMO_TODAY
      : period === "本月"
        ? `${DEMO_TODAY.slice(0, 7)}-01`
        : addDays(DEMO_TODAY, -((day + 6) % 7));
  const end =
    period === "本月"
      ? new Date(
          Date.UTC(
            Number(DEMO_TODAY.slice(0, 4)),
            Number(DEMO_TODAY.slice(5, 7)),
            0,
          ),
        )
          .toISOString()
          .slice(0, 10)
      : period === "今天"
        ? DEMO_TODAY
        : addDays(start, 6);
  return { start, end };
}

export function occurred(l: Lesson) {
  return (
    l.date < DEMO_TODAY || (l.date === DEMO_TODAY && l.status !== "未开始")
  );
}

export function attendanceSummary(lessons: Lesson[]) {
  const eligible = lessons.filter((l) => occurred(l) && l.status !== "已取消");
  const known = eligible.filter(
    (l) => Boolean(l.studentIn) || l.attendance === "学员缺席",
  );
  const present = known.filter((l) => Boolean(l.studentIn)).length;
  const absent = known.filter((l) => !l.studentIn);
  const byStudent = new Map<string, Lesson[]>();
  for (const lesson of eligible) {
    const list = byStudent.get(lesson.studentId) || [];
    list.push(lesson);
    byStudent.set(lesson.studentId, list);
  }
  const consecutive = [...byStudent.entries()]
    .filter(([, list]) => {
      const latest = [...list].sort(
        (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
      );
      return (
        latest.length >= 2 &&
        latest
          .slice(0, 2)
          .every((l) => l.attendance === "学员缺席" && !l.studentIn)
      );
    })
    .map(([id]) => id);
  return {
    present,
    expected: known.length,
    absent: absent.length,
    absentStudents: new Set(absent.map((l) => l.studentId)).size,
    consecutive,
    unknown: eligible.length - known.length,
    rate: known.length ? Math.round((present / known.length) * 100) : null,
  };
}

export function courseAnomalies(lessons: Lesson[], now = Date.now()) {
  const eligible = lessons.filter(occurred);
  const labels = eligible
    .filter((lesson) => lesson.status !== "已取消")
    .map((lesson) => recordAttendance(lesson, now));
  const anomalies: { name: string; count: number; filter: Record<string, string> }[] = [
    {
      name: "课程取消",
      count: eligible.filter((lesson) => lesson.status === "已取消").length,
      filter: { status: "已取消" },
    },
    ...["学员缺席", "学员迟到", "学员早退", "老师缺席", "老师迟到", "老师早退"].map((name) => ({
      name,
      count: labels.filter((tags) => tags.includes(name)).length,
      filter: { attendance: name },
    })),
  ];
  return {
    anomalies,
    pending: labels.filter((tags) => tags.includes("待核实")).length,
  };
}

export function bookingSummary(lessons: Lesson[], start: string, end: string) {
  const items = lessons.filter((lesson) => lesson.date >= start && lesson.date <= end);
  const count = (status: Lesson["status"]) => items.filter((lesson) => lesson.status === status).length;
  const cancelled = count("已取消");
  return {
    total: items.length,
    upcoming: count("未开始"),
    completed: count("已完成"),
    pending: count("待确认"),
    absent: count("缺席"),
    cancelled,
    cancellationRate: items.length ? Math.round(cancelled / items.length * 1000) / 10 : null,
  };
}
