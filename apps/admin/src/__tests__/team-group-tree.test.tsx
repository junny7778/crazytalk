// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import TeamGroupTree from "../pages/operations/TeamGroupTree";
import type { CatalogEntry } from "@crazytalk/shared";
afterEach(cleanup);
const catalog: CatalogEntry[] = [
  {id:"a",type:"队伍",name:"A队",detail:"",enabled:true},
  {id:"b",type:"队伍",name:"B队",detail:"",enabled:true},
  {id:"g",type:"组别",parentId:"a",name:"一组",detail:"",enabled:true},
];
it("队伍下显示组别分支，支持收起展开和新增编辑", () => {
  const onAdd = vi.fn(), onEdit = vi.fn();
  render(<TeamGroupTree catalog={catalog} query="" onAdd={onAdd} onEdit={onEdit}/>);
  const team = screen.getByRole("treeitem", {name:"A队"});
  expect(within(team).getByRole("treeitem", {name:"一组"}).getAttribute("aria-level")).toBe("2");
  fireEvent.click(screen.getByRole("button", {name:"收起A队"}));
  expect(screen.queryByRole("treeitem", {name:"一组"})).toBeNull();
  fireEvent.keyDown(team, {key:"ArrowRight"});
  fireEvent.click(screen.getByRole("button", {name:"编辑组别 一组"}));
  expect(onEdit).toHaveBeenCalledWith(catalog[2]);
  fireEvent.click(screen.getByRole("button", {name:"添加A队的组别"}));
  expect(onAdd).toHaveBeenCalledWith(catalog[0]);
  fireEvent.click(screen.getByRole("button", {name:"全部收起"}));
  expect(screen.queryByRole("treeitem", {name:"一组"})).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"全部展开"}));
  expect(screen.getByRole("treeitem", {name:"一组"})).toBeTruthy();
});
it("搜索组别展示所属队伍并展开匹配路径", () => {
  render(<TeamGroupTree catalog={catalog} query="一组" onAdd={()=>{}} onEdit={()=>{}}/>);
  expect(screen.getByRole("treeitem", {name:"A队"})).toBeTruthy();
  expect(screen.getByRole("treeitem", {name:"一组"})).toBeTruthy();
  expect(screen.queryByRole("treeitem", {name:"B队"})).toBeNull();
});
