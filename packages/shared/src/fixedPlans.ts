import {
  addDays,
  DEMO_TODAY,
  type DemoState,
  type ScheduleIntent,
} from "./model";
import { isAvailable, minutes } from "./domain";
import { scheduleIntentSchema } from "./model";

export type FixedPlanSlot = {
  date: string;
  time: string;
  teacherId: string;
  lessonId?: string;
};
export type FixedPlan = {
  primaryTeacherId: string;
  slots: FixedPlanSlot[];
  requiredCount: number;
  coveredCount: number;
  primaryCount: number;
  teacherCount: number;
  complete: boolean;
  positions: { day: number; time: string }[];
};
const dayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
const timeText = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function getFixedSchedulePlans(
  data: DemoState,
  studentId: string,
  intent: ScheduleIntent,
): FixedPlan[] {
  const student = data.students.find((s) => s.id === studentId);
  if (
    !student ||
    ["停课", "退费", "结课"].includes(student.status) ||
    intent.mode !== "fixed" ||
    !scheduleIntentSchema.safeParse(intent).success
  )
    return [];
  const teachers = data.teachers.filter(
    (t) =>
      t.status !== "已离职" &&
      (!data.rules.trainingRequired || t.trained) &&
      !(
        student.age !== null &&
        student.age < 16 &&
        !t.categories.includes("少儿")
      ),
  );
  const end = addDays(intent.startDate, intent.weeks * 7);
  const booked = data.lessons
    .filter(
      (l) =>
        !l.scheduleExtra &&
        l.studentId === studentId &&
        l.status !== "已取消" &&
        l.duration === intent.duration,
    )
    .map((l) => ({ ...l, ...(l.fixedOrigin || {}) }))
    .filter(
      (l) =>
        l.date >= intent.startDate &&
        l.date < end &&
        intent.windows.some(
          (w) =>
            w.day === dayOf(l.date) &&
            l.time >= w.start &&
            minutes(l.time) + l.duration <= minutes(w.end),
        ),
    );
  const required = new Set(booked.map((l) => `${dayOf(l.date)}-${l.time}`));
  if (required.size > intent.frequency) return [];
  const keys = new Set<string>();
  const candidates: {
    start: number;
    day: number;
    time: string;
    required: boolean;
    series: { date: string; time: string; ids: string[]; lessonId?: string }[];
  }[] = [];
  for (let d = 0; d < 7; d++) {
    const date = addDays(intent.startDate, d);
    const day = dayOf(date);
    for (const w of intent.windows.filter((w) => w.day === day))
      for (
        let m = minutes(w.start);
        m + intent.duration <= minutes(w.end);
        m++
      ) {
        const time = timeText(m),
          key = `${day}-${time}`;
        if (keys.has(key)) continue;
        keys.add(key);
        const series = Array.from({ length: intent.weeks }, (_, week) => {
          const occurrence = addDays(date, week * 7);
          const lesson = booked.find(
            (l) => l.date === occurrence && l.time === time,
          );
          return {
            date: occurrence,
            time,
            ids: lesson
              ? [lesson.teacherId]
              : occurrence < DEMO_TODAY
                ? []
                : teachers
                    .filter(
                      (t) =>
                        !isAvailable(
                          data,
                          t.id,
                          occurrence,
                          time,
                          intent.duration,
                          studentId,
                        ).length,
                    )
                    .map((t) => t.id),
            ...(lesson ? { lessonId: lesson.id } : {}),
          };
        });
        candidates.push({
          start: d * 1440 + m,
          day,
          time,
          required: required.has(key),
          series,
        });
      }
  }
  const locked = candidates.filter((c) => c.required);
  const free = candidates
    .filter(
      (c) =>
        !c.required &&
        !locked.some((l) => Math.abs(l.start - c.start) < intent.duration),
    )
    .sort((a, b) => a.start - b.start);
  const count = intent.frequency - locked.length;
  const previous = free.map((c, i) => {
    let lo = 0,
      hi = i;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (free[mid].start + intent.duration <= c.start) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  });
  const requiredCount = intent.frequency * intent.weeks;
  const plans = teachers.map((primary) => {
    // Weighted interval scheduling: complete coverage dominates primary coverage;
    // cardinality is the final tie-break so empty required positions stay visible.
    const score = (c: (typeof candidates)[number]) =>
      c.series.filter((s) => s.ids.length).length *
        (requiredCount + 1) *
        (intent.frequency + 1) +
      c.series.filter((s) => s.ids.includes(primary.id)).length *
        (intent.frequency + 1) +
      1;
    const dp = Array.from({ length: free.length + 1 }, () =>
      Array.from({ length: count + 1 }, () => ({
        score: 0,
        indices: Array<number>(),
      })),
    );
    for (let i = 1; i <= free.length; i++)
      for (let k = 1; k <= count; k++) {
        const skip = dp[i - 1][k],
          base = dp[previous[i - 1]][k - 1];
        const value = base.score + score(free[i - 1]);
        dp[i][k] =
          value > skip.score
            ? { score: value, indices: [...base.indices, i - 1] }
            : skip;
      }
    const positions = [
      ...locked,
      ...dp[free.length][count].indices.map((i) => free[i]),
    ].sort((a, b) => a.start - b.start);
    const all = positions.flatMap((p) => p.series);
    const assignments = all.map((s) => ({
      ...s,
      teacherId: s.lessonId
        ? s.ids[0] || ""
        : s.ids.includes(primary.id)
          ? primary.id
          : "",
    }));
    const remaining = new Set(
      assignments
        .map((s, i) => (!s.teacherId && s.ids.length ? i : -1))
        .filter((i) => i >= 0),
    );
    while (remaining.size) {
      const best = [...teachers].sort(
        (a, b) =>
          [...remaining].filter((i) => assignments[i].ids.includes(b.id))
            .length -
          [...remaining].filter((i) => assignments[i].ids.includes(a.id))
            .length,
      )[0];
      if (!best) break;
      for (const i of remaining)
        if (assignments[i].ids.includes(best.id)) {
          assignments[i].teacherId = best.id;
          remaining.delete(i);
        }
    }
    const slots = assignments
      .map(({ date, time, teacherId, lessonId }) => ({
        date,
        time,
        teacherId,
        ...(lessonId ? { lessonId } : {}),
      }))
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
      );
    const coveredCount = slots.filter((s) => s.teacherId).length;
    return {
      primaryTeacherId: primary.id,
      slots,
      requiredCount,
      coveredCount,
      primaryCount: slots.filter((s) => s.teacherId === primary.id).length,
      teacherCount: new Set(slots.map((s) => s.teacherId).filter(Boolean)).size,
      complete: coveredCount === requiredCount,
      positions: positions.map(({ day, time }) => ({ day, time })),
    };
  });
  return plans
    .filter((p) => p.primaryCount > 0)
    .sort(
      (a, b) =>
        b.coveredCount - a.coveredCount ||
        b.primaryCount - a.primaryCount ||
        a.teacherCount - b.teacherCount ||
        a.primaryTeacherId.localeCompare(b.primaryTeacherId),
    );
}
