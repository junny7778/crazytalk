// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { demoRepository, DEMO_STORAGE_KEY } from "./repository";
import { restoreLessonSyncNotice } from "./restoreLessonSyncNotice";
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
});
it("仅恢复指定记录的提示，刷新不会反复恢复", () => {
  const data = structuredClone(demoRepository.read());
  const student = data.students.find((s) => s.name === "Nancy")!;
  const teacher = data.teachers.find((t) => t.name === "T. Carol")!;
  const lesson = data.lessons.find(
    (l) =>
      l.studentId === student.id &&
      l.date === "2026-10-27" &&
      l.time === "19:30",
  )!;
  expect(teacher).toBeTruthy();
  expect(lesson).toBeTruthy();
  lesson.teacherId = teacher.id;
  lesson.sync = "已同步";
  lesson.syncReason = "";
  const before = structuredClone(data);
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  const restored = demoRepository.refresh();
  const result = restored.lessons.find((l) => l.id === lesson.id)!;
  expect(result.sync).toBe("未同步");
  expect(result).toEqual({
    ...lesson,
    sync: "未同步",
    syncReason: "课程时间还未更新到 ClassIn，请重新更新。",
  });
  expect(restored.lessons.filter((l) => l.id !== lesson.id)).toEqual(
    before.lessons.filter((l) => l.id !== lesson.id),
  );
  demoRepository.execute({ type: "lesson.retry", id: lesson.id });
  expect(
    demoRepository.refresh().lessons.find((l) => l.id === lesson.id)?.sync,
  ).toBe("已同步");
});
it("没有匹配记录时不更改数据", () => {
  const data = structuredClone(demoRepository.read());
  data.lessons = [];
  expect(restoreLessonSyncNotice(data)).toBe(false);
});
