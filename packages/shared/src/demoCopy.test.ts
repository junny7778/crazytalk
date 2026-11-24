// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { matchingSurveyAnswers, matchingSurveyOptions } from "./studentSurvey";
import { createSeed } from "./seed";
import { DEMO_STORAGE_KEY, demoRepository } from "./repository";

afterEach(() => localStorage.clear());

it("刷新旧数据时更新系统文案并保留手填备注", () => {
  const data = createSeed();
  data.tasks[0].note = "示例待办，可在学生档案记录处理结果。";
  data.tasks.push({
    ...data.tasks[0],
    id: "manual-task",
    sourceType: "manual",
  });
  data.credits[0].note = "演示课包";

  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  const updated = demoRepository.refresh();

  expect(updated.tasks[0].note).toBe("请回访学习情况，并在学员档案记录处理结果。");
  expect(updated.tasks[1].note).toBe("示例待办，可在学生档案记录处理结果。");
  expect(updated.credits[0].note).toBe("期初课时");
  expect(demoRepository.refresh()).toEqual(updated);
});

it("Demo 恢复旧问卷的已提交状态，保留链接、原答和真正待填写的问卷", () => {
  const data = createSeed();
  const [legacy, pending] = data.students;
  const submittedAt = "2026-11-16T15:30:33.000Z";
  const answers = matchingSurveyAnswers.parse({
    chineseName: legacy.chineseName, gender: "男", level: matchingSurveyOptions.level[0],
    personality: matchingSurveyOptions.personality[0], membership: "1-2个月", listening: "200小时内",
  });
  Object.assign(legacy, {
    surveyOriginal: answers, surveyPreviousSubmittedAt: submittedAt, surveyToken: "legacy-token",
  });
  pending.surveyToken = "pending-token";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  const restored = demoRepository.refresh();
  expect(restored.students[0]).toMatchObject({
    surveySubmittedAt: submittedAt, surveyToken: "legacy-token", surveyOriginal: answers,
  });
  expect(restored.students[1].surveySubmittedAt).toBeUndefined();
  expect(demoRepository.refresh()).toEqual(restored);
});
