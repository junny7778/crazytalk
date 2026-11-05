// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { createSeed, payrollBreakdown, transition } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Payroll from "../pages/operations/Payroll";
import { PayContent } from "../../../teacher/src/screens";
import zh from "../../../teacher/src/locales/zh";

beforeEach(() => { localStorage.clear(); demoRepository.reset(); });
afterEach(cleanup);

it("all payroll sources reconcile and confirmed -> paid remains frozen after external changes", () => {
  let data = createSeed();
  for (const p of data.payroll) {
    const b = payrollBreakdown(data,p.id);
    expect(b.base).toBeCloseTo(b.opening.amount + b.rows.reduce((s,r)=>s+r.amount,0), 2);
    expect(b.total).toBeCloseTo(b.base-b.deductions+b.adjustment,2);
    expect(b.units).toBeCloseTo(b.opening.units+b.rows.reduce((s,r)=>s+r.units,0),5);
  }
  const p = data.payroll.find(p=>p.status==="待确认")!;
  data.actions=[];
  data=transition(data,{type:"payroll.status",ids:[p.id],status:"已确认"}).data;
  const frozen=structuredClone(payrollBreakdown(data,p.id));
  data.teachers.find(t=>t.id===p.teacherId)!.rate=10000;
  data.lessons=[];
  data=transition(data,{type:"payroll.status",ids:[p.id],status:"已发放"}).data;
  expect(payrollBreakdown(data,p.id)).toEqual(frozen);
});

it("admin Erika empty detail explicitly identifies historical balance and reconciles total", async () => {
  render(<QueryClientProvider client={new QueryClient()}><DemoProvider><ToastProvider><MemoryRouter><Payroll /></MemoryRouter></ToastProvider></DemoProvider></QueryClientProvider>);
  fireEvent.click(await screen.findByText("T. Erika"));
  const dialog=screen.getByRole("dialog");
  expect(within(dialog).getByText("课酬来源")).toBeTruthy();
  expect(within(dialog).getByText(/暂无可追溯的计薪课程明细/)).toBeTruthy();
  expect(within(dialog).getByText(/演示期初课酬/)).toBeTruthy();
  expect(within(dialog).getByRole("heading",{name:/应发/}).textContent).toContain("29,250");
});

it("teacher missing payroll month renders unconfirmed state without throwing", () => {
  render(<PayContent pay={undefined} payroll={undefined} t={key=>zh[key]} findStudent={()=>undefined} onFeedback={()=>{}} />);
  expect(screen.getByText(zh.notConfirmed)).toBeTruthy();
});

it("teacher confirmed payroll uses snapshot amount despite different current rate", () => {
  const data=createSeed();
  const p=data.payroll.find(p=>p.status==="已确认")!;
  const pay=payrollBreakdown(data,p.id);
  render(<PayContent pay={pay} payroll={p} t={key=>zh[key]} findStudent={()=>undefined} onFeedback={()=>{}} />);
  fireEvent.click(screen.getByText(zh.payDetails));
  expect(screen.getByText(zh.noPayLessons)).toBeTruthy();
  expect(screen.getByText(zh.openingPay)).toBeTruthy();
  expect(document.body.textContent).not.toContain("99,999");
});

it("legacy frozen deductions appear in salary list even without original deduction lines", async () => {
 const data=demoRepository.read();
 const p=data.payroll.find(p=>p.month==="2026-10" && p.status==="已确认")!;
 const pay=p.breakdownSnapshot!;
 pay.deductions=123;pay.deductionRows=[];pay.total=pay.base-123+pay.adjustment;
 render(<QueryClientProvider client={new QueryClient()}><DemoProvider><ToastProvider><MemoryRouter><Payroll /></MemoryRouter></ToastProvider></DemoProvider></QueryClientProvider>);
 const name=data.teachers.find(t=>t.id===p.teacherId)!.name;
 const row=(await screen.findByText(name)).closest("tr")!;
 expect(within(row).getByText("−₱123")).toBeTruthy();
});
