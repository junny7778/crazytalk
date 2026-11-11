// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { emptyStudentProfile } from "@crazytalk/shared";
import { demoRepository } from "../../../../packages/shared/src/repository";
import App from "../App";

function mount(path: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("学员中心确认方案", () => {
  it("默认列表只呈现9个原表关键字段和操作，名字独立可点，不暴露系统编号或等级", async () => {
    const { container } = mount("/students");
    await screen.findByRole("heading", { name: "学员中心" });
    const headers = [...container.querySelectorAll(".students-table th")]
      .map((cell) => cell.textContent?.trim())
      .filter(Boolean);
    expect(headers).toEqual([
      "学生名字",
      "渠道",
      "订单状态",
      "买单日期",
      "总课时",
      "上课老师",
      "教材",
      "上课时间",
      "操作",
    ]);
    expect(
      screen.getByRole("link", { name: "Jayden" }).getAttribute("href"),
    ).toBe(
      `/students/${demoRepository.read().students.find((student) => student.name === "Jayden")?.id}`,
    );
    expect(container.querySelector(".students-table")?.textContent).not.toMatch(
      /X0007|CEFR|Pre-A1/,
    );
    fireEvent.click(screen.getByRole("button", { name: "显示列" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "是否续课" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "周上课频次" }));
    expect(
      [...container.querySelectorAll(".students-table th")]
        .map((cell) => cell.textContent?.trim())
        .filter(Boolean),
    ).toEqual([
      "学生名字",
      "渠道",
      "订单状态",
      "买单日期",
      "总课时",
      "上课老师",
      "教材",
      "上课时间",
      "周上课频次",
      "是否续课",
      "操作",
    ]);
  });
  it("基本信息保留档案字段，月度统计集中到课程Tab", async () => {
    const { container } = mount("/students/s1");
    await screen.findByRole("tab", { name: "概述信息" });
    const labels = [
      ...container.querySelectorAll(".student-detail-fields dt"),
    ].map((label) => label.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining(["学生名字", "手机号码", "年龄", "上课老师"]),
    );
    expect(labels).not.toContain("当月已排课程");
    expect(labels).not.toContain("月应上课");
    expect(screen.queryByRole("heading", { name: /月度上课情况/ })).toBeNull();
    expect(
      screen
        .getByRole("tab", { name: "概述信息" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(container.querySelector(".student-detail")?.textContent).not.toMatch(
      /学员编号|CEFR|学习目标/,
    );
  });
  it("暂缓待办入口，旧链接返回学员概述",async()=>{
    mount("/students/s1?tab=tasks");await screen.findByRole("tab",{name:"概述信息"});
    expect(screen.queryByRole("tab",{name:"待办事项"})).toBeNull();
  });
  it("保留0和未知值，剩余课时未核实不冒充总课时或要求补编号", async () => {
    demoRepository.execute({
      type: "student.import",
      mode: "skip",
      students: [
        {
          ...emptyStudentProfile(),
          name: "无编号原表学生",
          groupName: "学习服务群",
          totalUnits: 0,
          legacyComplaints: "0",
          monthlyRecords: [
            {
              id: "july",
              month: "7月（原表，年份未注明）",
              planned: null,
              actual: 0,
              note: "",
            },
          ],
        },
      ],
    });
    const student = demoRepository
      .read()
      .students.find((item) => item.name === "无编号原表学生");
    mount(`/students/${student?.id}`);
    await screen.findByRole("tab", { name: "概述信息" });
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getAllByText("未填写").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "课时与续费" }));
    expect(await screen.findByText("录入初始剩余课时")).toBeTruthy();
    expect(screen.queryByText("暂无转介绍关系")).toBeNull();
  });
});
