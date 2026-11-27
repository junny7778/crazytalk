import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { canAutoSettleLesson } from "./autoLessonSettlement";
it("新课等待结束页，正常提交计一次课时；学员缺席生成站内信", () => {
  let d = createSeed();
  const l = d.lessons.find(
    (l) => l.status === "待确认" && l.attendance === "正常",
  )!;
  l.requiresScreenshot = true;
  l.confirmedUnits = 1;
  expect(canAutoSettleLesson(l, Date.now())).toBe(false);
  const report = {
    lessonId: l.id,
    studentId: l.studentId,
    teacherId: l.teacherId,
    date: l.date,
    material: "Book",
    from: "",
    to: "截图",
    comment: "",
    rating: 0,
    suggestedLevel: "",
  };
  expect(() => transition(d, { type: "report.save", report })).toThrow("截图");
  const next = transition(d, {
    type: "report.save",
    report: { ...report, screenshot: "data:image/png;base64,YQ==" },
  }).data;
  expect(next.lessons.find((x) => x.id === l.id)?.deducted).toBe(true);
  d = transition(d, {
    type: "lesson.incident",
    id: l.id,
    reason: "学员缺席",
    note: "教务核对",
  }).data;
  expect(d.lessons.find((x) => x.id === l.id)?.absenceNotice).toBe("已送达");
});

it("未到堂先通知，后到堂保留提醒；最终老师缺席只退一次", () => {
  let data = createSeed();
  const l = data.lessons.find(row => row.deducted && row.confirmedUnits && data.students.some(s => s.id === row.studentId))!;
  const update = (person: "老师" | "学员", result: "到堂" | "未到堂" | "缺席", at: string) => {
    data = transition(data, {type:"lesson.attendance", id:l.id, person, result, at}).data;
    return data.lessons.find(row => row.id === l.id)!;
  };
  const start = "2026-11-01T10:00:00+08:00";
  expect(update("学员","未到堂",start).attendanceMessages?.学员).toBe(start);
  expect(update("学员","到堂","2026-11-01T10:02:00+08:00").attendanceMessages?.学员).toBe(start);
  const before = data.credits.length;
  expect(update("老师","缺席","2026-11-01T10:25:00+08:00").deducted).toBe(false);
  update("老师","缺席","2026-11-01T10:26:00+08:00");
  expect(data.credits.length).toBe(before+1);
  expect(data.credits[0]).toMatchObject({lessonId:l.id,type:"扣课退回",units:l.confirmedUnits});
});
