import type { Lesson } from "@crazytalk/shared";

export function calendarLessonStatus(status: Lesson["status"]) {
  return status === "待确认" ? "待核实" : status;
}

export function CalendarStatusLegend({ lessons }: { lessons: Lesson[] }) {
  const statuses = [...new Set(lessons.map((lesson) => lesson.status))];
  return (
    <div className="calendar-status-legend" aria-label="课程状态图例">
      {statuses.map((status) => (
        <span key={status} data-status={status}>{calendarLessonStatus(status)}</span>
      ))}
    </div>
  );
}
