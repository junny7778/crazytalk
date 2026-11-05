import { expect, it } from "vitest";
import { changeDemoPassword, demoInitialPassword, passwordError, setDemoPassword } from "./demoPasswords";
it("校验长度、字母数字及二次确认", () => {
 expect(passwordError("abc", "abc")).toContain("8–64");
 expect(passwordError("abcdefgh", "abcdefgh")).toContain("字母和数字");
 expect(passwordError("Abcd12345", "Abcd12346")).toContain("不一致");
 expect(passwordError("Abcd12345", "Abcd12345")).toBe("");
});
it("初始密码、重置和修改只对目标账号生效，拒绝错误旧密码", async () => {
 await setDemoPassword("password-test-a", "Initial123");
 await expect(changeDemoPassword("password-test-a", "Wrong123", "Changed123")).rejects.toThrow("当前密码");
 await changeDemoPassword("password-test-a", "Initial123", "Changed123");
 await expect(changeDemoPassword("password-test-a", "Changed123", "Changed123")).rejects.toThrow("相同");
 await setDemoPassword("password-test-a", "Reset1234");
 await expect(changeDemoPassword("password-test-a", "Changed123", "Another123")).rejects.toThrow();
 await changeDemoPassword("password-test-a", "Reset1234", "Another123");
 await changeDemoPassword("password-test-b", demoInitialPassword, "Another123");
});
