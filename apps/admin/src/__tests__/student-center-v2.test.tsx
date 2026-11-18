import { act as testAct } from "@testing-library/react";
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
import { demoRepository, DEMO_STORAGE_KEY } from "../../../../packages/shared/src/repository";
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
async function change(label: string, value: string) {
  await testAct(async () => { fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  }); });
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  const fixture = demoRepository.read();
  fixture.students[0].name = "Jayden";
  fixture.students[0].chineseName = "Jayden";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(fixture));
  demoRepository.refresh();
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
  it("学员姓名与唯一 ID 独立成列，姓名可进入档案", async () => {
    const { container } = mount("/students");
    await screen.findByRole("heading", { name: "学员中心" });
    const headers = [...container.querySelectorAll(".students-table th")]
      .map((cell) => cell.textContent?.trim())
      .filter(Boolean);
    const learner = demoRepository.read().students.find(s => s.name === "Jayden")!;
    const row = screen.getByRole("link", {name: learner.name}).closest("tr")!;
    expect(within(row).getByRole("cell", {name: learner.name}).textContent).toBe(learner.name);
    expect(within(row).getByRole("cell", {name: learner.id}).textContent).toBe(learner.id);
    expect(headers).toEqual([
      "学生名字",
      "学员 ID",
      "所属队伍",
      "所属组别",
      "负责教务",
      "订单状态",
      "上课老师",
      "拉群日期（充值）",
      "起始教材",
      "上课时间",
      "总课时",
      "套餐共用",
      "渠道",
      "买单日期",
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
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "显示列" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "是否续课" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "周上课频次" })); });
    expect(
      [...container.querySelectorAll(".students-table th")]
        .map((cell) => cell.textContent?.trim())
        .filter(Boolean),
    ).toEqual([
      ...headers.slice(0, -1),
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
      expect.arrayContaining(["学生中文名", "学生英文名", "手机号码", "年龄", "上课老师"]),
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
    await testAct(async () => { fireEvent.click(screen.getByRole("tab", { name: "课时与续费" })); });
    expect(await screen.findByText("录入初始剩余课时")).toBeTruthy();
    expect(screen.queryByText("暂无转介绍关系")).toBeNull();
  });
});

describe("学员列表快捷操作", () => {
  it("多节课先选择，单节课直接办理，无课时禁用入口", async () => {
    const state = demoRepository.read();
    const student = state.students.find(s => s.name === "Jayden")!;
    const template = state.lessons[0];
    state.lessons = ["11:00", "09:00"].map(time => ({
      ...template, id: time, studentId: student.id, date: "2099-01-01", time,
      status: "未开始", deducted: false,
    }));
    mount("/students?q=Jayden");
    const row = (await screen.findByRole("link", {name: student.name})).closest("tr")!;
    const cancel = () => within(row).getByRole("button", {name: "取消课"}) as HTMLButtonElement;
    await testAct(async () => { fireEvent.click(cancel()); });
    const picker = screen.getByRole("dialog", {name: "选择要取消的课程"});
    const options = within(picker).getAllByRole("button", {name: /2099-01-01/});
    expect(options[0].textContent).toContain("09:00");
    await testAct(async () => { fireEvent.click(options[0]); });
    for (const time of ["09:00", "11:00"]) {
      const form = within(screen.getByRole("dialog", {name: "取消课程"}));
      expect(form.getByText("预计扣除 0 课时")).toBeTruthy();
      await testAct(async () => { fireEvent.change(form.getByLabelText(/取消原因$/), {target: {value: "家长提前请假"}}); });
      await testAct(async () => { fireEvent.click(form.getByRole("button", {name: "确认取消课程"})); });
      await waitFor(() => expect(demoRepository.read().lessons.find(l => l.time === time)?.status).toBe("已取消"));
      if (time === "09:00") {
        expect(demoRepository.read().lessons.find(l => l.time === "11:00")?.status).toBe("未开始");
        await testAct(async () => { fireEvent.click(cancel()); });
      }
    }
    expect(cancel().disabled).toBe(true);
  });

  it("回访弹窗正文显示所选学员，并保存到该学员的记录", async () => {
    mount("/students");
    const row = (await screen.findByRole("link", {name: "Jayden"})).closest("tr")!;
    await testAct(async () => { fireEvent.click(within(row).getByRole("button", {name: "添加回访"})); });
    const form = within(screen.getByRole("dialog", {name: "记录回访"}));
    expect(form.getByText("学员姓名：Jayden")).toBeTruthy();
    await testAct(async () => { fireEvent.click(form.getByRole("combobox", {name: /星级评价/})); });
    await testAct(async () => { fireEvent.click(screen.getByRole("option", {name: "4 星"})); });
    await testAct(async () => { fireEvent.change(form.getByRole("textbox"), {target: {value: "家长反馈课程进度合适"}}); });
    await testAct(async () => { fireEvent.click(form.getByRole("button", {name: "确认保存"})); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const state = demoRepository.read();
    expect(state.events[0]).toMatchObject({type: "回访", studentId: state.students.find(s => s.name === "Jayden")!.id, visit: {stars: 4, text: "家长反馈课程进度合适"}});
  });
});
