import { DatePicker } from "@crazytalk/ui";
import { formatStudentProgress } from "@crazytalk/shared";
import { useId, useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  getStudentSummary,
  addDays,
  teacherName,
  type Student,
  type Lesson,
} from "@crazytalk/shared";
import { Badge, Button, EmptyState, Field, Panel, Select } from "@crazytalk/ui";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import {
  lessonEnd,
  lessonCharge,
  reportSubmittedAt,
  StudentLessonDrawer,
} from "./StudentLessonDrawer";
import "./student-courses.css";
import "./student-statistics.css";

function weekStart(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}
function timeMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
const statuses = ["未开始", "待确认", "已完成", "缺席", "已取消"];

export default function StudentCourses({
  student,
  onReschedule,
  onOpenLesson,
  onSchedule,
  onChangeTeacher,
}: {
  student: Student;
  onReschedule: (lessonId: string) => void;
  onOpenLesson?: (lessonId: string) => void;
  onSchedule?: () => void;
  onChangeTeacher?: () => void;
}) {
  const { data, can } = useDemo();
  const activeService = !["停课", "结课", "退费"].includes(student.status);
  const [month, setMonth] = useState(DEMO_TODAY.slice(0, 7));
  const [monthlyMode, setMonthlyMode] = useState<"planned" | "actual" | null>(
    null,
  );
  const monthlyDetailsId = useId();
  const [showAllMonthly, setShowAllMonthly] = useState(false);
  const [showAllProgress, setShowAllProgress] = useState(false);
  const summary = getStudentSummary(data, student.id, month);
  const monthlyLessons = (
    monthlyMode === "actual"
      ? summary.monthly.actualLessons
      : summary.monthly.lessons
  )
    .slice()
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  function toggleMonthly(mode: "planned" | "actual") {
    setMonthlyMode(monthlyMode === mode ? null : mode);
    setShowAllMonthly(false);
  }
  const historicalMonths = student.monthlyRecords.filter(
    (record) => record.month === month,
  );
  const openCourse = (id: string) =>
    onOpenLesson ? onOpenLesson(id) : setLessonId(id);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [week, setWeek] = useState(() => weekStart(DEMO_TODAY));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [status, setStatus] = useState("");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const lessons = useMemo(
    () =>
      data.lessons
        .filter((lesson) => lesson.studentId === student.id)
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [data.lessons, student.id],
  );
  const filtered = lessons.filter(
    (lesson) =>
      (view === "calendar" || !from || lesson.date >= from) &&
      (view === "calendar" || !to || lesson.date <= to) &&
      (!teacherId || lesson.teacherId === teacherId) &&
      (!status || lesson.status === status),
  );
  const weekEnd = addDays(week, 6);
  const weekly = filtered.filter(
    (lesson) => lesson.date >= week && lesson.date <= weekEnd,
  );
  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index));
  const startHour = weekly.length
    ? Math.max(
        0,
        Math.floor(
          Math.min(...weekly.map((lesson) => timeMinutes(lesson.time))) / 60,
        ) - 1,
      )
    : 9;
  const endHour = weekly.length
    ? Math.min(
        24,
        Math.ceil(
          Math.max(
            ...weekly.map(
              (lesson) => timeMinutes(lesson.time) + lesson.duration,
            ),
          ) / 60,
        ) + 1,
      )
    : 18;
  const reports = data.reports
    .filter((report) => report.studentId === student.id)
    .sort((a, b) => {
      const aLesson = lessons.find((lesson) => lesson.id === a.lessonId);
      const bLesson = lessons.find((lesson) => lesson.id === b.lessonId);
      return `${bLesson?.date || b.date}${bLesson?.time || ""}`.localeCompare(
        `${aLesson?.date || a.date}${aLesson?.time || ""}`,
      );
    });
  const latestReportLesson = reports[0]
    ? lessons.find((lesson) => lesson.id === reports[0].lessonId)
    : undefined;
  function courseLabel(lesson: Lesson) {
    return `${lesson.date} ${lesson.time} ${teacherName(data, lesson.teacherId)} ${lesson.duration}分钟 ${lesson.status}`;
  }
  const activeFilters =
    (view === "list" && (!!from || !!to)) || !!teacherId || !!status;
  function clearFilters() {
    if (view === "list") {
      setFrom("");
      setTo("");
    }
    setTeacherId("");
    setStatus("");
  }
  return (
    <div className="stack sc-courses">
      <Panel title="课程安排">
        <dl className="sc-arrangement-summary">
          <div>
            <dt>当前老师</dt>
            <dd className="row wrap">
              <strong>{summary.teacher.name || "暂未安排老师"}</strong>
              {activeService &&
                can("student.reschedule") &&
                onChangeTeacher && (
                  <Button size="sm" variant="ghost" onClick={onChangeTeacher}>
                    换老师
                  </Button>
                )}
            </dd>
          </div>
          <div>
            <dt>上课时间</dt>
            <dd>{summary.scheduleText || "暂无固定安排"}</dd>
          </div>
          <div>
            <dt>周上课频次</dt>
            <dd>{summary.frequencyText || "未填写"}</dd>
          </div>
        </dl>
      </Panel>
      <Panel
        title="课表"
        action={
          <div className="row wrap student-course-actions">
            <div className="sc-view-switch" aria-label="课程显示方式">
              <Button
                size="sm"
                aria-pressed={view === "list"}
                variant={view === "list" ? "primary" : "ghost"}
                onClick={() => setView("list")}
              >
                <List size={14} />
                列表
              </Button>
              <Button
                size="sm"
                aria-pressed={view === "calendar"}
                variant={view === "calendar" ? "primary" : "ghost"}
                onClick={() => setView("calendar")}
              >
                <CalendarDays size={14} />
                日历
              </Button>
            </div>
            {activeService && can("schedule.create") && onSchedule && (
              <Button size="sm" onClick={onSchedule}>
                安排课程
              </Button>
            )}
          </div>
        }
      >
        <div
          className={`sc-filters ${view === "calendar" ? "sc-calendar-filters" : ""}`}
        >
          {view === "calendar" && (
            <div className="sc-week-toolbar">
              <div className="row">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="上一周"
                  onClick={() => setWeek(addDays(week, -7))}
                >
                  <ChevronLeft size={15} />
                </Button>
                <strong>
                  {week} — {weekEnd}
                </strong>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="下一周"
                  onClick={() => setWeek(addDays(week, 7))}
                >
                  <ChevronRight size={15} />
                </Button>
              </div>
              <div className="row">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setWeek(weekStart(DEMO_TODAY))}
                >
                  回到本周
                </Button>
              </div>
            </div>
          )}

          {view === "list" && (
            <>
              <Field label="上课日期（起始）">
                <DatePicker
                  mode="date"
                  placeholder="上课日期（起始）"
                  value={from}
                  onValueChange={(nextValue) => setFrom(nextValue)}
                />
              </Field>
              <Field label="上课日期（结束）">
                <DatePicker
                  mode="date"
                  placeholder="上课日期（结束）"
                  min={from || undefined}
                  value={to}
                  onValueChange={(nextValue) => setTo(nextValue)}
                />
              </Field>
            </>
          )}
          <Field label="上课老师">
            <Select value={teacherId} onValueChange={setTeacherId}>
              <option value="">全部老师</option>
              {[...new Set(lessons.map((lesson) => lesson.teacherId))].map(
                (id) => (
                  <option key={id} value={id}>
                    {teacherName(data, id)}
                  </option>
                ),
              )}
            </Select>
          </Field>
          <Field label="课程状态">
            <Select value={status} onValueChange={setStatus}>
              <option value="">全部状态</option>
              {statuses.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </Select>
          </Field>
          {activeFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              清除筛选
            </Button>
          )}
        </div>
        {view === "list" && from && to && from > to ? (
          <p role="alert" className="danger">
            结束日期不能早于开始日期
          </p>
        ) : view === "list" ? (
          <>
            {filtered.length ? (
              <div className="table-wrap">
                <table className="sc-lesson-table">
                  <thead>
                    <tr>
                      <th>上课时间</th>
                      <th>老师</th>
                      <th>教材</th>
                      <th>状态</th>
                      <th>出勤</th>
                      <th>课时结果</th>
                      <th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((lesson) => (
                      <tr key={lesson.id}>
                        <td>
                          <button
                            className="sc-link"
                            onClick={() => openCourse(lesson.id)}
                            aria-label={`查看课程 ${courseLabel(lesson)}`}
                          >
                            {lesson.date} {lesson.time}
                          </button>
                          <small>
                            {lesson.duration} 分钟 · {lesson.kind}
                          </small>
                        </td>
                        <td>{teacherName(data, lesson.teacherId)}</td>
                        <td>{lesson.material || "未填写"}</td>
                        <td>
                          <Badge
                            tone={
                              lesson.status === "已取消"
                                ? "neutral"
                                : lesson.status === "已完成"
                                  ? "success"
                                  : "info"
                            }
                          >
                            {lesson.status}
                          </Badge>
                        </td>
                        <td>
                          {lesson.status === "未开始"
                            ? "待上课"
                            : lesson.status === "已取消"
                              ? "—"
                              : lesson.attendance}
                        </td>
                        <td>{lessonCharge(lesson)}</td>
                        <td>{lesson.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={lessons.length ? "暂无符合条件的课程" : "暂无课程安排"}
                action={
                  activeFilters ? (
                    <Button onClick={clearFilters}>清除筛选</Button>
                  ) : undefined
                }
                description={
                  activeFilters
                    ? "可以清除筛选后再查看。"
                    : "排课后，会在这里显示课程安排。"
                }
              />
            )}
          </>
        ) : (
          <>
            <div className="sc-calendar-scroll">
              <div
                className="sc-calendar"
                role="region"
                aria-label="学员课程周历"
              >
                <div className="sc-time-head">时间</div>
                {days.map((day, index) => (
                  <div
                    key={day}
                    className={`sc-day-head ${day === DEMO_TODAY ? "sc-today" : ""}`}
                  >
                    <strong>
                      {
                        [
                          "周一",
                          "周二",
                          "周三",
                          "周四",
                          "周五",
                          "周六",
                          "周日",
                        ][index]
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
                  const placed: { lesson: Lesson; lane: number }[] = [];
                  const laneEnds: number[] = [];
                  for (const lesson of daily) {
                    const start = timeMinutes(lesson.time);
                    let lane = laneEnds.findIndex((end) => end <= start);
                    if (lane < 0) lane = laneEnds.length;
                    laneEnds[lane] = start + lesson.duration;
                    placed.push({ lesson, lane });
                  }
                  const lanes = Math.max(1, laneEnds.length);
                  return (
                    <div
                      className="sc-calendar-day"
                      key={day}
                      style={{ height: (endHour - startHour) * 120 }}
                    >
                      {placed.map(({ lesson, lane }) => (
                        <button
                          key={lesson.id}
                          aria-label={`查看课程 ${courseLabel(lesson)}`}
                          data-status={lesson.status}
                          className={`sc-calendar-lesson ${lesson.status === "已取消" ? "sc-cancelled" : lesson.status === "已完成" ? "sc-completed" : ""} ${lesson.duration < 35 ? "sc-calendar-lesson-compact" : ""}`}
                          onClick={() => openCourse(lesson.id)}
                          style={{
                            top:
                              (timeMinutes(lesson.time) - startHour * 60) * 2,
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
                            {teacherName(data, lesson.teacherId)} ·{" "}
                            {lesson.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            {weekly.length === 0 && (
              <EmptyState
                title={
                  activeFilters ? "该周暂无符合条件的课程" : "该周暂无课程"
                }
                action={
                  activeFilters ? (
                    <Button onClick={clearFilters}>清除筛选</Button>
                  ) : undefined
                }
                description="可以切换周次，或返回列表查看其他日期。"
              />
            )}
          </>
        )}
      </Panel>
      <Panel
        title="月度上课情况"
        className="sc-monthly-panel"
        action={
          <div className="sc-month-picker">
            <Field label="统计月份">
              <DatePicker
                placeholder="统计月份"
                mode="month"
                value={month}
                onValueChange={(nextValue) => {
                  setMonth(nextValue || DEMO_TODAY.slice(0, 7));
                  setMonthlyMode(null);
                  setShowAllMonthly(false);
                }}
              />
            </Field>
          </div>
        }
      >
        <div className="sc-month-metrics">
          {(["planned", "actual"] as const).map((mode) => {
            const count = summary.monthly[mode];
            const active = monthlyMode === mode;
            return (
              <div
                key={mode}
                className={`sc-month-metric${active ? " is-active" : ""}`}
              >
                <span>{mode === "planned" ? "月应上课" : "实际上课"}</span>
                <strong>
                  {count} <small>节</small>
                </strong>
                {count > 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`${active ? "收起" : "查看"}${mode === "planned" ? "月应上课" : "实际上课"}课程`}
                    aria-expanded={active}
                    aria-controls={monthlyDetailsId}
                    onClick={() => toggleMonthly(mode)}
                  >
                    {active ? "收起课程 ▴" : "查看课程 ▾"}
                  </Button>
                ) : (
                  <span className="muted">暂无课程</span>
                )}
              </div>
            );
          })}
        </div>
        {monthlyMode && (
          <section
            id={monthlyDetailsId}
            className="sc-month-details"
            aria-label="月度课程明细"
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>上课时间</th>
                    <th>老师</th>
                    <th>时长</th>
                    <th>课程状态</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAllMonthly
                    ? monthlyLessons
                    : monthlyLessons.slice(0, 5)
                  ).map((lesson) => (
                    <tr key={lesson.id}>
                      <td>
                        {lesson.date} {lesson.time}
                      </td>
                      <td>{teacherName(data, lesson.teacherId)}</td>
                      <td>{lesson.duration} 分钟</td>
                      <td>
                        <Badge>{lesson.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {monthlyLessons.length > 5 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAllMonthly(!showAllMonthly)}
              >
                {showAllMonthly
                  ? "收起为前5节"
                  : `展开全部，共 ${monthlyLessons.length} 节`}
              </Button>
            )}
          </section>
        )}
        {historicalMonths.length > 0 && (
          <details className="student-history">
            <summary>
              查看该月历史导入数据 ·{" "}
              {historicalMonths
                .map(
                  (record) =>
                    `应上 ${record.planned === null ? "未提供" : `${record.planned} 节`}，实上 ${record.actual === null ? "未提供" : `${record.actual} 节`}`,
                )
                .join("；")}
            </summary>
            {historicalMonths.map((record) => (
              <div className="inset" key={record.id}>
                <p>月份：{record.month}</p>
                <p>
                  月应上课：
                  {record.planned === null ? "未提供" : `${record.planned} 节`}
                </p>
                <p>
                  实际上课：
                  {record.actual === null ? "未提供" : `${record.actual} 节`}
                </p>
                {record.note && <p>{record.note}</p>}
              </div>
            ))}
          </details>
        )}
      </Panel>
      <Panel title="教材与学习进度">
        <div className="sc-progress-summary">
          <span className="muted">当前学到</span>
          <strong>
            {summary.progress.material || "教材未填写"} /{" "}
            {formatStudentProgress(summary.progress.unit) || "尚未记录学习进度"}
          </strong>
          {latestReportLesson && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => openCourse(latestReportLesson.id)}
            >
              查看对应课程
            </Button>
          )}
        </div>
        <h3 className="sc-progress-heading">逐节学习记录</h3>
        {reports.length ? (
          <div className="sc-progress-list">
            {(showAllProgress ? reports : reports.slice(0, 5)).map((report) => {
              const lesson = lessons.find(
                (item) => item.id === report.lessonId,
              );
              return (
                <article key={report.id}>
                  <div className="row between">
                    <strong>
                      {lesson ? `${lesson.date} ${lesson.time}` : report.date} ·{" "}
                      {teacherName(data, report.teacherId)}
                    </strong>
                    {lesson && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => openCourse(lesson.id)}
                      >
                        查看课程
                      </Button>
                    )}
                  </div>
                  <p>
                    {report.material} /{" "}
                    {report.from
                      ? `${formatStudentProgress(report.from)} → `
                      : ""}
                    {formatStudentProgress(report.to)}
                  </p>
                  {report.screenshot && <img src={report.screenshot} width={200} alt="当节教材结束页"/>}
                  {report.comment && <p>{report.comment}</p>}
                  <small>
                    {report.rating > 0 ? `${report.rating} 分 · ` : ""}
                    {report.recordedAt
                      ? `提交于 ${reportSubmittedAt(report.recordedAt)}`
                      : `记录日期 ${report.date}`}
                  </small>
                </article>
              );
            })}
            {reports.length > 5 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAllProgress(!showAllProgress)}
              >
                {showAllProgress
                  ? "收起记录"
                  : `查看更多，共 ${reports.length} 条`}
              </Button>
            )}
          </div>
        ) : (
          <p className="muted">
            暂无逐节学习记录，老师提交课后进度后将显示在这里。
          </p>
        )}
      </Panel>
      <StudentLessonDrawer
        lessonId={lessonId}
        onClose={() => setLessonId(null)}
        onReschedule={onReschedule}
      />
    </div>
  );
}
