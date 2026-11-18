// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
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
