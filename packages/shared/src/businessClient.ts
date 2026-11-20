

import { z } from "zod";
import { stateSchema, type Command } from "./model";

export const businessMode = () => (import.meta as ImportMeta & { env?: { MODE: string } }).env?.MODE === "business";
export const identitySchema = z.object({
  accountId: z.string(), roleId: z.string(), teacherId: z.string().optional(),
  name: z.string(), csrfToken: z.string(),
});
export type Identity = z.infer<typeof identitySchema>;
let csrfToken = "";
let accountId = "";
export const businessAccountId = () => accountId;
export const businessHeaders = (): Record<string, string> => businessMode() ? { "X-CSRF-Token": csrfToken } : {};
export function setBusinessIdentity(identity: Identity) { csrfToken = identity.csrfToken; accountId = identity.accountId; }
export class BusinessRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
export async function businessRequest(path: string, method = "GET", body?: unknown, signal?: AbortSignal, requestId?: string) {
  const response = await fetch("/api" + path, {
    method, credentials: "same-origin", signal,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, ...(requestId ? { "X-Request-Id": requestId } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) { csrfToken = ""; accountId = ""; window.dispatchEvent(new Event("crazytalk-session-expired")); }
  const result = await response.json().catch(() => { throw new BusinessRequestError(response.ok ? "服务响应格式异常，请联系管理员" : `服务请求失败（HTTP ${response.status}），请确认业务服务已启动`, response.status); });
  if (!response.ok) throw new BusinessRequestError(typeof result.message === "string" ? result.message : result.error || "请求失败", response.status);
  return result;
}
async function persistMedia(value: unknown): Promise<unknown> {
  if (typeof value === "string" && /^data:(image|video)\//.test(value)) {
    const blob = await (await fetch(value)).blob();
    const response = await fetch("/api/files/raw", { method: "POST", headers: { ...businessHeaders(), "Content-Type": blob.type }, body: blob });
    const uploaded = await response.json();
    if (!response.ok) throw new Error(uploaded.message || "文件上传失败");
    return z.string().parse(uploaded.url);
  }
  if (Array.isArray(value)) return Promise.all(value.map(persistMedia));
  if (value !== null && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await persistMedia(item)]));
    return Object.fromEntries(entries);
  }
  return value;
}
const commandFlights = new Map<string, Promise<CommandResult>>();
type CommandResult = { message: string; data: z.infer<typeof stateSchema>; undoToken?: string };
export async function waitForBusinessOperation(id: string, acceptState?: (data: z.infer<typeof stateSchema>) => void): Promise<CommandResult> {
  const deadline = Date.now() + 120000;
  while (true) {
    let raw;
    try { raw = await businessRequest("/commands/" + id, "GET", undefined, AbortSignal.timeout(15000)); }
    catch { throw new Error("暂时无法获取处理结果，请稍后查看；已提交的操作会继续处理。"); }
    const result = z.object({ status: z.enum(["processing", "completed", "failed"]), message: z.string(), data: stateSchema }).parse(raw);
    acceptState?.(result.data);
    if (result.status === "completed") return result;
    if (result.status === "failed") throw new Error(result.message);
    if (Date.now() >= deadline) throw new Error("操作仍在处理中，可以关闭页面，稍后查看结果。");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
export async function executeBusinessCommand(command: Command, acceptState?: (data: z.infer<typeof stateSchema>) => void) {
  // Keep only a digest and request ID, never account passwords or command contents.
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(command))))).map(v => v.toString(16).padStart(2, "0")).join("");
  const key = "crazytalk-operation:" + accountId + ":" + digest;
  const flight = commandFlights.get(key);
  if (flight) return flight;
  const pending = (async () => {
    const previousId = localStorage.getItem(key);
    const requestId = previousId || crypto.randomUUID();
    localStorage.setItem(key, requestId);
    let result;
    try { result = await businessRequest("/commands", "POST", { command: await persistMedia(command), requestId }, AbortSignal.timeout(30000)); }
    catch (error) {
      if (!previousId && error instanceof BusinessRequestError && error.status >= 400 && error.status < 500) localStorage.removeItem(key);
      throw error;
    }
    const saved = { message: z.string().parse(result.message), data: stateSchema.parse(result.data), undoToken: z.string().optional().parse(result.undoToken) };
    acceptState?.(saved.data);
    const completed = result.operationId ? await waitForBusinessOperation(z.string().parse(result.operationId), acceptState) : saved;
    localStorage.removeItem(key);
    return { ...completed, undoToken: saved.undoToken };
  })();
  commandFlights.set(key, pending);
  try { return await pending; } finally { commandFlights.delete(key); }
}
