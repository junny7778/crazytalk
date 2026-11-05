import CourseSyncLink from "../components/CourseSyncLink";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../components/DataTransferButton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Image,
  Plus,
  X,
  AlertCircle,
  Check,
  ArrowRight,
  Users,
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
  getTeacherScheduleMatch,
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
import { FixedPlanCalendar } from "../components/scheduling/FixedPlanCalendar";
import { CoursePlanEditor } from "../components/scheduling/CoursePlanEditor";
import { StudentSchedulingPanel } from "../components/scheduling/StudentSchedulingPanel";
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
  const [selectedTeacher, setTeacher] = useState(params.get("teacher") || "t1");
  const [panel, setPanel] = useState(
    params.get("student") ? "pending" : "teachers",
  );
  const [query, setQuery] = useState("");
  const [so, setSo] = useState("");
  const [studentId, setStudent] = useState(
    routeStudentId ||
      data.students.find((s) => s.code === params.get("studentCode"))?.id ||
      "",
  );
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
  const [recommendedTeacher, setRecommendedTeacher] = useState("");
  const [duration, setDuration] = useState(25);
  const [selected, setSelected] = useState<Slot[]>([]);
  const [generatedPlan, setGeneratedPlan] = useState(false);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [modal, setModal] = useState<"schedule" | "reschedule" | "free" | null>(
    null,
  );
  const [kind, setKind] = useState<"固定课" | "临时课">("固定课");
  const [weeks, setWeeks] = useState(8);
  const [rescheduleConfirmed, setRescheduleConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState(DEMO_TODAY);
  const [rescheduleTime, setRescheduleTime] = useState("19:00");
  const [rescheduleTeacher, setRescheduleTeacher] = useState("t1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarNode, setCalendarNode] = useState<HTMLDivElement | null>(null);
  const freeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (routeStudentId) {
      setStudent(routeStudentId);
      setRecommendedTeacher("");
      setPanel("pending");
    }
  }, [routeStudentId]);
  const student = data.students.find((s) => s.id === studentId);
  const teacher =
    data.teachers.find((t) => t.id === selectedTeacher) || data.teachers[0];
  const lesson = data.lessons.find((l) => l.id === lessonId);
  const calendarAnchor = useMemo(() => {
    const windows =
      panel === "pending" ? student?.scheduleIntent?.windows : undefined;
    const starts =
      windows?.map((w) => minute(w.start)) ||
      teacher.availability.map((w) => minute(w.start));
    return starts.length ? Math.min(...starts) : 17 * 60;
  }, [panel, student?.scheduleIntent, teacher.availability]);
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
  function isFree(
    t: Teacher,
    slot: Slot,
    minutes = duration,
    ignoreId?: string,
    allowOutsideRegular = false,
    checkStudent = true,
  ) {
    return !isAvailable(
      data,
      t.id,
      slot.date,
      slot.time,
      minutes,
      checkStudent && panel === "pending" ? studentId : undefined,
      ignoreId,
      allowOutsideRegular,
    ).length;
  }
  const visibleTeachers = data.teachers.filter(
    (t) =>
      t.status !== "已离职" &&
      (!so || t.so === so) &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  const pending = data.students.filter(
    (s) =>
      !["停课", "结课", "退费"].includes(s.status) &&
      (s.scheduleIntent
        ? !getStudentScheduleProgress(data, s.id, s.scheduleIntent).complete
        : s.status === "待排课"),
  );
  const filtered = visibleTeachers;
  const found = panel === "pending" && Boolean(recommendedTeacher);
  function changePanel(next: string) {
    setDuration(25);
    setWeeks(8);
    setPanel(next);
    setSelected([]);
    setRecommendedTeacher("");
    setScheduleResult(null);
    setStudent(next === "pending" ? pending[0]?.id || "" : "");
    setError("");
  }
  function viewRecommendation(
    teacherId: string,
    intent: NonNullable<Student["scheduleIntent"]>,
  ) {
    setTeacher(teacherId);
    setRecommendedTeacher(teacherId);
    setSelected([]);
    setDuration(intent.duration);
    setWeeks(intent.weeks);
    navigateView("week", intent.startDate, teacherId);
  }
  function previewRecommendation(
    teacherId: string,
    intent: NonNullable<Student["scheduleIntent"]>,
    slots: Slot[],
    useManualTimes = false,
  ) {
    viewRecommendation(teacherId, intent);
    const match = getTeacherScheduleMatch(data, teacherId, studentId, intent);
    setSelected(
      intent.mode === "fixed" && !useManualTimes ? match.plan : slots,
    );
    setGeneratedPlan(true);
    setKind(intent.mode === "fixed" ? "固定课" : "临时课");
    setError("");
    setModal("schedule");
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
    setTeacher(id);
    navigateView("week", base, id);
    setSelected([]);
  }
  function changeStudent(id: string) {
    setStudent(id);
    const s = data.students.find((s) => s.id === id);
    if (modal !== "schedule") {
      setSelected([]);
      setRecommendedTeacher("");
    }
  }
  function beginSchedule(temporary = false) {
    setGeneratedPlan(false);
    setError("");
    setKind(temporary ? "临时课" : "固定课");
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
  const sourceSlots = selected;
  const selectedOutside = sourceSlots.some(
    (s) => !isRegularTime(teacher, s.date, s.time, duration),
  );
  useEffect(() => {
    setRescheduleConfirmed(false);
  }, [rescheduleTeacher, rescheduleDate, rescheduleTime]);
  function run(command: Command, onSuccess?: () => void) {
    try {
      const result = act(command);
      toast(result.message, { undo: result.undo });
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时没能保存，请重试");
      toast(e instanceof Error ? e.message : "暂时没能保存，请重试", {
        tone: "error",
      });
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
  async function exportImage(copy = false) {
    if (!freeRef.current) return;
    setBusy(true);
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(freeRef.current, { pixelRatio: 2 });
      if (!blob) throw Error();
      if (copy && navigator.clipboard && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast("空档图已复制，可以发给家长了");
      } else {
        saveBlob(blob, `${teacher.name}-可上课时间.png`);
        toast("空档图已保存");
      }
    } catch {
      toast("暂时无法复制，请使用“保存图片”", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const slots = Array.from({ length: 32 }, (_, i) => clock(480 + i * 30));
  const ScheduleOverlay = panel === "pending" ? Drawer : Modal;
  const profileTeacher = data.teachers.find((t) => t.id === profileTeacherId);
  function closeStudentFlow() {
    setRecommendedTeacher("");
    setModal(null);
    setSelected([]);
    setError("");
  }
  function previewStudentTimes() {
    const intent = student?.scheduleIntent;
    if (!intent) return;
    const slots = selected.length
      ? intent.mode === "flex"
        ? selected
        : selected.flatMap((slot) => {
            const firstDate = addDays(
              intent.startDate,
              (dayOf(slot.date) - dayOf(intent.startDate) + 7) % 7,
            );
            return Array.from({ length: intent.weeks }, (_, week) => ({
              date: addDays(firstDate, week * 7),
              time: slot.time,
            }));
          })
      : getTeacherScheduleMatch(data, teacher.id, student.id, intent).slots;
    const uniqueSlots = [
      ...new Map(
        slots.map((slot) => [`${slot.date}-${slot.time}`, slot]),
      ).values(),
    ].filter(
      (slot) =>
        !data.lessons.some(
          (lesson) =>
            lesson.studentId === student.id &&
            lesson.status !== "已取消" &&
            lesson.date === slot.date &&
            lesson.time === slot.time &&
            lesson.duration === intent.duration,
        ),
    );
    previewRecommendation(teacher.id, intent, uniqueSlots, selected.length > 0);
  }
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
  const teacherCalendar = (
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
      <div className="schedule-grid-scroll" ref={attachCalendar}>
        <div
          className="schedule-grid"
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
                    {formatDate(col.date)}
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
                  l.status === "已通过" &&
                  overlapsLeave(col.date, time, duration, l.start, l.end),
              );
              const open = isRegularTime(col.teacher, col.date, time, duration);
              const blocked = !isFree(
                col.teacher,
                slot,
                duration,
                undefined,
                true,
              );
              const selectedHere =
                selectedTeacher === col.teacher.id &&
                selected.some((s) => same(s, slot));
              const intentWindow =
                found &&
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
                  aria-label={`${col.teacher.name} ${col.date} ${time} ${occupied ? "已有课" : leave ? "请假" : blocked ? "不可安排" : open ? "常规可排" : "可临时安排，需老师确认"}`}
                  aria-pressed={selectedHere}
                  title={
                    intentWindow && !intent
                      ? "不在排课周期内，请切换至开始日期之后"
                      : blocked
                        ? isAvailable(
                            data,
                            col.teacher.id,
                            col.date,
                            time,
                            duration,
                            panel === "pending" ? studentId : undefined,
                            undefined,
                            true,
                          ).join("；")
                        : open
                          ? "常规可用时间"
                          : "非常规时间，可与老师确认后安排临时课"
                  }
                  disabled={
                    blocked ||
                    (panel === "pending" && !intent) ||
                    col.date < DEMO_TODAY ||
                    !can("schedule.create")
                  }
                  className={`schedule-cell ${blocked ? "closed" : open ? "open" : "coordinate"} ${leave ? "leave" : ""} ${selectedHere ? "selected" : ""} ${intentWindow ? "intent" : ""} ${intentWindow && !intent ? "outside-intent-period" : ""} ${col.date < DEMO_TODAY ? "past" : ""}`}
                  style={{ gridColumn: ci + 2, gridRow: ri + 2 }}
                  onClick={(e) => {
                    setTeacher(col.teacher.id);
                    if (panel === "pending" || e.shiftKey) {
                      setSelected((prev) =>
                        selectedTeacher !== col.teacher.id
                          ? [slot]
                          : prev.some((s) => same(s, slot))
                            ? prev.filter((s) => !same(s, slot))
                            : [...prev, slot],
                      );
                    } else {
                      setSelected([slot]);
                      if (panel === "teachers") beginSchedule(true);
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
            data.lessons
              .filter(
                (l) =>
                  l.teacherId === col.teacher.id &&
                  l.date === col.date &&
                  active(l) &&
                  minute(l.time) >= 480 &&
                  minute(l.time) < 1440,
              )
              .map((l) => {
                const s = data.students.find((s) => s.id === l.studentId);
                return (
                  <button
                    key={l.id}
                    onClick={() => setLessonId(l.id)}
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
      <CalendarHorizontalScroll node={calendarNode} />
      <div className="schedule-legend">
        <span>
          <i className="legend-open" />
          常规可排
        </span>
        <span>
          <i className="legend-fixed" />
          固定课
        </span>
        <span>
          <i className="legend-temp" />
          灵活课
        </span>
        <span>
          <i className="legend-coordinate" />
          可临时协调
        </span>
        <span>
          <i className="legend-closed" />
          不可安排
        </span>
        <span>
          <i className="legend-leave" />
          请假
        </span>
        <small>每格 30 分钟，可在排课时调整到具体分钟</small>
      </div>
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
  );
  return (
    <div className="schedule-page">
      <PageHeader
        title="排课管理"
        description="找到合适的老师，把每一节课安排妥当。"
        action={
          <>
            {panel === "teachers" && can("schedule.create") && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setSelected([
                    {
                      date: base < DEMO_TODAY ? DEMO_TODAY : base,
                      time: "19:00",
                    },
                  ]);
                  beginSchedule(true);
                }}
              >
                <Plus size={15} />
                安排课程
              </Button>
            )}
            {panel === "teachers" && (
              <Button
                size="sm"
                onClick={() => {
                  setModal("free");
                  setError("");
                }}
              >
                <Image size={15} />
                生成空档图
              </Button>
            )}
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
          { value: "teachers", label: "老师排课" },
          { value: "pending", label: "待排课学员", count: pending.length },
        ]}
      />
      <div className="schedule-workspace">
        <aside className="schedule-roster">
          <h3>{panel === "teachers" ? "老师列表" : "待排课学员"}</h3>
          {panel === "teachers" ? (
            <>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="搜索老师"
              />
              <Select
                aria-label="按 SO 筛选"
                value={so}
                onValueChange={(value) => setSo(value)}
              >
                <option value="">全部 SO</option>
                {[...new Set(data.teachers.map((t) => t.so))].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <div className="roster-list">
                {filtered.map((t) => {
                  return (
                    <button
                      key={t.id}
                      className={`roster-person ${view === "week" && selectedTeacher === t.id ? "selected" : ""}`}
                      aria-pressed={view === "week" && selectedTeacher === t.id}
                      onClick={() => selectTeacher(t.id)}
                    >
                      <Avatar name={t.name} />
                      <span>
                        <strong>
                          {t.name} {t.needConfirm && <AlertCircle size={13} />}
                        </strong>
                        <small>{t.so + " · 口音 " + t.accent}</small>
                      </span>
                      <span className="roster-rate">
                        {usage(t)}
                        <small>%</small>
                      </span>
                    </button>
                  );
                })}
                {!filtered.length && (
                  <EmptyState
                    title="没有合适的老师"
                    description="试试调整意向时间或筛选条件。"
                  />
                )}
              </div>
            </>
          ) : (
            <div className="roster-list">
              {pending.map((s) => (
                <button
                  key={s.id}
                  className={`roster-person ${studentId === s.id ? "selected" : ""}`}
                  onClick={() => {
                    changeStudent(s.id);
                    setRecommendedTeacher("");
                  }}
                >
                  <Avatar name={s.name} />
                  <span>
                    <strong>
                      {s.name}
                      {s.groupName ? ` · ${s.groupName}` : ""}
                    </strong>
                    <small>
                      {s.project} ·{" "}
                      {s.age === null ? "年龄未填写" : `${s.age} 岁`} ·{" "}
                      {s.material}
                      {s.scheduleIntent
                        ? (() => {
                            const progress = getStudentScheduleProgress(
                              data,
                              s.id,
                              s.scheduleIntent,
                            );
                            return ` · 已排 ${progress.scheduledCount}/${progress.requiredCount} 节`;
                          })()
                        : " · 待补充意向"}
                    </small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
              {!pending.length && (
                <EmptyState
                  title="都安排好了"
                  description="新学员会显示在这里。"
                />
              )}
            </div>
          )}
          {panel === "teachers" && (
            <div className="roster-tip">
              <Users size={16} />
              <span>
                选择老师后，点击空档安排课程。Shift 多选多个独立上课时间。
              </span>
            </div>
          )}
        </aside>
        <div className="schedule-main stack">
          {panel === "pending" &&
            (student ? (
              <StudentSchedulingPanel
                onFixedPlan={(plan, intent) => {
                  setFixedPlan({ plan, intent });
                  setTeacher(plan.primaryTeacherId);
                  setModal(null);
                  setRecommendedTeacher("");
                }}
                key={student.id}
                student={student}
                onIntentSaved={() => {
                  setRecommendedTeacher("");
                  setSelected([]);
                }}
                onScheduleComplete={(count, teacherName) =>
                  setScheduleResult({
                    studentId,
                    studentName: student.name,
                    teacherName,
                    count,
                  })
                }
                onViewTeacher={setProfileTeacherId}
              />
            ) : (
              <EmptyState
                title="请选择待排课学员"
                description="查看该学员的意向时间，匹配老师并生成排课方案。"
              />
            ))}
          {panel === "teachers" && teacherCalendar}
        </div>
      </div>
      {panel === "teachers" &&
        selected.length > 0 &&
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
              {!selectedOutside && (selected.length > 0 || found) && (
                <Button
                  size="sm"
                  onClick={() => beginSchedule(true)}
                  disabled={preview}
                >
                  灵活排课
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => beginSchedule(selectedOutside)}
                disabled={preview}
              >
                <Plus size={15} />
                选择学员排
                {selectedOutside ? "灵活课" : "固定课"}
              </Button>
            </div>
          </div>
        )}
      <ScheduleOverlay
        open={Boolean(fixedPlan)}
        onClose={() => setFixedPlan(null)}
        title={`${student?.name || "学员"} 的排课方案`}
        width={1100}
        footer={null}
      >
        {fixedPlan && (
          <FixedPlanCalendar
            key={`${studentId}-${fixedPlan.plan.primaryTeacherId}`}
            studentId={studentId}
            plan={fixedPlan.plan}
            intent={fixedPlan.intent}
            onClose={() => setFixedPlan(null)}
            onComplete={(count, teacherName) => {
              setFixedPlan(null);
              setScheduleResult({
                studentId,
                studentName: student?.name || "学员",
                teacherName,
                count,
              });
            }}
          />
        )}
      </ScheduleOverlay>
      <ScheduleOverlay
        open={modal === "schedule"}
        onClose={() => setModal(null)}
        title={`给 ${student?.name || "学员"} 排课`}
        width={1000}
        footer={null}
      >
        {modal === "schedule" && (
          <CoursePlanEditor
            studentId={studentId}
            teacherId={selectedTeacher}
            slots={selected.map((slot) => ({
              ...slot,
              teacherId:
                generatedPlan &&
                isAvailable(
                  data,
                  selectedTeacher,
                  slot.date,
                  slot.time,
                  duration,
                  studentId,
                ).length
                  ? ""
                  : selectedTeacher,
            }))}
            kind={kind}
            duration={duration}
            generated={generatedPlan}
            onComplete={(id, count, teachers, date) => {
              navigateView("week", date);
              setModal(null);
              setSelected([]);
              setRecommendedTeacher("");
              setScheduleResult({
                studentId: id,
                studentName:
                  data.students.find((s) => s.id === id)?.name || "学员",
                teacherName: teachers,
                count,
              });
            }}
            onClose={() => {
              setModal(null);
              setSelected([]);
            }}
          />
        )}
      </ScheduleOverlay>
      <Drawer
        open={
          panel === "pending" &&
          Boolean(recommendedTeacher) &&
          modal !== "schedule" &&
          !scheduleResult
        }
        onClose={closeStudentFlow}
        title={`为 ${student?.name || "学员"} 排课 · ${teacher.name}`}
        description="点击意向时段可多选，再次点击取消；选好后预览排课。"
        width={1000}
        footer={
          <>
            <span className="schedule-drawer-selection">
              {selected.length
                ? `已选 ${selected.length} 个上课时间`
                : "尚未手动选择时间"}
            </span>
            <Button onClick={closeStudentFlow}>取消</Button>
            <Button
              variant="primary"
              disabled={
                !student?.scheduleIntent || !can("schedule.create") || preview
              }
              onClick={previewStudentTimes}
            >
              预览排课
            </Button>
          </>
        }
      >
        <div className="stack schedule-student-calendar">
          {student?.scheduleIntent && (
            <p className="schedule-drawer-intent">
              {student.scheduleIntent.mode === "fixed"
                ? "固定排课"
                : "灵活排课"}{" "}
              · 每节 {duration} 分钟 · 每周 {student.scheduleIntent.frequency}{" "}
              节 · 共 {weeks} 周
            </p>
          )}
          {teacherCalendar}
        </div>
      </Drawer>
      <Drawer
        open={Boolean(scheduleResult)}
        onClose={() => setScheduleResult(null)}
        title="排课完成"
        width={640}
        footer={
          <>
            <Link
              className="btn btn-secondary"
              to={`/students/${scheduleResult?.studentId}?tab=courses`}
            >
              查看学员课表
            </Link>
            <Button
              variant="primary"
              onClick={() => {
                setScheduleResult(null);
                setPanel("pending");
                setStudent(
                  pending.find((s) => s.id !== scheduleResult?.studentId)?.id ||
                    "",
                );
              }}
            >
              继续处理下一位学员
            </Button>
          </>
        }
      >
        {scheduleResult && (
          <div className="stack">
            <h3>
              已为 {scheduleResult.studentName} 安排 {scheduleResult.count}{" "}
              节课程
            </h3>
            <p>授课老师：{scheduleResult.teacherName}</p>
            <p>
              课程已保存，学员排课进度已更新。未完成的排课需求会继续保留在待排列表。
            </p>
          </div>
        )}
      </Drawer>
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
              <dt>老师介绍</dt>
              <dd>{profileTeacher.bio || "未填写"}</dd>
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
        open={Boolean(lesson)}
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
                disabled={!can("student.reschedule") || preview}
              >
                调课 / 换老师
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
              disabled={
                preview ||
                !rescheduleDate ||
                !rescheduleTime ||
                !rescheduleTeacher ||
                Boolean(movePrecheck) ||
                (moveNeedsConfirmation && !rescheduleConfirmed)
              }
              onClick={() => {
                if (lesson)
                  run(
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
                    },
                  );
              }}
            >
              确认调整
            </Button>
          </>
        }
      >
        <div className="stack">
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
      <Modal
        open={modal === "free"}
        onClose={() => setModal(null)}
        title="生成老师空档图"
        description="只展示老师介绍与可上课时间，不包含其他学员信息。"
        width={720}
        footer={
          <>
            <Button onClick={() => setModal(null)}>关闭</Button>
            <Button onClick={() => exportImage(false)} loading={busy}>
              <Download size={16} />
              保存图片
            </Button>
            <Button
              variant="primary"
              onClick={() => exportImage(true)}
              loading={busy}
            >
              复制图片
            </Button>
          </>
        }
      >
        <div className="free-preview" ref={freeRef}>
          <div className="free-brand">
            Crazy Talk <span>找到喜欢的老师，开启新的学习旅程</span>
          </div>
          <div className="row gap-16">
            <Avatar name={teacher.name} size={56} />
            <div>
              <h2>{teacher.name}</h2>
              <p>
                {teacher.so} · 口音 {teacher.accent} ·{" "}
                {teacher.categories.join(" / ")}
              </p>
            </div>
          </div>
          <p className="free-bio">{teacher.bio}</p>
          <h3>
            {formatDate(weekStart)} — {formatDate(addDays(weekStart, 6))}{" "}
            可上课时间
          </h3>
          <div className="free-days">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(
              (date) => (
                <div key={date}>
                  <strong>{weekdays[dayOf(date)]}</strong>
                  <small>{formatDate(date)}</small>
                  {slots
                    .filter(
                      (time) =>
                        date >= DEMO_TODAY &&
                        isFree(
                          teacher,
                          { date, time },
                          25,
                          undefined,
                          false,
                          false,
                        ),
                    )
                    .map((time) => (
                      <span key={time}>{time}</span>
                    ))}
                </div>
              ),
            )}
          </div>
          <small>具体安排请联系教务确认</small>
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
