import { z } from "zod";

export const accountPasswordHint =
  "8–16 位，须同时包含大小写英文字母、数字和英文符号。";

export const accountPasswordSchema = z
  .string()
  .min(8, "密码长度须为 8–16 位")
  .max(16, "密码长度须为 8–16 位")
  .regex(/^[\x21-\x7e]+$/, "密码只允许英文字母、数字和英文符号")
  .regex(
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9])/,
    accountPasswordHint,
  );
