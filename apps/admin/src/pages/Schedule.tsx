import { businessMode, businessRequest } from "@crazytalk/shared/react";
import CourseSyncLink from "../components/CourseSyncLink";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../components/DataTransferButton";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link, useBlocker } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  Clock3,
} from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  overlapsLeave,
  isAvailable,
  isRegularTime,
  availabilitySummary,
  addDays,
  DEMO_TODAY,
  formatDate,
  type Lesson,
  type Teacher,
  type Command,
  getStudentScheduleProgress,
  type Student,
  type FixedPlan,
  type ScheduleIntent,
} from "@crazytalk/shared";
import {
  Select,
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  SearchInput,
  Tabs,
  useToast,
} from "@crazytalk/ui";
import "./Schedule.css";
import "../components/weekly-calendar.css";
import { CalendarStatusLegend, calendarLessonStatus } from "../components/CalendarStatusLegend";
import { FixedPlanCalendar } from "../components/scheduling/FixedPlanCalendar";
import { CustomSchedulingPanel } from "../components/scheduling/CustomSchedulingPanel";
import { StudentSchedulingPanel } from "../components/scheduling/StudentSchedulingPanel";
import { ScheduleOverview } from "../components/scheduling/ScheduleOverview";
type Slot = { date: string; time: string };
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const dayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
const monday = (date: string) => addDays(date, -((dayOf(date) + 6) % 7));
const same = (a: Slot, b: Slot) => a.date === b.date && a.time === b.time;
const active = (lesson: Lesson) => lesson.status !== "已取消";
export default function Schedule() {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const routeStudentId =
    data.studentIdAliases?.[params.get("student") || ""] ??
    params.get("student");
  const view = params.get("view") === "day" ? "day" : "week";
  const base = params.get("date") || DEMO_TODAY;
  const weekStart = monday(base);
  const [selectedTeacher, setTeacher] = useState(
    params.get("teacher") ||
      (businessMode() ? data.teachers[0]?.id || "" : "t1"),
  );
  const [panel, setPanel] = useState(
    params.get("teacher") && !params.get("student") ? "teachers" : "pending",
  );
  const [calendarMode, setCalendarMode] = useState<"read" | "edit">("read");
  const [flow, setFlow] = useState<"overview" | "auto" | "custom" | "calendar">(
    "overview",
  );
  const [workflowStage, setWorkflowStage] = useState<"setup" | "preview">(
    "setup",
  );
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const [customDraftKey, setCustomDraftKey] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [multiSelect, setMultiSelect] = useState(false);
  function leaveWorkflow(action: () => void) {
    if (workflowBusy) return;
    if (workflowDirty || (flow === "calendar" && selected.length) || fixedPlan)
      setLeaveAction(() => action);
    else action();
  }
  function resetWorkflow() {
    setFlow("overview");
    setWorkflowStage("setup");
    setFixedPlan(null);
    setFixedPreview(false);
    setModal(null);
    setSelected([]);
    setWorkflowDirty(false);
    setWorkflowBusy(false);
    setError("");
  }
  const [query, setQuery] = useState("");
  const [so, setSo] = useState("");
  const [studentId, setStudent] = useState(routeStudentId || "");
  const [fixedPreview, setFixedPreview] = useState(false);
  const [fixedPlan, setFixedPlan] = useState<{
    plan: FixedPlan;
    intent: ScheduleIntent;
  } | null>(null);
  const [profileTeacherId, setProfileTeacherId] = useState("");
  const [scheduleResult, setScheduleResult] = useState<{
    studentId: string;
    studentName: string;
    teacherName: string;
    count: number;
  } | null>(null);
  const duration = 25;
  const [selected, setSelected] = useState<Slot[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [modal, setModal] = useState<"schedule" | "reschedule" | null>(null);
  const [rescheduleConfirmed, setRescheduleConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState(DEMO_TODAY);
  const [rescheduleTime, setRescheduleTime] = useState("19:00");
  const [rescheduleTeacher, setRescheduleTeacher] = useState(
    businessMode() ? data.teachers[0]?.id || "" : "t1",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarNode, setCalendarNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (routeStudentId) {
      resetWorkflow();
      setStudent(routeStudentId);
      setPanel("pending");
    }
  }, [routeStudentId]);
  const hasDraft =
    workflowDirty ||
    !!fixedPlan ||
    (flow === "calendar" && selected.length > 0);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (hasDraft || workflowBusy) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        new URLSearchParams(currentLocation.search).get("student") !==
          new URLSearchParams(nextLocation.search).get("student")),
  );
  useEffect(() => {
    if (!hasDraft && !workflowBusy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft, workflowBusy]);
  const student = data.students.find((s) => s.id === studentId);
  const teacher =
    data.teachers.find((t) => t.id === selectedTeacher) || data.teachers[0];
  const lesson = data.lessons.find((l) => l.id === lessonId);
  const calendarAnchor = useMemo(() => {
    const windows =
      panel === "pending" ? student?.scheduleIntent?.windows : undefined;
    const starts =
      windows?.map((w) => minute(w.start)) ||
      teacher?.availability.map((w) => minute(w.start));
    return starts?.length ? Math.min(...starts) : 17 * 60;
  }, [panel, student?.scheduleIntent, teacher?.availability]);
  const attachCalendar = useCallback(
    (node: HTMLDivElement | null) => {
      setCalendarNode(node);
      if (node)
        node.scrollTop = Math.max(0, ((calendarAnchor - 480) * 40) / 30 - 40);
    },
    [calendarAnchor, selectedTeacher, weekStart],
  );
  function navigateView(
    next: string,
    date = base,
    teacherId = selectedTeacher,
  ) {
    const p = new URLSearchParams(params);
    p.set("view", next);
    p.set("date", date);
    p.set("teacher", teacherId);
    setParams(p);
  }
  const studentRanks = useMemo(() => {
    const futureStudents = new Set(
      data.lessons
        .filter((l) => l.date >= DEMO_TODAY && l.status !== "已取消")
        .map((l) => l.studentId),
    );
    return new Map(
      data.students.map((s) => [
        s.id,
        ["停课", "结课", "退费"].includes(s.status)
          ? 3
          : !futureStudents.has(s.id)
            ? 0
            : s.scheduleIntent &&
                getStudentScheduleProgress(data, s.id, s.scheduleIntent)
                  .complete
              ? 2
              : 1,
      ]),
    );
  }, [data]);
  const studentRank = (s: Student) => studentRanks.get(s.id)!;
  const allStudents = useMemo(
    () =>
      [...data.students].sort(
        (a, b) =>
          studentRank(a) - studentRank(b) ||
          a.name.localeCompare(b.name, "zh-CN") ||
          a.id.localeCompare(b.id),
      ),
    [data.students, studentRanks],
  );
  const pending = allStudents.filter(
    (s) =>
      `${s.name} ${s.id}`.toLowerCase().includes(studentQuery.toLowerCase()) &&
      (studentFilter === "all" || studentFilter === String(studentRank(s))),
  );
  const visibleTeachers = data.teachers
    .filter(
      (t) =>
        t.status === "在职" &&
        (!so || t.so === so) &&
        `${t.name} ${t.teacherNumber}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(a.status === "已离职") - Number(b.status === "已离职") ||
        Number(!a.availability.length) - Number(!b.availability.length) ||
        usage(a) - usage(b) ||
        a.name.localeCompare(b.name),
    );
  const filtered = visibleTeachers;
  useEffect(() => {
    if (!studentId && allStudents.length) setStudent(allStudents[0].id);
  }, [studentId, allStudents]);
  function changePanel(next: string) {
    if (next === panel) return;
    leaveWorkflow(() => {
      resetWorkflow();
      setPanel(next);
      setScheduleResult(null);
    });
  }
  const columns =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => ({
          id: addDays(weekStart, i),
          date: addDays(weekStart, i),
          teacher,
        }))
      : filtered.map((t) => ({ id: t.id, date: base, teacher: t }));
  function usage(t: Teacher, date?: string) {
    const dates = date
      ? [date]
      : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const open = dates.reduce(
      (sum, d) =>
        sum +
        (t.availabilityFrom && d < t.availabilityFrom
          ? 0
          : t.availability
              .filter((r) => r.day === dayOf(d))
              .reduce((n, r) => n + minute(r.end) - minute(r.start), 0)),
      0,
    );
    const booked = data.lessons
      .filter(
        (l) => l.teacherId === t.id && dates.includes(l.date) && active(l),
      )
      .reduce((sum, l) => sum + l.duration, 0);
    return open ? Math.min(100, Math.round((booked / open) * 100)) : 0;
  }
  function selectTeacher(id: string) {
    if (id === selectedTeacher) return;
    leaveWorkflow(() => {
      resetWorkflow();
      setTeacher(id);
      navigateView("week", base, id);
    });
  }
  function changeStudent(id: string) {
    setStudent(id);
    if (modal !== "schedule") {
      setSelected([]);
    }
  }
  function beginSchedule() {
    setError("");
    setModal("schedule");
  }
  const moveTeacher = data.teachers.find((t) => t.id === rescheduleTeacher);
  const moveOutside = Boolean(
    lesson &&
      moveTeacher &&
      !isRegularTime(
        moveTeacher,
        rescheduleDate,
        rescheduleTime,
        lesson.duration,
      ),
  );
  const moveNeedsConfirmation =
    moveOutside || Boolean(moveTeacher?.needConfirm);
  const movePrecheck = lesson
    ? isAvailable(
        data,
        rescheduleTeacher,
        rescheduleDate,
        rescheduleTime,
        lesson.duration,
        lesson.studentId,
        lesson.id,
        true,
      )[0]
    : "";
  useEffect(() => {
    setRescheduleConfirmed(false);
  }, [rescheduleTeacher, rescheduleDate, rescheduleTime]);
  const [actionBusy, setActionBusy] = useState(false);
  async function run(command: Command, onSuccess?: () => void) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const result = await act(command);
      toast(result.message, { undo: result.undo });
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时没能保存，请重试");
      toast(e instanceof Error ? e.message : "暂时没能保存，请重试", {
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }
  async function exportSchedule() {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("老师周课表");
      sheet.addRow([
        "老师",
        "日期",
        "时间",
        "学生群名",
        "学生名字",
        "时长",
        "教材",
      ]);
      data.lessons
        .filter(
          (l) =>
            l.date >= weekStart &&
            l.date <= addDays(weekStart, 6) &&
            active(l) &&
            filtered.some((t) => t.id === l.teacherId),
        )
        .forEach((l) => {
          const s = data.students.find((s) => s.id === l.studentId);
          sheet.addRow([
            data.teachers.find((t) => t.id === l.teacherId)?.name,
            l.date,
            l.time,
            s?.groupName,
            s?.name,
            l.duration,
            l.material,
          ]);
        });
      sheet.columns.forEach((c) => (c.width = 20));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveBlob(blob, `老师周课表-${weekStart}.xlsx`);
      toast("课表已导出");
    } catch {
      toast("导出失败，请重试", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  const slots = Array.from({ length: 32 }, (_, i) => clock(480 + i * 30));
  const profileTeacher = data.teachers.find((t) => t.id === profileTeacherId);
  const calendarToolbar = (
    <div className="schedule-topbar">
      <div className="row gap-12">
        <div className="schedule-date">
          <button
            className="icon-button"
            aria-label={view === "week" ? "上一周" : "前一天"}
            onClick={() =>
              navigateView(view, addDays(base, view === "week" ? -7 : -1))
            }
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {view === "week"
              ? `${formatDate(weekStart)} — ${formatDate(addDays(weekStart, 6))}`
              : `${formatDate(base)} ${weekdays[dayOf(base)]}`}
          </strong>
          <button
            className="icon-button"
            aria-label={view === "week" ? "下一周" : "后一天"}
            onClick={() =>
              navigateView(view, addDays(base, view === "week" ? 7 : 1))
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {panel === "teachers" && (
        <Tabs
          value={view}
          onChange={(v) => navigateView(v)}
          items={[
            { value: "week", label: "周视图" },
            { value: "day", label: "日视图" },
          ]}
        />
      )}
    </div>
  );
  const viewingCalendar = calendarMode === "read";
  const calendarLessons = data.lessons.filter((lesson) =>
    (viewingCalendar || active(lesson)) &&
    columns.some((column) => lesson.teacherId === column.teacher.id && lesson.date === column.date) &&
    minute(lesson.time) >= 480 && minute(lesson.time) < 1440,
  );
  const teacherCalendar = teacher ? (
    <section className="schedule-board">
      <div className="schedule-board-heading">
        <div className="row gap-12">
          {view === "week" ? (
            <>
              <Avatar name={teacher.name} />
              <h3>{teacher.name}</h3>
              {teacher.needConfirm && (
                <Badge tone="warning">排课前需确认</Badge>
              )}
            </>
          ) : (
            <>
              <CalendarDays size={20} />
              <div>
                <h3>老师日程对照</h3>
                <small>点击老师姓名，查看这位老师的一周</small>
              </div>
            </>
          )}
        </div>
        <div className="schedule-usage">
          {view === "week" ? (
            <>
              本周订课率 <strong>{usage(teacher)}%</strong>
            </>
          ) : (
            <>{columns.length} 位老师</>
          )}
        </div>
      </div>
      {view === "week" && (
        <dl className="schedule-teacher-facts" aria-label="老师授课信息">
          <div>
            <dt>SO</dt>
            <dd>{teacher.so || "未填写"}</dd>
          </div>
          <div>
            <dt>口音等级</dt>
            <dd>{teacher.accent || "未填写"}</dd>
          </div>
          <div>
            <dt>导师等级</dt>
            <dd>{teacher.level || "未填写"}</dd>
          </div>
          <div>
            <dt>可教类别</dt>
            <dd>{teacher.categories.join(" / ") || "未填写"}</dd>
          </div>
          <div className="schedule-teacher-facts-wide">
            <dt>常规上课时间</dt>
            <dd>
              {availabilitySummary(teacher)}
              {teacher.availabilityFrom && (
                <small>{teacher.availabilityFrom} 起适用</small>
              )}
            </dd>
          </div>
          {teacher.availabilityNote && (
            <div className="schedule-teacher-facts-wide">
              <dt>排课备注</dt>
              <dd>{teacher.availabilityNote}</dd>
            </div>
          )}
        </dl>
      )}
      {calendarToolbar}
      {viewingCalendar && columns.length > 0 && calendarLessons.length === 0 ? (
        <EmptyState title={view === "week" ? "该周暂无课程" : "当天暂无课程"} />
      ) : (
        <div className="schedule-grid-scroll" ref={attachCalendar}>
          <div
            className={`schedule-grid ${viewingCalendar ? "calendar-read" : ""}`}
            style={{
              minWidth:
                view === "day"
                  ? 64 + Math.max(columns.length, 1) * 112
                  : undefined,
              gridTemplateColumns: `64px repeat(${Math.max(columns.length, 1)},minmax(${view === "day" ? 112 : 108}px,1fr))`,
              gridTemplateRows: `52px repeat(${slots.length},40px)`,
            }}
          >
            <div className="schedule-corner">时间</div>
            {columns.map((col, ci) => (
              <button
                key={col.id}
                className={`schedule-col-head ${col.date === DEMO_TODAY ? "today" : ""}`}
                style={{ gridColumn: ci + 2, gridRow: 1 }}
                onClick={() => {
                  if (view === "day") {
                    setTeacher(col.teacher.id);
                    navigateView("week", col.date, col.teacher.id);
                  }
                }}
              >
                {view === "week" ? (
                  <>
                    <strong>{weekdays[dayOf(col.date)]}</strong>
                    <small>
                      {col.date.slice(5)}
                      {col.date === DEMO_TODAY ? " · 今天" : ""}
                    </small>
                  </>
                ) : (
                  <>
                    <strong>{col.teacher.name}</strong>
                    <small>{col.teacher.so}</small>
                  </>
                )}
              </button>
            ))}
            {slots.map((time, ri) => (
              <div
                key={time}
                className={`schedule-time ${time.endsWith("00") ? "hour" : ""}`}
                style={{ gridColumn: 1, gridRow: ri + 2 }}
              >
                {time}
              </div>
            ))}
            {columns.map((col, ci) =>
              slots.map((time, ri) => {
                if (viewingCalendar) {
                  return <div key={`${col.id}-${time}`} className="schedule-cell" style={{ gridColumn: ci + 2, gridRow: ri + 2 }} />;
                }
                const slot = { date: col.date, time };
                const occupied = data.lessons.some(
                  (l) =>
                    l.teacherId === col.teacher.id &&
                    l.date === col.date &&
                    active(l) &&
                    minute(l.time) <= minute(time) &&
                    minute(l.time) + l.duration > minute(time),
                );
                const leave = data.leaves.some(
                  (l) =>
                    l.teacherId === col.teacher.id &&
                    ["已通过", "已登记"].includes(l.status) &&
                    overlapsLeave(col.date, time, duration, l.start, l.end),
                );
                const conflicts = isAvailable(
                  data, col.teacher.id, col.date, time, duration,
                  panel === "pending" ? studentId : undefined,
                );
                const past = col.date < DEMO_TODAY;
                const blocked = conflicts.length > 0 || past;
                const selectedHere =
                  selectedTeacher === col.teacher.id &&
                  selected.some((s) => same(s, slot));
                const intentWindow =
                  panel === "pending" &&
                  Boolean(
                    student?.scheduleIntent?.windows.some(
                      (w) =>
                        w.day === dayOf(slot.date) &&
                        minute(slot.time) >= minute(w.start) &&
                        minute(slot.time) + duration <= minute(w.end),
                    ),
                  );
                const intent =
                  intentWindow &&
                  slot.date >= (student?.scheduleIntent?.startDate || "") &&
                  slot.date <
                    addDays(
                      student?.scheduleIntent?.startDate || DEMO_TODAY,
                      (student?.scheduleIntent?.weeks || 1) * 7,
                    );
                return (
                  <button
                    key={`${col.id}-${time}`}
                    type="button"
                    aria-label={`${col.teacher.name} ${col.date} ${time} ${occupied ? "已排课" : leave ? "请假" : blocked ? "不可安排" : "可排课"}`}
                    aria-pressed={selectedHere}
                    title={
                      intentWindow && !intent
                        ? "不在排课周期内，请切换至开始日期之后"
                        : blocked
                          ? past ? "已过期" : conflicts.join("；")
                          : "可排课"
                    }
                    disabled={
                      blocked ||
                      (panel === "pending" && !intent) ||
                      !can("schedule.create")
                    }
                    className={`schedule-cell ${blocked ? "closed" : "open"} ${leave ? "leave" : ""} ${selectedHere ? "selected" : ""} ${intentWindow ? "intent" : ""} ${intentWindow && !intent ? "outside-intent-period" : ""} ${past ? "past" : ""}`}
                    style={{ gridColumn: ci + 2, gridRow: ri + 2 }}
                    onClick={(e) => {
                      setTeacher(col.teacher.id);
                      if (panel === "pending" || multiSelect || e.shiftKey) {
                        setSelected((prev) =>
                          selectedTeacher !== col.teacher.id
                            ? [slot]
                            : prev.some((s) => same(s, slot))
                              ? prev.filter((s) => !same(s, slot))
                              : [...prev, slot],
                        );
                      } else {
                        setSelected([slot]);
                        if (panel === "teachers") beginSchedule();
                      }
                    }}
                  >
                    {selectedHere ? (
                      <>
                        <Check size={14} />
                        <span>已选</span>
                      </>
                    ) : leave ? (
                      "请假"
                    ) : intentWindow && !intent ? (
                      slot.date < (student?.scheduleIntent?.startDate || "") ? (
                        "尚未开始"
                      ) : (
                        "周期已结束"
                      )
                    ) : intent ? (
                      blocked ? (
                        "意向 · 不可排"
                      ) : (
                        "意向"
                      )
                    ) : !blocked ? (
                      <span className="cell-plus">+</span>
                    ) : (
                      ""
                    )}
                  </button>
                );
              }),
            )}
            {columns.map((col, ci) =>
              calendarLessons
                .filter((l) => l.teacherId === col.teacher.id && l.date === col.date)
                .map((l) => {
                  const s = data.students.find((s) => s.id === l.studentId);
                  return (
                    <button
                      key={l.id}
                      onClick={() => setLessonId(l.id)}
                      data-status={viewingCalendar ? l.status : undefined}
                      className={`schedule-lesson ${l.kind === "临时课" ? "temporary" : ""} ${l.date < DEMO_TODAY ? "past" : ""} ${l.conflict ? "conflict" : ""}`}
                      style={{
                        gridColumn: ci + 2,
                        gridRow: `${2 + Math.floor((minute(l.time) - 480) / 30)} / span ${Math.ceil(((minute(l.time) % 30) + l.duration) / 30)}`,
                      }}
                    >
                      <strong>
                        {s?.name}
                        {l.conflict && " ⚠"}
                      </strong>
                      <small>
                        {l.time}–{clock(minute(l.time) + l.duration)}
                        {viewingCalendar && ` · ${calendarLessonStatus(l.status)}`}
                      </small>
                    </button>
                  );
                }),
            )}
            {!columns.length && (
              <div className="no-columns">没有符合筛选条件的老师</div>
            )}
          </div>
        </div>
      )}
      <CalendarHorizontalScroll node={calendarNode} />
      {viewingCalendar && calendarLessons.length > 0 && <CalendarStatusLegend lessons={calendarLessons} />}
      {!viewingCalendar && (
        <div className="schedule-legend">
          <span><i className="legend-open" />可排课</span>
          <span><i className="legend-fixed" />已排课</span>
          <span><i className="legend-closed" />不可安排</span>
          <span><i className="legend-leave" />请假</span>
          <small>每格 30 分钟，可在排课时调整到具体分钟</small>
        </div>
      )}
      {view === "day" && (
        <div className="schedule-day-rates">
          {columns.map((c) => (
            <span key={c.id}>
              {c.teacher.name} <strong>{usage(c.teacher, base)}%</strong>
            </span>
          ))}
        </div>
      )}
    </section>
  ) : (
    <EmptyState title="暂无老师" description="请先维护老师资料。" />
  );
  return (
    <div className="schedule-page">
      <PageHeader
        title="排课管理"
        description="找到合适的老师，把每一节课安排妥当。"
        action={
          <>
            {can("schedule.export") && (
              <DataTransferButton
                direction="export"
                size="sm"
                onClick={exportSchedule}
                loading={busy}
              />
            )}
          </>
        }
      />
      <Tabs
        value={panel}
        onChange={changePanel}
        items={[
          { value: "pending", label: "按学员排课" },
          { value: "teachers", label: "按老师排课" },
        ]}
      />
      <div className="schedule-workspace">
        <aside
          className={`schedule-roster ${panel === "pending" ? "schedule-student-roster" : ""}`}
        >
          <h3>{panel === "teachers" ? "老师列表" : "学员列表"}</h3>
          <SearchInput
            value={panel === "teachers" ? query : studentQuery}
            onChange={panel === "teachers" ? setQuery : setStudentQuery}
            placeholder="搜索姓名或 ID"
          />
          {panel === "pending" ? (
            <>
              <Select
                aria-label="排课状态"
                value={studentFilter}
                onValueChange={setStudentFilter}
              >
                <option value="all">全部学员</option>
                <option value="0">未排课</option>
                <option value="1">部分已排 / 待完善计划</option>
                <option value="2">计划已排齐</option>
              </Select>
              <div className="roster-list" aria-label="学员列表">
                {pending.map((s) => (
                  <button
                    key={s.id}
                    className={`roster-person ${studentId === s.id ? "selected" : ""}`}
                    aria-pressed={studentId === s.id}
                    onClick={() =>
                      leaveWorkflow(() => {
                        resetWorkflow();
                        changeStudent(s.id);
                        setScheduleResult(null);
                      })
                    }
                  >
                    <Avatar name={s.name} />
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.id}</small>
                    </span>
                  </button>
                ))}
              </div>
              {!pending.length && (
                <EmptyState
                  title="没有符合条件的学员"
                  description="试试搜索其他姓名或清除筛选。"
                />
              )}
              {(studentQuery || studentFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStudentQuery("");
                    setStudentFilter("all");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </>
          ) : (
            <>
              <Select aria-label="按 SO 筛选" value={so} onValueChange={setSo}>
                <option value="">全部 SO</option>
                {[...new Set(data.teachers.map((t) => t.so))].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <div className="roster-list" aria-label="老师列表">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    className={`roster-person ${selectedTeacher === t.id ? "selected" : ""}`}
                    aria-pressed={selectedTeacher === t.id}
                    onClick={() => selectTeacher(t.id)}
                  >
                    <Avatar name={t.name} />
                    <span>
                      <strong>{t.name}</strong>
                      <small>{t.teacherNumber}</small>
                    </span>
                  </button>
                ))}
              </div>
              {!filtered.length && (
                <EmptyState
                  title="没有符合条件的老师"
                  description="试试搜索其他姓名或清除筛选。"
                />
              )}
              {(query || so) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setSo("");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </>
          )}
        </aside>
        <div
          className={`schedule-main stack ${flow !== "overview" ? "schedule-workspace-card" : ""}`}
        >
          {scheduleResult && (
            <div role="status" className="schedule-result row between wrap">
              <span>
                已为 {scheduleResult.studentName} 安排 {scheduleResult.count}{" "}
                节课程。课程已保存，可在下方查看同步状态。
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScheduleResult(null)}
              >
                关闭提示
              </Button>
            </div>
          )}
          {flow !== "overview" && (
            <div className="schedule-flow-heading row between wrap">
              <div className="schedule-person-heading">
                <Avatar
                  name={
                    (panel === "pending" ? student?.name : teacher?.name) || ""
                  }
                />
                <div>
                  <h3>
                    {panel === "pending" ? student?.name : teacher?.name} ·{" "}
                    {flow === "calendar" && modal !== "schedule"
                      ? "完整课表"
                      : "安排课程"}
                  </h3>
                  <small>
                    ID: {panel === "pending" ? student?.id : teacher?.teacherNumber}
                  </small>
                </div>
              </div>
              {(flow !== "calendar" || modal === "schedule") && (
                <ol className="schedule-steps" aria-label="排课步骤">
                  <li
                    aria-current={
                      !fixedPreview && workflowStage === "setup"
                        ? "step"
                        : undefined
                    }
                  >
                    ① 设置排课
                  </li>
                  <li aria-hidden="true">→</li>
                  <li
                    aria-current={
                      fixedPreview || workflowStage === "preview"
                        ? "step"
                        : undefined
                    }
                  >
                    ② 预览确认
                  </li>
                </ol>
              )}
              {flow === "calendar" && modal !== "schedule" && (
                <Button
                  variant="ghost"
                  disabled={workflowBusy}
                  onClick={() => leaveWorkflow(resetWorkflow)}
                >
                  返回概况
                </Button>
              )}
            </div>
          )}
          {flow === "overview" && (panel === "pending" ? student : teacher) && (
            <ScheduleOverview
              key={`${panel}-${panel === "pending" ? studentId : selectedTeacher}`}
              person={
                panel === "pending" && student
                  ? { kind: "student", value: student }
                  : { kind: "teacher", value: teacher }
              }
              onStart={(mode) => {
                setScheduleResult(null);
                setFlow(mode);
                if (mode === "custom") {
                  setSelected([]);
                  setModal("schedule");
                }
              }}
              onReschedule={(id) => {
                const selectedLesson = data.lessons.find(l => l.id === id)!;
                setLessonId(id);
                setRescheduleDate(selectedLesson.date);
                setRescheduleTime(selectedLesson.time);
                setRescheduleTeacher(selectedLesson.teacherId);
                setReason("");
                setRescheduleConfirmed(false);
                setError("");
                setModal("reschedule");
              }}
              onLesson={setLessonId}
              onTeacherProfile={() => setProfileTeacherId(selectedTeacher)}
              onTeacherCalendar={() => { setCalendarMode("read"); setFlow("calendar"); }}
            />
          )}
          {flow === "auto" && student && (
            <div hidden={fixedPreview}>
              <StudentSchedulingPanel
                key={student.id}
                student={student}
                onDirtyChange={setWorkflowDirty}
                onBusyChange={setWorkflowBusy}
                onClose={() => leaveWorkflow(resetWorkflow)}
                onStageChange={setWorkflowStage}
                onFixedPlan={(plan, intent) => {
                  setFixedPlan({ plan, intent });
                  setFixedPreview(true);
                  setTeacher(plan.primaryTeacherId);
                }}
                onViewTeacher={setProfileTeacherId}
                onIntentSaved={() => {
                  setFixedPlan(null);
                  setFixedPreview(false);
                  setSelected([]);
                  setWorkflowDirty(false);
                }}
                onScheduleComplete={(count, teacherName) => {
                  resetWorkflow();
                  setScheduleResult({
                    studentId,
                    studentName: student.name,
                    teacherName,
                    count,
                  });
                }}
              />
            </div>
          )}
          {fixedPlan && student && (
            <div className="schedule-summary-card" hidden={!fixedPreview}>
              <FixedPlanCalendar
                key={`${studentId}-${fixedPlan.plan.primaryTeacherId}-${JSON.stringify(fixedPlan.intent)}`}
                studentId={studentId}
                plan={fixedPlan.plan}
                intent={fixedPlan.intent}
                onBusyChange={setWorkflowBusy}
                onClose={() => setFixedPreview(false)}
                onComplete={(count, teacherName) => {
                  resetWorkflow();
                  setScheduleResult({
                    studentId,
                    studentName: student.name,
                    teacherName,
                    count,
                  });
                }}
              />
            </div>
          )}
          {modal === "schedule" && (
            <div className="schedule-summary-card">
              <CustomSchedulingPanel
                studentId={panel === "pending" ? studentId : ""}
                teacherId={panel === "teachers" ? selectedTeacher : ""}
                initialTime={selected[0]}
                initialTimes={selected}
                onDraftKeyChange={setCustomDraftKey}
                startDate={base}
                onDirtyChange={setWorkflowDirty}
                onBusyChange={setWorkflowBusy}
                onStageChange={setWorkflowStage}
                onClose={() => leaveWorkflow(resetWorkflow)}
                onComplete={(id, count, teachers) => {
                  resetWorkflow();
                  if (panel === "pending") setStudent(id);
                  setScheduleResult({
                    studentId: id,
                    studentName:
                      data.students.find((s) => s.id === id)?.name || "学员",
                    teacherName: teachers,
                    count,
                  });
                }}
              />
            </div>
          )}
          {flow === "calendar" && modal !== "schedule" && (
            <>
              {can("schedule.create") && (
                <Tabs
                  value={calendarMode}
                  onChange={(mode) => {
                    setCalendarMode(mode === "edit" ? "edit" : "read");
                    setSelected([]);
                  }}
                  items={[
                    { value: "read", label: "查看课表" },
                    { value: "edit", label: "操作排课" },
                  ]}
                />
              )}
              {calendarMode === "edit" && (
                <div className="row wrap">
                  <label>
                    <input
                      type="checkbox"
                      checked={multiSelect}
                      onChange={(e) => setMultiSelect(e.target.checked)}
                    />{" "}
                    多选上课时间
                  </label>
                  <small>点击空档安排课程，点击已有课程查看详情。</small>
                </div>
              )}
              {calendarMode === "edit" && can("schedule.create") && (
                <Button
                  onClick={() => {
                    setSelected([]);
                    beginSchedule();
                  }}
                >
                  为该老师排课
                </Button>
              )}
              {teacherCalendar}
            </>
          )}
          {flow === "overview" &&
            !(panel === "pending" ? student : teacher) && (
              <EmptyState
                title="暂无可查看的人员"
                description="请先维护学员或老师资料。"
              />
            )}
        </div>
      </div>
      {panel === "teachers" &&
        selected.length > 0 &&
        modal !== "schedule" &&
        can("schedule.create") && (
          <div className="batch-bar schedule-batch">
            <div>
              <strong>
                {selected.length
                  ? `已选 ${selected.length} 个时段`
                  : student
                    ? `为 ${student.name} 排课`
                    : "选择学员开始排课"}
              </strong>
              <small>
                {selected.length
                  ? " · 每个选中时间代表一节课，按住 Shift 可多选"
                  : " · 确认后更新学员课表和老师日程"}
              </small>
            </div>
            <div className="row">
              <Button
                size="sm"
                onClick={() => {
                  setSelected([]);
                }}
              >
                取消选择
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => beginSchedule()}
                disabled={preview}
              >
                <Plus size={15} />
                使用已选时间排课
              </Button>
            </div>
          </div>
        )}
      <Modal
        open={!!leaveAction || blocker.state === "blocked"}
        title="放弃本次修改？"
        onClose={() => {
          setLeaveAction(null);
          if (blocker.state === "blocked") blocker.reset();
        }}
        footer={
          <>
            <Button
              onClick={() => {
                setLeaveAction(null);
                if (blocker.state === "blocked") blocker.reset();
              }}
            >
              继续编辑
            </Button>
            <Button
              variant="primary"
              disabled={workflowBusy}
              onClick={() => {
                if (modal === "schedule" && customDraftKey) localStorage.removeItem(customDraftKey);
                leaveAction?.();
                if (blocker.state === "blocked") blocker.proceed();
                setLeaveAction(null);
              }}
            >
              放弃本次修改
            </Button>
          </>
        }
      >
        <p>本次尚未确认的排课将不会提交，已保存的课程不受影响。</p>
      </Modal>
      <Drawer
        open={Boolean(profileTeacher)}
        onClose={() => setProfileTeacherId("")}
        title="老师资料"
        width={560}
      >
        {profileTeacher && (
          <div className="stack">
            <div className="row gap-12">
              {profileTeacher.photo ? (
                <img
                  className="schedule-profile-avatar"
                  src={profileTeacher.photo}
                  alt={profileTeacher.name}
                />
              ) : (
                <Avatar name={profileTeacher.name} />
              )}
              <h3>{profileTeacher.name}</h3>
            </div>
            <dl className="schedule-teacher-profile-fields">
              <dt>SO</dt>
              <dd>{profileTeacher.so}</dd>
              <dt>口音等级</dt>
              <dd>{profileTeacher.accent || "未填写"}</dd>
              <dt>老师等级</dt>
              <dd>{profileTeacher.level || "未填写"}</dd>
              <dt>授课类型</dt>
              <dd>{profileTeacher.categories.join(" / ") || "未填写"}</dd>
              <dt>教师寄语与教学特色</dt>
              <dd>{profileTeacher.teachingPhilosophy || "未填写"}</dd>
              <dt>常规可用时间</dt>
              <dd>{availabilitySummary(profileTeacher)}</dd>
              <dt>排课要求</dt>
              <dd>
                {profileTeacher.needConfirm
                  ? "排课前需老师确认"
                  : "无额外确认要求"}
              </dd>
            </dl>
          </div>
        )}
      </Drawer>
      <Drawer
        open={Boolean(lesson) && modal !== "reschedule"}
        onClose={() => setLessonId(null)}
        title="课程详情"
        width={560}
        footer={
          lesson && (
            <>
              <Button
                onClick={() => {
                  setRescheduleDate(lesson.date);
                  setRescheduleTime(lesson.time);
                  setRescheduleTeacher(lesson.teacherId);
                  setReason("");
                  setRescheduleConfirmed(false);
                  setError("");
                  setModal("reschedule");
                }}
                disabled={
                  !can("student.reschedule") ||
                  preview ||
                  lesson.status !== "未开始" ||
                  lesson.date < DEMO_TODAY
                }
              >
                调整时间
              </Button>
              <Link to={`/students/${lesson.studentId}`}>
                <Button variant="primary">查看学员</Button>
              </Link>
            </>
          )
        }
      >
        {lesson && (
          <div className="stack">
            <div className="row gap-12">
              <Avatar
                name={
                  data.students.find((s) => s.id === lesson.studentId)?.name ||
                  ""
                }
              />
              <div>
                <h2>
                  {data.students.find((s) => s.id === lesson.studentId)?.name}
                </h2>
                <small>
                  {data.teachers.find((t) => t.id === lesson.teacherId)?.name}
                </small>
              </div>
              <Badge tone={lesson.status === "已完成" ? "success" : "neutral"}>
                {lesson.status}
              </Badge>
            </div>
            <dl className="detail-pairs">
              <dt>上课时间</dt>
              <dd>
                {formatDate(lesson.date)} {weekdays[dayOf(lesson.date)]}{" "}
                {lesson.time}–{clock(minute(lesson.time) + lesson.duration)}
              </dd>
              <dt>时长</dt>
              <dd>{lesson.duration} 分钟</dd>
              <dt>教材</dt>
              <dd>{lesson.material}</dd>
              <dt>课程安排</dt>
              <dd>{lesson.kind}</dd>
              {lesson.confirmation && (
                <>
                  <dt>老师时间确认</dt>
                  <dd>
                    {lesson.confirmation.operator} 已确认
                    {lesson.confirmation.note
                      ? ` · ${lesson.confirmation.note}`
                      : ""}
                  </dd>
                </>
              )}
              <dt>核实课时</dt>
              <dd>
                {lesson.confirmedUnits === undefined
                  ? "待核实"
                  : `${lesson.confirmedUnits} 课时`}
              </dd>
              <dt>课时处理</dt>
              <dd>{lesson.deducted ? "已扣课时" : "尚未扣课时"}</dd>
            </dl>
            <CourseSyncLink lesson={lesson} detail />
            <div className="inset">
              <h3>上课情况</h3>
              <p style={{ marginTop: 12 }}>
                老师：{lesson.teacherIn || "暂无记录"} 进入 ·{" "}
                {lesson.teacherOut || "暂无记录"} 离开
              </p>
              <p style={{ marginTop: 8 }}>
                学员：{lesson.studentIn || "暂无记录"} 进入 ·{" "}
                {lesson.studentOut || "暂无记录"} 离开
              </p>
            </div>
            {lesson.note && <p>{lesson.note}</p>}
          </div>
        )}
      </Drawer>
      <Modal
        open={modal === "reschedule"}
        onClose={() => setModal(null)}
        title="调整这节课"
        footer={
          <>
            <Button onClick={() => setModal(null)}>取消</Button>
            <Button
              variant="primary"
              loading={actionBusy}
              disabled={
                preview ||
                actionBusy ||
                !rescheduleDate ||
                !rescheduleTime ||
                !rescheduleTeacher ||
                Boolean(movePrecheck) ||
                (moveNeedsConfirmation && !rescheduleConfirmed)
              }
              onClick={async () => {
                if (lesson)
                  await run(
                    {
                      type: "lesson.reschedule",
                      id: lesson.id,
                      date: rescheduleDate,
                      time: rescheduleTime,
                      teacherId: rescheduleTeacher,
                      reason,
                      confirmedTeacher: rescheduleConfirmed,
                      confirmationNote: reason,
                    },
                    () => {
                      setTeacher(rescheduleTeacher);
                      navigateView("week", rescheduleDate, rescheduleTeacher);
                      setModal(null);
                      setLessonId(null);
                    },
                  );
              }}
            >
              {actionBusy ? "正在改期" : "确认调整"}
            </Button>
          </>
        }
      >
        <div className="stack">
          {lesson && (
            <div className="notice">
              原安排：{lesson.date} {lesson.time}
              <br />
              新安排：{rescheduleDate} {rescheduleTime} · 老师不变
            </div>
          )}
          <div className="form-grid">
            <Field label="上课日期" required>
              <DatePicker
                placeholder="上课日期"
                mode="date"
                value={rescheduleDate}
                min={DEMO_TODAY}
                onValueChange={(nextValue) => setRescheduleDate(nextValue)}
              />
            </Field>
            <Field label="上课时间" required>
              <input
                type="time"
                step="60"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </Field>
          </div>
          <Field label="老师">
            <Select
              value={rescheduleTeacher}
              disabled
              onValueChange={(value) => setRescheduleTeacher(value)}
            >
              {data.teachers
                .filter((t) => t.status !== "已离职")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <small>
            如需换老师，请到学员档案办理换师，取消原预约后重新排课。
          </small>
          <Field label="调整原因">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：家长临时有事"
            />
          </Field>
          {moveTeacher && (
            <small>常规时间：{availabilitySummary(moveTeacher)}</small>
          )}
          {moveOutside && (
            <div className="notice">
              调整后的时间不在老师的常规安排内，本节将作为临时课安排。
            </div>
          )}
          {moveNeedsConfirmation && (
            <label className="select-row">
              <input
                type="checkbox"
                checked={rescheduleConfirmed}
                onChange={(e) => setRescheduleConfirmed(e.target.checked)}
              />
              已与老师确认本次调整
            </label>
          )}
          {movePrecheck && (
            <p className="danger" role="alert">
              {movePrecheck}
            </p>
          )}
          <div className="notice notice-info">
            <Clock3 size={17} />
            确认后更新学员课表和老师日程。
          </div>
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CalendarHorizontalScroll({ node }: { node: HTMLDivElement | null }) {
  const [position, setPosition] = useState({ left: 0, max: 0 });
  useEffect(() => {
    if (!node) return;
    const sync = () =>
      setPosition({
        left: node.scrollLeft,
        max: Math.max(0, node.scrollWidth - node.clientWidth),
      });
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", sync);
    };
  }, [node]);
  if (!node || position.max <= 0) return null;
  return (
    <div className="schedule-horizontal-scroll">
      <span>左右拖动查看更多老师</span>
      <input
        type="range"
        aria-label="日历横向滚动"
        min={0}
        max={position.max}
        value={Math.min(position.left, position.max)}
        step={1}
        onChange={(e) => {
          const left = Number(e.target.value);
          node.scrollLeft = left;
          setPosition({ ...position, left });
        }}
      />
    </div>
  );
}
