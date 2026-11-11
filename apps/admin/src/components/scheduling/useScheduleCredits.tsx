import { useEffect, useState } from "react";
import { getScheduleCredits, scheduleUnits } from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Button, Field } from "@crazytalk/ui";

export function useScheduleCredits(
  studentId: string,
  duration: number,
  count: number,
) {
  const { data, act, can, preview } = useDemo();
  const [manual, setManual] = useState("");
  const [legacy, setLegacy] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    setManual("");
    setError("");
  }, [duration, studentId]);
  const units = scheduleUnits(
    duration,
    manual.trim() ? Number(manual) : undefined,
  );
  const summary = getScheduleCredits(data, studentId, count, units ?? NaN);
  const unknown = data.lessons.filter(
    (l) =>
      l.studentId === studentId &&
      !l.deducted &&
      ["未开始", "待确认", "缺席"].includes(l.status) &&
      scheduleUnits(l.duration, l.plannedUnits) === undefined,
  );
  const node = (
    <section
      className="schedule-credit-summary stack"
      aria-label="排课课时校验"
    >
      <strong>课时余额与占用</strong>
      {duration !== 25 && duration !== 50 ? (
        <Field label="每节预计扣课数" required>
          <input
            type="number"
            min="0.01"
            step="any"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="请填写每节预计占用的课时"
          />
        </Field>
      ) : (
        <small>
          每节 {duration} 分钟，预计占用 {units} 课时
        </small>
      )}
      <small>
        {summary.allocations.length ? "共享订单" : "个人余额"} · 剩余 {summary.balance} 课时 · 已排占用 {summary.reserved} 课时 · 可用{" "}
        {summary.available} 课时
      </small>
      <small>
        本次 {count} 节 · 需占用{" "}
        {Number.isFinite(summary.required) ? summary.required : "待填写"} 课时
      </small>
      {unknown.map((lesson) => (
        <div className="row wrap" key={lesson.id}>
          <Field
            label={`${lesson.date} ${lesson.time}（${lesson.duration}分钟）预计扣课数`}
          >
            <input
              type="number"
              min="0.01"
              step="any"
              value={legacy[lesson.id] || ""}
              onChange={(e) =>
                setLegacy({ ...legacy, [lesson.id]: e.target.value })
              }
            />
          </Field>
          <Button
            size="sm"
            disabled={
              preview ||
              !can("schedule.create") ||
              !Number.isFinite(Number(legacy[lesson.id])) ||
              Number(legacy[lesson.id]) <= 0
            }
            onClick={() => {
              try {
                act({
                  type: "lesson.plannedUnits.update",
                  id: lesson.id,
                  plannedUnits: Number(legacy[lesson.id]),
                });
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "核实失败");
              }
            }}
          >
            核实占用
          </Button>
        </div>
      ))}
      {summary.error && studentId && (
        <p className="danger" role="status">
          {summary.error}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
  return { units, error: summary.error, node };
}
