import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { assignSampleTeams, organizationView, studentInScope } from "./organization";

it("同名项目分渠道授权，月目标可修改，停用渠道不影响项目", () => {
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
  expect(studentInScope(data, student, "project:p-a")).toBe(false);
  expect(studentInScope(data, student, "project:p-b")).toBe(false);
  expect(
    save(data, { ...entry, monthlyLessons: 8 }).catalog.find(
      (c) => c.id === entry.id,
    )?.monthlyLessons,
  ).toBe(8);
  expect(() => save(data, { ...entry, monthlyLessons: 0 })).toThrow("正整数");
  expect(() => save(data, { ...entry, parentId: "missing" })).toThrow(
    "合作渠道",
  );
  expect(() =>
    transition(data, {
      type: "catalog.save",
      entry: { ...data.catalog.find((c) => c.id === "ch0")!, enabled: false },
    }),
  ).not.toThrow();
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
  expect(studentInScope(data, student, "本人负责", b)).toBe(false);
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

it("普通账号旧范围不再授权，管理员仍可访问全部，项目只筛选授权结果", () => {
 const data=createSeed(), account=data.accounts.find(a=>a.id==="u2")!;
 const student={...data.students[0], owner:account.name, ownerAccountId:account.id, project:"K12"};
 for(const scope of ["本人负责", "K12", "project:pr0", "project-all:pr0"]){
   expect(studentInScope(data,student,scope,account)).toBe(false);
   expect(()=>transition(data,{type:"account.save",account:{...account,scope}})).toThrow("数据范围");
 }
 expect(studentInScope(data,student,"全部",data.accounts[0])).toBe(true);
 expect(studentInScope(data,{...student,owner:"Roma",ownerAccountId:"u3"},"全部",account)).toBe(true);
 expect(()=>transition(data,{type:"account.save",account:{...account,scope:"全部"}})).not.toThrow();
 expect(()=>transition(data,{type:"account.save",account:{...account,team:"",group:""}})).toThrow("分配");
 const rows=[student,{...student,project:"乐说"},{...student,owner:"Roma",ownerAccountId:"u3"}];
 const authorized=rows.filter(s=>studentInScope(data,s,"本组",account));
 expect(authorized).toHaveLength(2);
 expect(authorized.filter(s=>s.project==="K12")).toEqual([student]);
 expect(()=>transition(data,{type:"account.save",account:{...account,scope:"本队"}})).not.toThrow();
});

it("导入名册按名册队组隔离，Demo旧账号范围刷新后更新", () => {
 const data=createSeed(), account=data.accounts.find(a=>a.id==="u2")!;
 const student={...data.students[0],owner:account.name,ownerAccountId:undefined,roster:{key:"scope-test",row:1,fields:{"教务":account.name,"队别":"B队","组别":account.group!}}};
 expect(studentInScope(data,student,"本组",account)).toBe(false);
 student.roster.fields["队别"]=account.team!;
 expect(studentInScope(data,student,"本组",account)).toBe(true);
 data.importedBatches=["sample-teams-v1"];
 account.scope="project-all:pr0";
 expect(assignSampleTeams(data)).toBe(true);
 expect(account.scope).toBe("本组");
 expect(data.accounts.filter(a=>a.roleId!=="admin").every(a=>a.team && a.group && a.scope==="本组")).toBe(true);
 expect(assignSampleTeams(data)).toBe(false);
});
