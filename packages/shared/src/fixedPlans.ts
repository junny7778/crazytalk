import { schedulingBookingIssue, teacherSchedulingAccountIssue } from "./schedulingAccounts";
import { materialMatchIssue, studentMaterials } from "./materials";
import { teacherFit, compareTeacherFit } from "./teacherMatch";
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
  material?: string;
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
    !!schedulingBookingIssue(data, studentId) ||
    ["停课", "退费", "结课"].includes(student.status) ||
    intent.mode !== "fixed" ||
    !scheduleIntentSchema.safeParse(intent).success
  )
    return [];
  const materials = studentMaterials(data, student).filter(c => intent.materialIds?.includes(c.id));
  if (!materials.length) return [];
  const teachers = data.teachers.filter(
    (t) =>
      !teacherSchedulingAccountIssue(t) &&
      materials.some(c => !materialMatchIssue(data, student, t, c.name)) &&
      !teacherFit(data, student, t).blocked.length &&
      t.status !== "已离职" &&
      (!data.rules.trainingRequired || t.trained) &&
      !(
        student.age !== null &&
        student.age < 16 &&
        !t.categories.includes("少儿")
      ),
  );
  const end = addDays(intent.startDate, intent.weeks * 7);
  const confirmedByDate = new Map<string, number>();
  if (intent.planId) {
    for (const l of data.lessons) {
      if (l.studentId === studentId && l.schedulePlanId === intent.planId && l.status !== "已取消")
        confirmedByDate.set(l.date, (confirmedByDate.get(l.date) ?? 0) + 1);
    }
  }
  const booked = data.lessons
    .filter(
      (l) =>
        (intent.unlimited ? !!intent.planId && l.schedulePlanId === intent.planId : !l.scheduleExtra) &&
        l.studentId === studentId &&
        l.status !== "已取消" &&
        l.duration === intent.duration,
    )
    .map((l) => intent.unlimited || !l.fixedOrigin ? l : { ...l, ...l.fixedOrigin })
    .filter(
      (l) =>
        l.date >= intent.startDate &&
        l.date < end &&
        (intent.unlimited || intent.windows.some(
          (w) =>
            w.day === dayOf(l.date) &&
            l.time >= w.start &&
            minutes(l.time) + l.duration <= minutes(w.end),
        )),
    );
  const required = new Set((intent.dailyLimit ? [] : booked).map((l) => `${dayOf(l.date)}-${l.time}`));
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
        if (m % 30 !== 0 && !required.has(key)) continue;
        if (keys.has(key)) continue;
        keys.add(key);
        const series = Array.from({ length: intent.weeks }, (_, week) => {
          const occurrence = addDays(date, week * 7);
          const lesson = !intent.dailyLimit && booked.find(
            (l) => l.date === occurrence && l.time === time,
          );
          return {
            date: occurrence,
            time,
            ids: lesson
              ? [lesson.teacherId]
              : occurrence < DEMO_TODAY || (!!intent.dailyLimit && (confirmedByDate.get(occurrence) ?? 0) >= intent.dailyLimit)
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
  const requiredCount = intent.targetLessons ?? intent.frequency * intent.weeks;
  const plans = teachers.map((primary) => {
    // Prefer primary-teacher coverage or total coverage according to the selected priority.
    const score = (c: (typeof candidates)[number]) => {
      const primaryCount = c.series.filter(s => s.ids.includes(primary.id)).length;
      const coveredCount = c.series.filter(s => s.ids.length > 0).length;
      const [first, second] = intent.priority === "teacher"
        ? [primaryCount, coveredCount]
        : [coveredCount, primaryCount];
      return (first * (requiredCount + 1) + second) * (intent.frequency + 1) + 1;
    };
    type Choice = { score: number; indices: number[] };
    const empty = (): Choice => ({score: 0, indices: []});
    let weekly = Array.from({length: count + 1}, empty);
    for (let start = 0; start < free.length;) {
      let end = start + 1;
      while (end < free.length && free[end].day === free[start].day) end++;
      const lockedToday = locked.filter(c => c.day === free[start].day).length;
      const limit = Math.min(count, Math.max(0, (intent.dailyLimit ?? intent.frequency) - lockedToday));
      const day = Array.from({length: end - start + 1}, () => Array.from({length: limit + 1}, empty));
      for (let i = start; i < end; i++) {
        const slotScore = score(free[i]) * (intent.frequency + 1);
        for (let k = 1; k <= limit; k++) {
          const skip = day[i - start][k];
          const base = day[Math.max(0, previous[i] - start)][k - 1];
          const value = base.score + slotScore;
          day[i - start + 1][k] = value > skip.score ? {score: value, indices: [...base.indices, i]} : skip;
        }
      }
      const next = weekly.slice();
      for (let k = 1; k <= count; k++) {
        for (let n = 1; n <= Math.min(k, limit); n++) {
          const today = day[end - start][n];
          const before = weekly[k - n];
          const spread = intent.dailyLimit && !lockedToday && today.indices.length ? 1 : 0;
          const value = before.score + today.score + spread;
          if (value > next[k].score) next[k] = {score: value, indices: [...before.indices, ...today.indices]};
        }
      }
      weekly = next;
      start = end;
    }
    const positions = [...locked, ...weekly[count].indices.map(i => free[i])].sort((a,b) => a.start - b.start);
    const all = Array.from({length: intent.weeks}, (_, week) => {
      const from = addDays(intent.startDate, week * 7);
      const to = addDays(from, 7);
      const already = intent.dailyLimit ? booked.filter(l => l.date >= from && l.date < to).map(l => ({
        date: l.date, time: l.time, ids: [l.teacherId], lessonId: l.id,
      })) : [];
      const used = new Map(confirmedByDate);
      const occurrences = positions.map(p => p.series[week]).filter(s => {
        if (already.some(l => l.date === s.date && l.time === s.time)) return false;
        const count = used.get(s.date) ?? 0;
        if (intent.dailyLimit && count >= intent.dailyLimit) return false;
        used.set(s.date, count + 1);
        return true;
      });
      const quota = Math.min(intent.frequency, requiredCount - week * intent.frequency);
      if (already.length + occurrences.length <= quota) return [...already, ...occurrences];
      const ranked = occurrences.sort((a,b) => Number(!!b.lessonId) - Number(!!a.lessonId)
        || Number(b.ids.includes(primary.id)) - Number(a.ids.includes(primary.id))
        || Number(!!b.ids.length) - Number(!!a.ids.length));
      return [...already, ...ranked].slice(0, quota);
    }).flat();
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
      const best = teachers.filter(t => [...remaining].some(i => assignments[i].ids.includes(t.id))).sort(
        (a, b) =>
          (intent.priority === "teacher" ? compareTeacherFit(data, student, a, b) : 0) ||
          [...remaining].filter((i) => assignments[i].ids.includes(b.id))
            .length -
          [...remaining].filter((i) => assignments[i].ids.includes(a.id))
            .length || compareTeacherFit(data, student, a, b),
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
        material: lessonId ? booked.find(l => l.id === lessonId)!.material : materials.find(c => data.teachers.find(t => t.id === teacherId)?.materialIds?.includes(c.id))?.name || materials[0].name,
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
    .sort(
      (a, b) =>
        (intent.priority === "teacher" ? compareTeacherFit(data, student, teachers.find(t => t.id === a.primaryTeacherId)!, teachers.find(t => t.id === b.primaryTeacherId)!) : 0) ||
        b.coveredCount - a.coveredCount ||
        b.primaryCount - a.primaryCount ||
        a.teacherCount - b.teacherCount ||
        a.primaryTeacherId.localeCompare(b.primaryTeacherId),
    );
}
