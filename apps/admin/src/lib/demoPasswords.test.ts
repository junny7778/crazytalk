import { expect, it } from "vitest";
import { changeDemoPassword, demoInitialPassword, passwordError, setDemoPassword } from "./demoPasswords";
it("校验 8–16 位、四类字符及二次确认", () => {
  for (const valid of ["Abcdef1!", "Abcdefghijklmn1!"]) {
    expect(passwordError(valid, valid)).toBe("");
  }
  for (const invalid of ["Abcde1!", "Abcdefghijklmno1!", "abcdef1!", "ABCDEF1!", "Abcdefg!", "Abcdef12", "Abcdef1😀", "Abcdef1！", "Abcdef1! "]) {
    expect(passwordError(invalid, invalid)).not.toBe("");
  }
  expect(passwordError("Abcdef1!", "abcdef1!")).toBe("两次输入的密码不一致");
});
it("初始密码、重置和修改只对目标账号生效，拒绝错误旧密码", async () => {
 await setDemoPassword("password-test-a", "Initial123!");
 await expect(changeDemoPassword("password-test-a", "Wrong123", "Changed123!")).rejects.toThrow("当前密码");
 await changeDemoPassword("password-test-a", "Initial123!", "Changed123!");
 await expect(changeDemoPassword("password-test-a", "Changed123!", "Changed123!")).rejects.toThrow("相同");
 await setDemoPassword("password-test-a", "Reset1234!");
 await expect(changeDemoPassword("password-test-a", "Changed123!", "Another123!")).rejects.toThrow();
 await changeDemoPassword("password-test-a", "Reset1234!", "Another123!");
 await changeDemoPassword("password-test-b", demoInitialPassword, "Another123!");
});
