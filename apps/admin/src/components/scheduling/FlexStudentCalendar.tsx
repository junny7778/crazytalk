import { StudentLessonDrawer } from "../StudentLessonDrawer";
import { z } from "zod";
import { scheduleIntentSchema } from "@crazytalk/shared";
import { materialMatchIssue, studentMaterials } from "@crazytalk/shared";
import StudentCourses from "../StudentCourses";
import { CalendarStatusLegend, calendarLessonStatus } from "../CalendarStatusLegend";
import ClassInOperationFeedback from "../ClassInOperationFeedback";
import ClassInBookingPreview from "./ClassInBookingPreview";
import { useScheduleCredits } from "./useScheduleCredits";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  isAvailable,
  teacherFit, compareTeacherFit,
  getStudentScheduleProgress,
  minutes,
  type ScheduleIntent,
} from "@crazytalk/shared";
import { Avatar, Button, Field, Select, Tabs, Modal, useToast } from "@crazytalk/ui";
export type CustomSlot = { date: string; time: string; teacherId: string; material: string };
type Slot = CustomSlot;
const customDraftSchema = z.object({intent:scheduleIntentSchema, repeatWeeks:z.number().int().positive(), slots:z.array(z.object({date:z.string(),time:z.string(),teacherId:z.string(),material:z.string()}))});
export function customDraftKey(accountId: string, studentId: string, teacherId = "") { return `ct-custom-calendar:${accountId}:${studentId}:${teacherId}`; }
export function readCustomDraft(key: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  try { const parsed = customDraftSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : undefined; } catch { return undefined; }
}

const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayOf = (d: string) => new Date(`${d}T12:00:00+08:00`).getUTCDay();
const monday = (d: string) => addDays(d, -((dayOf(d) + 6) % 7));
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function FlexStudentCalendar({
  studentId,
  teacherId,
  initialTime,
  initialTimes = [],
  onPickTime,
  repeatWeeks = 1,
  intent,
  onComplete,
  onDirtyChange,
  onBusyChange,
  onClose,
  onStageChange,
}: {
  teacherId?: string;
  initialTime?: {date: string; time: string};
  initialTimes?: {date: string; time: string}[];
  onPickTime?: (slot: {date: string; time: string}) => void;
  repeatWeeks?: number;
  onClose?: () => void;
  onStageChange?: (stage: "setup" | "preview") => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onComplete?: (count: number, teacherNames: string) => void;
  studentId: string;
  intent: ScheduleIntent;
}) {
  const { data, act, can, preview, accountId } = useDemo();
  const toast = useToast();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const student = data.students.find(s=>s.id===studentId);
  const progress = getStudentScheduleProgress(data, studentId, intent);
  const [week, setWeek] = useState(
    monday(initialTime?.date || (intent.startDate < DEMO_TODAY ? DEMO_TODAY : intent.startDate)),
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const draftKey = customDraftKey(accountId, studentId, teacherId);
  const [savedDraft, setSavedDraft] = useState(() => studentId ? readCustomDraft(draftKey) : undefined);
  const [draftStarted, setDraftStarted] = useState(false);
  useEffect(() => {
    if (!studentId || !draftStarted) return;
    if (slots.length) localStorage.setItem(draftKey, JSON.stringify({intent, repeatWeeks, slots}));
    else localStorage.removeItem(draftKey);
  }, [draftKey, studentId, draftStarted, intent, repeatWeeks, slots]);
  const [calendarMode, setCalendarMode] = useState("edit");
  const [viewedLesson, setViewedLesson] = useState<string | null>(null);
  const [view, setView] = useState("week");
  const materials = student ? studentMaterials(data, student).filter(c => !intent.materialIds || intent.materialIds.includes(c.id)) : [];
  const [material, setMaterial] = useState(materials[0]?.name || "");
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedTimes, setSelectedTimes] = useState<{date: string; time: string}[]>(initialTimes.length > 1 ? initialTimes : []);
  const [reviewing, setReviewing] = useState(false);
  useEffect(() => { onStageChange?.(reviewing ? "preview" : "setup"); }, [reviewing, onStageChange]);
  useEffect(() => { onDirtyChange?.(slots.length > 0 || (!!studentId && selectedTimes.length > 0)); }, [slots.length, studentId, selectedTimes.length, onDirtyChange]);
  const [editor, setEditor] = useState<{
    date: string;
    time: string;
    index: number;
  } | null>(initialTime && studentId ? {...initialTime, index: -1} : null);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  useEffect(() => {
    setSelectedTeacher(
      editor && editor.index >= 0 ? slots[editor.index]?.teacherId || "" : "",
    );
    if (editor && editor.index >= 0) setMaterial(slots[editor.index].material);
    setTeacherQuery("");
  }, [editor]);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState("");
  const [error, setError] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current)
      scroll.current.scrollTop = Math.max(
        0,
        ((Math.min(...intent.windows.map((w) => minutes(w.start)), 19 * 60) -
          0) /
          30 -
          1) *
          48,
      );
  }, [week, intent]);
  const dates = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => addDays(week, i));
  const lessons = data.lessons.filter(
    (l) => (studentId ? l.studentId === studentId : l.teacherId === teacherId) && l.status !== "已取消",
  );
  const overlap = (
    date: string,
    time: string,
    other: { date: string; time: string; duration?: number },
  ) =>
    date === other.date &&
    minutes(time) < minutes(other.time) + (other.duration ?? intent.duration) &&
    minutes(other.time) < minutes(time) + intent.duration;
  const inIntent = (date: string, time: string) =>
    intent.windows.some(
      (w) =>
        w.day === dayOf(date) &&
        time >= w.start &&
        minutes(time) + intent.duration <= minutes(w.end),
    );
  function candidates(date: string, time: string, ignore = -1, textbook = material) {
    if (
      date < DEMO_TODAY ||
      slots.some((s, i) => i !== ignore && overlap(date, time, s))
    )
      return [];
    const previous = new Set(
      lessons.filter((l) => l.status === "已完成").map((l) => l.teacherId),
    );
    const selected = new Set(slots.map((s) => s.teacherId));
    return data.teachers
      .filter(
        (t) =>
          (!teacherId || t.id === teacherId) &&
          (!student || !materialMatchIssue(data, student, t, textbook)) &&
          !isAvailable(
            data,
            t.id,
            date,
            time,
            intent.duration,
            studentId,
            undefined,
            false,
            true,
          ).length,
      )
      .sort(
        (a, b) =>
          (student ? compareTeacherFit(data,student,a,b) : 0) ||
          Number(previous.has(b.id)) - Number(previous.has(a.id)) ||
          Number(selected.has(b.id)) - Number(selected.has(a.id)) ||
          a.name.localeCompare(b.name),
      );
  }
  const cellTimes = useMemo(() => {
    const result = new Map<string, string>();
    for (const date of dates) {
      if (date < DEMO_TODAY) continue;
      for (let m = 0; m < 1440; m += 30) {
        for (
          let offset = 0;
          offset < 30 && m + offset + intent.duration <= 1440;
          offset++
        ) {
          const time = clock(m + offset);
          if (candidates(date, time, drag ?? -1).length) {
            result.set(`${date}/${clock(m)}`, time);
            break;
          }
        }
      }
    }
    return result;
  }, [data, slots, week, drag, intent.duration, studentId, material, teacherId, view]);
  const editingTeachers = editor
    ? candidates(editor.date, editor.time, editor.index)
    : [];
  function choose(id: string) {
    if (!editor || !editingTeachers.some((t) => t.id === id)) return;
    const times = editor.index >= 0 ? [editor] : selectedTimes.length ? selectedTimes : [editor];
    const next = times.flatMap(t => Array.from({length: editor.index >= 0 ? 1 : repeatWeeks}, (_, i) => ({date: addDays(t.date, i * 7), time: t.time, teacherId: id, material})));
    if (next.some((s, index) => !candidates(s.date, s.time, editor.index).some(t => t.id === id) || next.some((other, j) => index !== j && overlap(s.date, s.time, other)))) {
      setError("选中或重复课次存在时间冲突，未加入课表，请修改时间或重复周期。"); return;
    }
    setDraftStarted(true);
    setSavedDraft(undefined);
    setSlots(editor.index < 0 ? [...slots, ...next] : slots.map((s, i) => i === editor.index ? next[0] : s));
    setSelectedTimes([]);
    setEditor(null);
    setError("");
  }
  function drop(date: string, time: string) {
    if (drag === null) return;
    const available = candidates(date, time, drag, slots[drag].material),
      old = slots[drag];
    if (!available.length) {
      setError("该时间不可排课，课程未移动。");
    } else if (available.some((t) => t.id === old.teacherId)) {
      setSlots(slots.map((s, i) => (i === drag ? { ...s, date, time } : s)));
      setError("已调整本节课程。");
    } else {
      setEditor({ date, time, index: drag });
      setError("原老师在目标时间不可用，请重新选择老师；选择前保留原安排。");
    }
    setDrag(null);
    setHover("");
  }
  const [scheduleRevision] = useState(() => data.students.find(s => s.id === studentId)?.scheduleRevision ?? 0);
  const credits = useScheduleCredits(studentId, intent.duration, slots.length);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => { onBusyChange?.(submitting); }, [submitting, onBusyChange]);
  const submitLock = useRef(false);
  async function submit() {
    if (submitLock.current) return;
    submitLock.current = true; setSubmitting(true);
    try {
      if (!slots.length) return;
      const result = await act({
        type: "lesson.schedule",
        scheduleRevision,
        plannedUnits: credits.units,
        schedulingMode: "flex",
        kind: repeatWeeks > 1 ? "固定课" : "临时课",
        studentId,
        teacherId: slots[0].teacherId,
        slots,
        duration: intent.duration,
        material: slots[0].material,
      });
      if (!mounted.current) return;
      toast(result.message);
      localStorage.removeItem(draftKey);
      setSlots([]);
      setEditor(null);
      setError("");
      onComplete?.(
        slots.length,
        [
          ...new Set(
            slots.map(
              (slot) =>
                data.teachers.find((teacher) => teacher.id === slot.teacherId)
                  ?.name || "未填写",
            ),
          ),
        ].join("、"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
    } finally { submitLock.current = false; setSubmitting(false); }
  }
  const hasInvalid = slots.some(
    (s, i) => !candidates(s.date, s.time, i, s.material).some((t) => t.id === s.teacherId),
  );
  return (
    <section className="flex-student-calendar stack" aria-label="自定义排课日历">
      <ClassInOperationFeedback studentId={studentId}/>
      <StudentLessonDrawer lessonId={viewedLesson} onClose={() => setViewedLesson(null)}/>
      {savedDraft && !draftStarted && <div className="row wrap"><span>有尚未完成的排课草稿</span><Button disabled={preview || !can("schedule.create")} onClick={() => {setSlots(savedDraft.slots);setDraftStarted(true);setWeek(monday(savedDraft.slots[0]?.date || intent.startDate));setSavedDraft(undefined);}}>继续上次编排</Button><Button variant="ghost" onClick={() => {localStorage.removeItem(draftKey);setSavedDraft(undefined);}}>使用当前方案</Button></div>}
      <Tabs value={calendarMode} onChange={setCalendarMode} items={[{value:"read",label:"查看课表"},{value:"edit",label:"操作排课"}]}/>
      {calendarMode === "read" && student && <StudentCourses student={student} timetableOnly/>}
      <div hidden={calendarMode === "read" && !!student}>
      <fieldset disabled={submitting} className="stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
      {student && <Field label="日历匹配教材"><Select value={material} onValueChange={value => {setMaterial(value);setSelectedTimes([]);}}>{materials.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</Select></Field>}
      <div hidden={reviewing} className={`stack ${calendarMode === "read" ? "custom-calendar-read" : ""}`}>
      {student && !intent.windows.length && (
        <p className="muted">
          尚未填写意向时间，可直接在日历中选择可用时间排课。
        </p>
      )}
      <div className="row between wrap"><label className="row" hidden={calendarMode === "read" || !student}><input type="checkbox" checked={multiSelect} onChange={e => {setMultiSelect(e.target.checked); setSelectedTimes([]);}}/>多选上课时间</label><Tabs value={view} onChange={value => {setView(value);if(value === "week") setWeek(monday(week));}} items={[{value:"week",label:"周视图"},{value:"day",label:"日视图"}]}/></div>
      {student && selectedTimes.length > 0 && <div className="row"><span>已选 {selectedTimes.length} 个时段</span><Button onClick={() => setEditor({...selectedTimes[0], index:-1})}>为选中时段选择老师</Button><Button variant="ghost" onClick={() => setSelectedTimes([])}>取消选择</Button></div>}
      <div className="row between wrap">
        <div className="fixed-plan-week-nav">
          <button
            className="icon-button"
            aria-label={view === "day" ? "上一天" : "上一周"}
            onClick={() => setWeek(addDays(week, view === "day" ? -1 : -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {week.replaceAll("-", "/")}{view === "week" && ` - ${addDays(week, 6).replaceAll("-", "/")}`}
          </strong>
          <button
            className="icon-button"
            aria-label={view === "day" ? "下一天" : "下一周"}
            onClick={() => setWeek(addDays(week, view === "day" ? 1 : 7))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <small>
          每节 {intent.duration} 分钟 · 本周已有{" "}
          {
            lessons.filter((l) => l.date >= week && l.date < addDays(week, 7))
              .length
          }{" "}
          节 · 本次已选 {slots.length} 节 · 每周参考目标 {intent.frequency} 节
        </small>
      </div>
      <div className="fixed-calendar-scroll" ref={scroll}>
        <div
          className="fixed-calendar"
          style={{ gridTemplateRows: "44px repeat(48,48px)", gridTemplateColumns: `64px repeat(${dates.length},minmax(70px,1fr))` }}
        >
          <div className="fixed-calendar-head">时间</div>
          {dates.map((date) => (
            <div className={`fixed-calendar-head ${date === DEMO_TODAY ? "today" : ""}`} key={date}>
              {days[dayOf(date)]}
              <small>{date.slice(5)}</small>
            </div>
          ))}
          {Array.from({ length: 48 }, (_, i) => clock(i * 30)).map(
            (time, i) => (
              <div
                className="fixed-time"
                key={time}
                style={{ gridColumn: 1, gridRow: i + 2 }}
              >
                {time}
              </div>
            ),
          )}
          {dates.flatMap((date, d) =>
            Array.from({ length: 48 }, (_, i) => {
              const baseTime = clock(i * 30);
              const time = cellTimes.get(`${date}/${baseTime}`) || baseTime;
              const past = date < DEMO_TODAY;
              const booked = lessons.some((l) => overlap(date, time, l));
              const pending = slots.some(
                (s, n) => n !== drag && overlap(date, time, s),
              );
              const available = cellTimes.has(`${date}/${baseTime}`);
              const state = past
                ? "已过期"
                : booked
                  ? "已排课"
                  : pending
                    ? "待保存"
                    : available
                      ? "可排课"
                      : "不可安排";
              const preferred = inIntent(date, time),
                key = `${date}/${time}`;
              return (
                <button
                  type="button"
                  key={key}
                  aria-label={`${date} ${time} ${state}${preferred ? " 意向时间" : ""}`}
                  aria-disabled={
                    !available || preview || !can("schedule.create")
                  }
                  className={`flex-time-cell ${available ? "available" : "unavailable"} ${past ? "expired" : ""} ${preferred ? "intent" : ""} ${hover === key || selectedTimes.some(s => s.date === date && s.time === time) ? "drop-target" : ""}`}
                  style={{ gridColumn: d + 2, gridRow: i + 2 }}
                  onClick={() => {
                    if (calendarMode === "edit" && available && !preview && can("schedule.create")) {
                      if (!studentId) { onPickTime?.({date, time}); return; }
                      if (multiSelect) { setSelectedTimes(current => current.some(s => s.date === date && s.time === time) ? current.filter(s => s.date !== date || s.time !== time) : [...current,{date,time}]); return; }
                      setEditor({ date, time, index: -1 });
                      setError("");
                    }
                  }}
                  onDragOver={(e) => {
                    if (available && drag !== null) {
                      e.preventDefault();
                      setHover(key);
                    }
                  }}
                  onDragLeave={() => setHover("")}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!preview && can("schedule.create")) drop(date, time);
                  }}
                >
                  {available && <span>＋{time !== baseTime ? ` ${time}` : ""}</span>}
                  {preferred && <small>{available ? "意向时间" : "意向 · 不可安排"}</small>}
                </button>
              );
            }),
          )}
          {slots.map(
            (s, index) =>
              s.date >= week &&
              s.date < addDays(week, dates.length) && (
                <button
                  key={`${index}-${s.date}-${s.time}`}
                  className="fixed-course flex-pending"
                  draggable={!preview && can("schedule.create")}
                  aria-label={`${s.date} ${s.time} 待保存 ${data.teachers.find((t) => t.id === s.teacherId)?.name}`}
                  style={{
                    gridColumn: dates.indexOf(s.date) + 2,
                    gridRow: "2 / -1",
                    alignSelf: "start",
                    marginTop: minutes(s.time) * 1.6,
                    height: intent.duration * 1.6,
                  }}
                  onClick={() => {
                    setEditor({ ...s, index });
                    setError("");
                  }}
                  onDragStart={(e) => {
                    setDrag(index);
                    setError("");
                    e.dataTransfer.setData("text/plain", String(index));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setHover("");
                  }}
                >
                  <strong>
                    {s.time} ·{" "}
                    {data.teachers.find((t) => t.id === s.teacherId)?.name ||
                      "请选择老师"}
                  </strong>
                  <small>
                    {s.material} · 待保存{inIntent(s.date, s.time) ? " · 意向时间" : ""}
                  </small>
                </button>
              ),
          )}
          {lessons
            .filter(
              (l) =>
                l.date >= week &&
                l.date < addDays(week, dates.length) &&
                minutes(l.time) >= 0,
            )
            .map((l) => (
              <button
                type="button"
                onClick={() => setViewedLesson(l.id)}
                key={l.id}
                className="fixed-course flex-booked"
                data-status={calendarMode === "read" ? l.status : undefined}
                style={{
                  gridColumn: dates.indexOf(l.date) + 2,
                  gridRow: "2 / -1",
                  alignSelf: "start",
                  marginTop: minutes(l.time) * 1.6,
                  height: l.duration * 1.6,
                }}
              >
                <strong>
                  {l.time} ·{" "}
                  {studentId ? data.teachers.find((t) => t.id === l.teacherId)?.name : data.students.find(s => s.id === l.studentId)?.name}
                </strong>
                <small>
                  {calendarMode === "read" ? calendarLessonStatus(l.status) : "已排课"}{inIntent(l.date, l.time) ? " · 意向时间" : ""}
                </small>
              </button>
            ))}
        </div>
      </div>
      {calendarMode === "read" && <CalendarStatusLegend lessons={lessons}/>}
      <div className="flex-calendar-legend" hidden={calendarMode === "read"}>
        {[
          ["intent", "意向时间"],
          ["available", "可排课"],
          ["unavailable", "不可安排"],
          ["pending", "待保存"],
          ["booked", "已排课"],
          ["expired", "已过期"],
        ].map(([style, label]) => (
          <span key={label}>
            <i className={style} />
            {label}
          </span>
        ))}
      </div>
      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={teacherId ? "确认本节教材与老师" : "选择授课老师"}
          width={600}
          footer={
            <div className="flex-picker-footer">
              <span>
                {editingTeachers.find((t) => t.id === selectedTeacher)?.name ||
                  "请选择老师"}
              </span>
              {editor.index >= 0 && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSlots(slots.filter((_, i) => i !== editor.index));
                    setEditor(null);
                  }}
                >
                  移除本节
                </Button>
              )}
              <Button variant="ghost" onClick={() => setEditor(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                disabled={
                  !editingTeachers.some((t) => t.id === selectedTeacher) ||
                  preview ||
                  !can("schedule.create")
                }
                onClick={() => choose(selectedTeacher)}
              >
                {editor.index >= 0 ? "保存修改" : "加入课表"}
              </Button>
            </div>
          }
        >
          <div className="flex-picker">
            <div className="flex-picker-summary">
              <strong>
                {data.students.find((s) => s.id === studentId)?.name} ·{" "}
                {editor.date} {days[dayOf(editor.date)]}
              </strong>
              <span>
                {editor.time || "请选择时间"}
                {editor.time
                  ? `–${clock(minutes(editor.time) + intent.duration)}`
                  : ""}{" "}
                · {intent.duration} 分钟
              </span>
            </div>
            <Field label="本节教材"><Select value={material} onValueChange={value => {setMaterial(value);setSelectedTeacher("");}}>{materials.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</Select></Field>
            <div className="flex-picker-toolbar">
              <strong>可选老师 {editingTeachers.length} 位（教材与时间均匹配）</strong>
              <input
                aria-label="搜索可选老师"
                placeholder="搜索老师姓名"
                value={teacherQuery}
                onChange={(e) => setTeacherQuery(e.target.value)}
              />
            </div>
            {error && <p role="alert">{error}</p>}
            <div
              className="flex-teacher-options"
              key={`${editor.date}/${editor.time}/${editor.index}`}
            >
              {editingTeachers
                .filter((t) =>
                  t.name
                    .toLowerCase()
                    .includes(teacherQuery.trim().toLowerCase()),
                )
                .map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    aria-pressed={selectedTeacher === t.id}
                    className="flex-teacher-choice"
                    disabled={preview || !can("schedule.create")}
                    onClick={() => setSelectedTeacher(t.id)}
                  >
                    <div className="flex-teacher-heading">
                      <Avatar name={t.name} />
                      <strong>{t.name}</strong>
                      {student && <small>{[...teacherFit(data,student,t).matchedPrimary, ...teacherFit(data,student,t).matchedSecondary].join(" · ") || "教材与时间匹配"}</small>}
                      {student && [...teacherFit(data,student,t).blocked,...teacherFit(data,student,t).warnings].map(note=><small key={note}>{note}（教务可手动选择）</small>)}
                      {lessons.some(
                        (l) => l.teacherId === t.id && l.status === "已完成",
                      ) ? (
                        <small className="flex-teacher-tag">曾授课</small>
                      ) : slots.some((s) => s.teacherId === t.id) ? (
                        <small className="flex-teacher-tag">本次已选</small>
                      ) : null}
                      <span
                        className="flex-teacher-selection"
                        aria-hidden="true"
                      >
                        {selectedTeacher === t.id && (
                          <Check size={14} strokeWidth={3} />
                        )}
                      </span>
                    </div>
                    <div className="flex-teacher-facts">
                      <span>
                        <small>SO</small>
                        {t.so || "未填写"}
                      </span>
                      <span>
                        <small>口音等级</small>
                        {t.accent || "未填写"}
                      </span>
                      <span>
                        <small>导师等级</small>
                        {t.level || "未填写"}
                      </span>
                    </div>
                    <div className="flex-teacher-category">
                      可教类别：{t.categories.join(" / ") || "未填写"}
                    </div>
                  </button>
                ))}
              {!editingTeachers.length ? (
                <p className="muted">
                  该时间没有可用老师或学员已有课程，请返回日历选择其他时间。
                </p>
              ) : (
                !editingTeachers.some((t) =>
                  t.name
                    .toLowerCase()
                    .includes(teacherQuery.trim().toLowerCase()),
                ) && <p className="muted">没有找到该老师，请修改搜索关键词。</p>
              )}
            </div>
          </div>
        </Modal>
      )}
      </div>
      {reviewing && <section aria-label="自定义排课预览" className="stack"><p>本次安排 {slots.length} 节课程</p><div className="schedule-lessons-scroll"><table><thead><tr><th>日期时间</th><th>老师</th><th>教材</th><th>时长</th></tr></thead><tbody>{slots.map((slot,i)=><tr key={i}><td>{slot.date} {slot.time}</td><td>{data.teachers.find(t=>t.id===slot.teacherId)?.name}</td><td>{slot.material}</td><td>{intent.duration} 分钟</td></tr>)}</tbody></table></div></section>}
      {error && !editor && <p role="alert">{error}</p>}
      {hasInvalid && (
        <p role="alert">
          部分已选课程已不可安排，请点击课程重新选择老师或移除。
        </p>
      )}
      {student && <ClassInBookingPreview studentId={studentId} teacherIds={slots.map(row => row.teacherId)}/>}
      {student && credits.node}
      </fieldset>
      <div className="fixed-plan-footer schedule-flow-actions" style={{display: calendarMode === "read" || !student ? "none" : undefined}}>
        <span>
          <strong>
            已安排 {progress.scheduledCount}/{progress.requiredCount} 节
          </strong>
        </span>
        <Button
          disabled={!slots.length || submitting}
          onClick={() => {
            setSlots([]); setSelectedTimes([]); setReviewing(false);
            setEditor(null);
            setError("");
          }}
        >
          清空选择
        </Button>
        {!reviewing && onClose && <Button disabled={submitting} onClick={onClose}>返回概况</Button>}
        {reviewing && <Button disabled={submitting} onClick={()=>setReviewing(false)}>返回调整</Button>}
        <Button
          variant="primary"
          disabled={
            Boolean(credits.error) ||
            !slots.length ||
            hasInvalid ||
            preview ||
            !can("schedule.create")
          }
          loading={submitting}
            onClick={()=>reviewing ? submit() : setReviewing(true)}
        >
          {submitting ? "正在排课" : reviewing ? "确认排课" : "预览排课"}
        </Button>
      </div>
      </div>
    </section>
  );
}
