// @vitest-environment jsdom
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
import { DemoProvider, useDemo } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import StudentCourses from "../components/StudentCourses";

const reschedule = vi.fn();
function Subject() {
  const { data, setRole } = useDemo();
  return (
    <>
      <button onClick={() => setRole("course-reader")}>切换只读</button>
      <StudentCourses student={data.students[0]} onReschedule={reschedule} />
    </>
  );
}
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter>
            <Subject />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
function choose(label: string, value: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: value }));
}
function course(date: string) {
  return screen.getByRole("button", { name: new RegExp(`查看课程 ${date}`) });
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  reschedule.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const state = demoRepository.read();
  const seed = state.lessons[0];
  const studentId = state.students[0].id;
  state.lessons = [
    {
      ...seed,
      id: "sc-future",
      studentId,
      teacherId: "t1",
      date: "2026-11-02",
      time: "18:00",
      duration: 55,
      material: "未来课教材",
      kind: "临时课",
      status: "未开始",
      attendance: "无数据",
      deducted: false,
      confirmedUnits: undefined,
      note: "",
    },
    {
      ...seed,
      id: "sc-cancelled",
      studentId,
      teacherId: "t2",
      date: "2026-10-30",
      time: "18:00",
      duration: 120,
      material: "长课教材",
      status: "已取消",
      attendance: "无数据",
      deducted: false,
      confirmedUnits: undefined,
      note: "原安排取消",
    },
    {
      ...seed,
      id: "sc-done",
      studentId,
      teacherId: "t1",
      date: "2026-10-28",
      time: "19:00",
      duration: 25,
      material: "短课教材",
      status: "已完成",
      attendance: "正常",
      deducted: true,
      confirmedUnits: 1,
      note: "",
    },
    {
      ...seed,
      id: "sc-pending",
      studentId,
      teacherId: "t1",
      date: "2026-10-31",
      time: "19:00",
      duration: 50,
      status: "待确认",
      attendance: "正常",
      deducted: false,
      confirmedUnits: undefined,
      note: "",
    },
    {
      ...seed,
      id: "sc-other",
      studentId: state.students[1].id,
      date: "2026-10-29",
      time: "20:00",
    },
  ];
  state.reports = [
    {
      id: "sc-report",
      lessonId: "sc-done",
      studentId,
      teacherId: "t1",
      date: "2026-10-28",
      material: "本节教材",
      from: "p.8",
      to: "p.10",
      rating: 0,
      comment: "",
      suggestedLevel: "",
    },
  ];
  state.roles.push({
    id: "course-reader",
    name: "课程只读",
    description: "验收",
    permissions: ["student.view", "lesson.view"],
    scope: "全部",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("学员课程列表、日历与详情", () => {
  it("各时长日历卡统一只显示时间和老师状态，教材保留在详情并保留时长高度", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "日历" }));
    const shortCourse = course("2026-10-28");
    expect(shortCourse.style.height).toBe("46px");
    expect(within(shortCourse).getByText("19:00–19:25")).toBeTruthy();
    expect(within(shortCourse).getByText(/T\. Carol · 已完成/)).toBeTruthy();
    expect(within(shortCourse).queryByText("短课教材")).toBeNull();
    const longCourse = course("2026-10-30");
    expect(longCourse.style.height).toBe("236px");
    expect(within(longCourse).queryByText("长课教材")).toBeNull();
    fireEvent.click(shortCourse);
    const detail = screen.getByRole("dialog", { name: "课程详情" });
    expect(within(detail).getByText("短课教材")).toBeTruthy();
    fireEvent.click(within(detail).getAllByRole("button", { name: "关闭" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "下一周" }));
    const mediumCourse = course("2026-11-02");
    expect(mediumCourse.style.height).toBe("106px");
    expect(within(mediumCourse).queryByText("未来课教材")).toBeNull();
  });
  it("列表及周历复用当前学生的课程，切周关闭详情后保留所在位置，55/120分钟不转换课时", () => {
    mount();
    expect(within(screen.getByRole("table")).getAllByRole("button")).toHaveLength(4);
    expect(
      screen.queryByRole("button", { name: /查看课程 2026-10-29/ }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "日历" }));
    const week = screen.getByRole("region", { name: "学员课程周历" });
    expect(within(week).getAllByRole("button")).toHaveLength(3);
    expect(
      within(week).getByRole("button", { name: /120分钟 已取消/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "下一周" }));
    fireEvent.click(course("2026-11-02"));
    const detail = screen.getByRole("dialog", { name: "课程详情" });
    expect(within(detail).getByText("55 分钟")).toBeTruthy();
    expect(within(detail).getByText("待确认")).toBeTruthy();
    expect(within(detail).queryByText(/已扣 2/)).toBeNull();
    fireEvent.click(within(detail).getAllByRole("button", { name: "关闭" })[0]);
    expect(screen.getByText("2026-11-02 — 2026-11-08")).toBeTruthy();
    expect(screen.getByRole("region", { name: "学员课程周历" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "回到本周" }));
    expect(screen.getByText("2026-10-26 — 2026-11-01")).toBeTruthy();
  });
  it("日期、老师和状态筛选在列表日历间保持，并能清除和校验日期范围", () => {
    mount();
    choose("上课老师", "T. Destiny");
    choose("课程状态", "已取消");
    expect(within(screen.getByRole("table")).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "日历" }));
    expect(
      within(screen.getByRole("region", { name: "学员课程周历" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(1);
    expect(screen.queryByLabelText("上课日期（起始）")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "列表" }));
    fireEvent.change(screen.getByLabelText("上课日期（起始）"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(screen.getByLabelText("上课日期（结束）"), {
      target: { value: "2026-10-01" },
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "结束日期不能早于开始日期",
    );
    fireEvent.click(screen.getByRole("button", { name: "日历" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "学员课程周历" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "列表" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "日历" }));
    expect(
      within(screen.getByRole("region", { name: "学员课程周历" })).getAllByRole(
        "button",
      ),
    ).toHaveLength(3);
  });
  it("当前进度及逐节记录打开正确课程，未来课仅把选中课次传给原调课流程", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /查看对应课程/ }));
    expect(
      screen.getByRole("dialog", { name: "课程详情" }).textContent,
    ).toContain("本节教材");
    expect(screen.getByText("p.8 → p.10")).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "关闭",
      })[0],
    );
    fireEvent.click(course("2026-11-02"));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "调课" }),
    );
    expect(reschedule).toHaveBeenCalledWith("sc-future");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("在详情内更正已扣数量并准确退回，必须填写原因且不按分钟数折算", async () => {
    const balance = demoRepository.read().students[0].balance;
    mount();
    fireEvent.click(course("2026-10-28"));
    fireEvent.click(screen.getByRole("button", { name: "更正结果" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /本节扣课数量/ }), {
      target: { value: "1.5" },
    });
    expect(
      screen.getByText(new RegExp(`确认后余额 ${balance - 0.5} 课时`)),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存更正" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("更正原因"), {
      target: { value: "核对原台账应为1.5课时" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更正" }));
    await waitFor(() =>
      expect(demoRepository.read().students[0].balance).toBe(balance - 0.5),
    );
    expect(
      within(screen.getByRole("dialog")).getByText("已扣 1.5 课时"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "更正结果" }));
    choose("课时处理", "不扣课时");
    fireEvent.change(screen.getByLabelText("更正原因"), {
      target: { value: "核实本节不扣，退回原确认数量" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更正" }));
    await waitFor(() =>
      expect(demoRepository.read().students[0].balance).toBe(balance + 1),
    );
    expect(demoRepository.read().credits[0].units).toBe(1.5);
  });
  it("人工更正已结束课的出勤与结果，不按出勤自动扣课或变更薪资", async () => {
    const balance = demoRepository.read().students[0].balance;
    const payroll = structuredClone(demoRepository.read().payroll);
    mount();
    fireEvent.click(course("2026-10-28"));
    fireEvent.click(screen.getByRole("button", { name: "更正结果" }));
    choose("课程结果", "缺席");
    choose("出勤情况", "学员缺席");
    fireEvent.change(screen.getByLabelText("更正原因"), {
      target: { value: "核实实际为学员缺席，原扣课数量不变" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存更正" }));
    await waitFor(() =>
      expect(
        demoRepository.read().lessons.find((lesson) => lesson.id === "sc-done"),
      ).toMatchObject({
        status: "缺席",
        attendance: "学员缺席",
        deducted: true,
        confirmedUnits: 1,
      }),
    );
    expect(demoRepository.read().students[0].balance).toBe(balance);
    expect(demoRepository.read().payroll).toEqual(payroll);
    expect(
      within(screen.getByRole("dialog")).getByText("学员缺席"),
    ).toBeTruthy();
  });
  it("取消未来课程要确认原因，取消后余额不变，记录可继续查询", async () => {
    const balance = demoRepository.read().students[0].balance;
    mount();
    fireEvent.click(course("2026-11-02"));
    fireEvent.click(screen.getByRole("button", { name: "取消课程" }));
    fireEvent.click(screen.getByRole("button", { name: "确认取消课程" }));
    expect(screen.getByRole("alert").textContent).toBe("请填写取消原因");
    choose("取消原因方", "老师");
    fireEvent.change(screen.getByLabelText("取消原因"), {
      target: { value: "老师临时请假" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认取消课程" }));
    await waitFor(() =>
      expect(
        demoRepository.read().lessons.find((item) => item.id === "sc-future")
          ?.status,
      ).toBe("已取消"),
    );
    expect(demoRepository.read().students[0].balance).toBe(balance);
    expect(screen.getByRole("dialog").textContent).toContain("老师临时请假");
    expect(screen.queryByRole("button", { name: "取消课程" })).toBeNull();
  });
  it("只读角色可查看课程而没有更正、调课和取消入口", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "切换只读" }));
    fireEvent.click(course("2026-10-28"));
    expect(screen.queryByRole("button", { name: "更正结果" })).toBeNull();
    fireEvent.click(
      within(screen.getByRole("dialog")).getAllByRole("button", {
        name: "关闭",
      })[0],
    );
    fireEvent.click(course("2026-11-02"));
    expect(screen.queryByRole("button", { name: "调课" })).toBeNull();
    expect(screen.queryByRole("button", { name: "取消课程" })).toBeNull();
  });
  it("填写后关闭会保护未保存内容，可继续编辑或明确放弃", () => {
    mount();
    fireEvent.click(course("2026-11-02"));
    fireEvent.click(screen.getByRole("button", { name: "取消课程" }));
    fireEvent.change(screen.getByLabelText("取消原因"), {
      target: { value: "尚未确认的调整" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "课程详情" })).getByRole(
        "button",
        { name: "关闭" },
      ),
    );
    expect(screen.getByRole("dialog", { name: "放弃本次修改？" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByLabelText("取消原因")).toHaveProperty(
      "value",
      "尚未确认的调整",
    );
    fireEvent.click(screen.getByRole("button", { name: "返回详情" }));
    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    expect(screen.getByRole("dialog", { name: "课程详情" })).toBeTruthy();
    expect(screen.queryByLabelText("取消原因")).toBeNull();
    expect(
      demoRepository.read().lessons.find((item) => item.id === "sc-future")
        ?.status,
    ).toBe("未开始");
  });
});
