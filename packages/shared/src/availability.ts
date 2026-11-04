import type { Teacher } from "./model";

const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const minuteOf = (time: string) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
};
export function isScheduleDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const timestamp = Date.parse(`${date}T12:00:00+08:00`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === date
  );
}

export function isRegularTime(
  teacher: Teacher,
  date: string,
  time: string,
  duration: number,
): boolean {
  if (!isScheduleDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    return false;
  if (teacher.availabilityFrom && date < teacher.availabilityFrom) return false;
  const day = new Date(`${date}T12:00:00+08:00`).getUTCDay();
  const start = minuteOf(time);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const slots = teacher.availability
    .filter((slot) => slot.day === day)
    .sort((a, b) => a.start.localeCompare(b.start));
  let covered = start;
  for (const slot of slots) {
    if (minuteOf(slot.start) > covered) break;
    if (minuteOf(slot.end) > covered) covered = minuteOf(slot.end);
    if (covered >= start + duration) return true;
  }
  return false;
}

export function availableMinutesOnDate(
  teacher: Teacher,
  date: string,
  afterMinute = 0,
): number {
  if (
    !isScheduleDate(date) ||
    (teacher.availabilityFrom && date < teacher.availabilityFrom)
  )
    return 0;
  const day = new Date(`${date}T12:00:00+08:00`).getUTCDay();
  return teacher.availability
    .filter((slot) => slot.day === day)
    .reduce(
      (total, slot) =>
        total +
        Math.max(
          0,
          minuteOf(slot.end) - Math.max(minuteOf(slot.start), afterMinute),
        ),
      0,
    );
}

export function availabilitySummary(teacher: Teacher): string {
  if (!teacher.availability.length) return "可用时间待完善";
  const groups = new Map<string, string[]>();
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const ranges = teacher.availability
      .filter((slot) => slot.day === day)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((slot) => `${slot.start}–${slot.end}`)
      .join("、");
    if (!ranges) continue;
    groups.set(ranges, [...(groups.get(ranges) ?? []), dayNames[day]]);
  }
  return [...groups]
    .map(([ranges, days]) => `${days.join("、")} ${ranges}`)
    .join("；");
}

export function availabilityError(teacher: Teacher): string {
  if (teacher.availabilityFrom && !isScheduleDate(teacher.availabilityFrom))
    return "请选择有效的生效日期";
  for (const slot of teacher.availability) {
    if (slot.start >= slot.end)
      return `${dayNames[slot.day]}的结束时间需要晚于开始时间`;
    if (
      teacher.availability.some(
        (other) =>
          other !== slot &&
          other.day === slot.day &&
          slot.start < other.end &&
          other.start < slot.end,
      )
    )
      return `${dayNames[slot.day]}的可用时间有重叠，请调整后保存`;
  }
  return "";
}
