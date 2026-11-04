import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import { addDays, DEMO_TODAY, type Lesson } from "@crazytalk/shared";
import { Badge, Button, EmptyState, Tabs } from "@crazytalk/ui";

const lessonStatusTone = {
  未开始: "info",
  待确认: "warning",
  已完成: "success",
  缺席: "danger",
  已取消: "neutral",
} satisfies Record<Lesson["status"], ComponentProps<typeof Badge>["tone"]>;

export default function TeacherSchedule({ teacherId }: { teacherId: string }) {
  const { data } = useDemo();
  const [hover, setHover] = useState<{
    id: string;
    left: number;
    top: number;
  } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeDetails = () => {
    closeTimer.current = setTimeout(() => setHover(null), 120);
  };
  const keepDetails = () => clearTimeout(closeTimer.current);
  const showDetails = (id: string, element: HTMLElement) => {
    keepDetails();
    const rect = element.getBoundingClientRect();
    setHover({
      id,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 276)),
      top:
        rect.bottom + 240 > window.innerHeight
          ? Math.max(8, rect.top - 230)
          : rect.bottom + 8,
    });
  };
  const detail = hover
    ? data.lessons.find((lesson) => lesson.id === hover.id)
    : undefined;
  const [view, setView] = useState("calendar");
  const [showAll, setShowAll] = useState(false);
  const [date, setDate] = useState(DEMO_TODAY.slice(0, 7) + "-01");
  const month = date.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const changeMonth = (offset: number) => {
    const next = new Date(year, monthNumber - 1 + offset, 1, 12);
    setDate(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`,
    );
  };
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const start = addDays(date, -((weekday + 6) % 7));
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const cellCount = Math.ceil((((weekday + 6) % 7) + dayCount) / 7) * 7;
  const days = Array.from({ length: cellCount }, (_, index) =>
    addDays(start, index),
  );
  const lessons = data.lessons
    .filter(
      (lesson) =>
        lesson.teacherId === teacherId &&
        (showAll || (lesson.date >= DEMO_TODAY && lesson.status === "未开始")),
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const visible = lessons.filter((lesson) => lesson.date.startsWith(month));
  const studentName = (id: string) =>
    data.students.find((student) => student.id === id)?.name || "未知学员";
  return (
    <div className="stack">
      {hover &&
        detail &&
        createPortal(
          <div
            id="teacher-lesson-tooltip"
            role="tooltip"
            className="teacher-lesson-tooltip"
            style={{ left: hover.left, top: hover.top }}
            onMouseEnter={keepDetails}
            onMouseLeave={closeDetails}
          >
            <strong>{studentName(detail.studentId)}</strong>
            <dl>
              <dt>上课时间</dt>
              <dd>
                {detail.date} {detail.time}
              </dd>
              <dt>时长</dt>
              <dd>{detail.duration} 分钟</dd>
              <dt>教材</dt>
              <dd>{detail.material || "未填写"}</dd>
              <dt>课程类型</dt>
              <dd>{detail.kind}</dd>
              <dt>课程状态</dt>
              <dd>
                <Badge tone={lessonStatusTone[detail.status]}>
                  {detail.status}
                </Badge>
              </dd>
              {detail.leaveFlag && (
                <>
                  <dt>请假提示</dt>
                  <dd>老师请假</dd>
                </>
              )}
            </dl>
          </div>,
          document.body,
        )}
      <div className="row between wrap">
        <div className="teacher-schedule-month-toolbar">
          <div className="teacher-schedule-month-nav">
            <Button
              variant="ghost"
              aria-label="上个月"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={18} />
            </Button>
            <strong aria-live="polite">
              {year}年{monthNumber}月
            </strong>
            <Button
              variant="ghost"
              aria-label="下个月"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={18} />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDate(DEMO_TODAY.slice(0, 7) + "-01")}
          >
            本月
          </Button>
          <span className="muted">共 {visible.length} 节课</span>
        </div>
        <div className="row wrap">
          <label className="select-row">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
            />
            查看已完成课程
          </label>
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: "calendar", label: "日历" },
              { value: "list", label: "列表" },
            ]}
          />
        </div>
      </div>
      {showAll && (
        <small className="muted">
          已显示全部课程状态，包括已完成、缺席和已取消课程。
        </small>
      )}
      {view === "calendar" ? (
        <div className="teacher-schedule-scroll">
          <div className="teacher-schedule-week">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(
              (label) => (
                <div className="teacher-schedule-weekday" key={label}>
                  {label}
                </div>
              ),
            )}
            {days.map((day) => (
              <section
                className={`teacher-schedule-day${day.startsWith(month) ? "" : " is-outside"}`}
                key={day}
                aria-label={`${day}课程`}
              >
                <header>
                  <span className={day === DEMO_TODAY ? "is-today" : ""}>
                    {Number(day.slice(8))}
                  </span>
                </header>
                <div className="teacher-schedule-events">
                  {visible
                    .filter((lesson) => lesson.date === day)
                    .map((lesson) => (
                      <article
                        className="teacher-schedule-event"
                        key={lesson.id}
                        tabIndex={0}
                        aria-label={`${lesson.material}课程`}
                        aria-describedby={
                          hover?.id === lesson.id
                            ? "teacher-lesson-tooltip"
                            : undefined
                        }
                        onMouseEnter={(event) =>
                          showDetails(lesson.id, event.currentTarget)
                        }
                        onMouseLeave={closeDetails}
                        onFocus={(event) =>
                          showDetails(lesson.id, event.currentTarget)
                        }
                        onBlur={closeDetails}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setHover(null);
                        }}
                      >
                        <div className="teacher-schedule-event-heading">
                          <Link to={`/students/${lesson.studentId}`}>
                            {studentName(lesson.studentId)}
                          </Link>
                          <Badge tone={lessonStatusTone[lesson.status]}>
                            {lesson.status}
                          </Badge>
                        </div>
                        <span className="teacher-schedule-event-time">
                          {lesson.time} · {lesson.duration} 分钟
                        </span>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : visible.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>学员</th>
                <th>教材</th>
                <th>时长</th>
                <th>课程类型</th>
                <th>课程状态</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lesson) => (
                <tr key={lesson.id}>
                  <td>
                    {lesson.date} {lesson.time}
                  </td>
                  <td>
                    <Link to={`/students/${lesson.studentId}`}>
                      {studentName(lesson.studentId)}
                    </Link>
                  </td>
                  <td>{lesson.material}</td>
                  <td>{lesson.duration} 分钟</td>
                  <td>{lesson.kind}</td>
                  <td>
                    <Badge tone={lessonStatusTone[lesson.status]}>
                      {lesson.status}
                    </Badge>
                    {lesson.leaveFlag && <Badge tone="warning">老师请假</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="本月暂无符合条件的课程" />
      )}
    </div>
  );
}
