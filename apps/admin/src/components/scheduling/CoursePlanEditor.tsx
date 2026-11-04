import { z } from "zod";
import { useEffect, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  isAvailable,
  isRegularTime,
  minutes,
  type Lesson,
} from "@crazytalk/shared";
import { Button, Field, Select, DatePicker, useToast } from "@crazytalk/ui";

const draftSchema = z.object({
  studentId: z.string(),
  kind: z.enum(["固定课", "临时课"]),
  duration: z.number(),
  expanded: z.boolean(),
  rows: z.array(
    z.object({
      date: z.string(),
      time: z.string(),
      teacherId: z.string(),
      confirmedTeacher: z.boolean(),
    }),
  ),
});
type Row = {
  date: string;
  time: string;
  teacherId: string;
  confirmedTeacher: boolean;
};
export function CoursePlanEditor({
  studentId: initialStudent,
  teacherId,
  slots,
  kind: initialKind,
  duration: initialDuration,
  generated,
  onClose,
  onComplete,
}: {
  studentId: string;
  teacherId: string;
  slots: { date: string; time: string; teacherId?: string }[];
  kind: Lesson["kind"];
  duration: number;
  generated: boolean;
  onClose: () => void;
  onComplete: (
    studentId: string,
    count: number,
    teachers: string,
    date: string,
  ) => void;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const [studentId, setStudent] = useState(initialStudent);
  const [kind, setKind] = useState(initialKind);
  const [material, setMaterial] = useState(
    data.students.find((s) => s.id === initialStudent)?.material || "",
  );
  const [duration, setDuration] = useState(initialDuration);
  const [weeks, setWeeks] = useState(4);
  const [expanded, setExpanded] = useState(generated);
  const [rows, setRows] = useState<Row[]>(() =>
    slots.map((s) => ({
      ...s,
      teacherId: s.teacherId ?? teacherId,
      confirmedTeacher: false,
    })),
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [batchTeacher, setBatchTeacher] = useState(teacherId);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [error, setError] = useState("");
  const [rangeDate, setRangeDate] = useState(DEMO_TODAY);
  const [rangeStart, setRangeStart] = useState("18:00");
  const [rangeEnd, setRangeEnd] = useState("21:00");
  const [calendarStart, setCalendarStart] = useState(
    slots[0]?.date || DEMO_TODAY,
  );
  const draftKey = `crazytalk-course-plan:${initialStudent || "new"}:${initialKind}`;
  const [savedDraft, setSavedDraft] = useState(() => {
    try {
      const parsed = draftSchema.safeParse(
        JSON.parse(localStorage.getItem(draftKey) || "null"),
      );
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    localStorage.setItem(
      draftKey,
      JSON.stringify({ studentId, kind, duration, expanded, rows }),
    );
  }, [draftKey, studentId, kind, duration, expanded, rows]);
  const student = data.students.find((s) => s.id === studentId);
  const eligible = data.teachers.filter(
    (t) =>
      t.status !== "已离职" &&
      !(
        student?.age != null &&
        student.age < 16 &&
        !t.categories.includes("少儿")
      ),
  );
  function reason(
    row: Row,
    index: number,
    allowOutside = row.confirmedTeacher,
  ) {
    if (!row.teacherId) return "待选择老师";
    if (!eligible.some((t) => t.id === row.teacherId))
      return "老师不符合授课要求";
    if (row.date < DEMO_TODAY) return "不能安排过去的课程";
    if (
      rows.some(
        (other, i) =>
          i !== index &&
          other.date === row.date &&
          minutes(other.time) < minutes(row.time) + duration &&
          minutes(row.time) < minutes(other.time) + duration,
      )
    )
      return "计划中的课程时间重叠";
    return (
      isAvailable(
        data,
        row.teacherId,
        row.date,
        row.time,
        duration,
        studentId,
        undefined,
        allowOutside,
      )[0] || ""
    );
  }
  const needsConfirmation = (row: Row) => {
    const t = data.teachers.find((t) => t.id === row.teacherId);
    return (
      t && (t.needConfirm || !isRegularTime(t, row.date, row.time, duration))
    );
  };
  const ready = rows.filter(
    (r, i) => !reason(r, i) && (!needsConfirmation(r) || r.confirmedTeacher),
  );
  function update(index: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((r, i) =>
        i === index
          ? {
              ...r,
              ...patch,
              confirmedTeacher: patch.confirmedTeacher ?? false,
            }
          : r,
      ),
    );
    setError("");
  }
  function fill() {
    const next = rows.map((r) => ({ ...r }));
    const teachers = [...eligible].sort(
      (a, b) =>
        Number(b.id === teacherId) - Number(a.id === teacherId) ||
        next.filter(
          (r) =>
            !r.teacherId &&
            !reason({ ...r, teacherId: b.id }, next.indexOf(r), false),
        ).length -
          next.filter(
            (r) =>
              !r.teacherId &&
              !reason({ ...r, teacherId: a.id }, next.indexOf(r), false),
          ).length,
    );
    for (const t of teachers)
      next.forEach((r, i) => {
        if (!r.teacherId && !reason({ ...r, teacherId: t.id }, i, false))
          r.teacherId = t.id;
      });
    setRows(next);
  }
  function submit() {
    try {
      if (!student) throw new Error("请选择学员");
      const result = act({
        type: "lesson.schedule",
        studentId,
        teacherId,
        slots: ready,
        duration,
        kind,
        material: material || student.material,
        confirmationNote,
      });
      toast(result.message);
      if (ready.length === rows.length) {
        localStorage.removeItem(draftKey);
        onComplete(
          studentId,
          ready.length,
          [
            ...new Set(
              ready.map(
                (r) =>
                  data.teachers.find((t) => t.id === r.teacherId)?.name || "",
              ),
            ),
          ].join("、"),
          ready[0].date,
        );
      } else {
        setRows(rows.filter((r) => !ready.includes(r)));
        setSelected([]);
        setError(`已安排 ${ready.length} 节，剩余课程可继续补齐。`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "排课失败，请重试");
    }
  }
  return (
    <div className="stack course-plan">
      {savedDraft && (
        <div className="row wrap">
          <span>有尚未完成的排课草稿</span>
          <Button
            size="sm"
            onClick={() => {
              setRows(
                savedDraft.rows.map((r) => ({ ...r, confirmedTeacher: false })),
              );
              setStudent(savedDraft.studentId);
              setKind(savedDraft.kind);
              setDuration(savedDraft.duration);
              setExpanded(savedDraft.expanded);
              setSavedDraft(null);
            }}
          >
            继续上次编排
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSavedDraft(null)}>
            使用当前方案
          </Button>
        </div>
      )}
      {kind === "临时课" && (
        <section aria-label="学员周日历" className="stack">
          <div className="row between">
            <Button
              size="sm"
              onClick={() => setCalendarStart(addDays(calendarStart, -7))}
            >
              上一周
            </Button>
            <strong>{calendarStart} 起的一周</strong>
            <Button
              size="sm"
              onClick={() => setCalendarStart(addDays(calendarStart, 7))}
            >
              下一周
            </Button>
          </div>
          <div className="course-plan-calendar">
            {Array.from({ length: 7 }, (_, i) => addDays(calendarStart, i)).map(
              (date) => (
                <div className="inset" key={date}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={date < DEMO_TODAY}
                    onClick={() =>
                      setRows([
                        ...rows,
                        {
                          date,
                          time: "19:00",
                          teacherId: rows.at(-1)?.teacherId || teacherId,
                          confirmedTeacher: false,
                        },
                      ])
                    }
                  >
                    {date.slice(5)} +
                  </Button>
                  {data.lessons
                    .filter(
                      (l) =>
                        l.studentId === studentId &&
                        l.date === date &&
                        l.status !== "已取消",
                    )
                    .map((l) => (
                      <small key={l.id}>
                        已排 {l.time} ·{" "}
                        {data.teachers.find((t) => t.id === l.teacherId)?.name}
                      </small>
                    ))}
                  {rows
                    .filter((r) => r.date === date)
                    .map((r, i) => (
                      <small key={i}>待确认 {r.time}</small>
                    ))}
                </div>
              ),
            )}
          </div>
          <small className="muted">
            点击日期添加课程；已排课程请在主日历中调课或取消。
          </small>
        </section>
      )}
      <div className="form-grid">
        <Field label="学员">
          <Select
            value={studentId}
            disabled={generated}
            onValueChange={(v) => {
              setStudent(v);
              setMaterial(
                data.students.find((s) => s.id === v)?.material || "",
              );
              setRows(rows.map((r) => ({ ...r, confirmedTeacher: false })));
            }}
          >
            <option value="">请选择学员</option>
            {data.students
              .filter((s) => !["停课", "退费", "结课"].includes(s.status))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="排课方式">
          <Select
            value={kind}
            disabled={generated || expanded}
            onValueChange={(v) => setKind(v === "固定课" ? "固定课" : "临时课")}
          >
            <option value="固定课">固定排课</option>
            <option value="临时课">灵活排课</option>
          </Select>
        </Field>
        <Field label="教材">
          <Select value={material} onValueChange={setMaterial}>
            <option value="">使用学员教材</option>
            {[
              ...new Set([
                material,
                ...data.catalog
                  .filter((c) => c.type === "教材" && c.enabled)
                  .map((c) => c.name),
              ]),
            ]
              .filter(Boolean)
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="每节时长">
          <Select
            value={duration}
            disabled={generated}
            onValueChange={(v) => {
              setDuration(Number(v));
              setRows(rows.map((r) => ({ ...r, confirmedTeacher: false })));
            }}
          >
            {[25, 50, 55, 120].map((n) => (
              <option key={n} value={n}>
                {n} 分钟
              </option>
            ))}
          </Select>
        </Field>
        {kind === "固定课" && !expanded && (
          <Field label="重复周数">
            <Select value={weeks} onValueChange={(v) => setWeeks(Number(v))}>
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n} 周
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <p className="muted">
        {kind === "固定课"
          ? "固定上课时间，每节课可由不同老师授课。"
          : "按具体日期安排，每节课可自由选择时间和老师。"}
      </p>
      <div className="row between wrap">
        <strong>课程预览 · 共 {rows.length} 节</strong>
        <span>
          可确认 {ready.length} 节 · 待处理 {rows.length - ready.length} 节
        </span>
      </div>
      <div className="row wrap">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setSelected(
              selected.length === rows.length ? [] : rows.map((_, i) => i),
            )
          }
        >
          {selected.length === rows.length && rows.length
            ? "取消全选"
            : "全选课次"}
        </Button>
        {selected.some((i) => rows[i] && needsConfirmation(rows[i])) && (
          <Button
            size="sm"
            onClick={() =>
              setRows(
                rows.map((r, i) =>
                  selected.includes(i) ? { ...r, confirmedTeacher: true } : r,
                ),
              )
            }
          >
            已与老师确认选中课次
          </Button>
        )}
        <Button size="sm" onClick={fill}>
          补齐剩余老师
        </Button>
        <Select
          aria-label="批量分配老师"
          value={batchTeacher}
          onValueChange={setBatchTeacher}
        >
          <option value="">选择老师</option>
          {eligible.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={!selected.length || !batchTeacher}
          onClick={() => {
            setRows(
              rows.map((r, i) =>
                selected.includes(i) &&
                !reason({ ...r, teacherId: batchTeacher }, i, false)
                  ? { ...r, teacherId: batchTeacher, confirmedTeacher: false }
                  : r,
              ),
            );
            setError("已分配可覆盖的课次；其他课次保留原安排，请检查。");
          }}
        >
          分配给选中课次
        </Button>
      </div>
      <div className="stack">
        {rows.map((r, i) => (
          <section className="inset" key={i} aria-label={`第${i + 1}节课程`}>
            <div className="row wrap">
              <input
                aria-label={`选择第${i + 1}节`}
                type="checkbox"
                checked={selected.includes(i)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, i]
                      : selected.filter((n) => n !== i),
                  )
                }
              />
              <DatePicker
                aria-label={`第${i + 1}节上课日期`}
                mode="date"
                min={DEMO_TODAY}
                value={r.date}
                disabled={kind === "固定课" && expanded}
                onValueChange={(date) => update(i, { date })}
              />
              <input
                aria-label={`第${i + 1}节上课时间`}
                type="time"
                value={r.time}
                disabled={kind === "固定课" && expanded}
                onChange={(e) => update(i, { time: e.target.value })}
              />
              <Select
                aria-label={`第${i + 1}节老师`}
                value={r.teacherId}
                onValueChange={(teacherId) => update(i, { teacherId })}
              >
                <option value="">待安排</option>
                {eligible.map((t) => {
                  const why = reason({ ...r, teacherId: t.id }, i, true);
                  return (
                    <option key={t.id} value={t.id} disabled={Boolean(why)}>
                      {t.name}
                      {why ? ` · ${why}` : ""}
                    </option>
                  );
                })}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (kind === "固定课" && expanded)
                    update(i, { teacherId: "" });
                  else setRows(rows.filter((_, n) => n !== i));
                  setSelected([]);
                }}
              >
                {kind === "固定课" && expanded ? "暂不安排" : "移除"}
              </Button>
            </div>
            {reason(r, i) && <small role="status">{reason(r, i)}</small>}
            {needsConfirmation(r) && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={r.confirmedTeacher}
                  onChange={(e) =>
                    update(i, { confirmedTeacher: e.target.checked })
                  }
                />
                已与 {data.teachers.find((t) => t.id === r.teacherId)?.name}{" "}
                确认本节授课时间
                {!isRegularTime(
                  data.teachers.find((t) => t.id === r.teacherId) ||
                    eligible[0],
                  r.date,
                  r.time,
                  duration,
                )
                  ? "（非常规时间）"
                  : ""}
              </label>
            )}
          </section>
        ))}
      </div>
      {(kind === "临时课" || !expanded) && (
        <Button
          onClick={() =>
            setRows([
              ...rows,
              {
                date: rows.length
                  ? addDays(rows.at(-1)?.date || DEMO_TODAY, 1)
                  : DEMO_TODAY,
                time: rows.at(-1)?.time || "19:00",
                teacherId: rows.at(-1)?.teacherId || teacherId,
                confirmedTeacher: false,
              },
            ])
          }
        >
          添加时间
        </Button>
      )}
      {kind === "临时课" && (
        <details>
          <summary>在可接受时间范围内找课</summary>
          <div className="row wrap">
            <DatePicker
              aria-label="查找课程日期"
              mode="date"
              min={DEMO_TODAY}
              value={rangeDate}
              onValueChange={setRangeDate}
            />
            <input
              aria-label="最早上课时间"
              type="time"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
            <input
              aria-label="最晚上课结束时间"
              type="time"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
            <Button
              onClick={() => {
                for (
                  let m = minutes(rangeStart);
                  m + duration <= minutes(rangeEnd);
                  m++
                ) {
                  const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
                  for (const t of eligible) {
                    const row = {
                      date: rangeDate,
                      time,
                      teacherId: t.id,
                      confirmedTeacher: false,
                    };
                    if (!reason(row, -1, false)) {
                      setRows([...rows, row]);
                      setError("");
                      return;
                    }
                  }
                }
                setError("该范围内暂无可安排课程，请更换日期或扩大范围。");
              }}
            >
              匹配并添加一节
            </Button>
          </div>
        </details>
      )}
      {rows.some(needsConfirmation) && (
        <Field label="沟通备注（选填）">
          <input
            value={confirmationNote}
            onChange={(e) => setConfirmationNote(e.target.value)}
          />
        </Field>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="row wrap">
        <Button onClick={onClose}>返回调整</Button>
        {kind === "固定课" && !expanded ? (
          <Button
            variant="primary"
            disabled={!rows.length || !studentId}
            onClick={() => {
              setRows(
                rows.flatMap((r) =>
                  Array.from({ length: weeks }, (_, w) => ({
                    ...r,
                    date: addDays(r.date, w * 7),
                    confirmedTeacher: false,
                  })),
                ),
              );
              setExpanded(true);
              setSelected([]);
            }}
          >
            生成课程计划
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={
              !ready.length || !studentId || preview || !can("schedule.create")
            }
            onClick={submit}
          >
            {ready.length === rows.length || !ready.length
              ? "确认排课"
              : `确认已安排的 ${ready.length} 节`}
          </Button>
        )}
      </div>
    </div>
  );
}
