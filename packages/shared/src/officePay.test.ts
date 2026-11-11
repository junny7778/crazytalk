import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { officePay } from "./officePay";
it("NP 缺席按半薪，OP 无预订也有双底薪，冻结后明细不漂移", () => {
  let d = createSeed();
  const l = {
    ...d.lessons[0],
    duration: 25,
    date: "2026-11-05",
    status: "缺席" as const,
    attendance: "学员缺席" as const,
  };
  d.lessons = [l];
  const terms = {
    teacherId: l.teacherId,
    month: "2026-11",
    so: "办公室",
    mode: "NP" as const,
    hourly: 90,
    soHourly: 30,
    paidMinutes: 30,
    praise: null,
    complaint: null,
    fullAttendance: null,
    renewal: null,
    confirmed: [],
    teacherAdjustment: 0,
    soAdjustment: 0,
    adjustmentNote: "",
  };
  expect(officePay(d, terms)[0]).toMatchObject({ teacher: 22.5, office: 7.5 });
  const op = {
    ...terms,
    mode: "OP" as const,
    confirmed: [{ date: "2026-11-10", time: "09:00", minutes: 60 }],
  };
  d = transition(d, { type: "pay.terms", terms: op }).data;
  d = transition(d, {
    type: "pay.freeze",
    teacherId: l.teacherId,
    month: op.month,
  }).data;
  expect(officePay(d, { ...op, hourly: 100 })[0]).toMatchObject({
    teacher: 90,
    office: 30,
  });
});
