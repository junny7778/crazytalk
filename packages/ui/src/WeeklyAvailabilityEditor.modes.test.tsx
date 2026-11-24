// @vitest-environment jsdom
import {useState} from "react";
import {afterEach,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {WeeklyAvailabilityEditor,type AvailabilityValue} from "./WeeklyAvailabilityEditor";
afterEach(cleanup);
function Form({initial,disabled=false,language="zh"}:{initial:AvailabilityValue;disabled?:boolean;language?:"zh"|"en"}) {
 const [value,setValue]=useState(initial);
 return <><WeeklyAvailabilityEditor value={value} onChange={setValue} disabled={disabled} language={language}/><output aria-label="saved value">{JSON.stringify(value)}</output></>;
}
const initial:AvailabilityValue={availability:[{day:1,start:"10:15",end:"11:10"},{day:2,start:"06:00",end:"08:00"},{day:3,start:"22:10",end:"23:10"},{day:4,start:"17:00",end:"23:00"}],availabilityFrom:"2026-11-20",availabilityNote:"unchanged"};
it("switches mutually exclusive views without rounding or losing exact and off-grid times",()=>{
 render(<Form initial={initial}/>);
 expect(screen.queryByLabelText("开始使用日期（选填）")).toBeNull();
 expect(screen.getByRole("button",{name:"周历勾选"}).getAttribute("aria-pressed")).toBe("true");
 fireEvent.click(screen.getByRole("button",{name:"周历勾选"}));
 expect(screen.queryByRole("group",{name:"每周授课日"})).toBeNull();
 expect(screen.getAllByRole("table")).toHaveLength(1);
 for(const name of ["周一 10:00","周一 10:30","周一 11:00","周二 06:00","周三 23:00","周四 17:00","周四 22:30"])
   expect(screen.getByRole("button",{name}).getAttribute("aria-pressed")).toBe("true");
 expect(screen.getByRole("button",{name:"周一 10:00"}).textContent).toBe("10:15–11:10");
 fireEvent.click(screen.getByRole("button",{name:"周一 11:30"}));
 const next=JSON.parse(screen.getByLabelText("saved value").textContent!);
 for(const range of initial.availability) expect(next.availability).toContainEqual(range);
 fireEvent.click(screen.getByRole("button",{name:"按星期填写"}));
 expect(screen.queryByRole("table")).toBeNull();
 expect(screen.getByLabelText("周一 开始时间 1").getAttribute("value")).toBe("10:15");
 expect(next.availabilityFrom).toBe(initial.availabilityFrom);
 expect(next.availabilityNote).toBe(initial.availabilityNote);
});
it("merges adjacent half-hour cells and permits removal without touching precise ranges",()=>{
 render(<Form initial={{...initial,availability:[]}}/>);
 fireEvent.click(screen.getByRole("button",{name:"周历勾选"}));
 fireEvent.click(screen.getByRole("button",{name:"周一 09:00"}));
 fireEvent.click(screen.getByRole("button",{name:"周一 09:30"}));
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!).availability).toEqual([{day:1,start:"09:00",end:"10:00"}]);
 fireEvent.click(screen.getByRole("button",{name:"周一 09:00"}));
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!).availability).toEqual([{day:1,start:"09:30",end:"10:00"}]);
});
it("English read-only allows changing display mode but no editing",()=>{
 render(<Form initial={initial} disabled language="en"/>);
 fireEvent.click(screen.getByRole("button",{name:"Weekly grid"}));
 expect(screen.getByRole("button",{name:"Mon 10:00"}).textContent).toBe("10:15–11:10");
 expect(screen.getAllByRole("button").filter(input=>input.classList.contains("weekly-slot-cell")).every(input=>input.hasAttribute("disabled"))).toBe(true);
 expect(screen.getByRole("textbox",{name:"Notes (optional)"}).hasAttribute("disabled")).toBe(true);
 fireEvent.click(screen.getByRole("button",{name:"By day"}));
 expect(screen.queryByRole("table")).toBeNull();
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!)).toEqual(initial);
});

it("drag selects and clears a rectangle across days",()=>{
 render(<Form initial={{...initial,availability:[]}}/>);
 const first=screen.getByRole("button",{name:"周一 09:00"});
 const last=screen.getByRole("button",{name:"周二 10:00"});
 fireEvent.mouseDown(first,{button:0});fireEvent.mouseEnter(last);fireEvent.mouseUp(window);
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!).availability).toEqual([{day:1,start:"09:00",end:"10:30"},{day:2,start:"09:00",end:"10:30"}]);
 fireEvent.mouseDown(first,{button:0});fireEvent.mouseEnter(last);fireEvent.mouseUp(window);
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!).availability).toEqual([]);
 fireEvent.mouseEnter(screen.getByRole("button",{name:"周三 10:00"}));
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!).availability).toEqual([]);
});


it("edits an exact time in its calendar cell without switching modes",()=>{
 render(<Form initial={initial}/>);
 fireEvent.click(screen.getByRole("button",{name:"周一 10:00"}));
 const editor=screen.getByRole("dialog",{name:"周一"});
 fireEvent.change(screen.getByLabelText("开始时间",{selector:"input"}),{target:{value:"10:35"}});
 expect(JSON.parse(screen.getByLabelText("saved value").textContent!).availability[0]).toEqual({day:1,start:"10:35",end:"11:10"});
 expect(editor.isConnected).toBe(true);
 expect(screen.getByRole("button",{name:"周一 10:30"}).getAttribute("aria-pressed")).toBe("true");
});

it("keeps saved exact times but uses half hours for new weekday ranges and copies", () => {
  render(<Form initial={initial}/>);
  fireEvent.click(screen.getByRole("button", {name: "按星期填写"}));
  fireEvent.click(screen.getByRole("button", {name: "周一 复制时段"}));
  fireEvent.click(screen.getByRole("checkbox", {name: "周五"}));
  expect(screen.getByRole("button", {name: "确认复制"}).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "取消"}));
  fireEvent.click(screen.getByRole("button", {name: "周一 添加时段"}));
  const ranges = JSON.parse(screen.getByLabelText("saved value").textContent!).availability;
  expect(ranges).toContainEqual(initial.availability[0]);
  expect(ranges).toContainEqual({day: 1, start: "11:30", end: "22:00"});
});
