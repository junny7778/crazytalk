import { ScheduleTeacherPicker } from "./ScheduleTeacherPicker";
import { operationsNow } from "@crazytalk/shared";
import { teacherSchedulingAccountIssue } from "@crazytalk/shared";
import { TeacherSchedulingAccountNotice } from "./SchedulingAccountNotice";
import { materialMatchIssue, studentMaterials } from "@crazytalk/shared";
import { StudentLessonDrawer } from "../StudentLessonDrawer";
import ClassInOperationFeedback from "../ClassInOperationFeedback";
import ClassInBookingPreview from "./ClassInBookingPreview";
import { useScheduleCredits } from "./useScheduleCredits";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  isAvailable,
  minutes,
  type FixedPlan,
  type FixedPlanSlot,
  type ScheduleIntent,
} from "@crazytalk/shared";
import { Badge, Button, Modal, useToast } from "@crazytalk/ui";
const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
const monday = (date: string) => addDays(date, -((dayOf(date) + 6) % 7));
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
type Row = FixedPlanSlot & {
  manual?: boolean;
  extra?: boolean;
  fixedOrigin?: { date: string; time: string };
};
export function FixedPlanCalendar({
  active = true,
  studentId,
  plan,
  intent,
  onClose,
  onComplete,
  onBusyChange,
}: {
  active?: boolean;
  studentId: string;
  plan: FixedPlan;
  intent: ScheduleIntent;
  onBusyChange?: (busy: boolean) => void;
  onClose: () => void;
  onComplete: (count: number, teachers: string) => void;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const student = data.students.find((s) => s.id === studentId);
  const materials = student ? studentMaterials(data, student).filter(c => !intent.materialIds || intent.materialIds.includes(c.id)) : [];
  const [rows, setRows] = useState<Row[]>(() => plan.slots.map(s => ({...s, material: s.material || materials[0]?.name || ""})));
  const lessonKind = intent.kind ?? "固定课";
  const [viewedLesson, setViewedLesson] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const unchangedRecommendation = !rows.some(r => r.manual) && JSON.stringify(rows.map(({date,time,teacherId,material})=>({date,time,teacherId,material}))) === JSON.stringify(plan.slots.map(({date,time,teacherId,material})=>({date,time,teacherId,material})));
  const [week, setWeek] = useState(() => {
    const firstLesson = plan.slots.find(slot => slot.teacherId && !slot.lessonId)
      ?? plan.slots.find(slot => slot.teacherId);
    return monday(firstLesson?.date ?? intent.startDate);
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [choosingTeacher, setChoosingTeacher] = useState(false);
  const [includeFollowing, setIncludeFollowing] = useState(false);
  const [extra, setExtra] = useState<{ date: string; time: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rowKey = (r: { date: string; time: string }) => `${r.date}/${r.time}`;
  const teachers = data.teachers.filter(
    (t) =>
      materials.some(c => t.materialIds?.includes(c.id)) && t.status !== "已离职",
  );
  const dragged = rows.find((r) => rowKey(r) === dragging && !r.lessonId);
  function targetTeachers(date: string, time: string, source?: Row) {
    if (date < DEMO_TODAY) return [];
    if (
      rows.some(
        (r) =>
          r !== source &&
          !r.lessonId &&
          r.date === date &&
          minutes(r.time) < minutes(time) + intent.duration &&
          minutes(time) < minutes(r.time) + intent.duration,
      )
    )
      return [];
    return teachers.filter(
      (t) =>
        !teacherSchedulingAccountIssue(t) &&
        !materialMatchIssue(data, student!, t, source?.material || materials[0]?.name || "") &&
        !isAvailable(data, t.id, date, time, intent.duration, studentId, undefined, false, true).length,
    );
  }
  function dropLesson(date: string, time: string) {
    if (!dragged) return;
    if (dragged.date === date && dragged.time === time) {
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const candidates = targetTeachers(date, time, dragged);
    if (!candidates.length) {
      setMessage("该时段不可排课，课程未移动。");
      setDragging(null);
      setDropTarget(null);
      return;
    }
    const keepTeacher = candidates.some((t) => t.id === dragged.teacherId);
    const moved: Row = {
      ...dragged,
      manual: true,
      date,
      time,
      teacherId: keepTeacher ? dragged.teacherId : "",
      ...(!dragged.extra
        ? {
            fixedOrigin: dragged.fixedOrigin || {
              date: dragged.date,
              time: dragged.time,
            },
          }
        : {}),
    };
    setRows(rows.map((r) => (r === dragged ? moved : r)));
    setDragging(null);
    setDropTarget(null);
    setChoosingTeacher(!keepTeacher);
    setIncludeFollowing(false);
    setEditing(keepTeacher ? null : rowKey(moved));
    setMessage(
      keepTeacher
        ? "已调整本节时间，其他周保持不变。"
        : "原老师在新时间不可用，请选择本节可用老师。",
    );
  }
  const editable = rows.filter((r) => !r.lessonId);
  const missingTimeCount = Math.max(
    0,
    plan.requiredCount - rows.length,
  );
  function issues(r: Row, teacherChoice?: string) {
    const id = teacherChoice ?? r.teacherId;
    if (!id) return ["待安排老师"];
    if (!teachers.some((t) => t.id === id)) return ["老师不符合授课要求"];
    const materialIssue = materialMatchIssue(data, student!, teachers.find(t => t.id === id)!, r.material || materials[0]?.name || "");
    if (materialIssue) return [materialIssue];
    const accountIssue = teacherSchedulingAccountIssue(teachers.find(t=>t.id===id)!);
    if (accountIssue) return [accountIssue];
    if (r.date < DEMO_TODAY) return ["上课日期已过期"];
    const overlap = rows.some(
      (other) =>
        !other.lessonId &&
        rowKey(other) !== rowKey(r) &&
        other.date === r.date &&
        minutes(other.time) < minutes(r.time) + intent.duration &&
        minutes(r.time) < minutes(other.time) + intent.duration,
    );
    return [
      ...(overlap ? ["计划中课程重叠"] : []),
      ...isAvailable(data, id, r.date, r.time, intent.duration, studentId, undefined, false, !!teacherChoice || !!r.manual),
    ];
  }
  const ready = editable.filter(r => !issues(r).length);
  ready.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const pendingCount = editable.length - ready.length + missingTimeCount;
  const gaps = editable.filter((r) => issues(r).length);
  const focused = rows.find((r) => rowKey(r) === editing);
  const following = focused && choosingTeacher && !focused.extra ? rows.filter(r =>
    !r.lessonId && !r.extra && r.date > focused.date && dayOf(r.date) === dayOf(focused.date) && r.time === focused.time,
  ) : [];
  const available = focused && choosingTeacher
    ? teachers.filter((t) => !issues(focused, t.id).length)
    : [];
  const confirmed = data.lessons.filter(
    (l) =>
      l.studentId === studentId &&
      l.status !== "已取消" &&
      l.date >= week &&
      l.date < addDays(week, 7),
  );
  const visible = rows.filter(
    (r) => !r.lessonId && r.date >= week && r.date < addDays(week, 7),
  );
  const displayedTimes = [...rows, ...confirmed].map((r) => minutes(r.time));
  const windows = [...intent.windows, ...teachers.flatMap(t => t.availability)];
  const windowStarts = windows.map((w) => minutes(w.start));
  const windowEnds = windows.map((w) => minutes(w.end));
  const start = Math.max(
    0,
    Math.floor(
      (Math.min(...displayedTimes, ...windowStarts, 19 * 60) - 30) / 30,
    ) * 30,
  );
  const end = Math.min(
    1440,
    Math.ceil(
      (Math.max(
        ...displayedTimes,
        ...windowEnds.map((m) => m - intent.duration),
        20 * 60,
      ) +
        intent.duration +
        30) /
        30,
    ) * 30,
  );
  const scroll = useRef<HTMLDivElement>(null);
  const anchoredWeek = useRef("");
  const planned = visible.filter(row => row.teacherId);
  const anchorLessons = planned.length ? planned : confirmed;
  const firstMinute = Math.min(...anchorLessons.map(lesson => minutes(lesson.time)));
  useLayoutEffect(() => {
    if (!active) {
      anchoredWeek.current = "";
      return;
    }
    if (reviewing || !scroll.current || anchoredWeek.current === week) return;
    // Leave one half-hour row above the earliest course, below the sticky day headers.
    scroll.current.scrollTop = Number.isFinite(firstMinute)
      ? Math.max(0, Math.floor((firstMinute - start) / 30) - 1) * 48
      : 0;
    anchoredWeek.current = week;
  }, [active, reviewing, week, firstMinute, start]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weeklyShortfalls = Array.from({length: intent.weeks}, (_, index) => {
    const from = addDays(intent.startDate, index * 7);
    const to = addDays(from, 7);
    const expected = Math.min(intent.frequency, plan.requiredCount - index * intent.frequency);
    const assigned = rows.filter(r => r.date >= from && r.date < to && (intent.unlimited || !r.extra) && (r.lessonId || ready.includes(r)));
    const missing = expected - assigned.length;
    if (missing <= 0) return null;
    const pending = editable.find(r => r.date >= from && r.date < to && !ready.includes(r));
    const reason = pending ? issues(pending)[0] : "意向时间或每日上限不足以排满";
    return <li key={from}>第 {index + 1} 周（{from} 起）少排 {missing} 节：{reason}</li>;
  });
  const teacherSummary = [
    ...new Set(rows.map((r) => r.teacherId).filter(Boolean)),
  ]
    .map(
      (id) =>
        `${data.teachers.find((t) => t.id === id)?.name || id} ${rows.filter((r) => r.teacherId === id).length} 节`,
    )
    .join(" · ");
  const [scheduleRevision] = useState(() => data.students.find(s => s.id === studentId)?.scheduleRevision ?? 0);
  const credits = useScheduleCredits(studentId, intent.duration, ready.length, editable.map(r=>r.teacherId).filter(Boolean), intent.unlimited ? intent.unitsPerLesson : undefined);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { onBusyChange?.(submitting); }, [submitting, onBusyChange]);
  const submitLock = useRef(false);
  async function submit() {
    if (submitLock.current) return;
    submitLock.current = true; setSubmitting(true);
    try {
      if (!ready.length) return;
      const result = await act({
        type: "lesson.schedule",
        scheduleRevision,
        schedulePlanId: intent.planId,
        selectionMode: unchangedRecommendation ? "recommended" : "manual",
        plannedUnits: credits.units,
        studentId,
        teacherId: plan.primaryTeacherId,
        slots: ready,
        duration: intent.duration,
        kind: lessonKind,
        material: ready[0].material || "",
      });
      if (!mounted.current) return;
      toast(result.message);
      if (ready.length === editable.length && !missingTimeCount) {
        onComplete(ready.length, teacherSummary);
      } else {
        setRows(
          rows.map((r) => {
            if (!ready.includes(r)) return r;
            const lesson = result.data.lessons.find(
              (l) =>
                l.studentId === studentId &&
                l.date === r.date &&
                l.time === r.time &&
                l.status !== "已取消",
            );
            return lesson ? { ...r, lessonId: lesson.id } : r;
          }),
        );
        setEditing(null);
        setReviewing(false);
        setMessage(`${result.message}；其余课次仍待处理。`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "提交失败，请重试");
    } finally { submitLock.current = false; setSubmitting(false); }
  }
  return (
    <div className="fixed-plan stack">
      <StudentLessonDrawer lessonId={viewedLesson} onClose={() => setViewedLesson(null)}/>
      <ClassInOperationFeedback studentId={studentId}/>
      <fieldset disabled={submitting} className="stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
      <section className="fixed-plan-summary" aria-label="排课方案概览">
        <div className="fixed-plan-summary-head">
          <div className="fixed-plan-summary-title">
            <h3>排课方案概览</h3>
            <Badge tone={lessonKind === "固定课" ? "info" : "neutral"}>{lessonKind}</Badge>
          </div>
          <span className={`fixed-draft-badge${unchangedRecommendation ? "" : " is-manual"}`}>
            {unchangedRecommendation ? "系统推荐方案" : "教务手动调整"} · 尚未确认
          </span>
        </div>
        <div className="fixed-plan-summary-grid">
          <div className="fixed-plan-metric" data-pending={pendingCount > 0 || undefined}>
            <span>排课进度</span>
            <strong>{ready.length} / {plan.requiredCount} 节</strong>
            <small>目标 {plan.requiredCount} 节 · 拟安排 {ready.length} 节 · 待处理 {pendingCount} 节</small>
          </div>
          <div className="fixed-plan-metric">
            <span>授课老师</span>
            <strong>{teacherSummary || "尚未分配老师"}</strong>
          </div>
          <div className="fixed-plan-metric">
            <span>上课教材</span>
            <strong>{materials[0]?.name || student?.material || "未设置"}</strong>
          </div>
          <div className="fixed-plan-metric">
            <span>频次与周期</span>
            <strong>{intent.duration} 分钟 · 每周 {intent.frequency} 节</strong>
            <small>{intent.dailyLimit ? `每天最多 ${intent.dailyLimit} 节 · ` : ""}共 {intent.weeks} 周</small>
          </div>
        </div>
        {plan.positions.length > 0 && (
          <div className="fixed-plan-slots">
            <span className="fixed-plan-slots-label">固定时段</span>
            {plan.positions.map((p) => (
              <span key={`${p.day}-${p.time}`} className="fixed-plan-slot-chip">
                {days[p.day]} {p.time}
              </span>
            ))}
          </div>
        )}
      </section>
      {missingTimeCount > 0 && (
        <p role="status">
          距离目标还差 {missingTimeCount} 节，可在日历空档补排，或先确认已有安排。
        </p>
      )}
      {unchangedRecommendation && weeklyShortfalls.some(Boolean) && <details><summary>查看各周排课缺口</summary><ul>{weeklyShortfalls}</ul></details>}
      {!reviewing && gaps.length > 0 && (
        <div className="row wrap">
          <Button
            size="sm"
            onClick={() => {
              const index = gaps.findIndex((r) => rowKey(r) === editing);
              const r = gaps[(index + 1) % gaps.length];
              setChoosingTeacher(true);
              setIncludeFollowing(false);
              setMessage("");
              setWeek(monday(r.date));
              setEditing(rowKey(r));
            }}
          >
            下一处待安排（{gaps.length}）
          </Button>
        </div>
      )}
      <div hidden={reviewing} className="stack">
      <div className="row between wrap">
        <div className="fixed-plan-week-nav" aria-label="课表周切换">
          <button
            type="button"
            className="icon-button"
            aria-label="上一周"
            disabled={week <= monday(DEMO_TODAY)}
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {week.replaceAll("-", "/")} - {addDays(week, 6).replaceAll("-", "/")}
          </strong>
          <button
            type="button"
            className="icon-button"
            aria-label="下一周"
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="row fixed-plan-lock-actions"><Button size="sm" variant="ghost" disabled={!ready.length || preview || !can("schedule.create")} onClick={async () => {try {await act({type:"slot.lock",studentId,manual:!unchangedRecommendation,duration:intent.duration,slots:ready,expiresAt:new Date(operationsNow()+30*60000).toISOString()});setMessage("档期已保留30分钟；这不会创建课程。");} catch(e) {setMessage(e instanceof Error ? e.message : "保留失败");}}}>保留方案档期30分钟</Button>{data.slotLocks?.some(l => l.studentId === studentId && Date.parse(l.expiresAt) > operationsNow()) && <Button size="sm" variant="ghost" onClick={async () => {try {await act({type:"slot.release",studentId});setMessage("已释放档期");} catch(e) {setMessage(String(e));}}}>释放保留档期</Button>}</div>
      </div>
      <div className="fixed-calendar-scroll" ref={scroll}>
        <div
          className="fixed-calendar"
          role="region"
          aria-label="学员固定课表"
          style={{
            gridTemplateColumns: `64px repeat(${weekDates.length},minmax(90px,1fr))`, gridTemplateRows: `44px repeat(${(end - start) / 30},48px)`,
          }}
        >
          <div className="fixed-calendar-head">时间</div>
          {weekDates.map((date) => (
            <div className={`fixed-calendar-head ${date === DEMO_TODAY ? "today" : ""}`} key={date}>
              {days[dayOf(date)]}
              <small>{date.slice(5)}</small>
            </div>
          ))}
          {Array.from(
            { length: (end - start) / 30 },
            (_, i) => start + i * 30,
          ).map((m, i) => (
            <div
              className="fixed-time"
              key={m}
              style={{ gridColumn: 1, gridRow: i + 2 }}
            >
              {clock(m)}
            </div>
          ))}
          {weekDates.flatMap((date, d) =>
            Array.from({ length: (end - start) / 30 }, (_, i) => {
              const time = clock(start + i * 30);
              const canSchedule =
                targetTeachers(date, time, dragged).length > 0;
              const preferred = date >= DEMO_TODAY && date >= intent.startDate && intent.windows.some((window) =>
                window.day === dayOf(date) && time >= window.start &&
                minutes(time) + intent.duration <= minutes(window.end),
              );
              const targetKey = `${date}/${time}`;
              return (
                <button
                  key={`${date}-${time}`}
                  className={`fixed-empty-cell ${canSchedule ? "available" : "unavailable"} ${preferred ? "intent" : ""} ${dropTarget === targetKey ? "drop-target" : ""}`}
                  aria-label={`${date} ${time} ${canSchedule ? "可排课" : "不可排课"}`}
                  title={
                    canSchedule
                      ? "有老师可教本节教材，可加课或拖入课程"
                      : "该时段无法安排本节课程"
                  }
                  aria-disabled={!canSchedule}
                  onDragOver={(e) => {
                    if (dragged && canSchedule) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropTarget(targetKey);
                    }
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropLesson(date, time);
                  }}
                  style={{ gridColumn: d + 2, gridRow: i + 2 }}
                  onClick={() => {
                    if (!canSchedule || dragged) return;
                    setExtra({ date, time });
                    setEditing(null);
                  }}
                >
                  {canSchedule ? (preferred ? "＋ 意向时间" : "＋") : ""}
                </button>
              );
            }),
          )}
          {visible.map((r) => {
            const missing = issues(r).length > 0;
            return (
              <button
                key={rowKey(r)}
                draggable
                onDragStart={(e) => {
                  setDragging(rowKey(r));
                  setEditing(null);
                  setMessage("");
                  e.dataTransfer.setData("text/plain", rowKey(r));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                className={`fixed-course ${missing ? "gap" : ""} ${editing === rowKey(r) ? "active" : ""}`}
                style={{
                  gridColumn: weekDates.indexOf(r.date) + 2,
                  gridRow: "2 / -1",
                  alignSelf: "start",
                  marginTop: (minutes(r.time) - start) * 1.6,
                  height: intent.duration * 1.6,
                }}
                aria-label={`${r.date} ${r.time} ${r.teacherId ? data.teachers.find((t) => t.id === r.teacherId)?.name : "待安排"}`}
                onClick={() => {
                  setChoosingTeacher(false);
                  setMessage("");
                  setEditing(rowKey(r));
                  setExtra(null);
                }}
              >
                <strong>
                  {r.time}–{clock(minutes(r.time) + intent.duration)} ·{" "}
                  {r.teacherId
                    ? data.teachers.find((t) => t.id === r.teacherId)?.name
                    : "待安排"}
                </strong>
                <small>
                  {missing ? "待处理" : "拟安排"}
                  {r.extra ? " · 单次加课" : r.fixedOrigin ? " · 单次调整" : ""}
                </small>
              </button>
            );
          })}
          {confirmed.map((l) => (
            <button type="button" onClick={() => setViewedLesson(l.id)}
              className="fixed-course confirmed"
              key={l.id}
              style={{
                gridColumn: weekDates.indexOf(l.date) + 2,
                gridRow: "2 / -1",
                alignSelf: "start",
                marginTop: (minutes(l.time) - start) * 1.6,
                height: l.duration * 1.6,
              }}
            >
              <strong>
                {l.time}–{clock(minutes(l.time) + l.duration)} ·{" "}
                {data.teachers.find((t) => t.id === l.teacherId)?.name}
              </strong>
              <small>已排课</small>
            </button>
          ))}
        </div>
      </div>
      <div className="fixed-calendar-legend">
        <span>
          <i className="available" />
          可排课
        </span>
        <span>
          <i className="unavailable" />
          不可安排
        </span>
        <span><i className="booked" />已排课</span>
        <span><i className="intent" />学员意向</span>
        <small>点击空档可选老师加课，拖动课程可调整本节时间。</small>
      </div>
      {extra && (
        <ScheduleTeacherPicker
          student={student} date={extra.date} time={extra.time} duration={intent.duration}
          material={materials[0]?.name || ""} editingTeachers={targetTeachers(extra.date, extra.time)}
          pastTeachers={data.lessons.filter(l => l.studentId === studentId && l.status === "已完成").map(l => l.teacherId)}
          plannedTeachers={rows.map(r => r.teacherId)}
          onClose={() => setExtra(null)}
          onChoose={teacherId => {
            setRows([...rows, {...extra, manual: true, teacherId, material: materials[0]?.name || "", extra: true}]);
            setExtra(null);
            setMessage("");
          }}
        />
      )}
      {focused && !focused.lessonId && (choosingTeacher ? (
        <ScheduleTeacherPicker
          student={student} date={focused.date} time={focused.time} duration={intent.duration}
          material={focused.material || ""} editingTeachers={available}
          unboundTeachers={teachers.filter(t => teacherSchedulingAccountIssue(t))}
          initialTeacher={focused.teacherId} plannedTeachers={rows.map(r => r.teacherId)}
          pastTeachers={data.lessons.filter(l => l.studentId === studentId && l.status === "已完成").map(l => l.teacherId)}
          title={focused.teacherId ? "更换授课老师" : "选择授课老师"}
          confirmLabel={focused.teacherId ? "确认更换" : "确认选择"}
          error={message}
          onClose={() => { setChoosingTeacher(false); setMessage(""); }}
          onChoose={teacherId => {
            if (includeFollowing && following.some(r => issues(r, teacherId).length)) {
              setMessage("该老师无法覆盖全部后续课次，可仅更换本节。");
              return;
            }
            setRows(rows.map(r =>
              (r === focused || (includeFollowing && following.includes(r))) && r.teacherId !== teacherId
                ? { ...r, manual: true, teacherId } : r,
            ));
            setChoosingTeacher(false);
            setMessage("");
          }}
        >
          {following.length > 0 && <label><input type="checkbox" checked={includeFollowing}
            onChange={e => setIncludeFollowing(e.target.checked)}/> 同时更换后续同一时段的 {following.length} 节课</label>}
        </ScheduleTeacherPicker>
      ) : (
        <Modal open onClose={() => setEditing(null)} title="本节课程详情" width={440}
          footer={<div className="row between">
            <Button variant="ghost" onClick={() => {
              setRows(rows.filter(r => r !== focused));
              setEditing(null);
              setMessage("");
            }}>取消本节安排</Button>
            <Button variant="primary" onClick={() => {
              setIncludeFollowing(false);
              setChoosingTeacher(true);
            }}>{focused.teacherId ? "更换老师" : "选择老师"}</Button>
          </div>}
        >
          <dl className="flex-picker-summary fixed-lesson-details">
            <dt>授课老师</dt><dd><strong>{data.teachers.find(t => t.id === focused.teacherId)?.name || "待安排"}</strong></dd>
            <dt>上课时间</dt><dd>{focused.date} {days[dayOf(focused.date)]} {focused.time}–{clock(minutes(focused.time) + intent.duration)}</dd>
            <dt>学员</dt><dd>{student?.name}</dd>
            <dt>教材</dt><dd>{focused.material}</dd>
          </dl>
          {focused.teacherId && issues(focused).map(issue => <p key={issue} role="alert">{issue}</p>)}
        </Modal>
      ))}
      {message && !focused && <p role="alert">{message}</p>}
      </div>
      {reviewing && (
        <section aria-label="本次排课核对" className="stack">
          <div className="row between wrap">
            <h4>本次安排 {ready.length} 节 · 预计扣课 {credits.units ? Math.round(ready.length * credits.units * 100) / 100 : "待核实"} 课时 · 仍有 {pendingCount} 节待处理</h4>
            <small className="muted">请核对全部排课明细后再提交保存</small>
          </div>
          <div className="schedule-lessons-scroll">
            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>日期</th>
                  <th>星期</th>
                  <th>时间段</th>
                  <th>老师</th>
                  <th>教材</th>
                  <th>课程类型</th>
                  <th>时长</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((r, index) => (
                  <tr key={rowKey(r)}>
                    <td>{index + 1}</td>
                    <td>{r.date}</td>
                    <td>{days[dayOf(r.date)]}</td>
                    <td>{r.time}–{clock(minutes(r.time) + intent.duration)}</td>
                    <td>{data.teachers.find((t) => t.id === r.teacherId)?.name}</td>
                    <td>{r.material}</td>
                    <td>{r.extra ? "临时课" : lessonKind}</td>
                    <td>{intent.duration} 分钟</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {teachers.filter(t=>editable.some(r=>r.teacherId===t.id) && teacherSchedulingAccountIssue(t)).map(t=><TeacherSchedulingAccountNotice key={t.id} teacher={t}/>)}
      <ClassInBookingPreview studentId={studentId} teacherIds={ready.map(row => row.teacherId)}/>
      {credits.node}
      </fieldset>
      <div className="fixed-plan-footer schedule-flow-actions">
        <span>{reviewing ? "本次可确认" : "拟安排"} {ready.length} 节 · 待处理 {pendingCount} 节</span>
        <Button disabled={submitting} onClick={() => reviewing ? setReviewing(false) : onClose()}>返回调整</Button>
        <Button
          variant="primary"
          disabled={
            Boolean(credits.error) ||
            !ready.length ||
            preview ||
            !can("schedule.create")
          }
          loading={submitting}
            onClick={() => reviewing ? submit() : setReviewing(true)}
        >
          {submitting ? "正在排课" : !reviewing ? "核对排课" : ready.length === editable.length && !missingTimeCount
            ? "确认排课"
            : `确认已安排的 ${ready.length} 节`}
        </Button>
      </div>
    </div>
  );
}
