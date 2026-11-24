import { spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
const children = [];
const start = (args) => {
  const p = spawn("pnpm", args, { stdio: "inherit", detached: true, env: { ...process.env, CT_ISOLATED_BROWSER: "1" } });
  children.push(p);
  return p;
};
try {
  for (const port of [3192, 5177]) {
    let occupied = false;
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      occupied = true;
    } catch {}
    if (occupied) throw Error(`Test port ${port} already occupied`);
  }
  rmSync("/tmp/ct-browser-isolated.json", { force: true });
  start([
    "--filter",
    "@crazytalk/api",
    "exec",
    "tsx",
    "src/browser-isolated.ts",
  ]);
  start([
    "--filter",
    "@crazytalk/admin",
    "exec",
    "vite",
    "--config",
    "../../tests/e2e/isolated.vite.config.ts",
    "--mode",
    "business",
    "--host",
    "127.0.0.1",
  ]);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if (
        (await fetch("http://127.0.0.1:3192/api/health")).ok &&
        (await fetch("http://127.0.0.1:5177/")).ok
      ) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  if (!ready) throw Error("Isolated servers did not become ready");
  const test = start([
    "exec",
    "playwright",
    "test",
    ...(process.argv.length > 2 ? process.argv.slice(2) : [
      "tests/e2e/refund.isolated.spec.ts",
      "tests/e2e/report.isolated.spec.ts",
      "tests/e2e/schedule.isolated.spec.ts",
      "tests/e2e/payroll.isolated.spec.ts",
    ]),
  ]);
  process.exitCode = await new Promise((resolve) =>
    test.on("exit", (code) => resolve(code ?? 1)),
  );
} finally {
  try {
    if (!children.length) throw Error("not started");
    const { pid } = JSON.parse(
      readFileSync("/tmp/ct-browser-isolated.json", "utf8"),
    );
    process.kill(pid, "SIGTERM");
    await delay(1000);
  } catch {}
  for (const p of children)
    try {
      process.kill(-p.pid, "SIGTERM");
    } catch {}
}
