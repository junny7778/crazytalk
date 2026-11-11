import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition, isAvailable } from "./domain";
import { recommendedTags } from "./teacherMatch";
it("慢热学员匹配鼓励型老师，锁定后其他学员不能占位", () => {
  let d = createSeed();
  const [a, b] = d.students;
  const t = d.teachers[0];
  expect(
    recommendedTags({
      ...a,
      age: 7,
      level: "L1",
      personality: "慢热",
      interests: "汽车",
    }),
  ).toEqual(expect.arrayContaining(["擅长鼓励", "会引导", "会简笔画"]));
  t.trained = true;
  t.availability = [{ day: 1, start: "08:00", end: "22:00" }];
  t.availabilityFrom = "";
  const slot = { teacherId: t.id, date: "2026-11-23", time: "10:00" };
  d = transition(d, {
    type: "slot.lock",
    studentId: a.id,
    duration: 25,
    slots: [slot],
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  }).data;
  expect(isAvailable(d, t.id, slot.date, slot.time, 25, b.id)).toContain(
    "时段已锁定",
  );
  d = transition(d, { type: "slot.release", studentId: a.id }).data;
  expect(isAvailable(d, t.id, slot.date, slot.time, 25, b.id)).not.toContain(
    "时段已锁定",
  );
});
