import type { Lesson } from "@crazytalk/shared";

export function calendarLessonStatus(status: Lesson["status"]) {
  return status === "待确认" ? "待核实" : status;
}

export function CalendarStatusLegend({ lessons, availability = false }: { lessons: Lesson[]; availability?: boolean }) {
  const statuses = [...new Set(lessons.map((lesson) => lesson.status))];
  return (
    <div className="calendar-status-legend" aria-label="课程状态图例">
      {availability && <><span data-availability="available">可排课</span><span data-availability="unavailable">不可安排</span></>}
      {statuses.map((status) => (
        <span key={status} data-status={status}>{calendarLessonStatus(status)}</span>
      ))}
      {availability && <small>空档按每节 25 分钟展示，实际排课按所选时长校验。</small>}
    </div>
  );
}
