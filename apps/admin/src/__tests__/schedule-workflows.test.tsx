// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import Schedule from "../pages/Schedule";
function mount(path = "/schedule?teacher=t1&date=2026-11-23") {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DemoProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Schedule />
          </MemoryRouter>
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
function fixture() {
  const data = demoRepository.read();
  data.lessons = [];
  data.leaves = [];
  const teacher = data.teachers[0];
  data.teachers = [teacher];
  teacher.availability = [{ day: 1, start: "18:00", end: "21:00" }];
  teacher.availabilityFrom = "";
  teacher.trained = true;
  teacher.needConfirm = false;
  teacher.categories = ["少儿"];
  teacher.status = "在职";
  const student = data.students[3];
  student.scheduleIntent = {
    mode: "fixed",
    startDate: "2026-11-23",
    weeks: 2,
    duration: 50,
    frequency: 1,
    windows: [{ day: 1, start: "18:00", end: "19:00" }],
  };
  return { data, student, teacher };
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
  vi.unstubAllGlobals();
});
describe("排课双工作流", () => {
  it("老师资料关闭保留搜索，方案返回后不重复展开周期", () => {
    const { student } = fixture();
    mount(`/schedule?student=${student.id}`);
    fireEvent.change(screen.getByLabelText("搜索推荐老师"), {
      target: { value: "Carol" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查看老师资料" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "关闭" }),
    );
    expect(screen.getByLabelText<HTMLInputElement>("搜索推荐老师").value).toBe(
      "Carol",
    );
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    fireEvent.click(screen.getByRole("button", { name: "返回方案" }));
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    fireEvent.click(screen.getByRole("button", { name: "确认排课" }));
    expect(demoRepository.read().lessons).toHaveLength(2);
  });
  it("意向时间必填，删除全部或填写无效范围时不可保存", () => {
    const { student } = fixture();
    student.scheduleIntent = null;
    mount(`/schedule?student=${student.id}`);
    const save = screen.getByRole("button", { name: "保存意向并匹配老师" });
    expect(screen.queryByRole("heading", { name: "上课意向" })).toBeNull();
    expect(save.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "周一" }));
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.change(screen.getByLabelText("意向1结束时间"), {
      target: { value: "18:00" },
    });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("结束时间需晚于开始时间")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("意向1结束时间"), {
      target: { value: "19:10" },
    });
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("时间范围需至少容纳 25 分钟课程")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("意向1结束时间"), {
      target: { value: "20:00" },
    });
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "周一" }));
    expect(save.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("请选择每周上课日")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("多选上课日显示对应时间，取消其中一天保留其他时间并正确保存", () => {
    const { student } = fixture();
    student.scheduleIntent = null;
    mount(`/schedule?student=${student.id}`);
    fireEvent.click(screen.getByRole("button", { name: "周三" }));
    fireEvent.change(screen.getByLabelText("意向1开始时间"), {
      target: { value: "18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "周一" }));
    expect(
      screen.getByRole("button", { name: "周三" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getAllByRole("group", { name: /^意向时间[0-9]/ }),
    ).toHaveLength(2);
    expect(screen.getByLabelText("意向2开始时间").getAttribute("value")).toBe(
      "18:00",
    );
    fireEvent.click(screen.getByRole("button", { name: "周一" }));
    expect(screen.queryByLabelText("意向2开始时间")).toBeNull();
    expect(screen.getByLabelText("意向1开始时间").getAttribute("value")).toBe(
      "18:00",
    );
    fireEvent.click(screen.getByRole("button", { name: "保存意向并匹配老师" }));
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.scheduleIntent?.windows,
    ).toEqual([{ day: 3, start: "18:00", end: "21:00" }]);
  });
  it("切换待排课学员时默认选中列表第一位并展示详情", () => {
    const { student } = fixture();
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /待排课学员/ }));
    const first = within(screen.getByRole("complementary")).getAllByRole(
      "button",
    )[0];
    expect(first.classList.contains("selected")).toBe(true);
    expect(first.textContent).toContain(student.name);
    expect(
      screen.getByRole("heading", { name: `为 ${student.name} 安排课程` }),
    ).toBeTruthy();
    expect(screen.queryByText("请选择待排课学员")).toBeNull();
  });
  it("待排课列表为空时不默认选择其他学员", () => {
    const { data } = fixture();
    data.students.forEach((student) => {
      student.status = "在读";
      student.scheduleIntent = null;
    });
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /待排课学员/ }));
    expect(screen.getByText("都安排好了")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "学员排课意向" })).toBeNull();
  });
  it("老师模式无需学员即可查看空档，排课必须显式选择学员", () => {
    fixture();
    mount();
    expect(
      screen
        .getByRole("button", { name: "T. Carol 2026-11-23 18:00 常规可排" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "安排课程" }));
    expect(
      within(screen.getByRole("dialog"))
        .getByRole("button", { name: "确认排课" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
  it("待排课先展示学员需求，点老师后才展示日历，预览不会写课程", () => {
    const { student } = fixture();
    mount(`/schedule?student=${student.id}`);
    expect(screen.getByRole("region", { name: "学员排课意向" })).toBeTruthy();
    expect(screen.queryByText("常规可用时间")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    expect(demoRepository.read().lessons).toHaveLength(0);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("方案预览 · 尚未确认")).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "确认排课" }));
    expect(demoRepository.read().lessons).toHaveLength(2);
    expect(new Set(demoRepository.read().lessons.map((l) => l.date))).toEqual(
      new Set(["2026-11-23", "2026-11-30"]),
    );
  });
  it("已有一节固定课时仅补排缺口，不重复展开周期", () => {
    const { student } = fixture();
    demoRepository.execute({
      type: "lesson.schedule",
      studentId: student.id,
      teacherId: "t1",
      slots: [{ date: "2026-11-23", time: "18:00" }],
      duration: 50,
      kind: "固定课",
      material: student.material,
    });
    mount(`/schedule?student=${student.id}`);
    expect(screen.getByText("已安排 1/2 节")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/本次拟安排 1 节/)).toBeTruthy();
    fireEvent.click(dialog.getByRole("button", { name: "确认排课" }));
    expect(demoRepository.read().lessons).toHaveLength(2);
  });
  it("切换学员不沿用意向和老师；切换模式清空选择", () => {
    const { student, data } = fixture();
    mount(`/schedule?student=${student.id}`);
    fireEvent.click(screen.getByRole("button", { name: "查看排课方案" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "返回方案",
      }),
    );
    const other = data.students.find(
      (s) => s.status === "待排课" && s.id !== student.id,
    );
    if (!other) throw Error("missing fixture");
    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(other.name + ".*待补充意向"),
      }),
    );
    expect(
      screen.getByText("尚未填写意向时间，请先补充并保存，再匹配老师。"),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "推荐老师" })).toBeNull();
    expect(screen.queryByText("常规可用时间")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "老师排课" }));
    expect(screen.queryByRole("region", { name: "学员排课意向" })).toBeNull();
  });
  it("意向修改并保存后持久化，只更新当前学员", () => {
    const { student, data } = fixture();
    mount(`/schedule?student=${student.id}`);
    fireEvent.click(screen.getByRole("button", { name: "修改排课信息" }));
    fireEvent.change(screen.getByLabelText("意向1结束时间"), {
      target: { value: "20:00" },
    });
    fireEvent.change(screen.getByLabelText("意向1开始时间"), {
      target: { value: "18:30" },
    });
    expect(
      screen
        .getByRole("button", { name: "查看排课方案" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "保存意向并匹配老师" }));
    expect(
      demoRepository.read().students.find((s) => s.id === student.id)
        ?.scheduleIntent?.windows[0].start,
    ).toBe("18:30");
    expect(
      demoRepository.read().students.find((s) => s.id === data.students[0].id)
        ?.scheduleIntent,
    ).toBeUndefined();
    expect(
      JSON.parse(
        localStorage.getItem("crazytalk-demo-v1") || "{}",
      ).students.find((s: { id: string }) => s.id === student.id).scheduleIntent
        .windows[0].start,
    ).toBe("18:30");
  });
});

it("老师资料使用独立标签内容布局，待排学员侧栏不显示操作提示", () => {
  const { student, teacher } = fixture();
  teacher.bio = "耐心、有亲和力，善于引导学员表达。";
  mount(`/schedule?student=${student.id}`);
  expect(
    screen.queryByText("选择学员，保存意向后匹配老师并生成预览。"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看老师资料" }));
  const details = screen
    .getByRole("dialog")
    .querySelector(".schedule-teacher-profile-fields");
  expect(details?.querySelectorAll("dt")).toHaveLength(7);
  expect(details?.querySelectorAll("dd")).toHaveLength(7);
  expect(
    within(screen.getByRole("dialog")).getByText(teacher.bio),
  ).toBeTruthy();
});

it("日期导航位于课表卡片内，周与日视图只保留对应切换", () => {
  fixture();
  mount("/schedule?teacher=t1&date=2026-11-23");
  const board = document.querySelector(".schedule-board");
  expect(board?.querySelector(".schedule-topbar")).toBeTruthy();
  expect(screen.queryByLabelText("选择日期")).toBeNull();
  expect(screen.queryByRole("button", { name: "今天" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "下一周" }));
  expect(board?.querySelector(".schedule-date")?.textContent).toContain(
    "11月30日",
  );
  expect(screen.queryByRole("button", { name: "后一天" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "日视图" }));
  expect(screen.queryByRole("button", { name: "下一周" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "后一天" }));
  expect(board?.querySelector(".schedule-date")?.textContent).toContain(
    "12月01日",
  );
});

it("日视图不高亮某位老师，多老师列保留横向滚动宽度", () => {
  mount("/schedule?teacher=t1&date=2026-11-23");
  expect(document.querySelectorAll(".roster-person.selected")).toHaveLength(1);
  fireEvent.click(screen.getByRole("tab", { name: "日视图" }));
  expect(document.querySelectorAll(".roster-person.selected")).toHaveLength(0);
  const grid = document.querySelector<HTMLElement>(".schedule-grid");
  const count = document.querySelectorAll(".roster-person").length;
  expect(grid?.style.minWidth).toBe(`${64 + count * 112}px`);
  fireEvent.click(screen.getByRole("tab", { name: "周视图" }));
  expect(document.querySelectorAll(".roster-person.selected")).toHaveLength(1);
});

it("日历超宽时显示可鼠标拖动的底部滑动条，并双向同步滚动位置", () => {
  const width = vi
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(1600);
  const client = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(800);
  try {
    mount("/schedule?teacher=t1&view=day&date=2026-11-23");
    const slider = screen.getByRole<HTMLInputElement>("slider", {
      name: "日历横向滚动",
    });
    const grid = document.querySelector<HTMLElement>(".schedule-grid-scroll");
    fireEvent.change(slider, { target: { value: "500" } });
    expect(grid?.scrollLeft).toBe(500);
    if (grid) {
      grid.scrollLeft = 300;
      fireEvent.scroll(grid);
    }
    expect(slider.value).toBe("300");
  } finally {
    width.mockRestore();
    client.mockRestore();
  }
});
