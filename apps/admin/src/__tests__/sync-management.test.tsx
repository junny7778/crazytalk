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

it("只接收传输问题，账号关联和人工核实不进入同步队列", async () => {
  fixture();
  const data = structuredClone(demoRepository.read());
  data.lessons.forEach((l) => {
    l.sync = "已同步";
    l.attendance = "正常";
  });
  const missing = data.lessons[0];
  missing.date = "2020-01-01";
  missing.status = "待确认";
  missing.attendance = "无数据";
  const account = data.lessons[1];
  account.date = "2020-01-01";
  account.status = "待确认";
  account.attendance = "账号待关联";
  const uncertain = data.lessons[2];
  uncertain.date = "2020-01-01";
  uncertain.status = "待确认";
  uncertain.teacherAttendance = ["待核实"];
  const future = data.lessons[3];
  future.date = "2099-01-01";
  future.status = "未开始";
  future.attendance = "无数据";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  demoRepository.refresh();
  mount();
  expect(await screen.findByText("共 1 条 · 每页 25 条")).toBeTruthy();
  expect(screen.getByText("考勤数据拉取")).toBeTruthy();
  expect(screen.getByText("未收到考勤数据")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull();
  expect(screen.getByText("考勤拉取尚未接入")).toBeTruthy();
  expect(
    demoRepository.read().lessons.find((l) => l.id === missing.id)?.attendance,
  ).toBe("无数据");
});
it("连接异常时禁止单条和批量重试", async () => {
  fixture();
  const data = structuredClone(demoRepository.read());
  data.connection = "异常";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  demoRepository.refresh();
  mount();
  expect(
    await screen.findByText("请先恢复 ClassIn 连接，再重试同步。"),
  ).toBeTruthy();
  for (const button of screen.getAllByRole("button", {
    name: /重新同步|批量重试课程推送/,
  }))
    expect(button.hasAttribute("disabled")).toBe(true);
});

it("批量重试只处理课程推送，保留缺失考勤任务", async () => {
  fixture();
  const data = structuredClone(demoRepository.read());
  const missing = data.lessons[2];
  missing.date = "2020-01-01";
  missing.status = "待确认";
  missing.attendance = "无数据";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  demoRepository.refresh();
  mount();
  fireEvent.click(
    await screen.findByRole("button", { name: "批量重试课程推送（2）" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "重新同步" })).toBeNull(),
  );
  expect(screen.getByText("共 1 条 · 每页 25 条")).toBeTruthy();
  expect(screen.getByText("考勤数据拉取")).toBeTruthy();
  expect(
    demoRepository.read().lessons.find((l) => l.id === missing.id)?.attendance,
  ).toBe("无数据");
});
it("没有异常时通知不显示同步告警", async () => {
  fixture();
  const data = structuredClone(demoRepository.read());
  data.lessons.forEach((l) => {
    l.sync = "已同步";
    l.attendance = "正常";
  });
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  demoRepository.refresh();
  mount("/lessons");
  fireEvent.click(await screen.findByRole("button", { name: "通知" }));
  const notification = within(screen.getByRole("dialog", { name: "通知" }));
  expect(notification.queryByText("课程同步需要处理")).toBeNull();
  expect(notification.queryByRole("button", { name: /同步管理/ })).toBeNull();
});
