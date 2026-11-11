import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
it("登记后通知负责教务，重复提交不会增加记录，原有取消参数不能改变上课安排", () => {
  const d = createSeed(),
    l = d.lessons.find((l) => l.status === "未开始")!;
  const cmd = {
    type: "teacher.leave" as const,
    teacherId: l.teacherId,
    start: l.date,
    end: l.date,
    reason: "请假",
    cancelLessons: true,
  };
  let after = transition(d, cmd).data;
  after = transition(after, cmd).data;
  expect(after.leaves).toHaveLength(1);
  expect(after.leaves[0].status).toBe("已登记");
  expect(after.lessons.find((item) => item.id === l.id)).toMatchObject({
    ...l,
    leaveFlag: true,
  });
  expect(after.tasks.some((t) => t.lessonIds?.includes(l.id))).toBe(true);
});
