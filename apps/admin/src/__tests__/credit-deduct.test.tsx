// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
it("预览余额并提交一次手动扣减，列表显示新流水", () => {
 localStorage.clear();demoRepository.reset();
 const student=demoRepository.read().students[0];
 student.balance=5;student.balanceKnown=true;student.status="在读";
 render(<QueryClientProvider client={new QueryClient()}><DemoProvider><ToastProvider><MemoryRouter><Page /></MemoryRouter></ToastProvider></DemoProvider></QueryClientProvider>);
 fireEvent.click(screen.getByRole("button",{name:"扣减课时"}));
 const dialog=within(screen.getByRole("dialog"));
 const submit=dialog.getByRole("button",{name:"确认扣减"});
 expect(submit.hasAttribute("disabled")).toBe(true);
 fireEvent.change(dialog.getByLabelText("扣减课时"),{target:{value:"2"}});
 fireEvent.change(dialog.getByLabelText("扣减原因"),{target:{value:"纠正重复充值"}});
 expect(dialog.getByText("当前剩余 5 课时 → 扣减后 3 课时")).toBeTruthy();
 fireEvent.click(submit);
 expect(screen.queryByRole("dialog")).toBeNull();
 expect(demoRepository.read().students[0].balance).toBe(3);
 expect(screen.getByRole("button",{name:"手动扣减"})).toBeTruthy();
});
