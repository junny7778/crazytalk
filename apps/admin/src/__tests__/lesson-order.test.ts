import { describe, it, expect } from "vitest";
import { demoRepository } from "../../../../packages/shared/src/repository";
import { compareLessonRecords, isOverdueLesson } from "../lib/lessonOrder";
import type { Lesson } from "@crazytalk/shared";
const base = demoRepository.read().lessons[0];
const now = Date.parse("2026-11-05T20:00:00+08:00");
function lesson(
  id: string,
  date: string,
  time: string,
  status: Lesson["status"],
): Lesson {
  return { ...base, id, date, time, status, duration: 25 };
}
describe("运营上课记录排序", () => {
  it("已发生倒序，未来未开始正序，不按待确认强制置顶", () => {
    const records = [
      lesson("future-later", "2026-11-07", "20:00", "未开始"),
      lesson("old-pending", "2026-11-03", "19:00", "待确认"),
      lesson("overdue", "2026-11-05", "19:30", "未开始"),
      lesson("completed", "2026-11-04", "20:00", "已完成"),
      lesson("future-near", "2026-11-06", "19:00", "未开始"),
    ];
    expect(
      records.sort((a, b) => compareLessonRecords(a, b, now)).map((l) => l.id),
    ).toEqual([
      "overdue",
      "completed",
      "old-pending",
      "future-near",
      "future-later",
    ]);
  });
  it("北京时间结束时刻为边界，跨日时长正确处理", () => {
    const l = lesson("boundary", "2026-11-05", "23:50", "未开始");
    const end = Date.parse("2026-11-06T00:15:00+08:00");
    expect(isOverdueLesson(l, end - 1)).toBe(false);
    expect(isOverdueLesson(l, end)).toBe(true);
    expect(isOverdueLesson({ ...l, status: "已完成" }, end)).toBe(false);
  });
  it("同日未来课程最近的在前，排序不修改课程状态", () => {
    const early = lesson("early", "2026-11-05", "20:30", "未开始");
    const late = lesson("late", "2026-11-05", "21:00", "未开始");
    expect(compareLessonRecords(early, late, now)).toBeLessThan(0);
    expect(early.status).toBe("未开始");
  });
});
