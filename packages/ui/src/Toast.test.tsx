// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ToastProvider, useToast } from "./index";

afterEach(cleanup);

function Action({ undo }: { undo: () => Promise<void> }) {
  const toast = useToast();
  return <button onClick={() => toast("已确认", { undo })}>确认</button>;
}

it("撤销等待后端完成，失败显示原业务错误并保留重试入口", async () => {
  let reject!: (reason: Error) => void;
  const undo = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  render(
    <ToastProvider>
      <Action undo={undo} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  fireEvent.click(screen.getByRole("button", { name: "撤销" }));
  expect(
    (screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => reject(new Error("撤销时间已过，请更正结果")));
  expect(screen.getByText("撤销时间已过，请更正结果")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "撤销" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  undo.mockResolvedValueOnce();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "撤销" })),
  );
  expect(screen.queryByRole("button", { name: "撤销" })).toBeNull();
});
