// @vitest-environment jsdom
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
import {
  demoRepository,
  DEMO_STORAGE_KEY,
} from "../../../../packages/shared/src/repository";
import App from "../App";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
function fixture(permissions?: string[], scope = "全部") {
  const data = structuredClone(demoRepository.read());
  data.lessons.forEach((lesson, index) => {
    lesson.attendance = "正常";
    lesson.sync = index < 2 ? "未同步" : "已同步";
    lesson.syncReason = index === 0 ? "课程取消尚未同步到 ClassIn" : "";
  });
  data.lessons[0].date = "2020-01-01";
  data.lessons[1].date = "2099-01-01";
  if (permissions)
    data.roles.push({
      id: "sync-reader",
      name: "同步查看员",
      description: "专项验证",
      permissions,
      scope,
    });
  localStorage.setItem(
    `${DEMO_STORAGE_KEY}:nancy-sync-notice-2026-11-05`,
    "done",
  );
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  demoRepository.refresh();
}
function mount(path = "/settings?tab=classin") {
  const router = createMemoryRouter([{ path: "*", element: <App /> }], {
    initialEntries: [path],
  });
  routers.push(router);
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DemoProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>,
  );
  return router;
}
async function becomeReader() {
  fireEvent.click(await screen.findByRole("button", { name: "Rita 教务运营" }));
  fireEvent.click(screen.getByRole("button", { name: "同步查看员" }));
}
beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
  vi.stubGlobal(
    "AbortController",
    class {
      constructor() {
        return transferableAbortController();
      }
    },
  );
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

describe("统一同步入口", () => {
  it("同步管理直接列出异常，列表只提供按课程跳转", async () => {
    fixture();
    const router = mount("/lessons?tab=all&view=unsynced");
    expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull();
    expect(screen.queryByText("课程取消尚未同步到 ClassIn")).toBeNull();
    fireEvent.click(
      (await screen.findAllByRole("link", { name: "同步异常" }))[0],
    );
    expect(router.state.location.pathname).toBe("/settings");
    expect(router.state.location.search).toContain("tab=classin&lesson=");
    expect(
      await screen.findByRole("heading", { name: "ClassIn 同步管理" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "重新同步" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "查看全部同步异常" }));
    expect(screen.getAllByRole("button", { name: "重新同步" })).toHaveLength(2);
  });
  it("重试集中处理，成功后移除任务", async () => {
    fixture();
    mount();
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "重新同步" }))[0],
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "重新同步" })).toHaveLength(
        1,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "重新同步" }));
    expect(await screen.findByText("暂无同步异常")).toBeTruthy();
    expect(
      demoRepository.read().lessons.filter((l) => l.sync === "未同步"),
    ).toHaveLength(0);
  });
  it("看板跳转统一管理", async () => {
    fixture();
    const router = mount("/");
    const card = await screen.findByRole("article", { name: "同步异常" });
    expect(within(card).getByText(/有 2 节课程/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button"));
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/settings?tab=classin",
    );
  });
  it("只读账号可查看但不能重试", async () => {
    fixture(["dashboard.overview", "lesson.view", "classin.view"]);
    const router = mount();
    await becomeReader();
    await act(async () => {
      await router.navigate("/settings?tab=classin");
    });
    expect(await screen.findByText("课程取消尚未同步到 ClassIn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull();
  });
  it("没有课程查看权限不能读取队列", async () => {
    fixture(["classin.view", "sync.retry"]);
    const router = mount();
    await becomeReader();
    await act(async () => {
      await router.navigate("/settings?tab=classin");
    });
    expect(
      await screen.findByText("当前账号没有课程查看权限，请联系管理员。"),
    ).toBeTruthy();
    expect(screen.queryByText("课程取消尚未同步到 ClassIn")).toBeNull();
    expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull();
  });
  it("没有ClassIn查看权限不提供跳转", async () => {
    fixture(["lesson.view"]);
    const router = mount();
    await becomeReader();
    await act(async () => {
      await router.navigate("/lessons?view=unsynced");
    });
    expect(
      await screen.findAllByText("同步异常 · 请联系有权限的管理员"),
    ).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "同步异常" })).toBeNull();
  });
  it("同步管理遵循角色项目数据范围", async () => {
    fixture(["classin.view", "lesson.view"], "K12");
    const data = structuredClone(demoRepository.read());
    data.lessons[0].studentId = data.students.find(
      (s) => s.project === "K12",
    )!.id;
    data.lessons[1].studentId = data.students.find(
      (s) => s.project !== "K12",
    )!.id;
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    demoRepository.refresh();
    const router = mount();
    await becomeReader();
    await act(async () => {
      await router.navigate("/settings?tab=classin");
    });
    expect(await screen.findByText("共 1 条 · 每页 25 条")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});
