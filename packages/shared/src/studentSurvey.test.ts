import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
it("专属令牌回填本人，旧链接、重复提交不可覆盖资料", () => {
  let d = createSeed();
  const [a, b] = d.students;
  d = transition(d, { type: "survey.issue", id: a.id }).data;
  const old = d.students[0].surveyToken!;
  d = transition(d, { type: "survey.issue", id: a.id }).data;
  const cmd = {
    type: "survey.submit" as const,
    token: d.students[0].surveyToken!,
    answers: {
      age: 8,
      level: "L1",
      personality: "内向或慢热",
      interests: "汽车",
      experience: "无",
      material: "",
      times: "周四",
      needs: "",
    },
  };
  expect(() => transition(d, { ...cmd, token: old })).toThrow("失效");
  d = transition(d, cmd).data;
  expect(d.students[0].interests).toBe("汽车");
  expect(d.students[1]).toEqual(b);
  expect(() => transition(d, cmd)).toThrow("已提交");
});
