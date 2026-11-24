import { act as testAct } from "@testing-library/react";
// @vitest-environment jsdom
import { transferableAbortController } from "node:util";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
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
function fixture() {
  const data = structuredClone(demoRepository.read());
  data.lessons.forEach((lesson, index) => {
    lesson.attendance = "正常";
    lesson.sync = index < 2 ? "未同步" : "已同步";
    lesson.syncReason = index === 0 ? "课程取消尚未同步到 ClassIn" : "";
  });
  data.lessons[0].date = "2020-01-01";
  data.lessons[1].date = "2099-01-01";
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

it("打开指定课程的同步日志，显示该课的结果与原因", async () => {
  fixture();
  const lesson = demoRepository.read().lessons[0];
  mount("/settings?tab=classin&lesson=" + lesson.id);
  const row = await screen.findByRole("row", { name: /课程取消尚未同步到 ClassIn/ });
  expect(within(row).getByText("课程同步")).toBeTruthy();
  expect(within(row).getByText("未同步")).toBeTruthy();
  expect(screen.getByText("共 1 条 · 每页 25 条")).toBeTruthy();
});

it("连接异常时仍可查看已有同步日志", async () => {
  fixture();
  const data = structuredClone(demoRepository.read());
  data.connection = "异常";
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  demoRepository.refresh();
  mount("/settings?tab=classin&lesson=" + data.lessons[0].id);
  expect(await screen.findByText("ClassIn 尚未连接。")).toBeTruthy();
  expect(screen.getByRole("row", { name: /课程取消尚未同步到 ClassIn/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /重试|重新同步/ })).toBeNull();
});

it("未找到指定课程日志时，仍可返回全部日志查看其他课程", async () => {
  fixture();
  mount("/settings?tab=classin&lesson=missing-lesson");
  expect(await screen.findByText("暂无同步日志")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "查看全部同步日志" }));
  expect(await screen.findByRole("row", { name: /2099-01-01.*课程同步.*未同步/ })).toBeTruthy();
  expect(screen.queryByText("暂无同步日志")).toBeNull();
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
  {
    const target = await screen.findByRole("button", { name: "通知" });
    await testAct(async () => {
      fireEvent.click(target);
    });
  }
  const notification = within(screen.getByRole("dialog", { name: "通知" }));
  expect(notification.queryByText("课程同步需要处理")).toBeNull();
  expect(notification.queryByRole("button", { name: /同步管理/ })).toBeNull();
});

it("老师未到自动生成站内信，通知打开对应的上课记录", async () => {
  fixture();
  const lesson = demoRepository
    .read()
    .lessons.find((l) => l.status === "待确认")!;
  demoRepository.execute({
    type: "lesson.attendance",
    id: lesson.id,
    person: "老师",
    result: "未到堂",
    at: new Date().toISOString(),
  });
  mount("/lessons");
  {
    const target = await screen.findByRole("button", { name: "通知" });
    await testAct(async () => {
      fireEvent.click(target);
    });
  }
  const inbox = within(screen.getByRole("dialog", { name: "通知" }));
  expect(inbox.getByText("提醒 TM 老师没来")).toBeTruthy();
  await testAct(async () => {
    fireEvent.click(inbox.getByRole("button", { name: "查看上课记录" }));
  });
  expect(await screen.findByText(/老师未到堂提醒/)).toBeTruthy();
});
