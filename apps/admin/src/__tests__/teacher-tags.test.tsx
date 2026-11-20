// @vitest-environment jsdom

import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import TeacherTagPicker,{TeacherTags} from "../components/TeacherTagPicker";
import {standardTeacherTags} from "@crazytalk/shared";
afterEach(cleanup);
it("从标签库选择ID，停用标签保留展示但不供新增选择",()=>{
 const change=vi.fn();
 const catalog=standardTeacherTags.map(t=>({...t,enabled:t.id!=="tt-35"}));
 render(<TeacherTagPicker catalog={catalog} values={["tt-35","旧标签"]} onChange={change}/>);
 expect(screen.getByText(/有亲和力（已停用）/)).toBeTruthy();
 expect(screen.getByText(/旧标签（待整理）/)).toBeTruthy();
 fireEvent.click(screen.getByRole("checkbox",{name:"会唱歌"}));
 expect(change).toHaveBeenLastCalledWith(["tt-35","旧标签","tt-48"]);
 fireEvent.click(screen.getByRole("button",{name:"移除标签 有亲和力"}));
 expect(change).toHaveBeenLastCalledWith(["旧标签"]);
});
it("标签改名后仍按ID展示并提供释义",()=>{
 const catalog=standardTeacherTags.map(t=>t.id==="tt-48"?{...t,name:"音乐互动"}:t);
 render(<TeacherTags catalog={catalog} values={["tt-48"]}/>);
 expect(screen.getByText("音乐互动").getAttribute("title")).toContain("歌曲");
});
it("标签选择仅显示名称，无释义提示，选中状态有勾选且显示数量",()=>{
 const change=vi.fn();
 const tag=standardTeacherTags.find(t=>t.id==="tt-48")!;
 const {container,rerender}=render(<TeacherTagPicker catalog={[tag]} values={[]} onChange={change}/>);
 expect(screen.getByText("已选 0 个标签")).toBeTruthy();
 expect(screen.queryByRole("textbox")).toBeNull();
 expect(screen.queryByText(tag.tagMeaning!)).toBeNull();
 expect(screen.queryByText(tag.tagAdvice!)).toBeNull();
 expect(container.querySelector("[title]")).toBeNull();
 fireEvent.click(screen.getByRole("checkbox",{name:"会唱歌"}));
 expect(change).toHaveBeenLastCalledWith(["tt-48"]);
 rerender(<TeacherTagPicker catalog={[tag]} values={["tt-48"]} onChange={change}/>);
 expect(screen.getByText("已选 1 个标签")).toBeTruthy();
 expect(screen.getByRole("checkbox",{name:"会唱歌"}).closest("label")?.classList.contains("is-selected")).toBe(true);
 expect(screen.getByText("✓")).toBeTruthy();
 expect(container.querySelector("[title]")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"移除标签 会唱歌"}));
 expect(change).toHaveBeenLastCalledWith([]);
});
it("悬停或键盘聚焦标签展示含义与具体表现，离开及Escape关闭",()=>{
 const tag={...standardTeacherTags[0],tagMeaning:"标准发音",tagExample:"表达清楚",tagAdvice:"不展示的匹配建议"};
 render(<TeacherTagPicker catalog={[tag]} values={[]} onChange={vi.fn()}/>);
 const checkbox=screen.getByRole("checkbox");
 const label=checkbox.closest("label")!;
 expect(screen.queryByRole("tooltip")).toBeNull();
 fireEvent.mouseEnter(label);
 const tooltip=screen.getByRole("tooltip");
 expect(tooltip.textContent).toContain("含义标准发音");
 expect(tooltip.textContent).toContain("具体表现表达清楚");
 expect(tooltip.textContent).not.toContain(tag.tagAdvice);
 expect(checkbox.getAttribute("aria-describedby")).toBe(tooltip.id);
 fireEvent.mouseLeave(label);
 expect(screen.queryByRole("tooltip")).toBeNull();
 fireEvent.focus(checkbox);
 expect(screen.getByRole("tooltip")).toBeTruthy();
 fireEvent.keyDown(window,{key:"Escape"});
 expect(screen.queryByRole("tooltip")).toBeNull();
});
