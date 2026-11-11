import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { projectMetrics } from "./projectMetrics";
it("缺席可消课，取消不计出勤；未配置目标与 0 分母分别保留", () => {
  const d = createSeed(),
    s = d.students[0];
  const base = {
    ...d.lessons[0],
    studentId: s.id,
    date: "2026-11-02",
    status: "已完成" as const,
    deducted: true,
    confirmedUnits: 1,
  };
  d.lessons = [
    { ...base, studentAttendance: ["正常"] },
    { ...base, id: "absent", studentAttendance: ["缺席"] },
    { ...base, id: "canceled", status: "已取消", deducted: false },
  ];
  expect(projectMetrics(d, s, "2026-11")).toMatchObject({
    target: null,
    used: 2,
    expected: 2,
    present: 1,
  });
  s.monthlyRecords.push({
    id: "confirmed",
    month: "2026-11",
    planned: 12,
    actual: null,
    note: "",
  });
  expect(projectMetrics(d, s, "2026-11").target).toBe(12);
});
