import { useState } from "react";
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
import { Button, Select, Field, Modal, useToast } from "@crazytalk/ui";
const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const dayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
const monday = (date: string) => addDays(date, -((dayOf(date) + 6) % 7));
const clock = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
type Row = FixedPlanSlot & {
  confirmed?: boolean;
  extra?: boolean;
  fixedOrigin?: { date: string; time: string };
};
export function FixedPlanCalendar({
  studentId,
  plan,
  intent,
  onClose,
  onComplete,
}: {
  studentId: string;
  plan: FixedPlan;
  intent: ScheduleIntent;
  onClose: () => void;
  onComplete: (count: number, teachers: string) => void;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const student = data.students.find((s) => s.id === studentId);
  const [rows, setRows] = useState<Row[]>(plan.slots);
  const [week, setWeek] = useState(monday(intent.startDate));
  const [editing, setEditing] = useState<string | null>(null);
  const [extra, setExtra] = useState<{ date: string; time: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rowKey = (r: { date: string; time: string }) => `${r.date}/${r.time}`;
  const teachers = data.teachers.filter(
    (t) =>
      t.status !== "已离职" &&
      (!data.rules.trainingRequired || t.trained) &&
      !(
        student?.age != null &&
        student.age < 16 &&
        !t.categories.includes("少儿")
      ),
  );
  const dragged = rows.find((r) => rowKey(r) === dragging && !r.lessonId);
  function targetTeachers(date: string, time: string, source?: Row) {
    if (
      date < DEMO_TODAY ||
      date < intent.startDate ||
      date >= addDays(intent.startDate, intent.weeks * 7)
    )
      return [];
    if (
      !intent.windows.some(
        (w) =>
          w.day === dayOf(date) &&
          time >= w.start &&
          minutes(time) + intent.duration <= minutes(w.end),
      )
    )
      return [];
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
        !isAvailable(data, t.id, date, time, intent.duration, studentId).length,
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
      date,
      time,
      teacherId: keepTeacher ? dragged.teacherId : "",
      confirmed: false,
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
    plan.requiredCount - rows.filter((r) => !r.extra).length,
  );
  function issues(r: Row, id = r.teacherId) {
    if (!id) return ["待安排老师"];
    if (!teachers.some((t) => t.id === id)) return ["老师不符合授课要求"];
    if (r.date < DEMO_TODAY) return ["上课日期已过期"];
    const overlap = rows.some(
      (other) =>
        rowKey(other) !== rowKey(r) &&
        other.date === r.date &&
        minutes(other.time) < minutes(r.time) + intent.duration &&
        minutes(r.time) < minutes(other.time) + intent.duration,
    );
    return [
      ...(overlap ? ["计划中课程重叠"] : []),
      ...isAvailable(data, id, r.date, r.time, intent.duration, studentId),
    ];
  }
  const ready = editable.filter(
    (r) =>
      !issues(r).length &&
      (!data.teachers.find((t) => t.id === r.teacherId)?.needConfirm ||
        r.confirmed),
  );
  const gaps = editable.filter((r) => issues(r).length);
  const focused = rows.find((r) => rowKey(r) === editing);
  const available = focused
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
  const windowStarts = intent.windows.map((w) => minutes(w.start));
  const windowEnds = intent.windows.map((w) => minutes(w.end));
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
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const teacherSummary = [
    ...new Set(rows.map((r) => r.teacherId).filter(Boolean)),
  ]
    .map(
      (id) =>
        `${data.teachers.find((t) => t.id === id)?.name || id} ${rows.filter((r) => r.teacherId === id).length} 节`,
    )
    .join(" · ");
  function update(r: Row, patch: Partial<Row>) {
    setRows(
      rows.map((s) => (rowKey(s) === rowKey(r) ? { ...s, ...patch } : s)),
    );
    setMessage("");
  }
  function submit() {
    try {
      if (!ready.length) return;
      const result = act({
        type: "lesson.schedule",
        studentId,
        teacherId: plan.primaryTeacherId,
        slots: ready.map((r) => ({ ...r, confirmedTeacher: r.confirmed })),
        duration: intent.duration,
        kind: "固定课",
        material: student?.material || "",
      });
      toast(result.message);
      if (ready.length === editable.length) {
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
        setMessage(`${result.message}；其余课次仍待处理。`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "提交失败，请重试");
    }
  }
  return (
    <div className="fixed-plan stack">
      <section className="fixed-plan-summary">
        <div className="row between">
          <h3>{student?.name} 的固定课表</h3>
          <span className="fixed-draft-badge">方案预览 · 尚未确认</span>
        </div>
        <p>
          {plan.positions.map((p) => `${days[p.day]} ${p.time}`).join("、")} ·
          每节 {intent.duration} 分钟 · {intent.weeks} 周 · 目标{" "}
          {plan.requiredCount} 节
        </p>
        <p>{teacherSummary || "尚未分配老师"}</p>
        <small>
          本次拟安排 {editable.filter((r) => r.teacherId).length} 节 · 待处理{" "}
          {editable.length - ready.length} 节
        </small>
      </section>
      {missingTimeCount > 0 && (
        <p role="status">
          当前意向范围还缺 {missingTimeCount}{" "}
          节的固定时间，无法排满。请返回扩大意向范围；也可先确认已有安排。
        </p>
      )}
      {gaps.length > 0 && (
        <div className="row wrap">
          <Button
            size="sm"
            onClick={() => {
              const index = gaps.findIndex((r) => rowKey(r) === editing);
              const r = gaps[(index + 1) % gaps.length];
              setWeek(monday(r.date));
              setEditing(rowKey(r));
            }}
          >
            下一处待安排（{gaps.length}）
          </Button>
        </div>
      )}
      <div className="fixed-plan-week-nav" aria-label="课表周切换">
        <button
          type="button"
          className="icon-button"
          aria-label="上一周"
          disabled={week <= monday(intent.startDate)}
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
          disabled={
            addDays(week, 7) >= addDays(intent.startDate, intent.weeks * 7)
          }
          onClick={() => setWeek(addDays(week, 7))}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="fixed-calendar-legend">
        <span>
          <i className="available" />
          可排课
        </span>
        <span>
          <i className="unavailable" />
          不可排课
        </span>
        <small>拖动课程仅调整本节；需在学员意向内且有老师可用。</small>
      </div>
      <div className="fixed-calendar-scroll">
        <div
          className="fixed-calendar"
          role="region"
          aria-label="学员固定课表"
          style={{
            gridTemplateRows: `44px repeat(${(end - start) / 30},48px)`,
          }}
        >
          <div className="fixed-calendar-head">时间</div>
          {weekDates.map((date) => (
            <div className="fixed-calendar-head" key={date}>
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
              const targetKey = `${date}/${time}`;
              return (
                <button
                  key={`${date}-${time}`}
                  className={`fixed-empty-cell ${canSchedule ? "available" : "unavailable"} ${dropTarget === targetKey ? "drop-target" : ""}`}
                  aria-label={`${date} ${time} ${canSchedule ? "可排课" : "不可排课"}`}
                  title={
                    canSchedule
                      ? "符合意向且有可用老师；可添加课程或拖入课次"
                      : "意向范围外、时间冲突或没有可用老师"
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
                  {canSchedule ? "可排" : ""}
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
                  setEditing(rowKey(r));
                  setExtra(null);
                }}
              >
                <strong>
                  {r.time} ·{" "}
                  {r.teacherId
                    ? data.teachers.find((t) => t.id === r.teacherId)?.name
                    : "待安排"}
                </strong>
                <small>
                  {missing
                    ? "待安排"
                    : data.teachers.find((t) => t.id === r.teacherId)
                          ?.needConfirm && !r.confirmed
                      ? "待老师确认"
                      : "拟安排"}
                  {r.extra ? " · 单次加课" : r.fixedOrigin ? " · 单次调整" : ""}
                </small>
              </button>
            );
          })}
          {confirmed.map((l) => (
            <div
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
                {l.time} ·{" "}
                {data.teachers.find((t) => t.id === l.teacherId)?.name}
              </strong>
              <small>已确认 · 请在课程详情调课</small>
            </div>
          ))}
        </div>
      </div>
      {extra && (
        <Modal
          open
          onClose={() => setExtra(null)}
          title="新增单次课程"
          width={440}
        >
          <section className="inset stack" aria-label="新增单次课程">
            <strong>
              {extra.date} {extra.time} · 新增一节课
            </strong>
            <p>这是固定计划之外的单次加课，不改变每周固定安排。</p>
            <Button
              onClick={() => {
                const r = { ...extra, teacherId: "", extra: true };
                setRows([...rows, r]);
                setEditing(rowKey(r));
                setExtra(null);
              }}
            >
              添加单次课程并选择老师
            </Button>
            <Button variant="ghost" onClick={() => setExtra(null)}>
              取消
            </Button>
          </section>
        </Modal>
      )}
      {focused && !focused.lessonId && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title="调整本节课程"
          width={440}
        >
          <section className="inset stack" aria-label="编辑本节课程">
            <div className="row between">
              <strong>
                {focused.date} {focused.time} · 仅调整本节
              </strong>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                完成
              </Button>
            </div>
            <Field label="本节可用老师">
              <Select
                value={focused.teacherId}
                onValueChange={(teacherId) =>
                  update(focused, { teacherId, confirmed: false })
                }
              >
                <option value="">待安排</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.id === plan.primaryTeacherId ? " · 主老师" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {!available.length && (
              <p>该时间暂无符合要求的老师，可暂留缺口，或返回修改排课信息。</p>
            )}
            {issues(focused).map((s) => (
              <small key={s}>{s}</small>
            ))}
            {data.teachers.find((t) => t.id === focused.teacherId)
              ?.needConfirm && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={Boolean(focused.confirmed)}
                  onChange={(e) =>
                    update(focused, { confirmed: e.target.checked })
                  }
                />
                已与老师确认本节授课
              </label>
            )}
            <div className="row wrap">
              <Button
                size="sm"
                onClick={() =>
                  update(focused, { teacherId: "", confirmed: false })
                }
              >
                暂不安排本节
              </Button>
              <Button
                size="sm"
                disabled={!focused.teacherId}
                onClick={() => {
                  const targets = rows.filter(
                    (r) =>
                      !r.lessonId &&
                      r.date >= focused.date &&
                      dayOf(r.date) === dayOf(focused.date) &&
                      r.time === focused.time,
                  );
                  if (
                    targets.some((r) => issues(r, focused.teacherId).length)
                  ) {
                    setMessage(
                      "该老师无法覆盖此固定时段的全部后续课次，未作修改。",
                    );
                    return;
                  }
                  setRows(
                    rows.map((r) =>
                      targets.includes(r)
                        ? {
                            ...r,
                            teacherId: focused.teacherId,
                            confirmed: false,
                          }
                        : r,
                    ),
                  );
                }}
              >
                此老师承担该时段后续课程
              </Button>
            </div>
            {message && <p role="alert">{message}</p>}
          </section>
        </Modal>
      )}
      {message && !focused && <p role="alert">{message}</p>}
      <div className="fixed-plan-footer">
        <span>
          尚未保存 · 本次可确认 {ready.length} 节
          {editable.length > ready.length
            ? `，剩余 ${editable.length - ready.length} 节待处理`
            : ""}
        </span>
        <Button onClick={onClose}>返回方案</Button>
        <Button
          variant="primary"
          disabled={!ready.length || preview || !can("schedule.create")}
          onClick={submit}
        >
          {ready.length === editable.length && !missingTimeCount
            ? "确认排课"
            : `确认已安排的 ${ready.length} 节`}
        </Button>
      </div>
    </div>
  );
}
