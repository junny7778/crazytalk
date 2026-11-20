// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {businessRequest,waitForBusinessOperation} from "@crazytalk/shared/react";
import ClassInOperationFeedback from "./ClassInOperationFeedback";
vi.mock("@crazytalk/shared/react",()=>({businessMode:()=>true,businessAccountId:()=>"u1",useBusiness:()=>({acceptState:vi.fn()}),businessRequest:vi.fn(),waitForBusinessOperation:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ClassInOperationFeedback studentId="student"/></QueryClientProvider>);}
const operation={id:"same-operation",type:"lesson.changeTeacher",studentIds:["student"],status:"processing",message:"正在处理"};
it("重新进入页面读取原操作，仅显示统一 loading，不重新提交",async()=>{
  vi.mocked(businessRequest).mockResolvedValue([operation]);
  const first=mount();
  expect(await screen.findByText("正在换老师")).toBeTruthy();
  expect(screen.getByRole("status").querySelector(".spin")).toBeTruthy();
  first.unmount();mount();
  expect(await screen.findByText("正在换老师")).toBeTruthy();
  expect(vi.mocked(businessRequest).mock.calls.every(c=>!c[1]||c[1]==="GET")).toBe(true);
  expect(screen.queryByRole("button",{name:/重试/})).toBeNull();
});
it("失败后在原业务页面继续同一操作，不重复提交换师命令",async()=>{
  vi.mocked(businessRequest).mockImplementation(async(_path,method)=>method==="POST"?{operationId:operation.id}:[{...operation,status:"failed",retryable:true,message:"原老师部分课程尚未取消"}]);
  vi.mocked(waitForBusinessOperation).mockRejectedValue(new Error("平台仍不可用"));
  mount();fireEvent.click(await screen.findByRole("button",{name:"继续换老师"}));
  await waitFor(()=>expect(businessRequest).toHaveBeenCalledWith("/commands/same-operation/continue","POST"));
  expect(await screen.findByText("平台仍不可用")).toBeTruthy();
  expect(waitForBusinessOperation).toHaveBeenCalledWith(operation.id,expect.any(Function));
  expect(vi.mocked(businessRequest).mock.calls.some(c=>c[0]==="/commands")).toBe(false);
});
