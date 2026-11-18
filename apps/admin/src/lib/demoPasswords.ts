import { accountPasswordSchema } from "@crazytalk/shared";

const passwords = new Map<string, string>();
export const demoInitialPassword = "Demo12345";
export function passwordError(password: string, confirmation: string) {
  const result = accountPasswordSchema.safeParse(password);
  if (!result.success) return result.error.issues[0].message;
  if (password !== confirmation) return "两次输入的密码不一致";
  return "";
}
async function digest(value: string) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function setDemoPassword(id: string, password: string) {
  const error = passwordError(password, password);
  if (error) throw new Error(error);
  passwords.set(id, await digest(password));
}
export async function changeDemoPassword(id: string, current: string, next: string) {
  const expected = passwords.get(id) ?? await digest(demoInitialPassword);
  if (await digest(current) !== expected) throw new Error("当前密码不正确");
  if (current === next) throw new Error("新密码不能与当前密码相同");
  await setDemoPassword(id, next);
}
