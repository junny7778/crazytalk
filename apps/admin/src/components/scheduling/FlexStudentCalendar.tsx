import { useScheduleCredits } from "./useScheduleCredits";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  isAvailable,
  getStudentScheduleProgress,
  minutes,
  type ScheduleIntent,
} from "@crazytalk/shared";
import { Avatar, Button, Modal, useToast } from "@crazytalk/ui";
type Slot = { date: string; time: string; teacherId: string };
const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayOf = (d: string) => new Date(`${d}T12:00:00+08:00`).getUTCDay();
const monday = (d: string) => addDays(d, -((dayOf(d) + 6) % 7));
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function FlexStudentCalendar({
  studentId,
  intent,
  onComplete,
}: {
  onComplete?: (count: number, teacherNames: string) => void;
  studentId: string;
  intent: ScheduleIntent;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const progress = getStudentScheduleProgress(data, studentId, intent);
  const [week, setWeek] = useState(
    monday(intent.startDate < DEMO_TODAY ? DEMO_TODAY : intent.startDate),
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [editor, setEditor] = useState<{
    date: string;
    time: string;
    index: number;
  } | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [teacherQuery, setTeacherQuery] = useState("");
  useEffect(() => {
    setSelectedTeacher(
      editor && editor.index >= 0 ? slots[editor.index]?.teacherId || "" : "",
    );
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
  const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const lessons = data.lessons.filter(
    (l) => l.studentId === studentId && l.status !== "已取消",
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
  function candidates(date: string, time: string, ignore = -1) {
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
  }, [data, slots, week, drag, intent.duration, studentId]);
  const editingTeachers = editor
    ? candidates(editor.date, editor.time, editor.index)
    : [];
  function choose(id: string) {
    if (!editor || !editingTeachers.some((t) => t.id === id)) return;
    const next = { date: editor.date, time: editor.time, teacherId: id };
    setSlots(
      editor.index < 0
        ? [...slots, next]
        : slots.map((s, i) => (i === editor.index ? next : s)),
    );
    setEditor(null);
    setError("");
  }
  function drop(date: string, time: string) {
    if (drag === null) return;
    const available = candidates(date, time, drag),
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
  const credits = useScheduleCredits(studentId, intent.duration, slots.length);
  function submit() {
    try {
      if (!slots.length) return;
      const result = act({
        type: "lesson.schedule",
        plannedUnits: credits.units,
        schedulingMode: "flex",
        kind: "临时课",
        studentId,
        teacherId: slots[0].teacherId,
        slots,
        duration: intent.duration,
        material: data.students.find((s) => s.id === studentId)?.material || "",
      });
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
    }
  }
  const hasInvalid = slots.some(
    (s, i) => !candidates(s.date, s.time, i).some((t) => t.id === s.teacherId),
  );
  return (
    <section className="flex-student-calendar stack" aria-label="学员灵活课表">
      {!intent.windows.length && (
        <p className="muted">
          尚未填写意向时间，可通过“修改排课信息”补充，也可直接选择时间排课。
        </p>
      )}
      <div className="row between wrap">
        <div className="fixed-plan-week-nav">
          <button
            className="icon-button"
            aria-label="上一周"
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <strong>
            {week.replaceAll("-", "/")} -{" "}
            {addDays(week, 6).replaceAll("-", "/")}
          </strong>
          <button
            className="icon-button"
            aria-label="下一周"
            onClick={() => setWeek(addDays(week, 7))}
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
          style={{ gridTemplateRows: "44px repeat(48,48px)" }}
        >
          <div className="fixed-calendar-head">时间</div>
          {dates.map((date) => (
            <div className="fixed-calendar-head" key={date}>
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
                    ? "待确认"
                    : available
                      ? "可排课"
                      : "无老师";
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
                  className={`flex-time-cell ${available ? "available" : "unavailable"} ${past ? "expired" : ""} ${preferred ? "intent" : ""} ${hover === key ? "drop-target" : ""}`}
                  style={{ gridColumn: d + 2, gridRow: i + 2 }}
                  onClick={() => {
                    if (available && !preview && can("schedule.create")) {
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
                  <span>
                    {state}
                    {available && time !== baseTime ? ` ${time}` : ""}
                  </span>
                  {preferred && <small>意向时间</small>}
                </button>
              );
            }),
          )}
          {slots.map(
            (s, index) =>
              s.date >= week &&
              s.date < addDays(week, 7) && (
                <button
                  key={`${index}-${s.date}-${s.time}`}
                  className="fixed-course flex-pending"
                  draggable={!preview && can("schedule.create")}
                  aria-label={`${s.date} ${s.time} 待确认 ${data.teachers.find((t) => t.id === s.teacherId)?.name}`}
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
                    待确认{inIntent(s.date, s.time) ? " · 意向时间" : ""}
                  </small>
                </button>
              ),
          )}
          {lessons
            .filter(
              (l) =>
                l.date >= week &&
                l.date < addDays(week, 7) &&
                minutes(l.time) >= 0,
            )
            .map((l) => (
              <div
                key={l.id}
                className="fixed-course flex-booked"
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
                  {data.teachers.find((t) => t.id === l.teacherId)?.name}
                </strong>
                <small>
                  已排课{inIntent(l.date, l.time) ? " · 意向时间" : ""}
                </small>
              </div>
            ))}
        </div>
      </div>
      <div className="flex-calendar-legend">
        {[
          ["intent", "意向时间"],
          ["available", "可排课"],
          ["unavailable", "无老师"],
          ["pending", "待确认"],
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
          title="选择授课老师"
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
            <div className="flex-picker-toolbar">
              <strong>可选老师 {editingTeachers.length} 位</strong>
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
      {error && !editor && <p role="alert">{error}</p>}
      {hasInvalid && (
        <p role="alert">
          部分已选课程已不可安排，请点击课程重新选择老师或移除。
        </p>
      )}
      {credits.node}
      <div className="fixed-plan-footer">
        <span>
          <strong>
            已安排 {progress.scheduledCount}/{progress.requiredCount} 节
          </strong>
        </span>
        <Button
          disabled={!slots.length}
          onClick={() => {
            setSlots([]);
            setEditor(null);
            setError("");
          }}
        >
          清空选择
        </Button>
        <Button
          variant="primary"
          disabled={
            Boolean(credits.error) ||
            !slots.length ||
            hasInvalid ||
            preview ||
            !can("schedule.create")
          }
          onClick={submit}
        >
          确认排课
        </Button>
      </div>
    </section>
  );
}
