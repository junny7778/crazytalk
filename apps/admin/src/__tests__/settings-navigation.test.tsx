import { act as testAct } from "@testing-library/react";
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
import { DEMO_STORAGE_KEY, demoRepository } from "../../../../packages/shared/src/repository";
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
  await testAct(async () => { fireEvent.change(
    await screen.findByRole("spinbutton", {
      name: "课时快用完（剩余课时 ≤）",
    }),
    { target: { value: "6" } },
  ); });
}

describe("独立设置布局与导航", () => {
  it("隐藏业务侧栏和顶栏工具，展示分组及账号菜单", async () => {
    mount();
    const nav = await screen.findByRole("navigation", { name: "设置导航" });
    expect(screen.queryByRole("link", { name: "学员中心" })).toBeNull();
    expect(screen.queryByRole("button", { name: /搜索学员或老师/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "通知" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rita 超级管理员" })).toBeTruthy();
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
    { const target = await screen.findByRole("button", { name: "设置" }); await testAct(async () => { fireEvent.click(target); }); }
    await screen.findByRole("navigation", { name: "设置导航" });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回工作台" })); });
    await screen.findByRole("link", { name: "学员中心" });
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/students?project=K12",
    );
    expect(localStorage.getItem("ct-sidebar")).toBe("open");
  });
  it("直接访问设置时返回数据看板", async () => {
    const router = mount("/settings?tab=audit");
    { const target = await screen.findByRole("button", { name: "返回工作台" }); await testAct(async () => { fireEvent.click(target); }); }
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
  it("页签切换支持地址与历史导航", async () => {
    const router = mount();
    { const target = await screen.findByRole("button", { name: "操作日志" }); await testAct(async () => { fireEvent.click(target); }); }
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
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "团队账号" })); });
    let dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" })); });
    expect(
      screen
        .getByRole("spinbutton", { name: "课时快用完（剩余课时 ≤）" })
        .getAttribute("value"),
    ).toBe("6");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "团队账号" })); });
    dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" })); });
    await screen.findByRole("heading", { name: "团队账号" });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "业务规则" })); });
    expect(
      (await screen.findByRole("button", { name: "保存规则" })).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
  });
  it("规则保存成功后可以直接返回，实际数据更新", async () => {
    mount("/settings?tab=rules");
    await changeRule();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存规则" })); });
    const dialog = await screen.findByRole("dialog", {
      name: "确认修改业务规则",
    });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "确认保存" })); });
    await waitFor(() => expect(demoRepository.read().rules.lowBalance).toBe(6));
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回工作台" })); });
    expect(screen.queryByRole("dialog", { name: "有未保存的修改" })).toBeNull();
    await screen.findByRole("link", { name: "学员中心" });
  });
  it("浏览器返回和工作台返回均拦截未保存修改", async () => {
    const router = mount("/settings");
    { const target = await screen.findByRole("button", { name: "业务规则" }); await testAct(async () => { fireEvent.click(target); }); }
    await changeRule();
    await act(async () => {
      await router.navigate(-1);
    });
    let dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" })); });
    expect(router.state.location.search).toBe("?tab=rules");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回工作台" })); });
    dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" })); });
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
  it("账号编辑关闭时保护输入，放弃后不写入数据", async () => {
    mount();
    { const target = await screen.findByRole("button", { name: "新建账号" }); await testAct(async () => { fireEvent.click(target); }); }
    const account = await screen.findByRole("dialog", { name: "新建团队账号" });
    await testAct(async () => { fireEvent.change(within(account).getByRole("textbox", { name: "姓名" }), {
      target: { value: "专项测试账号" },
    }); });
    await testAct(async () => { fireEvent.click(within(account).getByRole("button", { name: "取消" })); });
    const dialog = await screen.findByRole("dialog", {
      name: "有未保存的修改",
    });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" })); });
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
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "教务 系统角色" })); });
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
    { const target = await screen.findByRole("button", { name: "编辑权限" }); await testAct(async () => { fireEvent.click(target); }); }
    expect(
      screen.getByRole("button", { name: "保存权限" }).hasAttribute("disabled"),
    ).toBe(true);
    await testAct(async () => { fireEvent.change(screen.getByRole("textbox", { name: "角色名称" }), {
      target: { value: "教务新名称" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存权限" })); });
    const confirm = await screen.findByRole("dialog", {
      name: "确认修改角色权限",
    });
    await testAct(async () => { fireEvent.click(within(confirm).getByRole("button", { name: "确认修改" })); });
    await waitFor(() =>
      expect(
        demoRepository.read().roles.find((role) => role.id === "ops")?.name,
      ).toBe("教务新名称"),
    );
    expect(
      await screen.findByRole("button", { name: "编辑权限" }),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回角色列表" })); });
    expect(
      await screen.findByRole("button", { name: "教务新名称 系统角色" }),
    ).toBeTruthy();
  });
  it("未改动的编辑可以直接返回，修改后返回保护草稿", async () => {
    mount("/settings?tab=roles&role=ops");
    { const target = await screen.findByRole("button", { name: "编辑权限" }); await testAct(async () => { fireEvent.click(target); }); }
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回角色列表" })); });
    expect(await screen.findByRole("table")).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "教务 系统角色" })); });
    expect(screen.queryByRole("textbox", { name: "角色名称" })).toBeNull();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "编辑权限" })); });
    await testAct(async () => { fireEvent.change(screen.getByRole("textbox", { name: "说明" }), {
      target: { value: "修改中" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回角色列表" })); });
    let dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "继续编辑" })); });
    expect(
      screen.getByRole("textbox", { name: "说明" }).getAttribute("value"),
    ).toBe("修改中");
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回角色列表" })); });
    dialog = await screen.findByRole("dialog", { name: "有未保存的修改" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" })); });
    expect(await screen.findByRole("table")).toBeTruthy();
  });
  it("新建角色在详情中编辑，取消新建只需一次放弃确认", async () => {
    mount("/settings?tab=roles");
    { const target = await screen.findByRole("button", { name: "新建角色" }); await testAct(async () => { fireEvent.click(target); }); }
    expect(
      await screen.findByRole("textbox", { name: "角色名称" }),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "取消编辑" })); });
    const dialog = await screen.findByRole("dialog", {
      name: "有未保存的修改",
    });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "放弃修改" })); });
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("超级管理员详情只能查看，可以复制成可编辑新角色", async () => {
    mount("/settings?tab=roles&role=admin");
    await screen.findByRole("heading", { name: "超级管理员" });
    expect(screen.queryByRole("button", { name: "编辑权限" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除角色" })).toBeNull();
    const count = screen
      .getAllByRole("checkbox", { checked: true })
      .filter((input) => input.closest("label[title]")).length;
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "复制角色" })); });
    expect(
      await screen.findByRole("textbox", { name: "角色名称" }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole("checkbox", { checked: true })
        .filter((input) => input.closest("label[title]")),
    ).toHaveLength(count);
    expect(
      screen
        .getAllByRole("checkbox")
        .every((input) => !input.hasAttribute("disabled")),
    ).toBe(true);
  });
  it("无效角色地址只显示空状态提示", async () => {
    mount("/settings?tab=roles&role=missing");
    expect(await screen.findByText("角色不存在或已删除")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "返回角色列表" })).toBeNull();
  });
});

describe("角色详情权限与删除约束", () => {
  it("新建角色保留权限依赖，保存后可从列表再次查看并删除", async () => {
    mount("/settings?tab=roles");
    { const target = await screen.findByRole("button", { name: "新建角色" }); await testAct(async () => { fireEvent.click(target); }); }
    await testAct(async () => { fireEvent.change(await screen.findByRole("textbox", { name: "角色名称" }), {
      target: { value: "专项验证角色" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "新建学员" })); });
    expect(
      screen.getByRole("checkbox", { name: "查看学员" }).matches(":checked"),
    ).toBe(true);
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "查看学员" })); });
    expect(
      screen.getByRole("checkbox", { name: "新建学员" }).matches(":checked"),
    ).toBe(false);
    await testAct(async () => { fireEvent.click(screen.getByRole("checkbox", { name: "查看学员" })); });
    const studentAll = screen.getByRole("checkbox", { name: "学员全部权限" });
    const dashboardAll = screen.getByRole("checkbox", { name: "数据看板全部权限" });
    expect(studentAll).toHaveProperty("indeterminate", true);
    await testAct(async () => { fireEvent.click(dashboardAll); });
    await testAct(async () => { fireEvent.click(studentAll); });
    expect(studentAll).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "加课时" })).toHaveProperty("checked", true);
    await testAct(async () => { fireEvent.click(studentAll); });
    expect(screen.getByRole("checkbox", { name: "查看学员" })).toHaveProperty("checked", false);
    expect(dashboardAll).toHaveProperty("checked", true);
    await testAct(async () => { fireEvent.click(studentAll); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "保存权限" })); });
    const confirm = await screen.findByRole("dialog", {
      name: "确认修改角色权限",
    });
    await testAct(async () => { fireEvent.click(within(confirm).getByRole("button", { name: "确认修改" })); });
    await waitFor(() =>
      expect(
        demoRepository
          .read()
          .roles.some(
            (role) =>
              role.name === "专项验证角色" &&
              role.permissions.includes("student.view") &&
              role.permissions.includes("credit.add") &&
              role.permissions.includes("dashboard.overview") &&
              role.permissions.length === 13,
          ),
      ).toBe(true),
    );
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "返回角色列表" })); });
    await testAct(async () => { fireEvent.click(
      await screen.findByRole("button", { name: "专项验证角色" }),
    ); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "删除角色" })); });
    const deletion = await screen.findByRole("dialog", { name: "删除角色" });
    await testAct(async () => { fireEvent.change(within(deletion).getByRole("textbox"), {
      target: { value: "专项验证角色" },
    }); });
    await testAct(async () => { fireEvent.click(within(deletion).getByRole("button", { name: "确认删除" })); });
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(
      demoRepository.read().roles.some((role) => role.name === "专项验证角色"),
    ).toBe(false);
  });
  it.each([
    ["ops", "教务"],
    ["tm", "老师管理（TM）"],
  ])("内置角色 %s 可保存权限变更，不能删除", async (id, name) => {
    mount(`/settings?tab=roles&role=${id}`);
    await screen.findByRole("heading", { name });
    expect(screen.queryByRole("button", { name: "删除角色" })).toBeNull();
    expect(() => demoRepository.execute({ type: "role.delete", id }))
      .toThrow("系统角色不能删除");

    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "编辑权限" }));
    });
    const exportPermission = screen.getByRole("checkbox", { name: "导出看板" });
    expect(exportPermission).toHaveProperty("checked", false);
    await testAct(async () => { fireEvent.click(exportPermission); });
    await testAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存权限" }));
    });
    const dialog = await screen.findByRole("dialog", { name: "确认修改角色权限" });
    await testAct(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "确认修改" }));
    });
    await screen.findByRole("button", { name: "编辑权限" });
    expect(demoRepository.read().roles.find((item) => item.id === id)?.permissions)
      .toContain("dashboard.export");
    expect(screen.getByRole("checkbox", { name: "导出看板" }))
      .toHaveProperty("checked", true);
  });
  it("仍被账号使用的自定义角色不能删除", async () => {
    const state = demoRepository.read();
    const role = state.roles.find((item) => item.id === "ops")!;
    const account = state.accounts.find((item) => item.roleId === "ops")!;
    demoRepository.execute({
      type: "role.save",
      role: { ...role, id: "custom-ops", name: "自定义教务" },
    });
    demoRepository.execute({
      type: "account.save",
      account: { ...account, roleId: "custom-ops" },
    });
    mount("/settings?tab=roles&role=custom-ops");
    { const target = await screen.findByRole("button", { name: "删除角色" }); await testAct(async () => { fireEvent.click(target); }); }
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
      { const target = await screen.findByRole("tab", { name: type }); await testAct(async () => { fireEvent.click(target); }); }
      expect(screen.queryByRole("tab", { name: "下拉选项" })).toBeNull();
      await testAct(async () => { fireEvent.click(
        type === "反馈分类"
          ? screen.getByRole("button", { name: "编辑一级分类 老师相关" })
          : screen.getAllByRole("button", { name: "编辑" })[0],
      ); });
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
      await testAct(async () => { fireEvent.click(within(editing).getByRole("button", { name: "取消" })); });
      await testAct(async () => { fireEvent.click(
        screen.getByRole("button", {
          name: type === "反馈分类" ? "新增一级分类" : "新增",
        }),
      ); });
      expect(
        await screen.findByRole("dialog", {
          name: type === "反馈分类" ? "新增一级分类" : `新增${type}`,
        }),
      ).toBeTruthy();
    },
  );
  it.each(["项目", "渠道"])("共享弹窗编辑%s时也展示对应类型", async (type) => {
    mount("/settings?tab=org");
    fireEvent.click(
      await screen.findByRole("tab", {
        name: type === "渠道" ? "渠道（一级）" : "项目（课包/课程产品）",
      }),
    );
    await screen.findByRole("table");
    const entry = demoRepository
      .read()
      .catalog.find((item) => item.type === type);
    if (!entry) throw new Error(`缺少${type}测试资料`);
    const row = screen.getByText(entry.name, { exact: true }).closest("tr");
    if (!row) throw new Error("未找到资料所在行");
    await testAct(async () => { fireEvent.click(within(row).getByRole("button", { name: "编辑" })); });
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
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    expect(screen.getByRole("tree", { name: "反馈分类树" })).toBeTruthy();
    expect(
      screen
        .getByRole("treeitem", { name: "缺乏互动" })
        .getAttribute("aria-level"),
    ).toBe("3");
    const row = categoryRow("缺乏互动");
    await testAct(async () => { fireEvent.click(
      within(row).getByRole("button", { name: "编辑三级分类 缺乏互动" }),
    ); });
    const dialog = await screen.findByRole("dialog", { name: "编辑三级分类" });
    expect(
      within(dialog)
        .getByRole("textbox", { name: "三级分类名称" })
        .getAttribute("value"),
    ).toBe("缺乏互动");
    expect(within(dialog).getByText("老师相关 › 教学问题")).toBeTruthy();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    await testAct(async () => { fireEvent.change(
      within(dialog).getByRole("textbox", { name: "三级分类名称" }),
      { target: { value: "课堂互动不足" } },
    ); });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "保存" })); });
    expect(await screen.findByText("课堂互动不足")).toBeTruthy();
  });
  it("添加子分类自动带出上级，保存后显示在对应列", async () => {
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    const row = categoryRow("教学问题");
    await testAct(async () => { fireEvent.click(
      within(row).getByRole("button", { name: "添加教学问题的子分类" }),
    ); });
    const dialog = await screen.findByRole("dialog", { name: "新增三级分类" });
    expect(within(dialog).getByText("老师相关 › 教学问题")).toBeTruthy();
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(2);
    await testAct(async () => { fireEvent.change(
      within(dialog).getByRole("textbox", { name: "三级分类名称" }),
      { target: { value: "板书不清晰" } },
    ); });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "保存" })); });
    expect(
      await screen.findByRole("treeitem", { name: "板书不清晰" }),
    ).toBeTruthy();
  });
  it("本地旧分类自动迁移且保留历史反馈", async () => {
    const original = demoRepository.read();
    const history = original.feedback;
    localStorage.setItem(
      DEMO_STORAGE_KEY,
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
      localStorage.getItem(DEMO_STORAGE_KEY) || "{}",
    );
    expect(
      persisted.catalog.find((item: { id: string }) => item.id === "old").name,
    ).toBe("缺乏互动");
  });
});

describe("反馈分类与录入联动", () => {
  it("停用上级先确认，确认后下级同时停用", async () => {
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    const row = categoryRow("老师相关");
    await testAct(async () => { fireEvent.click(within(row).getByRole("button", { name: "更多" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "停用分类" })); });
    const dialog = await screen.findByRole("dialog", { name: "停用反馈分类" });
    expect(
      demoRepository
        .read()
        .catalog.filter((item) => item.type === "反馈分类")
        .every((item) => item.enabled),
    ).toBe(true);
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "确认停用" })); });
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
    await openSelect(await screen.findByRole("combobox", { name: "一级分类" }));
    await selectOption(screen.getByRole("option", { name: "课堂问题" }));
    await openSelect(screen.getByRole("combobox", { name: "二级分类" }));
    await selectOption(screen.getByRole("option", { name: "教学问题" }));
    await openSelect(screen.getByRole("combobox", { name: "三级分类" }));
    expect(screen.queryByRole("option", { name: "用错教材" })).toBeNull();
    await selectOption(screen.getByRole("option", { name: "缺乏互动" }));
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "添加分类" })); });
    expect(screen.getByText("课堂问题 / 教学问题 / 缺乏互动")).toBeTruthy();
    await openSelect(screen.getByRole("combobox", { name: "一级分类" }));
    expect(screen.queryByRole("option", { name: "老师相关" })).toBeNull();
  });
});

describe("反馈分类单项维护与调整归属", () => {
  it("新增一级分类只填写一个名称", async () => {
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "新增一级分类" })); });
    const dialog = await screen.findByRole("dialog", { name: "新增一级分类" });
    expect(within(dialog).getByText("无上级（一级分类）")).toBeTruthy();
    await testAct(async () => { fireEvent.change(
      within(dialog).getByRole("textbox", { name: "一级分类名称" }),
      { target: { value: "服务问题" } },
    ); });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "保存" })); });
    expect(
      await screen.findByRole("button", { name: "编辑一级分类 服务问题" }),
    ).toBeTruthy();
  });
  it("编辑上级只改当前名称，确认下级影响后保存", async () => {
    const history = demoRepository.read().feedback;
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    await testAct(async () => { fireEvent.click(
      screen.getByRole("button", { name: "编辑二级分类 教学问题" }),
    ); });
    const dialog = await screen.findByRole("dialog", { name: "编辑二级分类" });
    expect(within(dialog).getByText("老师相关")).toBeTruthy();
    expect(
      within(dialog).queryByRole("textbox", { name: "一级分类名称" }),
    ).toBeNull();
    await testAct(async () => { fireEvent.change(
      within(dialog).getByRole("textbox", { name: "二级分类名称" }),
      { target: { value: "课堂教学" } },
    ); });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "保存" })); });
    const confirm = await screen.findByRole("dialog", {
      name: "确认修改上级分类名称",
    });
    expect(within(confirm).getByText(/其下 2 个分类/)).toBeTruthy();
    await testAct(async () => { fireEvent.click(within(confirm).getByRole("button", { name: "确认保存" })); });
    expect(
      await screen.findByRole("treeitem", { name: "课堂教学" }),
    ).toBeTruthy();
    expect(demoRepository.read().feedback).toEqual(history);
  });
  it("更多菜单支持调整归属，预览路径后移动，历史反馈不变", async () => {
    const history = demoRepository.read().feedback;
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    const row = categoryRow("缺乏互动");
    if (!row) throw new Error("缺少分类行");
    await testAct(async () => { fireEvent.click(within(row).getByRole("button", { name: "更多" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "调整归属" })); });
    const dialog = await screen.findByRole("dialog", { name: "调整分类归属" });
    await openSelect(within(dialog).getByRole("combobox", { name: "所属二级分类" }));
    await selectOption(screen.getByRole("option", { name: "设备网络" }));
    expect(
      within(dialog).getByText("老师相关 › 设备网络 › 缺乏互动"),
    ).toBeTruthy();
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "确认调整" })); });
    expect(
      await screen.findByRole("treeitem", { name: "缺乏互动" }),
    ).toBeTruthy();
    expect(demoRepository.read().feedback).toEqual(history);
  });
  it("移动时排除会超过三级的目标，取消修改保护输入", async () => {
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    const row = categoryRow("教学问题");
    await testAct(async () => { fireEvent.click(within(row).getByRole("button", { name: "更多" })); });
    await testAct(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "调整归属" })); });
    const dialog = await screen.findByRole("dialog", { name: "调整分类归属" });
    await openSelect(within(dialog).getByRole("combobox", { name: "所属二级分类" }));
    expect(screen.queryByRole("option", { name: "设备网络" })).toBeNull();
    await selectOption(screen.getByRole("option", { name: "无二级上级（作为二级分类）" }));
    await openSelect(within(dialog).getByRole("combobox", { name: "所属一级分类" }));
    await selectOption(screen.getByRole("option", { name: "无上级（作为一级分类）" }));
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "取消" })); });
    const discard = await screen.findByRole("dialog", {
      name: "有未保存的修改",
    });
    await testAct(async () => { fireEvent.click(within(discard).getByRole("button", { name: "继续编辑" })); });
    expect(within(dialog).getByText("教学问题")).toBeTruthy();
  });
});

describe("反馈分类树交互", () => {
  it("支持展开收起，搜索自动展开父级并显示匹配节点", async () => {
    mount("/settings?tab=basics");
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "收起老师相关" })); });
    expect(screen.queryByRole("treeitem", { name: "缺乏互动" })).toBeNull();
    await testAct(async () => { fireEvent.change(screen.getByRole("textbox", { name: "搜索名称" }), {
      target: { value: "互动" },
    }); });
    expect(
      screen
        .getByRole("treeitem", { name: "老师相关" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("treeitem", { name: "缺乏互动" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "设备网络" })).toBeNull();
    await testAct(async () => { fireEvent.change(screen.getByRole("textbox", { name: "搜索名称" }), {
      target: { value: "" },
    }); });
    await testAct(async () => { fireEvent.click(screen.getByRole("button", { name: "全部展开" })); });
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
    { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
    await testAct(async () => { fireEvent.click(
      within(categoryRow("可删除分类")).getByRole("button", { name: "更多" }),
    ); });
    await testAct(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "删除分类" })); });
    let dialog = await screen.findByRole("dialog", { name: "删除反馈分类" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "取消" })); });
    expect(screen.getByRole("treeitem", { name: "可删除分类" })).toBeTruthy();
    await testAct(async () => { fireEvent.click(
      within(categoryRow("可删除分类")).getByRole("button", { name: "更多" }),
    ); });
    await testAct(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "删除分类" })); });
    dialog = await screen.findByRole("dialog", { name: "删除反馈分类" });
    await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "确认删除" })); });
    await waitFor(() =>
      expect(screen.queryByRole("treeitem", { name: "可删除分类" })).toBeNull(),
    );
  });
  it.each(["老师相关", "缺乏互动"])(
    "%s 有下级或被使用，删除入口展示原因并禁止提交",
    async (name) => {
      mount("/settings?tab=basics");
      { const target = await screen.findByRole("tab", { name: "反馈分类" }); await testAct(async () => { fireEvent.click(target); }); }
      await testAct(async () => { fireEvent.click(
        within(categoryRow(name)).getByRole("button", { name: "更多" }),
      ); });
      await testAct(async () => { fireEvent.click(screen.getByRole("menuitem", { name: "删除分类" })); });
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
 { const target = await screen.findByRole("button", {name:"新建账号"}); await testAct(async () => { fireEvent.click(target); }); }
 const form=within(screen.getByRole("dialog", {name:"新建团队账号"}));

 await openSelect(form.getByRole("combobox", {name:"所属队伍"}));
 await selectOption(screen.getByRole("option", {name:"A队"}));
 await openSelect(form.getByRole("combobox", {name:"队内组别"}));
 await selectOption(screen.getByRole("option", {name:"二组"}));
 await testAct(async () => { fireEvent.change(form.getByLabelText("姓名"),{target:{value:"密码测试"}}); });
 await testAct(async () => { fireEvent.change(form.getByLabelText("登录账号"),{target:{value:"13812345678"}}); });
 expect(form.getByRole("button",{name:"保存账号"}).hasAttribute("disabled")).toBe(true);
 await testAct(async () => { fireEvent.change(form.getByLabelText("初始密码"),{target:{value:"Initial123!"}}); });
 await testAct(async () => { fireEvent.change(form.getByLabelText("确认密码"),{target:{value:"Initial124!"}}); });
 expect(form.getByText("两次输入的密码不一致")).toBeTruthy();
 await testAct(async () => { fireEvent.change(form.getByLabelText("确认密码"),{target:{value:"Initial123!"}}); });
 await testAct(async () => { fireEvent.click(form.getByRole("button",{name:"保存账号"})); });
 await waitFor(()=>expect(screen.queryByRole("dialog",{name:"新建团队账号"})).toBeNull());
 const record=demoRepository.read().accounts.find(a=>a.name==="密码测试")!;
 expect(JSON.stringify(record)).not.toContain("Initial123!");
 const row=screen.getByText("密码测试").closest("tr")!;
 await testAct(async () => { fireEvent.click(within(row).getByRole("button",{name:"编辑"})); });
 const edit=within(screen.getByRole("dialog",{name:"编辑团队账号"}));
 expect(edit.queryByLabelText("初始密码")).toBeNull();
 await testAct(async () => { fireEvent.click(edit.getByRole("button",{name:"取消"})); });
 await testAct(async () => { fireEvent.click(within(row).getByRole("button",{name:"重置密码"})); });
 const reset=within(screen.getByRole("dialog",{name:"重置 密码测试 的密码"}));
 await testAct(async () => { fireEvent.change(reset.getByLabelText("新密码"),{target:{value:"Reset1234!"}}); });
 await testAct(async () => { fireEvent.change(reset.getByLabelText("确认新密码"),{target:{value:"Reset1234!"}}); });
 await testAct(async () => { fireEvent.click(reset.getByRole("button",{name:"确认重置"})); });
 await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
 await expect(changeDemoPassword(record.id,"Initial123!","Another123!")).rejects.toThrow();
 await changeDemoPassword(record.id,"Reset1234!","Another123!");
});

it("个人菜单修改密码校验当前密码并更新演示会话", async () => {
 vi.stubGlobal("crypto", webcrypto);
 mount("/settings?tab=accounts");
 { const target = await screen.findByRole("button",{name:/Rita.*超级管理员/}); await testAct(async () => { fireEvent.click(target); }); }
 await testAct(async () => { fireEvent.click(screen.getByRole("button",{name:"修改密码"})); });
 const form=within(screen.getByRole("dialog",{name:"修改密码"}));
 await testAct(async () => { fireEvent.change(form.getByLabelText("当前密码"),{target:{value:"Wrong123"}}); });
 await testAct(async () => { fireEvent.change(form.getByLabelText("新密码"),{target:{value:"Personal123!"}}); });
 await testAct(async () => { fireEvent.change(form.getByLabelText("确认新密码"),{target:{value:"Personal123!"}}); });
 await testAct(async () => { fireEvent.click(form.getByRole("button",{name:"确认修改"})); });
 expect(await form.findByText("当前密码不正确")).toBeTruthy();
 await testAct(async () => { fireEvent.change(form.getByLabelText("当前密码"),{target:{value:"Demo12345"}}); });
 await testAct(async () => { fireEvent.click(form.getByRole("button",{name:"确认修改"})); });
 await waitFor(()=>expect(screen.queryByRole("dialog",{name:"修改密码"})).toBeNull());
 const record=demoRepository.read().accounts.find(a=>a.name==="Rita")!;
 await changeDemoPassword(record.id,"Personal123!","Another123!");
});

it("项目编辑可选择一级所属渠道、月应上课数与结算单价", async () => {
  mount("/settings?tab=org");
  fireEvent.click(await screen.findByRole("tab", { name: "项目（课包/课程产品）" }));
  const row = (await screen.findByText("K12", { exact: true })).closest("tr")!;
  await testAct(async () => { fireEvent.click(within(row).getByRole("button", { name: "编辑" })); });
  const dialog = await screen.findByRole("dialog", { name: "编辑项目" });
  await openSelect(within(dialog).getByRole("combobox", { name: "所属一级渠道" }));
  await selectOption(screen.getByRole("option", { name: "许老师" }));
  await testAct(async () => { fireEvent.change(within(dialog).getByRole("spinbutton", { name: /月应上课数/ }), { target: { value: "12" } }); });
  await testAct(async () => { fireEvent.change(within(dialog).getByRole("spinbutton", { name: /结算单价/ }), { target: { value: "150" } }); });
  await testAct(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "保存" })); });
  await within(row).findByRole("cell", { name: "许老师" });
  expect(within(row).getByRole("cell", { name: "12" })).toBeTruthy();
  expect(demoRepository.read().catalog.find(p => p.id === "pr0")).toMatchObject({
    parentId: "ch0",
    channelIds: ["ch0"],
    monthlyLessons: 12,
    unitPrice: 150,
  });
});

async function openSelect(trigger: HTMLElement) {
  await testAct(async () => { trigger.focus(); fireEvent.click(trigger); });
}
async function selectOption(option: HTMLElement) {
  const trigger = screen.getByRole("combobox", { expanded: true });
  await testAct(async () => { fireEvent.click(option); });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
}

it("新增渠道可选择合作项目，重新编辑回显并可取消配对", async () => {
  mount("/settings?tab=org");
  fireEvent.click(await screen.findByRole("button", {name:"新建渠道"}));
  let dialog = await screen.findByRole("dialog", {name:"新增渠道"});
  fireEvent.change(within(dialog).getByRole("textbox", {name:/名称/}), {target:{value:"双向配对渠道"}});
  fireEvent.click(within(dialog).getByRole("checkbox", {name:"K12"}));
  fireEvent.click(within(dialog).getByRole("checkbox", {name:"14"}));
  fireEvent.click(within(dialog).getByRole("button", {name:"保存"}));
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
  const channel = demoRepository.read().catalog.find(c=>c.name==="双向配对渠道")!;
  expect(demoRepository.read().catalog.filter(p=>p.channelIds?.includes(channel.id)).map(p=>p.id)).toEqual(["pr0","pr1"]);
  const row = screen.getByText("双向配对渠道", {exact:true}).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", {name:"编辑"}));
  dialog = await screen.findByRole("dialog", {name:"编辑渠道"});
  expect((within(dialog).getByRole("checkbox", {name:"K12"}) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(within(dialog).getByRole("checkbox", {name:"K12"}));
  fireEvent.click(within(dialog).getByRole("button", {name:"保存"}));
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
  expect(demoRepository.read().catalog.filter(p=>p.channelIds?.includes(channel.id)).map(p=>p.id)).toEqual(["pr1"]);
});


it("渠道和项目分 Tab 展示各自字段，新建类型跟随当前 Tab", async () => {
  mount("/settings?tab=org");
  await screen.findByRole("button", {name:"新建渠道"});
  expect(screen.getByRole("columnheader", {name:"下属项目（课包）"})).toBeTruthy();
  expect(screen.queryByRole("columnheader", {name:"月应上课数"})).toBeNull();
  expect(screen.queryByRole("columnheader", {name:"类型"})).toBeNull();
  fireEvent.click(screen.getByRole("tab", {name:"项目（课包/课程产品）"}));
  expect(screen.getByRole("columnheader", {name:"所属一级渠道"})).toBeTruthy();
  expect(screen.getByRole("columnheader", {name:"月应上课数"})).toBeTruthy();
  expect(screen.getByRole("columnheader", {name:"结算单价"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name:"新建项目"}));
  const dialog = await screen.findByRole("dialog", {name:"新增项目"});
  expect(within(dialog).getByRole("textbox", {name:/名称/})).toBeTruthy();
  expect(within(dialog).getByRole("combobox", {name:"所属一级渠道"})).toBeTruthy();
  expect(within(dialog).getByRole("spinbutton", {name:/月应上课数/})).toBeTruthy();
});

it("无可选队伍时禁用队伍和组别，点击不会展开数据范围", async () => {
  for (const team of demoRepository.read().catalog.filter(c=>c.type==="队伍")) {
    demoRepository.execute({type:"catalog.save",entry:{...team,enabled:false}});
  }
  mount("/settings?tab=accounts");
  fireEvent.click(await screen.findByRole("button", {name:"新建账号"}));
  const dialog = await screen.findByRole("dialog");
  const team = within(dialog).getByRole("combobox", {name:"所属队伍"});
  expect(team.hasAttribute("disabled")).toBe(true);
  expect(within(dialog).getByRole("combobox", {name:"队内组别"}).hasAttribute("disabled")).toBe(true);
  expect(within(dialog).getByText(/暂无可选队伍/)).toBeTruthy();
  fireEvent.click(team);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(within(dialog).getByRole("combobox", {name:"数据范围"}).getAttribute("aria-expanded")).toBe("false");
});

it.each([false, true])("队伍与组别无数据或无搜索结果时显示统一空状态（搜索：%s）", async (searchOnly) => {
  if (!searchOnly) {
    const data = demoRepository.read();
    data.catalog = data.catalog.filter(c => c.type !== "队伍" && c.type !== "组别");
  }
  mount("/settings?tab=basics");
  fireEvent.click(await screen.findByRole("tab", {name:"队伍与组别"}));
  if (searchOnly) fireEvent.change(screen.getByPlaceholderText("搜索名称"), {target:{value:"不存在的队伍名称"}});
  const empty = await screen.findByText("没有符合条件的资料");
  expect(empty.closest(".empty-state")).toBeTruthy();
  expect(empty.closest(".empty-state")!.querySelector("button")).toBeNull();
  expect(screen.queryByRole("button", {name:"编辑队伍"})).toBeNull();
});

it("普通登录账号可保存，密码不一致显示字段错误且修正后解除禁用", async () => {
  vi.stubGlobal("crypto", webcrypto);
  mount("/settings?tab=accounts");
  fireEvent.click(await screen.findByRole("button", {name:"新建账号"}));
  const form = within(await screen.findByRole("dialog", {name:"新建团队账号"}));

 await openSelect(form.getByRole("combobox", {name:"所属队伍"}));
 await selectOption(screen.getByRole("option", {name:"A队"}));
 await openSelect(form.getByRole("combobox", {name:"队内组别"}));
 await selectOption(screen.getByRole("option", {name:"二组"}));
  fireEvent.change(form.getByRole("textbox", {name:"姓名"}), {target:{value:"普通账号验证"}});
  fireEvent.change(form.getByRole("textbox", {name:"登录账号"}), {target:{value:"rita.test"}});
  fireEvent.change(form.getByLabelText("初始密码"), {target:{value:"Valid123!"}});
  fireEvent.change(form.getByLabelText("确认密码"), {target:{value:"Different123!"}});
  expect(form.getByText("两次输入的密码不一致").classList.contains("danger")).toBe(true);
  expect(form.getByLabelText("确认密码").getAttribute("aria-invalid")).toBe("true");
  const save = form.getByRole("button", {name:"保存账号"});
  expect(save.hasAttribute("disabled")).toBe(true);
  fireEvent.change(form.getByLabelText("确认密码"), {target:{value:"Valid123!"}});
  expect(form.queryByText("两次输入的密码不一致")).toBeNull();
  expect(save.hasAttribute("disabled")).toBe(false);
  fireEvent.click(save);
  await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
  expect(demoRepository.read().accounts.some(a=>a.phone==="rita.test")).toBe(true);
});

it("普通账号可选择全部本队本组，管理员使用全部", async () => {
 mount("/settings?tab=accounts");
 fireEvent.click(await screen.findByRole("button", {name:"新建账号"}));
 const form=within(screen.getByRole("dialog", {name:"新建团队账号"}));
 await openSelect(form.getByRole("combobox", {name:"数据范围"}));
 expect(screen.getAllByRole("option").map(o=>o.textContent)).toEqual(["全部", "本组", "本队"]);
 await selectOption(screen.getByRole("option", {name:"本队"}));
 await openSelect(form.getByRole("combobox", {name:"角色"}));
 await selectOption(screen.getByRole("option", {name:"超级管理员"}));
 await openSelect(form.getByRole("combobox", {name:"数据范围"}));
 expect(screen.getAllByRole("option").map(o=>o.textContent)).toEqual(["全部"]);
 await selectOption(screen.getByRole("option", {name:"全部"}));
 await openSelect(form.getByRole("combobox", {name:"角色"}));
 await selectOption(screen.getByRole("option", {name:"教务"}));
 expect(form.getByRole("combobox", {name:"数据范围"}).textContent).toBe("本组");
});

it("老师标签库仅提供启停操作，并保留标签说明", async () => {
 mount("/settings?tab=basics");
 fireEvent.click(await screen.findByRole("tab", {name:"老师标签"}));
 const library=within(screen.getByRole("table", {name:"老师标签库"}));
 expect(library.getAllByRole("columnheader").map(header => header.textContent)).toEqual(
   ["标签类型", "标签", "含义", "具体表现", "匹配建议", "状态", "操作"],
 );
 const row=library.getByText("有亲和力").closest("tr")!;
 const tag=demoRepository.read().catalog.find(entry => entry.id === "tt-35")!;
 expect(screen.queryByRole("button", {name:"新增"})).toBeNull();
 expect(library.queryByRole("button", {name:"编辑"})).toBeNull();
 expect(within(row).getByRole("cell", {name:"有亲和力"})).toBeTruthy();
 for (const cell of [tag.tagMeaning, tag.tagExample, tag.tagAdvice]) {
   if (cell) expect(within(row).getByRole("cell", {name:cell})).toBeTruthy();
 }
 fireEvent.click(within(row).getByRole("button", {name:"停用"}));
 await waitFor(() => {
   expect(within(row).getByText("已停用")).toBeTruthy();
   expect(demoRepository.read().catalog.find(entry => entry.id === tag.id)).toEqual({...tag, enabled:false});
 });
 fireEvent.click(within(row).getByRole("button", {name:"启用"}));
 await waitFor(() => {
   expect(within(row).getByRole("button", {name:"停用"})).toBeTruthy();
   expect(demoRepository.read().catalog.find(entry => entry.id === tag.id)).toEqual(tag);
 });
 fireEvent.click(screen.getByRole("tab", {name:"教材"}));
 expect(screen.getByRole("button", {name:"新增"})).toBeTruthy();
});

it.each(["ops", "tm"])("%s 的 ClassIn 关联独立提交，不保存账号编辑草稿", async (roleId) => {
  const account = demoRepository.read().accounts.find(a => a.roleId === roleId && a.enabled)!;
  mount("/settings?tab=accounts");
  let row = within(await screen.findByRole("table")).getByText(account.name).closest("tr")!;
  await testAct(async () => { fireEvent.click(within(row).getByRole("button", {name:"编辑"})); });
  const edit = within(screen.getByRole("dialog", {name:"编辑团队账号"}));
  expect(edit.queryByLabelText("ClassIn 账号")).toBeNull();
  expect(edit.queryByRole("button", {name:"确认关联"})).toBeNull();
  await testAct(async () => { fireEvent.change(edit.getByLabelText("姓名"), {target:{value:"不应保存的草稿"}}); });
  await testAct(async () => { fireEvent.click(edit.getByRole("button", {name:"取消"})); });
  await testAct(async () => { fireEvent.click(screen.getByRole("button", {name:"放弃修改"})); });
  let finish:(response:Response)=>void=()=>{};
  const lookup=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));
  vi.stubGlobal("fetch", lookup);
  row = within(screen.getByRole("table")).getByText(account.name).closest("tr")!;
  await testAct(async () => { fireEvent.click(within(row).getByRole("button", {name:"关联"})); });
  const dialog = within(screen.getByRole("dialog", {name:"关联 ClassIn 账号"}));
  expect(dialog.queryByRole("button", {name:"保存账号"})).toBeNull();
  expect(dialog.getByLabelText("姓名")).toHaveProperty("value", account.name);
  expect(dialog.getByLabelText("姓名")).toHaveProperty("disabled", true);
  expect(dialog.getByLabelText("角色")).toHaveProperty("value", demoRepository.read().roles.find(r=>r.id===roleId)!.name);
  expect(dialog.getByLabelText("角色")).toHaveProperty("disabled", true);
  expect(dialog.getByLabelText("ClassIn 账号")).toHaveProperty("disabled", false);
  expect(dialog.queryByRole("button", {name:"取消"})).toBeNull();
  await testAct(async () => { fireEvent.change(dialog.getByLabelText("ClassIn 账号"), {target:{value:"staff@example.com"}}); });
  await testAct(async () => { fireEvent.click(dialog.getByRole("button", {name:"确认关联"})); });
  expect(dialog.getByRole("button", {name:"正在关联"}).hasAttribute("disabled")).toBe(true);
  expect(lookup).toHaveBeenCalledTimes(1);
  await testAct(async () => { finish(new Response(JSON.stringify({uid:"998800",addedToInstitution:true}), {status:200})); });
  await waitFor(()=>expect(screen.queryByRole("dialog", {name:"关联 ClassIn 账号"})).toBeNull());
  const saved = demoRepository.read().accounts.find(a=>a.id===account.id)!;
  expect(saved).toMatchObject({...account, classInUid:"998800", classInAccount:"staff@example.com"});
  row=within(screen.getByRole("table")).getByText(account.name).closest("tr")!;
  expect(within(row).queryByText("已关联")).toBeNull();
  expect(within(row).getByText("staff@example.com")).toBeTruthy();
  expect(within(row).queryByRole("button", {name:"关联"})).toBeNull();
});
