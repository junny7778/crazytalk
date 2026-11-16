import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { assignSampleTeams, organizationView, studentInScope } from "./organization";

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

it("同名组按队分别统计学员、课节和反馈，教务调组后归属同步",()=>{
  const d=createSeed();
  const a=d.accounts.find(x=>x.name==="Rita")!, b=d.accounts.find(x=>x.name==="Roma")!;
  a.team="A队";b.team="B队";a.group=b.group="一组";
  const filter=new URLSearchParams({team:"A队",group:"一组"});
  const scoped=organizationView(d,filter),ids=new Set(scoped.students.map(s=>s.id));
  expect(scoped.students.length).toBeGreaterThan(0);
  expect(scoped.students.every(s=>s.owner===a.name)).toBe(true);
  expect(scoped.lessons).toEqual(d.lessons.filter(l=>ids.has(l.studentId)));
  expect(scoped.feedback).toEqual(d.feedback.filter(f=>ids.has(f.studentId)));
  a.group="二组";expect(organizationView(d,filter).students).toHaveLength(0);
});

it("已有本地学员随负责教务补齐队组，筛选命中且刷新后保留手动调整", () => {
  const data = createSeed();
  data.importedBatches = [];
  for (const a of data.accounts) { delete a.team; delete a.group; }
  expect(assignSampleTeams(data)).toBe(true);
  for (const [name,team,group] of [["Rita","A队","二组"],["Roma","B队","一组"]]) {
    const rows = organizationView(data,new URLSearchParams({team,group})).students;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(s=>s.owner===name)).toBe(true);
  }
  data.accounts.find(a=>a.name==="Rita")!.group="三组";
  expect(assignSampleTeams(data)).toBe(false);
  expect(organizationView(data,new URLSearchParams({team:"A队",group:"三组"})).students.length).toBeGreaterThan(0);
});
