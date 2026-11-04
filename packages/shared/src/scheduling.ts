import {
  addDays,
  DEMO_TODAY,
  scheduleIntentSchema,
  type DemoState,
  type ScheduleIntent,
} from "./model";
import { isAvailable, minutes } from "./domain";
import { isScheduleDate } from "./availability";

type Slot = { date: string; time: string };
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const dayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
const overlaps = (a: Slot, b: Slot, duration: number) =>
  a.date === b.date &&
  minutes(a.time) < minutes(b.time) + duration &&
  minutes(b.time) < minutes(a.time) + duration;
function valid(intent: ScheduleIntent) {
  return (
    scheduleIntentSchema.safeParse(intent).success &&
    isScheduleDate(intent.startDate) &&
    intent.windows.every(
      (w) => minutes(w.end) - minutes(w.start) >= intent.duration,
    )
  );
}
function inWindow(slot: Slot, duration: number, intent: ScheduleIntent) {
  return intent.windows.some(
    (w) =>
      w.day === dayOf(slot.date) &&
      slot.time >= w.start &&
      minutes(slot.time) + duration <= minutes(w.end),
  );
}
function existing(
  data: DemoState,
  studentId: string,
  intent: ScheduleIntent,
  week: number,
) {
  const start = addDays(intent.startDate, week * 7);
  return data.lessons
    .map((l) =>
      intent.mode === "fixed" && l.fixedOrigin ? { ...l, ...l.fixedOrigin } : l,
    )
    .filter(
      (l) =>
        !l.scheduleExtra &&
        l.studentId === studentId &&
        l.status !== "已取消" &&
        l.date >= start &&
        l.date < addDays(start, 7) &&
        l.duration === intent.duration &&
        inWindow(l, l.duration, intent),
    );
}
export function getStudentScheduleProgress(
  data: DemoState,
  studentId: string,
  intent: ScheduleIntent,
) {
  const requiredCount = intent.weeks * intent.frequency;
  if (!valid(intent))
    return { requiredCount, scheduledCount: 0, complete: false };
  const scheduledCount = Array.from({ length: intent.weeks }, (_, w) =>
    Math.min(intent.frequency, existing(data, studentId, intent, w).length),
  ).reduce((a, b) => a + b, 0);
  const positions = new Set(
    Array.from({ length: intent.weeks }, (_, w) =>
      existing(data, studentId, intent, w),
    )
      .flat()
      .map((l) => `${dayOf(l.date)}-${l.time}`),
  );
  return {
    requiredCount,
    scheduledCount,
    complete:
      scheduledCount >= requiredCount &&
      (intent.mode !== "fixed" || positions.size <= intent.frequency),
  };
}
export function getTeacherScheduleMatch(
  data: DemoState,
  teacherId: string,
  studentId: string,
  intent: ScheduleIntent,
) {
  const requiredCount = intent.weeks * intent.frequency;
  const plan: Slot[] = [];
  const result = (slots: Slot[], reasons: string[]) => ({
    slots,
    plan,
    requiredCount,
    matchedCount: slots.length,
    complete:
      slots.length +
        getStudentScheduleProgress(data, studentId, intent).scheduledCount >=
      requiredCount,
    reasons,
  });
  if (!valid(intent)) return result([], ["请补充有效的排课意向"]);
  const student = data.students.find((s) => s.id === studentId);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  if (!student || !teacher) return result([], ["请选择学员和老师"]);
  if (["停课", "结课", "退费"].includes(student.status))
    return result([], ["学员当前状态不可排课"]);
  if (
    student.age !== null &&
    student.age < 16 &&
    !teacher.categories.includes("少儿")
  )
    return result([], ["暂不教授少儿课程"]);
  const candidates: Slot[] = [];
  const candidateKeys = new Set<string>();
  for (let d = 0; d < 7; d++) {
    const date = addDays(intent.startDate, d);
    for (const window of intent.windows.filter((w) => w.day === dayOf(date))) {
      for (
        let m = minutes(window.start);
        m + intent.duration <= minutes(window.end);
        m += 1
      ) {
        const slot = { date, time: clock(m) };
        const key = `${date}-${slot.time}`;
        if (!candidateKeys.has(key)) {
          candidateKeys.add(key);
          candidates.push(slot);
        }
      }
    }
  }
  candidates.sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  const slots: Slot[] = [];
  const reasons = new Set<string>();
  const weekCounts = Array.from({ length: intent.weeks }, (_, w) =>
    Math.min(intent.frequency, existing(data, studentId, intent, w).length),
  );
  const available = (s: Slot) => {
    const errors =
      s.date < DEMO_TODAY
        ? ["上课日期已过期"]
        : isAvailable(
            data,
            teacherId,
            s.date,
            s.time,
            intent.duration,
            studentId,
          );
    errors.forEach((e) => reasons.add(e));
    return (
      !errors.length &&
      !slots.some((other) => overlaps(s, other, intent.duration))
    );
  };
  if (intent.mode === "fixed") {
    const requiredPositions: Slot[] = [];
    for (let w = 0; w < intent.weeks; w++) {
      for (const lesson of existing(data, studentId, intent, w)) {
        const date = addDays(lesson.date, -w * 7);
        if (
          !requiredPositions.some(
            (s) => s.date === date && s.time === lesson.time,
          )
        )
          requiredPositions.push({ date, time: lesson.time });
      }
    }
    if (requiredPositions.length > intent.frequency)
      return {
        ...result(
          [],
          ["已有课程的每周时间不一致，请先调整已有课程或改为灵活排课"],
        ),
        complete: false,
      };
    const ordered = [
      ...requiredPositions,
      ...candidates.filter(
        (c) =>
          !requiredPositions.some(
            (s) => s.date === c.date && s.time === c.time,
          ),
      ),
    ];
    const positions: Slot[] = [];
    const ranked = ordered
      .map((candidate) => ({
        candidate,
        coverage: Array.from({ length: intent.weeks }, (_, w) => ({
          date: addDays(candidate.date, w * 7),
          time: candidate.time,
        })).filter(available).length,
      }))
      .sort((a, b) => {
        const required = (s: Slot) =>
          Number(
            requiredPositions.some(
              (p) => p.date === s.date && p.time === s.time,
            ),
          );
        return (
          required(b.candidate) - required(a.candidate) ||
          b.coverage - a.coverage
        );
      });
    for (const { candidate } of ranked) {
      if (positions.length >= intent.frequency) break;
      if (positions.some((p) => overlaps(p, candidate, intent.duration)))
        continue;
      positions.push(candidate);
      for (let w = 0; w < intent.weeks; w++) {
        const slot = {
          date: addDays(candidate.date, w * 7),
          time: candidate.time,
        };
        if (
          existing(data, studentId, intent, w).some(
            (l) => l.date === slot.date && l.time === slot.time,
          )
        )
          continue;
        plan.push(slot);
        if (available(slot)) slots.push(slot);
      }
    }
  } else {
    for (let w = 0; w < intent.weeks; w++) {
      for (const candidate of candidates) {
        if (weekCounts[w] >= intent.frequency) break;
        const slot = {
          date: addDays(candidate.date, w * 7),
          time: candidate.time,
        };
        if (available(slot)) {
          slots.push(slot);
          weekCounts[w]++;
        }
      }
    }
  }
  const outcome = result(slots, []);
  return {
    ...outcome,
    reasons: outcome.complete
      ? []
      : [...reasons, "部分意向时间无法满足，请调整时间或选择其他老师"],
  };
}
