import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { feedbackPayItems } from "./feedbackPay";
it("星级回访留存原文，客服结果不触发计薪，TM 好评按学员去重", () => {
  let d = createSeed();
  d = transition(d, {
    type: "service.add",
    studentId: d.students[0].id,
    content: "家长希望老师放慢语速",
    stars: 3,
    stage: "首月",
  }).data;
  expect(d.events[0].visit?.text).toBe("家长希望老师放慢语速");
  const f = {
    ...d.feedback[0],
    rating: "好评" as const,
    customerResult: "处理成功",
    tmDate: "2026-11-01",
    tmResult: "",
  };
  d.feedback = [f];
  expect(feedbackPayItems(d, f.teacherId, "2026-11")).toHaveLength(0);
  f.tmResult = "处理成功";
  d.feedback.push({ ...f, id: "other" });
  expect(feedbackPayItems(d, f.teacherId, "2026-11")).toHaveLength(1);
});
