// @vitest-environment jsdom
import {afterEach,it,expect,vi} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
import {businessRequest} from "@crazytalk/shared/react";
import {ToastProvider} from "@crazytalk/ui";
import ClassInLinkForm from "./ClassInLinkForm";
vi.mock("@crazytalk/shared/react",()=>({businessMode:()=>true,businessRequest:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function submit(){fireEvent.click(screen.getByRole("button"));}
it.each([
 ["teacher",true,"关联成功，老师已加入 ClassIn 机构"],
 ["student",true,"关联成功，学员已加入 ClassIn 机构"],
 ["teacher",false,"关联成功"],["student",false,"关联成功"],
] as const)("%s added=%s 保存完成后才显示对应提示",async(role,addedToInstitution,message)=>{
 vi.mocked(businessRequest).mockResolvedValue({uid:"789",addedToInstitution});
 let finish=()=>{};const save=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 render(<ToastProvider><ClassInLinkForm targetId="target" name="Alice" phone="13800000000" role={role} onSave={save}/></ToastProvider>);
 expect(screen.getByLabelText("姓名")).toHaveProperty("value", "Alice");expect(screen.getByLabelText("姓名")).toHaveProperty("disabled", true);expect(screen.queryByLabelText("角色")).toBeNull();
 expect(screen.queryByLabelText("ClassIn UID")).toBeNull();expect(screen.queryByText("通过 UID 关联")).toBeNull();expect(screen.queryByLabelText("新账号初始密码")).toBeNull();
 submit();if(role === "student") {await screen.findByText("已取得 UID：789");submit();}
 await waitFor(()=>expect(save).toHaveBeenCalledWith("789","13800000000"));expect(screen.queryByText(message)).toBeNull();
 const loading=screen.getByRole("button",{name:"正在关联"});expect(loading.hasAttribute("disabled")).toBe(true);expect(loading.querySelector(".spin")).toBeTruthy();submit();expect(save).toHaveBeenCalledTimes(1);
 finish();await screen.findByText(message);
});
it("保存失败后保留新增机构结果，重试不重复调用接口",async()=>{
 vi.mocked(businessRequest).mockResolvedValue({uid:"789",addedToInstitution:true});
 const save=vi.fn().mockRejectedValueOnce(new Error("保存失败")).mockResolvedValue(undefined);
 render(<ToastProvider><ClassInLinkForm targetId="target" name="Alice" phone="13800000000" role="teacher" onSave={save}/></ToastProvider>);
 submit();await screen.findByRole("alert");expect(screen.queryByText("关联成功，老师已加入 ClassIn 机构")).toBeNull();
 fireEvent.click(screen.getByText("确认关联"));await screen.findByText("关联成功，老师已加入 ClassIn 机构");
 expect(save).toHaveBeenCalledTimes(2);expect(businessRequest).toHaveBeenCalledTimes(1);
});
it("更换UID需确认后才保存",async()=>{
 vi.mocked(businessRequest).mockResolvedValue({uid:"456",addedToInstitution:false});
 const save=vi.fn().mockResolvedValue(undefined);render(<ClassInLinkForm targetId="target" name="Alice" phone="13800000000" uid="123" role="teacher" onSave={save}/>);
 submit();await screen.findByRole("alert");expect(save).not.toHaveBeenCalled();expect(screen.getByText("确认关联").hasAttribute("disabled")).toBe(true);
 fireEvent.click(screen.getByLabelText(/确认更换原 UID/));fireEvent.click(screen.getByText("确认关联"));
 await waitFor(()=>expect(save).toHaveBeenCalledWith("456","13800000000"));expect(businessRequest).toHaveBeenCalledTimes(1);
});
it("未注册时显示提示且不保存关联",async()=>{
 vi.mocked(businessRequest).mockRejectedValue(new Error("该账号尚未注册 ClassIn，请先注册后再关联"));
 const save=vi.fn();render(<ClassInLinkForm targetId="target" name="Alice" phone="13800000000" role="teacher" onSave={save}/>);
 submit();expect((await screen.findByRole("alert")).textContent).toContain("尚未注册");expect(save).not.toHaveBeenCalled();
 expect(vi.mocked(businessRequest).mock.calls[0][2]).not.toHaveProperty("password");
});

it("账号格式正确即可提交，无需勾选",()=>{
 render(<ClassInLinkForm targetId="target" name="Alice" phone="" role="student" onSave={vi.fn()}/>);
 expect(screen.queryByRole("checkbox")).toBeNull();
 expect(screen.getByText("请填写已注册的 ClassIn 手机号或邮箱，并核对账号是否正确。关联成功后，该账号将加入本机构。")).toBeTruthy();
 const button=screen.getByText("核实账号");
 expect(button.hasAttribute("disabled")).toBe(true);
 fireEvent.change(screen.getByLabelText("ClassIn 账号"),{target:{value:"wrong"}});
 expect(button.hasAttribute("disabled")).toBe(true);
 fireEvent.change(screen.getByLabelText("ClassIn 账号"),{target:{value:"alice@example.com"}});
 expect(button.hasAttribute("disabled")).toBe(false);
});
