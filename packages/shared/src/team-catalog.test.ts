import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { migrateTeamCatalog } from "./organization";

it("队伍下新增组别，账号只能选择已有归属，改名同步账号", () => {
  let data = createSeed();
  const team = { id: "team-test", type: "队伍" as const, name: "新队伍", detail: "", enabled: true };
  const group = { ...team, id: "group-test", type: "组别" as const, parentId: team.id, name: "新组别" };
  for (const entry of [team, group]) data = transition(data, { type: "catalog.save", entry }).data;
  const account = { ...data.accounts[1], team: team.name, group: group.name };
  data = transition(data, { type: "account.save", account }).data;
  expect(() => transition(data, { type: "account.save", account: { ...account, group: "不存在" } })).toThrow("请选择基础资料");
  data = transition(data, { type: "catalog.save", entry: { ...group, name: "改名组别" } }).data;
  expect(data.accounts.find(a => a.id === account.id)?.group).toBe("改名组别");
  data = transition(data, { type: "catalog.save", entry: { ...team, enabled: false } }).data;
  expect(() => transition(data, { type: "account.save", account: { ...account, id: "new-account" } })).toThrow("请选择基础资料");
  expect(migrateTeamCatalog(data)).toBe(false);
});
