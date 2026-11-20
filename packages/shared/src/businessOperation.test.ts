// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createSeed } from "./seed";
import { executeBusinessCommand, setBusinessIdentity } from "./businessClient";
const data = createSeed();
const command = {
  type: "lesson.cancel" as const,
  id: data.lessons[0].id,
  reason: "取消",
  responsibility: "平台" as const,
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  setBusinessIdentity({
    accountId: "u1",
    roleId: "admin",
    name: "Admin",
    csrfToken: "token",
  });
});
afterEach(() => vi.unstubAllGlobals());
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
it("入队后仍等待实际结果；并发点击只提交一次", async () => {
  let complete: (value: Response) => void = () => {};
  const result = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const fetcher = vi.fn(async (url: string) =>
    url === "/api/commands"
      ? response({ message: "本地已保存", operationId: "operation", data })
      : result,
  );
  vi.stubGlobal("fetch", fetcher);
  const accepted = vi.fn();
  let finished = false;
  const first = executeBusinessCommand(command, accepted).then((r) => {
    finished = true;
    return r;
  });
  const second = executeBusinessCommand(command, accepted);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(finished).toBe(false);
  expect(accepted).toHaveBeenCalledTimes(1);
  complete(response({ status: "completed", message: "课程已取消", data }));
  expect((await first).message).toBe("课程已取消");
  await second;
  expect(
    fetcher.mock.calls.filter(([path]) => path === "/api/commands"),
  ).toHaveLength(1);
  expect(localStorage.length).toBe(0);
});
it("批量失败后再次提交沿用原请求标识；不生成第二批课程", async () => {
  const ids: string[] = [];
  let failed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/commands") {
        ids.push(JSON.parse(String(init?.body)).requestId);
        return response({ message: "保存", operationId: "operation", data });
      }
      return response({
        status: failed ? "failed" : "completed",
        message: failed ? "部分课程未排成" : "排课完成",
        data,
      });
    }),
  );
  await expect(executeBusinessCommand(command)).rejects.toThrow(
    "部分课程未排成",
  );
  expect(localStorage.length).toBe(1);
  failed = false;
  expect((await executeBusinessCommand(command)).message).toBe("排课完成");
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  expect(localStorage.length).toBe(0);
});
it("读取结果断网只报读取错误，不重发业务写请求", async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url === "/api/commands")
      return response({ message: "保存", operationId: "operation", data });
    throw new TypeError("offline");
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(executeBusinessCommand(command)).rejects.toThrow(
    "暂时无法获取处理结果",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(localStorage.length).toBe(1);
});
