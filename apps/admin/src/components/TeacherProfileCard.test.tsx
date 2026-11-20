// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {defaultAvatarSource} from "@crazytalk/ui";
import {renderTeacherCard} from "./TeacherProfileCard";
const originalContext=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,"getContext")!;
const originalFonts=Object.getOwnPropertyDescriptor(document,"fonts");
afterEach(()=>{Object.defineProperty(HTMLCanvasElement.prototype,"getContext",originalContext);vi.restoreAllMocks();vi.unstubAllGlobals();if(originalFonts)Object.defineProperty(document,"fonts",originalFonts);else Reflect.deleteProperty(document,"fonts");});
it.each([undefined,"/avatars/avatar-2.webp","/uploads/teacher-avatar.webp"])("预览和导出使用老师头像 %s，未设置时与默认头像一致",async(photo)=>{
 Object.defineProperty(document,"fonts",{configurable:true,value:{load:async()=>[],ready:Promise.resolve()}});
 vi.stubGlobal("Image",class {src="";width=200;height=200;crossOrigin="";decode(){return Promise.resolve();}});
 const drawImage=vi.fn();
 const ctx={save:vi.fn(),restore:vi.fn(),beginPath:vi.fn(),roundRect:vi.fn(),clip:vi.fn(),fill:vi.fn(),fillRect:vi.fn(),arc:vi.fn(),stroke:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),scale:vi.fn(),fillText:vi.fn(),drawImage,measureText:(text:string)=>({width:text.length*8})};
 Object.defineProperty(HTMLCanvasElement.prototype,"getContext",{configurable:true,value:vi.fn(()=>ctx)});
 vi.spyOn(HTMLCanvasElement.prototype,"toDataURL").mockReturnValue("data:image/png;base64,card");
 const fields={name:"老师验收d52394",specialties:"少儿",certificates:"",education:"",experience:"",message:""};
 expect(await renderTeacherCard(fields,photo)).toBe("data:image/png;base64,card");
 expect(drawImage.mock.calls[1][0].src).toBe(photo || defaultAvatarSource(fields.name));
 expect(ctx.fillText.mock.calls.some(([text])=>text==="老")).toBe(false);
});
