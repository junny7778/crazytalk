

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
export async function executeBusinessCommand(command: Command) {
  const result = await businessRequest("/commands", "POST", { command: await persistMedia(command), requestId: crypto.randomUUID() });
  return { message: z.string().parse(result.message), data: stateSchema.parse(result.data), undoToken: z.string().optional().parse(result.undoToken) };
}
