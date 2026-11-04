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

describe("ClassIn 未同步课程导航与处理", () => {
  it("连接页仅展示数量，跳转包含历史和未来课程且没有额外筛选", async () => {
    fixture();
    const router = mount();
    expect(await screen.findByText("有 2 节课程未同步到 ClassIn")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "需要留意的课程" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看课程" }));
    expect(router.state.location.pathname + router.state.location.search).toBe(
      "/lessons?tab=all&view=unsynced",
    );
    expect(await screen.findByText("课程取消尚未同步到 ClassIn")).toBeTruthy();
    expect(screen.getByText("课程尚未同步到 ClassIn")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });
  it("看板与连接页数量一致，项目切换不缩减未同步队列", async () => {
    fixture();
    const router = mount("/");
    const card = await screen.findByRole("article", { name: "未同步课程" });
    expect(within(card).getByText(/有 2 节课程/)).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "看板项目" }));
    fireEvent.click(screen.getByRole("option", { name: "乐说" }));
    expect(
      within(screen.getByRole("article", { name: "未同步课程" })).getByText(
        /有 2 节课程/,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "去检查同步：未同步课程" }),
    );
    expect(router.state.location.search).toBe("?tab=all&view=unsynced");
    expect(
      await screen.findAllByRole("button", { name: "重新同步" }),
    ).toHaveLength(2);
  });
  it("逐条重试后从筛选结果移除，最终显示空状态且连接页数量归零", async () => {
    fixture();
    const router = mount("/lessons?tab=all&view=unsynced");
    fireEvent.click(
      (await screen.findAllByRole("button", { name: "重新同步" }))[0],
    );
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "重新同步" })).toHaveLength(
        1,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "重新同步" }));
    expect(await screen.findByText("没有符合条件的未同步课程")).toBeTruthy();
    expect(
      demoRepository
        .read()
        .lessons.filter((lesson) => lesson.sync === "未同步"),
    ).toHaveLength(0);
    await act(async () => {
      await router.navigate("/settings?tab=classin");
    });
    expect(await screen.findByText("暂无未同步课程")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "查看课程" })).toBeNull();
  });
  it("详情展示实际原因，并可重新同步", async () => {
    fixture();
    mount("/lessons?tab=all&view=unsynced");
    await screen.findAllByRole("button", { name: "详情" });
    const reason = screen.getByText("课程取消尚未同步到 ClassIn");
    const row = reason.closest("tr");
    if (!row) throw new Error("缺少课程行");
    fireEvent.click(within(row).getByRole("button", { name: "详情" }));
    const dialog = await screen.findByRole("dialog", { name: "课程详情" });
    expect(within(dialog).getByText("课程取消尚未同步到 ClassIn")).toBeTruthy();
    expect(
      within(dialog).queryByText(/老师看到的时间可能还是原时间/),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "重新同步" }));
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("button", { name: "重新同步" }),
      ).toBeNull(),
    );
  });
  it("只有查看权限也能从看板进入，列表和详情均无重试按钮", async () => {
    fixture(["dashboard.overview", "lesson.view", "classin.view"]);
    mount();
    await becomeReader();
    fireEvent.click(
      await screen.findByRole("button", { name: "去检查同步：未同步课程" }),
    );
    await screen.findAllByRole("button", { name: "详情" });
    expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "详情" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "课程详情" });
    expect(within(dialog).getByText("课程尚未同步到 ClassIn")).toBeTruthy();
    expect(
      within(dialog).queryByRole("button", { name: "重新同步" }),
    ).toBeNull();
  });
  it("无课程查看权限时连接页不提供跳转", async () => {
    fixture(["classin.view"]);
    const router = mount();
    await becomeReader();
    await act(async () => {
      await router.navigate("/settings?tab=classin");
    });
    expect(await screen.findByText("有 2 节课程未同步到 ClassIn")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "查看课程" })).toBeNull();
  });
});

describe("未同步课程数据范围", () => {
  it("连接页与课程列表仅展示当前角色授权项目的课程", async () => {
    fixture(["classin.view", "lesson.view"], "K12");
    const data = structuredClone(demoRepository.read());
    const k12 = data.students.find((student) => student.project === "K12");
    const other = data.students.find((student) => student.project !== "K12");
    if (!k12 || !other) throw new Error("缺少项目样本");
    data.lessons[0].studentId = k12.id;
    data.lessons[1].studentId = other.id;
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
    demoRepository.refresh();
    const router = mount();
    await becomeReader();
    await act(async () => {
      await router.navigate("/settings?tab=classin");
    });
    expect(await screen.findByText("有 1 节课程未同步到 ClassIn")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看课程" }));
    await screen.findByRole("heading", { name: "上课记录", level: 1 });
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });
});
