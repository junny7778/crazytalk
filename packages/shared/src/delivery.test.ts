import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { canAutoSettleLesson } from "./autoLessonSettlement";
it("新课等待结束页，正常提交计一次课时；学员缺席生成待发送通知", () => {
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
  expect(d.lessons.find((x) => x.id === l.id)?.absenceNotice).toBe("待发送");
});
