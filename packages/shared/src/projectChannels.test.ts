import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { migrateProjectChannels, studentInScope } from "./organization";
import { projectMetrics } from "./projectMetrics";
import type { CatalogEntry } from "./model";

it("多渠道合作、解除合作保留学员和月目标，旧权限不扩大", () => {
  let data = createSeed();
  const project: CatalogEntry = { id: "many", type: "项目", name: "合作测试", parentId: "ch0", enabled: true, detail: "", monthlyLessons: 12 };
  data.catalog.push(project);
  expect(migrateProjectChannels(data)).toBe(true);
  expect(migrateProjectChannels(data)).toBe(false);
  const save = (patch: Partial<CatalogEntry>) => {
    data = transition(data, { type: "catalog.save", entry: { ...data.catalog.find(c => c.id === "many")!, ...patch } }).data;
  };
  save({ channelIds: ["ch0", "ch1"] });
  const before = data.students[0];
  data = transition(data, {type: "student.details.update", id: before.id, expected: {channel: before.channel, project: before.project}, patch: {channel: "ToC", project: "合作测试"}}).data;
  const learner = data.students[0];
  learner.monthlyRecords = [];
  expect(studentInScope(data, learner, "project:many")).toBe(false);
  expect(studentInScope(data, learner, "project-all:many")).toBe(false);
  expect(projectMetrics(data, learner, "2099-01").target).toBe(12);
  save({ channelIds: ["ch0"] });
  expect(data.students[0].channel).toBe("ToC");
  expect(projectMetrics(data, data.students[0], "2099-01").target).toBe(12);
  expect(studentInScope(data, data.students[0], "project-all:many")).toBe(false);
  save({ name: "合作新名称" });
  expect(data.students[0].project).toBe("合作新名称");
  const other = data.students[1];
  expect(() => transition(data, { type: "student.details.update", id: other.id, expected: {channel: other.channel, project: other.project}, patch: { channel: "ToC", project: "合作新名称" } })).toThrow("合作关系");
});

it("独立项目可保存，合作关系不得引入同渠道同名歧义", () => {
  let data = createSeed();
  const project: CatalogEntry = {id: "standalone", type: "项目", name: "独立", detail: "", enabled: true, monthlyLessons: 8, channelIds: []};
  data = transition(data, {type: "catalog.save", entry: project}).data;
  data = transition(data, {type: "catalog.save", entry: {...project, channelIds:["ch0", "ch1"]}}).data;
  expect(() => transition(data, {type:"catalog.save", entry:{...project,id:"duplicate",channelIds:["ch1"]}})).toThrow("同名");
  data = transition(data, {type:"catalog.save",entry:{...data.catalog.find(c=>c.id==="ch0")!,enabled:false}}).data;
  expect(data.catalog.find(c=>c.id==="standalone")?.enabled).toBe(true);
});

it("渠道新建与二次编辑可配对多个项目，项目端修改立即反映在渠道关系", () => {
  let data = createSeed();
  const channel: CatalogEntry = {id:"bidirectional", type:"渠道",name:"双向渠道",detail:"",enabled:true};
  data = transition(data, {type:"catalog.save",entry:channel,projectIds:["pr0","pr1"]}).data;
  expect(data.catalog.filter(p=>p.channelIds?.includes(channel.id)).map(p=>p.id)).toEqual(["pr0","pr1"]);
  const originalChannels = data.catalog.find(p=>p.id==="pr1")!.channelIds!;
  data = transition(data,{type:"catalog.save",entry:channel,projectIds:["pr0","pr2"]}).data;
  expect(data.catalog.filter(p=>p.channelIds?.includes(channel.id)).map(p=>p.id)).toEqual(["pr0","pr2"]);
  expect(data.catalog.find(p=>p.id==="pr1")!.historicalChannelIds).toContain(channel.id);
  expect(data.catalog.find(p=>p.id==="pr1")!.channelIds).toEqual(originalChannels.filter(id=>id!==channel.id));
  const project = data.catalog.find(p=>p.id==="pr0")!;
  data = transition(data,{type:"catalog.save",entry:{...project,monthlyLessons:8,channelIds:project.channelIds!.filter(id=>id!==channel.id)}}).data;
  expect(data.catalog.filter(p=>p.channelIds?.includes(channel.id)).map(p=>p.id)).toEqual(["pr2"]);
});
