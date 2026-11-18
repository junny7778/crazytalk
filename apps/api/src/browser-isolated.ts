import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { passwordHash } from "./auth";
import { createSeed } from "../../../packages/shared/src/seed";
import { writeState } from "./store";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { writeFileSync } from "node:fs";
async function main() {
  const schema = "browser_" + randomUUID().replaceAll("-", "");
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: url.href });
  try {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url.href },
      stdio: "pipe",
    });
    const password = randomUUID();
    const account = await db.account.create({
      data: {
        login: "browser",
        name: "浏览器验收",
        roleId: "admin",
        passwordHash: passwordHash(password),
      },
    });
    const state = createSeed();
    for (const lesson of state.lessons) lesson.autoSettlementPaused = true;
    const teacher = state.teachers[0];
    const teacherLogin = "browser-teacher";
    const teacherAccount = await db.account.create({
      data: {
        login: teacherLogin,
        name: teacher.name,
        roleId: "teacher",
        teacherId: teacher.id,
        passwordHash: passwordHash(password),
      },
    });
    state.accounts.push({
      id: teacherAccount.id,
      name: teacher.name,
      phone: teacherLogin,
      roleId: "teacher",
      scope: "本人",
      enabled: true,
    });
    state.accounts.push({
      id: account.id,
      name: account.name,
      phone: account.login,
      roleId: "admin",
      scope: "全部",
      enabled: true,
    });
    await db.$transaction((tx) => writeState(tx, state));
    writeFileSync(
      "/tmp/ct-browser-isolated.json",
      JSON.stringify({
        login: account.login,
        password,
        teacherLogin,
        teacherId: teacher.id,
        databaseUrl: url.href,
        pid: process.pid,
      }),
      { mode: 0o600 },
    );
    const server = spawn("pnpm", ["exec", "tsx", "src/integration-server.ts"], {
      env: {
        ...process.env,
        DATABASE_URL: url.href,
        API_PORT: "3192",
        NODE_ENV: "test",
        CLASSIN_API_BASE: "https://api.eeo.cn",
        CLASSIN_SID: "test",
        CLASSIN_SECRET: "test",
        CLASSIN_DATA_DIRECTORY: ".data/" + schema,
        UPLOAD_DIRECTORY: ".data/" + schema + "/uploads",
        BUSINESS_ORIGIN: "http://127.0.0.1:5177",
      },
      stdio: "inherit",
      detached: true,
    });
    await new Promise<void>((resolve) => process.once("SIGTERM", resolve));
    const exited = once(server, "exit");
    process.kill(-server.pid!, "SIGTERM");
    await exited;
  } finally {
    await db.$executeRawUnsafe(
      'DROP SCHEMA IF EXISTS "' + schema + '" CASCADE',
    );
    await db.$disconnect();
    await rm(".data/" + schema, { recursive: true, force: true });
    await rm("/tmp/ct-browser-isolated.json", { force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
