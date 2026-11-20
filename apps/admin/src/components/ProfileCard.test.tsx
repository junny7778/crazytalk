// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import ProfileCard from "./ProfileCard";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("editing preview copies edited text without mutating source",async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);
 Object.defineProperty(navigator,"clipboard",{value:{writeText},configurable:true});
 const content={title:"Student profile",text:"Original"};
 render(<ProfileCard content={content} onClose={()=>{}}/>);
 expect(screen.queryByRole("button",{name:"导出图片"})).toBeNull();
 const editor = screen.getByRole("textbox", {name:"画像文案"}) as HTMLTextAreaElement;
 await waitFor(()=>expect(document.activeElement).toBe(editor));
 expect(editor.selectionStart).toBe(editor.value.length);
 fireEvent.change(screen.getByLabelText("画像文案"),{target:{value:"Reviewed profile"}});
 expect(editor.value).toBe("Reviewed profile");
 fireEvent.click(screen.getByRole("button",{name:"复制文案"}));
 await waitFor(()=>expect(writeText).toHaveBeenCalledWith("Student profile\n\nReviewed profile"));
 expect(content.text).toBe("Original");
});
