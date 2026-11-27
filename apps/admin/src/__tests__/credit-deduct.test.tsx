import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentCredits from "../components/StudentCredits";
afterEach(cleanup);
function Page() {
 const {data}=useDemo();
 return <StudentCredits student={data.students[0]} onAction={()=>{}} onOpen={()=>{}} />;
}
it("预览余额并提交一次手动扣减，列表显示新流水", async () => {
 localStorage.clear();demoRepository.reset();
 const data = demoRepository.read();
 const student = data.students[0];
 const order = data.orders!.find(order => order.studentIds.includes(student.id))!;
 order.balance = 5; student.balance=5; student.status="在读";
 data.lessons = [{
   ...data.lessons[0],
   orderId: order.id,
   studentId: student.id,
   duration: 25,
   status: "未开始",
   deducted: false,
 }];
 render(<QueryClientProvider client={new QueryClient()}><DemoProvider><ToastProvider><MemoryRouter><Page /></MemoryRouter></ToastProvider></DemoProvider></QueryClientProvider>);
 await testAct(async () => { fireEvent.click(screen.getByRole("button",{name:"扣减课时"})); });
 const dialog=within(screen.getByRole("dialog"));
 const submit=dialog.getByRole("button",{name:"确认扣减"});
 expect(submit.hasAttribute("disabled")).toBe(true);
 await testAct(async () => { fireEvent.change(dialog.getByLabelText("扣减原因"),{target:{value:"纠正重复充值"}}); });
 await testAct(async () => { fireEvent.change(dialog.getByLabelText("扣减课时"),{target:{value:"5"}}); });
 expect(dialog.getByText(/可排课余额.*4/)).toBeTruthy();
 expect(submit.hasAttribute("disabled")).toBe(true);
 const creditsBefore = data.credits.length;
 await testAct(async () => { fireEvent.click(submit); });
 expect(demoRepository.read().credits).toHaveLength(creditsBefore);
 await testAct(async () => { fireEvent.change(dialog.getByLabelText("扣减课时"),{target:{value:"4"}}); });
 expect(submit.hasAttribute("disabled")).toBe(false);
 await testAct(async () => { fireEvent.click(submit); });
 await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
 expect(demoRepository.read().students[0].balance).toBe(1);
 expect(demoRepository.read().credits).toHaveLength(creditsBefore + 1);
 expect(screen.getByRole("button",{name:"手动扣减"})).toBeTruthy();
});
