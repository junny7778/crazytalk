import { ScheduleTeacherPicker } from "./ScheduleTeacherPicker";
import { schedulingBookingIssue, teacherSchedulingAccountIssue } from "@crazytalk/shared";
import { TeacherSchedulingAccountNotice } from "./SchedulingAccountNotice";
import { addDays,compareTeacherFit,DEMO_TODAY,getStudentScheduleProgress,isAvailable,matchesScheduleWindow,materialMatchIssue,minutes,studentMaterials,type ScheduleIntent } from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Button,useToast } from "@crazytalk/ui";
import { ChevronLeft,ChevronRight } from "lucide-react";
import { useEffect,useLayoutEffect,useMemo,useRef,useState } from "react";
import ClassInOperationFeedback from "../ClassInOperationFeedback";
import { StudentLessonDrawer } from "../StudentLessonDrawer";
import ClassInBookingPreview from "./ClassInBookingPreview";
import { useScheduleCredits } from "./useScheduleCredits";
type Slot = { date: string; time: string; teacherId: string; material: string };

const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayOf = (d: string) => new Date(`${d}T12:00:00+08:00`).getUTCDay();
const calendarWeekStart = (d: string) => addDays(d, -((dayOf(d) + 6) % 7));
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function FlexStudentCalendar({
  studentId,
  teacherId,
  initialTime,
  initialTimes = [],
  onConfirmTimes,
  onAdjustTeacherTimes,
  teacherUnits,
  repeatWeeks = 1,
  intent,
  onComplete,
  onDirtyChange,
  onBusyChange,
  onClose,
  onStageChange,
}: {
  teacherId?: string;
  onAdjustTeacherTimes?: () => void;
  teacherUnits?: number;
  initialTime?: {date: string; time: string};
  initialTimes?: {date: string; time: string}[];
  onConfirmTimes?: (slots: {date: string; time: string}[]) => void;
  repeatWeeks?: number;
  onClose?: () => void;
  onStageChange?: (stage: "setup" | "preview") => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onComplete?: (count: number, teacherNames: string) => void;
  studentId: string;
  intent: ScheduleIntent;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const student = data.students.find(s=>s.id===studentId);
  const progress = getStudentScheduleProgress(data, studentId, intent);
  const [week, setWeek] = useState(
    calendarWeekStart(initialTime?.date || (intent.startDate < DEMO_TODAY ? DEMO_TODAY : intent.startDate)),
  );
  const [editableSlots, setSlots] = useState<Slot[]>([]);
  const [viewedLesson, setViewedLesson] = useState<string | null>(null);
  const material = student ? studentMaterials(data, student).find(book => !intent.materialIds || book.id === intent.materialIds[0])?.name ?? "" : "";
  const teacherReview = !!onAdjustTeacherTimes;
  const slots = useMemo(() => {
    if (!teacherReview || !teacherId) return editableSlots;
    return initialTimes.map(time => ({ ...time, teacherId, material }));
  }, [teacherReview, teacherId, initialTimes, material, editableSlots]);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedTimes, setSelectedTimes] = useState<{date: string; time: string}[]>(!teacherReview && initialTimes.length > (studentId ? 1 : 0) ? initialTimes : !studentId && initialTime ? [initialTime] : []);
  const [reviewing, setReviewing] = useState(teacherReview);
  useEffect(() => { onStageChange?.(reviewing ? "preview" : "setup"); }, [reviewing, onStageChange]);
  useEffect(() => { onDirtyChange?.(slots.length > 0 || (selectedTimes.length > 0)); }, [slots.length, studentId, selectedTimes.length, onDirtyChange]);
  const [editor, setEditor] = useState<{
    date: string;
    time: string;
    index: number;
  } | null>(!teacherReview && initialTime && studentId ? {...initialTime, index: -1} : null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState("");
  const [error, setError] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const [entrySlot] = useState(initialTime);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const lessons = data.lessons.filter(
    (l) => (teacherId ? l.teacherId === teacherId : l.studentId === studentId) && l.status !== "已取消",
  );
  const overlap = (
    date: string,
    time: string,
    other: { date: string; time: string; duration?: number },
    duration = intent.duration,
  ) =>
    date === other.date &&
    minutes(time) < minutes(other.time) + (other.duration ?? intent.duration) &&
    minutes(other.time) < minutes(time) + duration;
  const inIntent = (date: string, time: string) =>
    matchesScheduleWindow({ date, time }, intent.duration, intent);
  function candidates(date: string, time: string, ignore = -1, textbook = material) {
    if (
      (studentId && !!schedulingBookingIssue(data, studentId)) ||
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
          !teacherSchedulingAccountIssue(t) &&
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
    if (teacherReview) return result;
    for (const date of dates) {
      if (date < DEMO_TODAY) continue;
      for (let m = 0; m < 1440; m += 30) {
        const rowStart = clock(m);
        if (studentId && !teacherId && (
          lessons.some(lesson => overlap(date, rowStart, lesson, 30)) ||
          slots.some((slot, index) => index !== drag && overlap(date, rowStart, slot, 30))
        )) continue;
        if (m + intent.duration <= 1440 && candidates(date, rowStart, drag ?? -1).length) {
          result.set(`${date}/${rowStart}`, rowStart);
        }
      }
    }
    return result;
  }, [data, slots, week, drag, intent.duration, studentId, material, teacherId, teacherReview]);
  const firstAvailable = cellTimes.size ? Math.min(...Array.from(cellTimes.values(), minutes)) : 0;
  const weekTimes = teacherReview ? slots.filter(s => calendarWeekStart(s.date) === week).map(s => minutes(s.time)) : [];
  const anchorTime = weekTimes.length ? Math.min(...weekTimes)
    : entrySlot && calendarWeekStart(entrySlot.date) === week ? minutes(entrySlot.time) : firstAvailable;
  function scrollToAvailable() {
    if (scroll.current) scroll.current.scrollTop = Math.max(0, (Math.floor(anchorTime / 30) - 1) * 48);
  }
  useLayoutEffect(scrollToAvailable, [week, anchorTime]);
  const selectingStudentTimes = !!teacherId && !studentId;
  const studentBatchSelected = !!student && !teacherId && multiSelect && selectedTimes.length > 0;
  const boxStart = useRef<{x: number; y: number} | null>(null);
  const suppressClick = useRef(false);
  const [box, setBox] = useState<{left:number; top:number; width:number; height:number} | null>(null);
  function pickTimes(times: typeof selectedTimes, toggle: boolean) {
    const teacher = data.teachers.find(t => t.id === teacherId);
    if (!data.catalog.some(c => c.type === "教材" && c.enabled && teacher?.materialIds?.includes(c.id))) {
      toast("请先设置老师的可授教材", {tone: "hint"});
      return;
    }
    const next = [...selectedTimes];
    for (const t of times) {
      const index = next.findIndex(s => s.date === t.date && s.time === t.time);
      if (index >= 0) {
        if (toggle) next.splice(index, 1);
      } else if (!next.some(s => overlap(t.date, t.time, s))) next.push(t);
      else if (toggle) toast("与已选时段重叠", {tone: "hint"});
    }
    if (!selectedTimes.length && next.length) toast("拖动鼠标可批量框选时段", {tone: "hint"});
    setSelectedTimes(next);
  }
  function pointerBox(event: React.PointerEvent<HTMLDivElement>) {
    const start = boxStart.current;
    if (!start) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    return {left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x-start.x), height: Math.abs(y-start.y)};
  }
  // A half-hour cell can contain both a course and the next selectable start time.
  function sharesCell(date: string, time: string, duration: number) {
    const start = minutes(time);
    const firstRow = clock(start - start % 30);
    const lastMinute = start + duration - 1;
    const lastRow = clock(lastMinute - lastMinute % 30);
    return [firstRow, lastRow].some(row => cellTimes.has(`${date}/${row}`));
  }
  function expandTimes(times: typeof selectedTimes, weeks: number) {
    return times.flatMap(t => Array.from({length: weeks}, (_, i) => ({
      date: addDays(t.date, i * 7), time: t.time,
    })));
  }
  const requestedTimes = !editor ? [] : editor.index >= 0 ? [editor]
    : expandTimes(selectedTimes.length ? selectedTimes : [editor], repeatWeeks);
  const [firstTime, ...otherTimes] = requestedTimes;
  const matchingIds = otherTimes.map(t => new Set(candidates(t.date, t.time, editor?.index).map(teacher => teacher.id)));
  const editingTeachers = editor && firstTime
    ? candidates(firstTime.date, firstTime.time, editor.index).filter(t => matchingIds.every(ids => ids.has(t.id)))
    : [];
  function choose(id: string) {
    if (!editor || !editingTeachers.some((t) => t.id === id)) return;
    const next = requestedTimes.map(({date, time}) => ({date, time, teacherId: id, material}));
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
  const credits = useScheduleCredits(studentId, intent.duration, slots.length, slots.map(s=>s.teacherId), teacherUnits);
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
  const invalidSlots = slots.filter(
    (s, i) => !candidates(s.date, s.time, i, s.material).some((t) => t.id === s.teacherId),
  );
  const hasInvalid = invalidSlots.length > 0;
  return (
    <section className="flex-student-calendar stack" aria-label={teacherReview ? "自定义排课预览" : "自定义排课日历"}>
      <ClassInOperationFeedback studentId={studentId}/>
      <StudentLessonDrawer lessonId={viewedLesson} onClose={() => setViewedLesson(null)}/>
      <div >
      <fieldset disabled={submitting} className="stack" style={{border:0,padding:0,margin:0,minWidth:0}}>
      <div hidden={reviewing && !teacherReview} className="stack">
      {student && !teacherId && <h4 className="custom-student-time-heading">排课</h4>}
      {student && !teacherReview && (
        <button type="button" role="switch" aria-checked={multiSelect} className="schedule-multiselect-switch"
          onClick={() => { setMultiSelect(!multiSelect); setSelectedTimes([]); }}>
          <span aria-hidden="true" />开启多选
        </button>
      )}
      <div className={`fixed-plan-week-nav schedule-week-navigation${teacherReview ? " schedule-review-navigation" : ""}`}>
        <Button size="sm" aria-label="上一周" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={18}/></Button>
        <strong>{week.replaceAll("-", "/")} - {addDays(week, 6).replaceAll("-", "/")}</strong>
        <Button size="sm" aria-label="下一周" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={18}/></Button>
        <Button size="sm" onClick={() => {
          const currentWeek = calendarWeekStart(DEMO_TODAY);
          if (week === currentWeek) scrollToAvailable();
          else setWeek(currentWeek);
        }}>本周</Button>
        {teacherReview && <strong className="schedule-review-summary">
          本次安排 {new Set(slots.map(slot => calendarWeekStart(slot.date))).size} 周，共 {slots.length} 节课待确认
        </strong>}
      </div>
      <div className="fixed-calendar-scroll" ref={scroll}>
        <div
          className="fixed-calendar"
          onPointerDown={event => {
            suppressClick.current = false;
            if (!selectingStudentTimes || preview || !can("schedule.create") || event.button !== 0 || event.pointerType !== "mouse") return;
            const cell = (event.target as HTMLElement).closest<HTMLButtonElement>(".flex-time-cell");
            if (!cell) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            boxStart.current = {x: event.clientX - bounds.left, y: event.clientY - bounds.top};
            cell.setPointerCapture(event.pointerId);
          }}
          onPointerMove={event => {
            const rect = pointerBox(event);
            if (rect && (suppressClick.current || Math.max(rect.width, rect.height) > 4)) {
              suppressClick.current = true;
              setBox(rect);
            }
          }}
          onPointerUp={event => {
            const rect = pointerBox(event);
            if (rect && (suppressClick.current || Math.max(rect.width, rect.height) > 4)) {
              suppressClick.current = true;
              const grid = event.currentTarget;
              const bounds = grid.getBoundingClientRect();
              const times = Array.from(grid.querySelectorAll<HTMLElement>(".flex-time-cell.available")).filter(cell => {
                const r = cell.getBoundingClientRect();
                return r.right > bounds.left + rect.left && r.left < bounds.left + rect.left + rect.width &&
                  r.bottom > bounds.top + rect.top && r.top < bounds.top + rect.top + rect.height;
              }).map(cell => ({date: cell.dataset.date!, time: cell.dataset.time!}));
              if (times.length) pickTimes(times, false);
            }
            boxStart.current = null;
            setBox(null);
          }}
          onPointerCancel={() => {boxStart.current = null; setBox(null);}}
          onClickCapture={event => {
            if (suppressClick.current) {event.stopPropagation(); suppressClick.current = false;}
          }}
          style={{ gridTemplateRows: "44px repeat(48,48px)", gridTemplateColumns: `64px repeat(${dates.length},minmax(70px,1fr))` }}
        >
          {box && <div className="schedule-selection-box" style={box}/>}
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
              if (teacherReview) return <div key={`${date}/${baseTime}`} className="flex-time-cell" style={{gridColumn:d + 2, gridRow:i + 2}}/>;
              const time = cellTimes.get(`${date}/${baseTime}`) || baseTime;
              const past = date < DEMO_TODAY;
              const booked = lessons.some((l) => overlap(date, time, l));
              const pending = slots.some(
                (s, n) => n !== drag && overlap(date, time, s),
              );
              const available = cellTimes.has(`${date}/${baseTime}`);
              const besideCourse = available && (
                lessons.some(l => overlap(date, baseTime, l, 30)) ||
                slots.some(s => overlap(date, baseTime, s, 30))
              );
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
                  data-date={date} data-time={time}
                  aria-pressed={selectingStudentTimes ? selectedTimes.some(s => s.date === date && s.time === time) : undefined}
                  aria-label={`${date} ${time} ${state}${preferred ? " 意向时间" : ""}`}
                  aria-disabled={
                    !available || preview || !can("schedule.create")
                  }
                  className={`flex-time-cell ${besideCourse ? "beside-course" : ""} ${available ? "available" : "unavailable"} ${past ? "expired" : ""} ${preferred ? "intent" : ""} ${hover === key || selectedTimes.some(s => s.date === date && s.time === time) ? "drop-target" : ""}`}
                  style={{ gridColumn: d + 2, gridRow: i + 2 }}
                  onClick={() => {
                    if (preview || !can("schedule.create")) return;
                    if (!available) {
                      const reason = past ? "该日期已过期" : booked ? "该时段已有课程" : pending ? "该时段已有待保存课程"
                        : teacherId ? isAvailable(data, teacherId, date, time, intent.duration, studentId, undefined, false, true)[0] : "";
                      toast(reason || "该时段没有符合当前排课条件的老师", { tone: "hint" });
                      return;
                    }
                    if (!studentId) {
                      pickTimes([{date, time}], true);
                      return;
                    }
                      if (multiSelect) { setError(""); setSelectedTimes(current => current.some(s => s.date === date && s.time === time) ? current.filter(s => s.date !== date || s.time !== time) : [...current,{date,time}]); return; }
                      setEditor({ date, time, index: -1 });
                      setError("");
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
                    if (available && !preview && can("schedule.create")) drop(date, time);
                  }}
                >
                  {available && <span>＋{besideCourse || time !== baseTime ? ` ${time}` : ""}</span>}
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
                  className={`fixed-course flex-pending ${sharesCell(s.date, s.time, intent.duration) ? "beside-slot" : ""}`}
                  disabled={teacherReview}
                  draggable={!teacherReview && !preview && can("schedule.create")}
                  aria-label={`${s.date} ${s.time} ${teacherReview ? "待确认 " + student?.name : "待保存 " + data.teachers.find(t => t.id === s.teacherId)?.name}`}
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
                    {s.time}{teacherReview && "–" + clock(minutes(s.time) + intent.duration)} ·{" "}
                    {teacherReview ? student?.name : data.teachers.find((t) => t.id === s.teacherId)?.name ||
                      "请选择老师"}
                  </strong>
                  <small>
                    {s.material} · {teacherReview ? "待确认" : "待保存"}{inIntent(s.date, s.time) ? " · 意向时间" : ""}
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
                className={`fixed-course flex-booked ${sharesCell(l.date, l.time, l.duration) ? "beside-slot" : ""}`}

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
                  {!teacherId ? data.teachers.find((t) => t.id === l.teacherId)?.name : data.students.find(s => s.id === l.studentId)?.name}
                </strong>
                <small>
                  已排课{inIntent(l.date, l.time) ? " · 意向时间" : ""}
                </small>
              </button>
            ))}
        </div>
      </div>
      <div className="flex-calendar-legend">
        {[
          ...(!teacherReview ? [...(student && intent.windows.length ? [["intent", "学员意向"]] : []),
          ["available", "可排课"],
          ["unavailable", "不可安排"],
          ["expired", "已过期"],
          ["selected", "当前选中"]] : []),
          ["pending", "待确认"],
          ["booked", "已排课"],
        ].map(([style, label]) => (
          <span key={label}>
            <i className={style} />
            {label}
          </span>
        ))}
      </div>
      {((selectingStudentTimes && selectedTimes.length > 0) || studentBatchSelected) && <div className="batch-bar students-batch-bar" role="group" aria-label="已选排课时段">
        <span>已选 {selectedTimes.length} 个时段</span>
        <div className="row">
          <Button variant="ghost" onClick={() => setSelectedTimes([])}>取消选择</Button>
          <Button variant="primary" disabled={preview || !can("schedule.create") || (selectingStudentTimes && !(teacherUnits && teacherUnits > 0))}
            onClick={() => {
              if (studentBatchSelected) {
                const times = expandTimes(selectedTimes, repeatWeeks);
                const conflict = times.find((t, i) => times.slice(0, i).some(other => overlap(t.date, t.time, other)));
                if (conflict) {
                  toast(`${conflict.date} ${conflict.time} 与本次其他课次重叠，请调整时段或重复周期。`, {tone: "hint"});
                  return;
                }
                setError("");
                setEditor({...selectedTimes[0], index: -1});
              } else onConfirmTimes?.([...selectedTimes]);
            }}>确认时段</Button>
        </div>
      </div>}
      {editor && (
        <ScheduleTeacherPicker
          key={`${editor.date}/${editor.time}/${editor.index}`}
          student={student} date={editor.date} time={editor.time} duration={intent.duration} material={material}
          editingTeachers={editingTeachers} error={error}
          title={teacherId ? "确认本节教材与老师" : "选择授课老师"}
          pastTeachers={lessons.filter(l => l.status === "已完成").map(l => l.teacherId)}
          plannedTeachers={slots.map(s => s.teacherId)}
          unboundTeachers={data.teachers.filter(t => t.status !== "已离职" && (!teacherId || t.id === teacherId) &&
            teacherSchedulingAccountIssue(t) && (!student || !materialMatchIssue(data, student, t, material)))}
          initialTeacher={slots[editor.index]?.teacherId}
          onRemove={editor.index < 0 ? undefined : () => {
            setSlots(slots.filter((_, i) => i !== editor.index));
            setEditor(null);
          }}
          onClose={() => setEditor(null)} onChoose={choose}
        />
      )}
      </div>
      {reviewing && !teacherReview && <section aria-label="自定义排课预览" className="stack"><p>本次安排 {slots.length} 节课程</p><div className="schedule-lessons-scroll"><table><thead><tr><th>日期时间</th><th>老师</th><th>教材</th><th>时长</th></tr></thead><tbody>{slots.map((slot,i)=><tr key={i}><td>{slot.date} {slot.time}</td><td>{data.teachers.find(t=>t.id===slot.teacherId)?.name}</td><td>{slot.material}</td><td>{intent.duration} 分钟</td></tr>)}</tbody></table></div></section>}
      {error && !editor && <p role="alert">{error}</p>}
      {hasInvalid && (
        <p role="alert">
          {teacherReview ? `${invalidSlots.map(s => s.date + " " + s.time).join("、")} 已不可安排，请返回调整时段。` : "部分已选课程已不可安排，请点击课程重新选择老师或移除。"}
        </p>
      )}
      {data.teachers.filter(t=>slots.some(s=>s.teacherId===t.id) && teacherSchedulingAccountIssue(t)).map(t=><TeacherSchedulingAccountNotice key={t.id} teacher={t}/>)}
      {student && !teacherReview && <ClassInBookingPreview studentId={studentId} teacherIds={slots.map(row => row.teacherId)}/>}
      {student && !teacherReview && credits.node}
      {teacherReview && credits.error && <p role="alert">{credits.error}</p>}
      </fieldset>
      <div className="fixed-plan-footer schedule-flow-actions" style={{display: !student || studentBatchSelected ? "none" : undefined}}>
        {!teacherReview && <><span>
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
        </Button></>}
        {!reviewing && onClose && <Button disabled={submitting} onClick={onClose}>返回概况</Button>}
        {reviewing && <Button disabled={submitting} onClick={onAdjustTeacherTimes ?? (()=>setReviewing(false))}>返回调整</Button>}
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
          {submitting ? "正在排课" : teacherReview ? "确定排课" : reviewing ? "确认排课" : "预览排课"}
        </Button>
      </div>
      </div>
    </section>
  );
}
