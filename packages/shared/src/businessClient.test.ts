// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { businessRequest, businessAccountId, setBusinessIdentity } from "./businessClient";
afterEach(() => vi.unstubAllGlobals());
it("空代理错误响应显示服务状态而非JSON解析错误", async () => {
  vi.stubGlobal("fetch", async () => new Response("", { status: 502 }));
  await expect(businessRequest("/state")).rejects.toThrow("HTTP 502");
});
it("会话失效即使返回空响应也清除身份并通知界面", async () => {
  setBusinessIdentity({ accountId: "test", roleId: "admin", name: "test", csrfToken: "token" });
  const expired = vi.fn(); window.addEventListener("crazytalk-session-expired", expired);
  vi.stubGlobal("fetch", async () => new Response("", { status: 401 }));
  await expect(businessRequest("/state")).rejects.toThrow("HTTP 401");
  expect(businessAccountId()).toBe(""); expect(expired).toHaveBeenCalledTimes(1);
  window.removeEventListener("crazytalk-session-expired", expired);
});
it("正常业务错误保持服务器说明", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ message: "余额不足" }), { status: 400 }));
  await expect(businessRequest("/commands")).rejects.toThrow("余额不足");
});
