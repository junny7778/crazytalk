// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { changeDemoPassword } from "../lib/demoPasswords";
import { transferableAbortController } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import { demoRepository } from "../../../../packages/shared/src/repository";
import App from "../App";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
function mount(path = "/settings") {
  const router = createMemoryRouter([{ path: "*", element: <App /> }], {
    initialEntries: [path],
  });
  routers.push(router);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <DemoProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  return router;
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
  routers.splice(0).forEach((router) => router.dispose());
  vi.unstubAllGlobals();
});

function categoryRow(name: string) {
  const item = screen.getByRole("treeitem", { name });
  const row = item.querySelector<HTMLDivElement>(".settings-category-tree-row");
  if (!row) throw new Error("缺少分类节点");
  return row;
}

async function changeRule() {
  fireEvent.change(
    await screen.findByRole("spinbutton", {
      name: "课时快用完（剩余课时 ≤）",
    }),
    { target: { value: "6" } },
  );
}

describe("独立设置布局与导航", () => {
  it("隐藏业务侧栏和顶栏工具，展示分组及账号菜单", async () => {
    mount();
    const nav = await screen.findByRole("navigation", { name: "设置导航" });
    expect(screen.queryByRole("link", { name: "学员中心" })).toBeNull();
    expect(screen.queryByRole("button", { name: /搜索学员或老师/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "通知" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rita 教务运营" })).toBeTruthy();
    for (const name of ["团队与权限", "业务资料", "系统管理"])
      expect(within(nav).getByRole("heading", { name })).toBeTruthy();
    expect(within(nav).queryByRole("heading", { name: "业务规则" })).toBeNull();
    const business = within(nav).getByRole("region", { name: "业务资料" });
    expect(
      within(business).getByRole("button", { name: "业务规则" }),
    ).toBeTruthy();
    const entries = within(nav).getAllByRole("button");
    expect(entries).toHaveLength(7);
    for (const entry of entries) {
      expect(entry.querySelectorAll("svg")).toHaveLength(1);
      expect(entry.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
    expect(
      within(nav)
        .getByRole("button", { name: "团队账号" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
  it("返回进入前的业务地址和查询参数，并保留侧栏偏好", async () => {
    localStorage.setItem("ct-sidebar", "open");
    const router = mount("/students?project=K12");
    fireEvent.click(await screen.findByRole("button", { name: "设置" }));
    await screen.findByRole("navigation", { name: "设置导航" });
    fireEvent.click(screen.getByRole("button", { name: "返回工作台" }));
    await screen.findByRole("link", { name: "学员中心" });
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/students?project=K12",
    );
    expect(localStorage.getItem("ct-sidebar")).toBe("open");
  });
  it("直接访问设置时返回数据看板", async () => {
    const router = mount("/settings?tab=audit");
    fireEvent.click(await screen.findByRole("button", { name: "返回工作台" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
  it("页签切换支持地址与历史导航", async () => {
    const router = mount();
    fireEvent.click(await screen.findByRole("button", { name: "操作日志" }));
    expect(router.state.location.search).toBe("?tab=audit");
    expect(
      await screen.findByRole("heading", { name: "操作日志" }),
    ).toBeTruthy();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(
      await screen.findByRole("heading", { name: "团队账号" }),
    ).toBeTruthy();
    await act(async () => {
      await router.navigate(1);
    });
    expect(
      await screen.findByRole("heading", { name: "操作日志" }),
    ).toBeTruthy();
  });
  it("未修改规则不可保存，切换页签保护草稿，放弃后重置", async () => {
    mount("/settings?tab=rules");
    const save = await screen.findByRole("button", { name: "保存规则" });
    expect(
      screen.queryByRole("spinbutton", { name: "免费取消时限（提前几小时）" }),
    ).toBeNull();
    expect(
      screen.queryByRole("spinbutton", { name: "固定课预排周数" }),
    ).toBeNull();
    expect(save.hasAttribute("disabled")).toBe(true);
    await changeRule();
    fireEvent.click(screen.getByRole("button", { name: "团队账号" }));
    let dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" }));
    expect(
      screen
        .getByRole("spinbutton", { name: "课时快用完（剩余课时 ≤）" })
        .getAttribute("value"),
    ).toBe("6");
    fireEvent.click(screen.getByRole("button", { name: "团队账号" }));
    dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" }));
    await screen.findByRole("heading", { name: "团队账号" });
    fireEvent.click(screen.getByRole("button", { name: "业务规则" }));
    expect(
      (await screen.findByRole("button", { name: "保存规则" })).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
  });
  it("规则保存成功后可以直接返回，实际数据更新", async () => {
    mount("/settings?tab=rules");
    await changeRule();
    fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
    const dialog = await screen.findByRole("dialog", {
      name: "确认修改业务规则",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认保存" }));
    await waitFor(() => expect(demoRepository.read().rules.lowBalance).toBe(6));
    fireEvent.click(screen.getByRole("button", { name: "返回工作台" }));
    expect(screen.queryByRole("dialog", { name: "有未保存的修改" })).toBeNull();
    await screen.findByRole("link", { name: "学员中心" });
  });
  it("浏览器返回和工作台返回均拦截未保存修改", async () => {
    const router = mount("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "业务规则" }));
    await changeRule();
    await act(async () => {
      await router.navigate(-1);
    });
    let dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" }));
    expect(router.state.location.search).toBe("?tab=rules");
    fireEvent.click(screen.getByRole("button", { name: "返回工作台" }));
    dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
  it("账号编辑关闭时保护输入，放弃后不写入数据", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "新建账号" }));
    const account = await screen.findByRole("dialog", { name: "新建团队账号" });
    fireEvent.change(within(account).getByRole("textbox", { name: "姓名" }), {
      target: { value: "专项测试账号" },
    });
    fireEvent.click(within(account).getByRole("button", { name: "取消" }));
    const dialog = await screen.findByRole("dialog", {
      name: "有未保存的修改",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" }));
    expect(screen.queryByRole("dialog", { name: "新建团队账号" })).toBeNull();
    expect(
      demoRepository.read().accounts.some((a) => a.name === "专项测试账号"),
    ).toBe(false);
  });
});

describe("角色列表与详情", () => {
  it("一级页面只显示角色列表，点击角色进入只读详情，并支持历史返回", async () => {
    const router = mount("/settings?tab=roles");
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "教务" }));
    expect(router.state.location.search).toContain("role=ops");
    expect(await screen.findByRole("heading", { name: "教务" })).toBeTruthy();
    expect(
      screen
        .getAllByRole("checkbox")
        .every((input) => input.hasAttribute("disabled")),
    ).toBe(true);
    expect(screen.queryByRole("textbox", { name: "角色名称" })).toBeNull();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByRole("table")).toBeTruthy();
  });
  it("直接访问角色详情，编辑后确认保存并回到只读状态", async () => {
    mount("/settings?tab=roles&role=ops");
    fireEvent.click(await screen.findByRole("button", { name: "编辑权限" }));
    expect(
      screen.getByRole("button", { name: "保存权限" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "角色名称" }), {
      target: { value: "教务新名称" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存权限" }));
    const confirm = await screen.findByRole("dialog", {
      name: "确认修改角色权限",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认修改" }));
    await waitFor(() =>
      expect(
        demoRepository.read().roles.find((role) => role.id === "ops")?.name,
      ).toBe("教务新名称"),
    );
    expect(
      await screen.findByRole("button", { name: "编辑权限" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    expect(
      await screen.findByRole("button", { name: "教务新名称" }),
    ).toBeTruthy();
  });
  it("未改动的编辑可以直接返回，修改后返回保护草稿", async () => {
    mount("/settings?tab=roles&role=ops");
    fireEvent.click(await screen.findByRole("button", { name: "编辑权限" }));
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "教务" }));
    expect(screen.queryByRole("textbox", { name: "角色名称" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "编辑权限" }));
    fireEvent.change(screen.getByRole("textbox", { name: "说明" }), {
      target: { value: "修改中" },
    });
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    let dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" }));
    expect(
      screen.getByRole("textbox", { name: "说明" }).getAttribute("value"),
    ).toBe("修改中");
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });
  it("新建角色在详情中编辑，取消新建只需一次放弃确认", async () => {
    mount("/settings?tab=roles");
    fireEvent.click(await screen.findByRole("button", { name: "新建角色" }));
    expect(
      await screen.findByRole("textbox", { name: "角色名称" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消编辑" }));
    const dialog = await screen.findByRole("dialog", {
      name: "有未保存的修改",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("超级管理员详情只能查看，可以复制成可编辑新角色", async () => {
    mount("/settings?tab=roles&role=admin");
    await screen.findByRole("heading", { name: "超级管理员" });
    expect(screen.queryByRole("button", { name: "编辑权限" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除角色" })).toBeNull();
    const count = screen
      .getAllByRole("checkbox")
      .filter((input) => input.getAttribute("checked") !== null).length;
    fireEvent.click(screen.getByRole("button", { name: "复制角色" }));
    expect(
      await screen.findByRole("textbox", { name: "角色名称" }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("checkbox")
        .filter((input) => input.getAttribute("checked") !== null),
    ).toHaveLength(count);
    expect(
      screen
        .getAllByRole("checkbox")
        .every((input) => !input.hasAttribute("disabled")),
    ).toBe(true);
  });
  it("无效角色地址提供返回列表入口", async () => {
    mount("/settings?tab=roles&role=missing");
    expect(await screen.findByText("角色不存在或已删除")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    expect(await screen.findByRole("table")).toBeTruthy();
  });
});

describe("角色详情权限与删除约束", () => {
  it("新建角色保留权限依赖，保存后可从列表再次查看并删除", async () => {
    mount("/settings?tab=roles");
    fireEvent.click(await screen.findByRole("button", { name: "新建角色" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "角色名称" }), {
      target: { value: "专项验证角色" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "新建学员" }));
    expect(
      screen.getByRole("checkbox", { name: "查看学员" }).matches(":checked"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "查看学员" }));
    expect(
      screen.getByRole("checkbox", { name: "新建学员" }).matches(":checked"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "查看学员" }));
    fireEvent.click(screen.getByRole("button", { name: "保存权限" }));
    const confirm = await screen.findByRole("dialog", {
      name: "确认修改角色权限",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "确认修改" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .roles.some(
            (role) =>
              role.name === "专项验证角色" &&
              role.permissions.includes("student.view"),
          ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "专项验证角色" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除角色" }));
    const deletion = await screen.findByRole("dialog", { name: "删除角色" });
    fireEvent.change(within(deletion).getByRole("textbox"), {
      target: { value: "专项验证角色" },
    });
    fireEvent.click(within(deletion).getByRole("button", { name: "确认删除" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(
      demoRepository.read().roles.some((role) => role.name === "专项验证角色"),
    ).toBe(false);
  });
  it("仍被账号使用的角色不能删除", async () => {
    mount("/settings?tab=roles&role=ops");
    fireEvent.click(await screen.findByRole("button", { name: "删除角色" }));
    const deletion = await screen.findByRole("dialog", { name: "删除角色" });
    expect(
      within(deletion).getByText(
        "仍有账号使用这个角色，请先为这些账号重新分配角色。",
      ),
    ).toBeTruthy();
    expect(
      within(deletion)
        .getByRole("button", { name: "确认删除" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("资料弹窗标题", () => {
  it.each(["教材", "反馈分类", "SO"])(
    "%s 页签按编辑和新增操作展示对应标题",
    async (type) => {
      mount("/settings?tab=basics");
      fireEvent.click(await screen.findByRole("tab", { name: type }));
      expect(screen.queryByRole("tab", { name: "下拉选项" })).toBeNull();
      fireEvent.click(
        type === "反馈分类"
          ? screen.getByRole("button", { name: "编辑一级分类 老师相关" })
          : screen.getAllByRole("button", { name: "编辑" })[0],
      );
      const editing = await screen.findByRole("dialog", {
        name: type === "反馈分类" ? "编辑一级分类" : `编辑${type}`,
      });
      expect(
        within(editing)
          .getByRole("textbox", {
            name: type === "反馈分类" ? "一级分类名称" : "名称",
          })
          .getAttribute("value"),
      ).toBeTruthy();
      fireEvent.click(within(editing).getByRole("button", { name: "取消" }));
      fireEvent.click(
        screen.getByRole("button", {
          name: type === "反馈分类" ? "新增一级分类" : "新增",
        }),
      );
      expect(
        await screen.findByRole("dialog", {
          name: type === "反馈分类" ? "新增一级分类" : `新增${type}`,
        }),
      ).toBeTruthy();
    },
  );
  it.each(["项目", "渠道"])("共享弹窗编辑%s时也展示对应类型", async (type) => {
    mount("/settings?tab=org");
    await screen.findByRole("table");
    const entry = demoRepository
      .read()
      .catalog.find((item) => item.type === type);
    if (!entry) throw new Error(`缺少${type}测试资料`);
    const row = screen.getByText(entry.name, { exact: true }).closest("tr");
    if (!row) throw new Error("未找到资料所在行");
    fireEvent.click(within(row).getByRole("button", { name: "编辑" }));
    expect(
      await screen.findByRole("dialog", {
        name: type === "反馈分类" ? "编辑一级分类" : `编辑${type}`,
      }),
    ).toBeTruthy();
  });
});

describe("反馈分类维护", () => {
  it("树状层级展示，编辑只填写当前级别名称", async () => {
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    expect(screen.getByRole("tree", { name: "反馈分类树" })).toBeTruthy();
    expect(
      screen
        .getByRole("treeitem", { name: "缺乏互动" })
        .getAttribute("aria-level"),
    ).toBe("3");
    const row = categoryRow("缺乏互动");
    fireEvent.click(
      within(row).getByRole("button", { name: "编辑三级分类 缺乏互动" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "编辑三级分类" });
    expect(
      within(dialog)
        .getByRole("textbox", { name: "三级分类名称" })
        .getAttribute("value"),
    ).toBe("缺乏互动");
    expect(within(dialog).getByText("老师相关 › 教学问题")).toBeTruthy();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "三级分类名称" }),
      { target: { value: "课堂互动不足" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(await screen.findByText("课堂互动不足")).toBeTruthy();
  });
  it("添加子分类自动带出上级，保存后显示在对应列", async () => {
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    const row = categoryRow("教学问题");
    fireEvent.click(
      within(row).getByRole("button", { name: "添加教学问题的子分类" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "新增三级分类" });
    expect(within(dialog).getByText("老师相关 › 教学问题")).toBeTruthy();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "三级分类名称" }),
      { target: { value: "板书不清晰" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(
      await screen.findByRole("treeitem", { name: "板书不清晰" }),
    ).toBeTruthy();
  });
  it("本地旧分类自动迁移且保留历史反馈", async () => {
    const original = demoRepository.read();
    const history = original.feedback;
    localStorage.setItem(
      "crazytalk-demo-v1",
      JSON.stringify({
        ...original,
        catalog: [
          {
            id: "old",
            type: "反馈分类",
            name: "老师相关 / 教学问题 / 缺乏互动",
            detail: "",
            enabled: true,
          },
        ],
      }),
    );
    const upgraded = demoRepository.refresh();
    expect(
      upgraded.catalog.filter((item) => item.type === "反馈分类"),
    ).toHaveLength(3);
    expect(upgraded.feedback).toEqual(history);
    const persisted = JSON.parse(
      localStorage.getItem("crazytalk-demo-v1") || "{}",
    );
    expect(
      persisted.catalog.find((item: { id: string }) => item.id === "old").name,
    ).toBe("缺乏互动");
  });
});

describe("反馈分类与录入联动", () => {
  it("停用上级先确认，确认后下级同时停用", async () => {
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    const row = categoryRow("老师相关");
    fireEvent.click(within(row).getByRole("button", { name: "更多" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "停用分类" }));
    const dialog = await screen.findByRole("dialog", { name: "停用反馈分类" });
    expect(
      demoRepository
        .read()
        .catalog.filter((item) => item.type === "反馈分类")
        .every((item) => item.enabled),
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "确认停用" }));
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .catalog.filter((item) => item.type === "反馈分类")
          .every((item) => !item.enabled),
      ).toBe(true),
    );
  });
  it("录入反馈按层级选取新名称，停用分类不会成为新选项", async () => {
    const root = demoRepository
      .read()
      .catalog.find(
        (item) => item.type === "反馈分类" && item.name === "老师相关",
      );
    const disabled = demoRepository
      .read()
      .catalog.find(
        (item) => item.type === "反馈分类" && item.name === "用错教材",
      );
    if (!root || !disabled) throw new Error("缺少分类");
    demoRepository.execute({
      type: "catalog.save",
      entry: { ...root, name: "课堂问题" },
    });
    demoRepository.execute({
      type: "catalog.save",
      entry: { ...disabled, enabled: false },
    });
    mount("/feedback?new=1");
    fireEvent.click(await screen.findByRole("combobox", { name: "一级分类" }));
    fireEvent.click(screen.getByRole("option", { name: "课堂问题" }));
    fireEvent.click(screen.getByRole("combobox", { name: "二级分类" }));
    fireEvent.click(screen.getByRole("option", { name: "教学问题" }));
    fireEvent.click(screen.getByRole("combobox", { name: "三级分类" }));
    expect(screen.queryByRole("option", { name: "用错教材" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "缺乏互动" }));
    fireEvent.click(screen.getByRole("button", { name: "添加分类" }));
    expect(screen.getByText("课堂问题 / 教学问题 / 缺乏互动")).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "一级分类" }));
    expect(screen.queryByRole("option", { name: "老师相关" })).toBeNull();
  });
});

describe("反馈分类单项维护与调整归属", () => {
  it("新增一级分类只填写一个名称", async () => {
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    fireEvent.click(screen.getByRole("button", { name: "新增一级分类" }));
    const dialog = await screen.findByRole("dialog", { name: "新增一级分类" });
    expect(within(dialog).getByText("无上级（一级分类）")).toBeTruthy();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "一级分类名称" }),
      { target: { value: "服务问题" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(
      await screen.findByRole("button", { name: "编辑一级分类 服务问题" }),
    ).toBeTruthy();
  });
  it("编辑上级只改当前名称，确认下级影响后保存", async () => {
    const history = demoRepository.read().feedback;
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    fireEvent.click(
      screen.getByRole("button", { name: "编辑二级分类 教学问题" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "编辑二级分类" });
    expect(within(dialog).getByText("老师相关")).toBeTruthy();
    expect(
      within(dialog).queryByRole("textbox", { name: "一级分类名称" }),
    ).toBeNull();
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "二级分类名称" }),
      { target: { value: "课堂教学" } },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    const confirm = await screen.findByRole("dialog", {
      name: "确认修改上级分类名称",
    });
    expect(within(confirm).getByText(/其下 2 个分类/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "确认保存" }));
    expect(
      await screen.findByRole("treeitem", { name: "课堂教学" }),
    ).toBeTruthy();
    expect(demoRepository.read().feedback).toEqual(history);
  });
  it("更多菜单支持调整归属，预览路径后移动，历史反馈不变", async () => {
    const history = demoRepository.read().feedback;
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    const row = categoryRow("缺乏互动");
    if (!row) throw new Error("缺少分类行");
    fireEvent.click(within(row).getByRole("button", { name: "更多" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "调整归属" }));
    const dialog = await screen.findByRole("dialog", { name: "调整分类归属" });
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: "所属二级分类" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "设备网络" }));
    expect(
      within(dialog).getByText("老师相关 › 设备网络 › 缺乏互动"),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "确认调整" }));
    expect(
      await screen.findByRole("treeitem", { name: "缺乏互动" }),
    ).toBeTruthy();
    expect(demoRepository.read().feedback).toEqual(history);
  });
  it("移动时排除会超过三级的目标，取消修改保护输入", async () => {
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    const row = categoryRow("教学问题");
    fireEvent.click(within(row).getByRole("button", { name: "更多" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "调整归属" }));
    const dialog = await screen.findByRole("dialog", { name: "调整分类归属" });
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: "所属二级分类" }),
    );
    expect(screen.queryByRole("option", { name: "设备网络" })).toBeNull();
    fireEvent.click(
      screen.getByRole("option", { name: "无二级上级（作为二级分类）" }),
    );
    fireEvent.click(
      within(dialog).getByRole("combobox", { name: "所属一级分类" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: "无上级（作为一级分类）" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    const discard = await screen.findByRole("dialog", {
      name: "有未保存的修改",
    });
    fireEvent.click(within(discard).getByRole("button", { name: "继续编辑" }));
    expect(within(dialog).getByText("教学问题")).toBeTruthy();
  });
});

describe("反馈分类树交互", () => {
  it("支持展开收起，搜索自动展开父级并显示匹配节点", async () => {
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    fireEvent.click(screen.getByRole("button", { name: "收起老师相关" }));
    expect(screen.queryByRole("treeitem", { name: "缺乏互动" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索名称" }), {
      target: { value: "互动" },
    });
    expect(
      screen
        .getByRole("treeitem", { name: "老师相关" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("treeitem", { name: "缺乏互动" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "设备网络" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索名称" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "全部展开" }));
    expect(screen.getByRole("treeitem", { name: "用错教材" })).toBeTruthy();
    expect(
      within(categoryRow("用错教材")).queryByRole("button", { name: /添加/ }),
    ).toBeNull();
  });
  it("删除未使用叶子需要确认，取消不删除，确认后节点消失", async () => {
    demoRepository.execute({
      type: "catalog.save",
      entry: {
        id: "unused-ui",
        type: "反馈分类",
        name: "可删除分类",
        detail: "",
        enabled: true,
        parentId: "",
      },
    });
    mount("/settings?tab=basics");
    fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
    fireEvent.click(
      within(categoryRow("可删除分类")).getByRole("button", { name: "更多" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除分类" }));
    let dialog = await screen.findByRole("dialog", { name: "删除反馈分类" });
    fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    expect(screen.getByRole("treeitem", { name: "可删除分类" })).toBeTruthy();
    fireEvent.click(
      within(categoryRow("可删除分类")).getByRole("button", { name: "更多" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除分类" }));
    dialog = await screen.findByRole("dialog", { name: "删除反馈分类" });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" }));
    await waitFor(() =>
      expect(screen.queryByRole("treeitem", { name: "可删除分类" })).toBeNull(),
    );
  });
  it.each(["老师相关", "缺乏互动"])(
    "%s 有下级或被使用，删除入口展示原因并禁止提交",
    async (name) => {
      mount("/settings?tab=basics");
      fireEvent.click(await screen.findByRole("tab", { name: "反馈分类" }));
      fireEvent.click(
        within(categoryRow(name)).getByRole("button", { name: "更多" }),
      );
      fireEvent.click(screen.getByRole("menuitem", { name: "删除分类" }));
      const dialog = await screen.findByRole("dialog", {
        name: "删除反馈分类",
      });
      expect(
        within(dialog)
          .getByRole("button", { name: "确认删除" })
          .hasAttribute("disabled"),
      ).toBe(true);
      expect(
        within(dialog).getByText(
          name === "老师相关" ? /仍有下级分类/ : /已被反馈使用/,
        ),
      ).toBeTruthy();
    },
  );
});

describe("业务规则轻量展示", () => {
  it("系统口径紧凑展示，移除未接入扣课开关，保留有效配置", async () => {
    mount("/settings?tab=rules");
    const conventions = await screen.findByRole("region", { name: "系统口径" });
    for (const value of [
      "1 课时 = 25 分钟",
      "30 分钟一格",
      "18:00 起",
      "向后检查 4 周",
    ])
      expect(within(conventions).getByText(value)).toBeTruthy();
    expect(
      within(conventions).getByRole("heading", { name: "系统口径", level: 3 }),
    ).toBeTruthy();
    expect(screen.queryByText(/演示按当前值判断后续操作/)).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "临开课改期按取消规则扣课" }),
    ).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: "老师培训达标后才能排课" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("spinbutton", { name: "课时快用完（剩余课时 ≤）" }),
    ).toBeTruthy();
  });
});

it("新建账号设置密码，编辑不回显，独立重置可生效", async () => {
 vi.stubGlobal("crypto", webcrypto);
 mount("/settings?tab=accounts");
 fireEvent.click(await screen.findByRole("button", {name:"新建账号"}));
 const form=within(screen.getByRole("dialog", {name:"新建团队账号"}));
 fireEvent.change(form.getByLabelText("姓名"),{target:{value:"密码测试"}});
 fireEvent.change(form.getByLabelText("登录手机号"),{target:{value:"13812345678"}});
 expect(form.getByRole("button",{name:"保存账号"}).hasAttribute("disabled")).toBe(true);
 fireEvent.change(form.getByLabelText("初始密码"),{target:{value:"Initial123"}});
 fireEvent.change(form.getByLabelText("确认密码"),{target:{value:"Initial124"}});
 expect(form.getByText("两次输入的密码不一致")).toBeTruthy();
 fireEvent.change(form.getByLabelText("确认密码"),{target:{value:"Initial123"}});
 fireEvent.click(form.getByRole("button",{name:"保存账号"}));
 await waitFor(()=>expect(screen.queryByRole("dialog",{name:"新建团队账号"})).toBeNull());
 const record=demoRepository.read().accounts.find(a=>a.name==="密码测试")!;
 expect(JSON.stringify(record)).not.toContain("Initial123");
 const row=screen.getByText("密码测试").closest("tr")!;
 fireEvent.click(within(row).getByRole("button",{name:"编辑"}));
 const edit=within(screen.getByRole("dialog",{name:"编辑团队账号"}));
 expect(edit.queryByLabelText("初始密码")).toBeNull();
 fireEvent.click(edit.getByRole("button",{name:"取消"}));
 fireEvent.click(within(row).getByRole("button",{name:"重置密码"}));
 const reset=within(screen.getByRole("dialog",{name:"重置 密码测试 的密码"}));
 fireEvent.change(reset.getByLabelText("新密码"),{target:{value:"Reset1234"}});
 fireEvent.change(reset.getByLabelText("确认新密码"),{target:{value:"Reset1234"}});
 fireEvent.click(reset.getByRole("button",{name:"确认重置"}));
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 await expect(changeDemoPassword(record.id,"Initial123","Another123")).rejects.toThrow();
 await changeDemoPassword(record.id,"Reset1234","Another123");
});

it("个人菜单修改密码校验当前密码并更新演示会话", async () => {
 vi.stubGlobal("crypto", webcrypto);
 mount("/settings?tab=accounts");
 fireEvent.click(await screen.findByRole("button",{name:/Rita.*教务运营/}));
 fireEvent.click(screen.getByRole("button",{name:"修改密码"}));
 const form=within(screen.getByRole("dialog",{name:"修改密码"}));
 fireEvent.change(form.getByLabelText("当前密码"),{target:{value:"Wrong123"}});
 fireEvent.change(form.getByLabelText("新密码"),{target:{value:"Personal123"}});
 fireEvent.change(form.getByLabelText("确认新密码"),{target:{value:"Personal123"}});
 fireEvent.click(form.getByRole("button",{name:"确认修改"}));
 expect(await form.findByText("当前密码不正确")).toBeTruthy();
 fireEvent.change(form.getByLabelText("当前密码"),{target:{value:"Demo12345"}});
 fireEvent.click(form.getByRole("button",{name:"确认修改"}));
 await waitFor(()=>expect(screen.queryByRole("dialog",{name:"修改密码"})).toBeNull());
 const record=demoRepository.read().accounts.find(a=>a.name==="Rita")!;
 await changeDemoPassword(record.id,"Personal123","Demo12345");
});

it("项目编辑后列表和已保存资料均显示所属渠道和月应上课数", async () => {
  mount("/settings?tab=org");
  const row = (await screen.findByText("K12", {exact:true})).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", {name:"编辑"}));
  const dialog = await screen.findByRole("dialog", {name:"编辑项目"});
  fireEvent.click(within(dialog).getByRole("combobox", {name:/所属渠道/}));
  fireEvent.click(screen.getByRole("option", {name:"许老师"}));
  fireEvent.change(within(dialog).getByRole("spinbutton", {name:/月应上课数/}), {target:{value:"12"}});
  fireEvent.click(within(dialog).getByRole("button",{name:"保存"}));
  await screen.findByText(/许老师 · 每月 12 节/);
  expect(demoRepository.read().catalog.find(p => p.id === "pr0")).toMatchObject({parentId:"ch0",monthlyLessons:12});
});
