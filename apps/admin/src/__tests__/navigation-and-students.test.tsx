// @vitest-environment jsdom
import { Component, Profiler, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { transferableAbortController } from "node:util";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import App from "../App";
class RenderWatchdog extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">页面陷入重复渲染，无法操作</p>
    ) : (
      this.props.children
    );
  }
}
function mount(path = "/students") {
  let renders = 0;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DemoProvider>
        <ToastProvider>
          <RouterProvider
            router={createMemoryRouter(
              [
                {
                  path: "*",
                  element: (
                    <RenderWatchdog>
                      <Profiler
                        id="navigation"
                        onRender={() => {
                          if (++renders > 45)
                            throw new Error(
                              "UI render loop: more than 45 commits during one task",
                            );
                        }}
                      >
                        <App />
                      </Profiler>
                    </RenderWatchdog>
                  ),
                },
              ],
              { initialEntries: [path] },
            )}
          />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    "AbortController",
    class {
      constructor() {
        return transferableAbortController();
      }
    },
  );
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
describe("后台导航和学员建档", () => {
  it.each([
    ["数据看板", /^周.好，Rita$/],
    ["学员中心", "学员"],
    ["排课管理", "排课管理"],
    ["上课记录 9", "上课记录"],
    ["反馈 3", "反馈"],
    ["老师中心", "老师"],
    ["薪资", "薪资"],
  ])("菜单 %s 打开对应后台模块", async (menu, heading) => {
    mount();
    fireEvent.click(screen.getByRole("link", { name: menu }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy(),
    );
    expect(screen.getByRole("link", { name: "学员中心" })).toBeTruthy();
  });
  it("设置从顶栏打开后台设置页", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "团队账号" })).toBeTruthy(),
    );
  });

  it("老师菜单进入后台老师管理，老师详情也保留后台导航", async () => {
    mount("/feedback");
    fireEvent.click(screen.getByRole("link", { name: "老师中心" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "老师" })).toBeTruthy(),
    );
    expect(screen.queryByRole("heading", { name: "Hi Carol" })).toBeNull();
    fireEvent.click(screen.getByRole("cell", { name: "T. Carol" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^T\. Carol/ })).toBeTruthy(),
    );
    expect(screen.getByRole("link", { name: "学员中心" })).toBeTruthy();
  });
  it("老师端独立入口仍显示老师首页", async () => {
    mount("/teacher");
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Hi Carol" })).toBeTruthy(),
    );
    expect(screen.queryByRole("link", { name: "薪资" })).toBeNull();
  });
  it("新建学员反复打开、输入、关闭后仍可操作列表", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.queryByRole("alert")).toBeNull();
      fireEvent.change(screen.getByRole("textbox", { name: "学生名字" }), {
        target: { value: "Regression Lucy" },
      });
      fireEvent.click(screen.getByRole("button", { name: "取消" }));
      fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    }
    fireEvent.change(
      screen.getByRole("textbox", { name: "搜索学生名字、学生群名或手机号" }),
      { target: { value: "Jayden" } },
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Jayden" })).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(errors.mock.calls.flat().join(" ")).not.toContain(
      "Maximum update depth",
    );
  });
  it("顶栏移除新建快捷入口，学员页面仍可新建", async () => {
    mount();
    const topbar = within(screen.getByRole("banner"));
    expect(topbar.queryByRole("button", { name: /新建/ })).toBeNull();
    expect(topbar.getByRole("button", { name: "通知" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    expect(
      await screen.findByRole("dialog", { name: "新建学员" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
  });
  it("从列表新建零余额学员可直接加课时，不要求重复核实", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.change(screen.getByRole("textbox", { name: "学生名字" }), {
      target: { value: "Regression Lucy" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "手机号码" }), {
      target: { value: "13812345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存并加课时" }));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "给 Regression Lucy 加课时" }),
      ).toBeTruthy(),
    );
  });

  it("渠道下拉按原表字段筛选学生", async () => {
    mount();
    fireEvent.click(screen.getByRole("combobox", { name: "渠道筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "许老师" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Molly" })).toBeNull(),
    );
    expect(screen.getByRole("link", { name: "Jayden" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "渠道筛选" }).textContent,
    ).toContain("许老师");
  });
  it("建档选择渠道不会生成或要求填写业务编号", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "新建学员" }));
    fireEvent.click(screen.getByRole("combobox", { name: "渠道" }));
    fireEvent.click(screen.getByRole("option", { name: "ToC" }));
    expect(screen.queryByRole("textbox", { name: "学员编号" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "学生名字" }), {
      target: { value: "渠道建档验证" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存学员资料" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "渠道建档验证", level: 1 }),
      ).toBeTruthy(),
    );
    expect(demoRepository.read().students[0].channel).toBe("ToC");
  });
  it("反馈抽屉搜索学员并选择后自动带出对应老师", async () => {
    mount("/feedback?new=1");
    const students = await screen.findByRole("combobox", { name: "学员" });
    fireEvent.click(students);
    fireEvent.change(screen.getByRole("textbox", { name: "搜索选项" }), {
      target: { value: "Molly" },
    });
    fireEvent.click(
      screen.getByRole("option", { name: "Molly · Molly专属学习群" }),
    );
    expect(
      screen.getByRole("combobox", { name: "老师" }).textContent,
    ).toContain("T. Destiny");
    expect(screen.getByRole("dialog", { name: "登记反馈" })).toBeTruthy();
  });

  it("看板按基础数据、待处理事项、详细数据的顺序展示", () => {
    const { container } = mount("/");
    const basics = screen.getByRole("region", { name: "基础数据" });
    const pending = screen.getByRole("region", { name: "待处理事项" });
    const details = screen.getByRole("region", { name: "详细数据" });
    expect(
      basics.compareDocumentPosition(pending) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      pending.compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector("time")?.getAttribute("datetime")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(screen.getByRole("heading", { name: /^周.好，Rita$/ })).toBeTruthy();
    expect(screen.getByText("今天也一起照顾好学员的学习旅程吧")).toBeTruthy();
    expect(
      container.querySelector(".dashboard-welcome img")?.getAttribute("src"),
    ).toBe(container.querySelector(".user-button img")?.getAttribute("src"));
    expect(container.querySelector("time")?.textContent).toMatch(
      /^今天，\d{4}年\d{1,2}月\d{1,2}日$/,
    );
  });
  it("看板展示四张插画事项卡，未同步卡进入对应课程列表", async () => {
    mount("/");
    const pending = within(screen.getByRole("region", { name: "待处理事项" }));
    expect(pending.getAllByRole("article")).toHaveLength(4);
    for (const label of [
      "课后待确认",
      "待处理反馈",
      "未同步课程",
      "课时即将用完",
    ]) {
      const card = pending.getByRole("article", { name: label });
      expect(card.querySelector("img")?.getAttribute("src")).toMatch(
        /^\/illustrations\/reminder-.+\.webp$/,
      );
      expect(within(card).getByRole("heading", { name: label })).toBeTruthy();
    }
    expect(pending.queryByRole("button", { name: /查看明细/ })).toBeNull();
    fireEvent.click(
      pending.getByRole("button", { name: "去检查同步：未同步课程" }),
    );
    expect(
      await screen.findByRole("heading", { name: "上课记录", level: 1 }),
    ).toBeTruthy();
  });
  it("看板待处理事项只在运营总览中显示，切换页签后能恢复", () => {
    mount("/");
    fireEvent.click(screen.getByRole("tab", { name: "老师利用率" }));
    expect(screen.queryByRole("region", { name: "待处理事项" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "运营总览" }));
    expect(screen.getByRole("region", { name: "待处理事项" })).toBeTruthy();
  });
  it("看板切换统计周期后仍保留未处理反馈，卡片可进入处理页面", async () => {
    mount("/");
    fireEvent.click(screen.getByRole("combobox", { name: "看板时间范围" }));
    fireEvent.click(screen.getByRole("option", { name: "今天" }));
    const pending = within(screen.getByRole("region", { name: "待处理事项" }));
    expect(
      pending.getByRole("article", { name: "待处理反馈" }).textContent,
    ).toContain("3 条家长反馈");
    fireEvent.click(
      pending.getByRole("button", { name: "去处理反馈：待处理反馈" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "反馈", level: 1 }),
      ).toBeTruthy(),
    );
  });
});

describe("数据看板概览与下钻", () => {
  it("约课统计放在待办后，待上课下钻保留完整周期", async () => {
    mount("/");
    const booking = await screen.findByRole("region", { name: "约课统计" });
    const pending = screen.getByRole("region", { name: "待处理事项" });
    expect(pending.compareDocumentPosition(booking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(booking).getByText("取消率")).toBeTruthy();
    const upcoming = within(booking).getByRole("button", { name: /^待上课 / });
    fireEvent.click(upcoming);
    expect(await screen.findByText(/看板筛选：2026-10-26 至 2026-11-01/)).toBeTruthy();
    expect(screen.getByText(/全部项目 · 未开始/)).toBeTruthy();
  });
  it("展示四张业务卡片和四个分析区块，不展示首页学员表格", async () => {
    mount("/");
    const cards = await screen.findByRole("region", { name: "基础数据" });
    expect(within(cards).getAllByRole("button")).toHaveLength(4);
    expect(
      within(cards).getByRole("button", { name: /在读学员 \/ 总学员/ }),
    ).toBeTruthy();
    expect(
      within(cards).getByRole("button", { name: /可排课老师 \/ 老师总数/ }),
    ).toBeTruthy();
    for (const name of ["上课趋势", "学员出勤", "课程异常", "服务质量"])
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("heading", { name: "剩余课时分布" })).toBeNull();
    for (const name of ["老师早退", "学员迟到", "学员早退", "待核实"])
      expect(screen.getByRole("button", { name: new RegExp(`^${name} \\d+ 节$`) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "学员缺席 1 节" }));
    expect(await screen.findByText(/看板筛选：.*学员缺席/)).toBeTruthy();
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
  });
  it("差评分类下钻保留周期和分类，且可清除筛选", async () => {
    mount("/");
    fireEvent.click(
      await screen.findByRole("button", { name: "设备网络 1 条" }),
    );
    expect(await screen.findByText(/看板筛选：.*设备网络/)).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.queryByText(/看板筛选：/)).toBeNull();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(2);
  });
});

describe("看板数据说明气泡", () => {
  it("说明默认收起，点击显示统计口径，关闭后恢复焦点", async () => {
    mount("/");
    expect(screen.queryByText(/暂不计入出勤率/)).toBeNull();
    const trigger = await screen.findByRole("button", {
      name: "学员出勤：数据说明",
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: "学员出勤数据说明",
    });
    expect(
      within(dialog).getByText(/出勤率 = 实到课次 ÷ 应到课次/),
    ).toBeTruthy();
    expect(within(dialog).getByText(/暂不计入出勤率/)).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭数据说明" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "学员出勤数据说明" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("头像下拉菜单", () => {
  it("点击菜单内部保持展开，点击外部关闭，并可再次打开", async () => {
    mount("/students");
    const trigger = await screen.findByRole("button", {
      name: "Rita 教务运营",
    });
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByText("演示身份"));
    expect(screen.getByText("演示身份")).toBeTruthy();
    fireEvent.pointerDown(
      screen.getByRole("heading", { name: "学员", level: 1 }),
    );
    expect(screen.queryByText("演示身份")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByText("演示身份")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("演示身份")).toBeNull();
  });
});

describe("侧栏菜单顺序", () => {
  it("老师中心紧随学员中心", async () => {
    mount("/students");
    await screen.findByRole("heading", { name: "学员", level: 1 });
    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "数据看板",
      "学员中心",
      "老师中心",
      "排课管理",
      "上课记录9",
      "反馈3",
      "薪资",
    ]);
  });
});

describe("统一搜索仅查找学员和老师", () => {
  it("教材关键词只显示空状态，不再返回课次或空分组", async () => {
    mount("/students");
    fireEvent.click(
      await screen.findByRole("button", { name: /搜索学员或老师/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "搜索" });
    expect(within(dialog).getByText("输入关键词查找学员或老师。")).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "pow" },
    });
    expect(within(dialog).getByText("没有找到匹配结果")).toBeTruthy();
    expect(within(dialog).queryByText("Power Up 3")).toBeNull();
    expect(within(dialog).queryByText("学员", { exact: true })).toBeNull();
    expect(within(dialog).queryByText("老师", { exact: true })).toBeNull();
  });
  it("匹配学员和老师，支持忽略大小写和首尾空格", async () => {
    mount("/students");
    fireEvent.click(
      await screen.findByRole("button", { name: /搜索学员或老师/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "搜索" });
    const input = within(dialog).getByRole("textbox");
    fireEvent.change(input, { target: { value: " JAYDEN " } });
    expect(within(dialog).getByRole("button", { name: /Jayden/ })).toBeTruthy();
    expect(within(dialog).queryByText("没有找到匹配结果")).toBeNull();
    fireEvent.change(input, { target: { value: " carol " } });
    expect(
      within(dialog).getByRole("button", { name: /T. Carol/ }),
    ).toBeTruthy();
    expect(within(dialog).queryByText("学员", { exact: true })).toBeNull();
  });
});

describe("统一搜索结果内容", () => {
  it("学员结果显示群名和手机号，并展示超过五条的匹配项", async () => {
    mount("/students");
    fireEvent.click(
      await screen.findByRole("button", { name: /搜索学员或老师/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "搜索" });
    fireEvent.change(within(dialog).getByRole("textbox"), {
      target: { value: "a" },
    });
    const results = within(dialog).getByRole("region", { name: "搜索结果" });
    const studentButtons = within(results)
      .getAllByRole("button")
      .filter((button) =>
        /群名未填写|手机号未填写|\d{4}/.test(button.textContent || ""),
      );
    expect(studentButtons.length).toBeGreaterThan(5);
    expect(
      studentButtons.every(
        (button) => !button.textContent?.includes("负责教务"),
      ),
    ).toBe(true);
    expect(
      studentButtons.every((button) =>
        / · (?:\d|\*|手机号未填写)/.test(button.textContent || ""),
      ),
    ).toBe(true);
  });
});

it("看板老师入口使用可见普通筛选，清除后展示全部老师", async () => {
  const data = demoRepository.read();
  mount("/");
  fireEvent.click(
    await screen.findByRole("button", { name: /可排课老师 \/ 老师总数/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "老师中心", level: 1 }),
  ).toBeTruthy();
  expect(
    screen.getByRole("combobox", { name: "任职状态" }).textContent,
  ).toContain("在职");
  expect(
    screen.getByText(
      `共 ${data.teachers.filter((t) => t.status === "在职" && (!data.rules.trainingRequired || t.trained)).length} 位老师`,
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "清除全部筛选" }));
  expect(screen.getByText(`共 ${data.teachers.length} 位老师`)).toBeTruthy();
});

describe("上课记录统计卡", () => {
  it("统计全部分页的匹配课程，并随姓名搜索更新", async () => {
    mount("/lessons");
    const stats = await screen.findByRole("region", { name: "上课记录统计" });
    const data = demoRepository.read();
    const assertCounts = (lessons: typeof data.lessons) => {
      expect(within(stats).getByRole("article", { name: `总约课数 ${lessons.length} 节` })).toBeTruthy();
      for (const [label, status] of [["待上课数", "未开始"], ["已完成数", "已完成"], ["已取消数", "已取消"]]) {
        expect(within(stats).getByRole("article", { name: `${label} ${lessons.filter((lesson) => lesson.status === status).length} 节` })).toBeTruthy();
      }
    };
    assertCounts(data.lessons);
    const search = screen.getByPlaceholderText("搜索学员或老师姓名");
    fireEvent.change(search, { target: { value: "不存在的姓名" } });
    assertCounts([]);
    fireEvent.change(search, { target: { value: "" } });
    assertCounts(data.lessons);
  });
  it("状态筛选后卡片数量与列表一致", async () => {
    mount("/lessons?bookingStatus=已取消");
    const stats = await screen.findByRole("region", { name: "上课记录统计" });
    const count = demoRepository.read().lessons.filter((lesson) => lesson.status === "已取消").length;
    expect(within(stats).getByRole("article", { name: `总约课数 ${count} 节` })).toBeTruthy();
    expect(within(stats).getByRole("article", { name: `已取消数 ${count} 节` })).toBeTruthy();
    expect(within(stats).getByRole("article", { name: "待上课数 0 节" })).toBeTruthy();
    expect(within(stats).getByRole("article", { name: "已完成数 0 节" })).toBeTruthy();
  });
});
