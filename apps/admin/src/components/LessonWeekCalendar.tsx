import { CourseWeekNavigation } from "./CourseCalendarControls";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { addDays, DEMO_TODAY, type Lesson } from "@crazytalk/shared";
import { lessonEnd } from "./StudentLessonDrawer";
import {
  CalendarStatusLegend,
  calendarLessonStatus,
} from "./CalendarStatusLegend";
import "./student-courses.css";
import "./weekly-calendar.css";
const timeMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export default function LessonWeekCalendar({
  lessons,
  label,
  onOpen,
  available,
  filters,
}: {
  filters?: ReactNode;
  lessons: Lesson[];
  label: (lesson: Lesson) => string;
  onOpen: (id: string) => void;
  available?: (date: string, time: string) => boolean;
}) {
  const [week, setWeek] = useState(() =>
    addDays(
      DEMO_TODAY,
      -((new Date(`${DEMO_TODAY}T12:00:00Z`).getUTCDay() + 6) % 7),
    ),
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weekly = lessons.filter((l) => l.date >= week && l.date <= days[6]);
  const firstLessonMinute = Math.min(
    ...weekly.map((lesson) => timeMinutes(lesson.time)),
  );
  const startHour = Math.min(8, Math.floor(firstLessonMinute / 60));
  const endHour = Math.max(
    22,
    ...weekly.map((l) => Math.ceil((timeMinutes(l.time) + l.duration) / 60)),
  );
  const scroll = useRef<HTMLDivElement>(null);
  const visibleLessonIds = weekly.map((lesson) => lesson.id).join(",");
  useLayoutEffect(() => {
    if (scroll.current) {
      scroll.current.scrollTop = Number.isFinite(firstLessonMinute)
        ? (firstLessonMinute - startHour * 60) * 2
        : 0;
    }
  }, [week, firstLessonMinute, startHour, visibleLessonIds]);
  return (
    <>
      <div className="sc-filters sc-calendar-filters">
        <CourseWeekNavigation
          week={week}
          onChange={(value) => {
            setWeek(value);
          }}
        />
        {filters}
      </div>
      <div className="sc-calendar-scroll" ref={scroll}>
        <div className="sc-calendar" role="region" aria-label="课程周历">
          <div className="sc-time-head">时间</div>
          {days.map((day, index) => (
            <div
              key={day}
              className={`sc-day-head ${day === DEMO_TODAY ? "sc-today" : ""}`}
            >
              <strong>
                {
                  ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][
                    index
                  ]
                }
              </strong>
              <span>{day.slice(5)}</span>
            </div>
          ))}
          <div
            className="sc-time-axis"
            style={{ height: (endHour - startHour) * 120 }}
          >
            {Array.from({ length: endHour - startHour }, (_, index) => (
              <span key={index} style={{ top: index * 120 }}>
                {String(startHour + index).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((day) => {
            const daily = weekly
              .filter((lesson) => lesson.date === day)
              .sort((a, b) => a.time.localeCompare(b.time));
            const groups: Lesson[][] = [];
            let groupEnd = -1;
            for (const lesson of daily) {
              const start = timeMinutes(lesson.time);
              if (start >= groupEnd) {
                groups.push([]);
                groupEnd = -1;
              }
              groups[groups.length - 1].push(lesson);
              groupEnd = Math.max(groupEnd, start + lesson.duration);
            }
            const layouts = groups.map((group) => {
              const placed: { lesson: Lesson; lane: number }[] = [];
              const laneEnds: number[] = [];
              for (const lesson of group) {
                const start = timeMinutes(lesson.time);
                let lane = laneEnds.findIndex((end) => end <= start);
                if (lane < 0) lane = laneEnds.length;
                laneEnds[lane] = start + lesson.duration;
                placed.push({ lesson, lane });
              }
              const start = timeMinutes(group[0].time);
              const end = Math.max(
                ...group.map((l) => timeMinutes(l.time) + l.duration),
              );
              return {
                group,
                placed,
                lanes: laneEnds.length,
                start,
                end,
              };
            });
            return (
              <div
                className="sc-calendar-day"
                key={day}
                style={{ height: (endHour - startHour) * 120 }}
              >
                {available &&
                  Array.from({ length: (endHour - startHour) * 2 }, (_, i) => {
                    const minute = startHour * 60 + i * 30;
                    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
                    const open = available(day, time);
                    return (
                      <div
                        key={time}
                        className={`sc-availability ${open ? "available" : "unavailable"}`}
                        aria-label={`${day} ${time} ${open ? "可排课（25分钟）" : "不可安排"}`}
                        style={{
                          position: "absolute",
                          top: i * 60,
                          height: 60,
                          left: 0,
                          right: 0,
                        }}
                      />
                    );
                  })}
                {layouts.map(({ group, placed, lanes, start, end }) => (
                  <div
                    key={group[0].id}
                    className="sc-course-group"
                    style={{
                      position: "absolute",
                      top: (start - startHour * 60) * 2,
                      left: 0,
                      right: 0,
                      height: Math.max((end - start) * 2, 72),
                    }}
                  >
                    {placed.map(({ lesson, lane }) => (
                      <button
                        key={lesson.id}
                        aria-label={`查看课程 ${label(lesson)}`}
                        data-status={lesson.status}
                        className={`sc-calendar-lesson ${lesson.status === "已取消" ? "sc-cancelled" : lesson.status === "已完成" ? "sc-completed" : ""} ${lesson.duration < 35 ? "sc-calendar-lesson-compact" : ""}`}
                        onClick={() => onOpen(lesson.id)}
                        style={{
                          top: (timeMinutes(lesson.time) - start) * 2,
                          height: Math.max(lesson.duration * 2 - 4, 44),
                          left: `calc(${(lane / lanes) * 100}% + 3px)`,
                          width: `calc(${100 / lanes}% - 6px)`,
                        }}
                      >
                        <strong>
                          {lesson.time}–
                          {lessonEnd(lesson.time, lesson.duration)}
                        </strong>
                        <span>
                          {label(lesson)} ·{" "}
                          {calendarLessonStatus(lesson.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <CalendarStatusLegend lessons={weekly} availability={!!available} />{" "}
    </>
  );
}
