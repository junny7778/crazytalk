import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { studentInScope } from "./organization";

it("同名项目分渠道授权，月目标可修改，停用父渠道前先处理项目", () => {
  const seed = createSeed();
  const entry = {
    id: "p-a",
    name: "新项目",
    type: "项目" as const,
    parentId: "ch0",
    monthlyLessons: 12,
    enabled: true,
    detail: "",
  };
  const save = (data: typeof seed, next: typeof entry) =>
    transition(data, { type: "catalog.save", entry: next }).data;
  const data = save(save(seed, entry), {
    ...entry,
    id: "p-b",
    parentId: "ch1",
  });
  const student = { ...data.students[0], project: "新项目", channel: "许老师" };
  expect(studentInScope(data, student, "project:p-a")).toBe(true);
  expect(studentInScope(data, student, "project:p-b")).toBe(false);
  expect(
    save(data, { ...entry, monthlyLessons: 8 }).catalog.find(
      (c) => c.id === entry.id,
    )?.monthlyLessons,
  ).toBe(8);
  expect(() => save(data, { ...entry, monthlyLessons: 0 })).toThrow("正整数");
  expect(() => save(data, { ...entry, parentId: "missing" })).toThrow(
    "所属渠道",
  );
  expect(() =>
    transition(data, {
      type: "catalog.save",
      entry: { ...data.catalog.find((c) => c.id === "ch0")!, enabled: false },
    }),
  ).toThrow("启用项目");
});

it("组队按实际账号归属限制，未分配组队的人员不能看到其他未分配成员", () => {
  const data = createSeed();
  const [a, b] = data.accounts.filter((a) => a.roleId === "ops");
  a.group = b.group = "第一组";
  a.team = "A队";
  b.team = "B队";
  const student = { ...data.students[0], owner: b.name };
  expect(studentInScope(data, student, "本组", a)).toBe(false);
  expect(studentInScope(data, student, "本队", a)).toBe(false);
  a.team = b.team;
  expect(studentInScope(data, student, "本组", a)).toBe(true);
  a.group = "二组";
  expect(studentInScope(data, student, "本队", a)).toBe(true);
  expect(studentInScope(data, student, "本组", a)).toBe(false);
  expect(studentInScope(data, student, "本人负责", b)).toBe(true);
  expect(studentInScope(data, student, "本组", { ...a, group: "" })).toBe(
    false,
  );
});
