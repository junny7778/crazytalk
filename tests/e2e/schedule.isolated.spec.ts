import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { type DemoState, emptyStudentProfile } from "../../packages/shared/src/model";
test.setTimeout(60000);
test.skip(process.env.CT_ISOLATED_BROWSER !== "1", "Use node tests/e2e/run-isolated.mjs for isolated fixtures");
const origin = "http://127.0.0.1:5177";
test("隔离双入口排课提交落库", async ({ page, request }) => {
  const c = JSON.parse(readFileSync("/tmp/ct-browser-isolated.json", "utf8"));
  await request.post(origin + "/api/session", {
    data: { login: c.login, password: c.password },
    headers: { Origin: origin },
  });
  const me = await (await request.get(origin + "/api/me")).json();
  const send = async (command: unknown) => {
    const r = await request.post(origin + "/api/commands", {
      headers: { Origin: origin, "X-CSRF-Token": me.csrfToken },
      data: { command, requestId: randomUUID() },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return (await r.json()).data;
  };
  const readState = async (): Promise<DemoState> =>
    (await request.get(origin + "/api/state")).json();
  const seed = await readState();
  const owner = {
    ...seed.accounts.find(account => account.roleId === "ops")!,
    id: randomUUID(), name: "排课验收教务", phone: "schedule-owner", classInUid: "882001",
  };
  await send({ type: "account.save", account: owner, initialPassword: "Test1!" + randomUUID().slice(0, 8) });
  const teacher = {
    ...seed.teachers[0], id: randomUUID(), name: "排课验收老师", classInUid: "882002",
    status: "在职", materialIds: ["m1"], availabilityFrom: "",
    availability: [{ day: 1, start: "10:00", end: "10:50" }],
  };
  await send({ type: "teacher.save", teacher });
  const name = "双入口" + Date.now();
  await send({
    type: "student.create",
    student: {
      ...emptyStudentProfile(), name, chineseName: name, owner: owner.name,
      ownerAccountId: owner.id, material: "Power Up 1", materialIds: ["m1"],
    },
  });
  const student = (await readState()).students.find(s => s.name === name)!;
  await send({
    type: "order.buy",
    id: randomUUID(),
    studentId: student.id,
    studentIds: [student.id],
    units: 72,
    date: "2026-11-18",
    kind: "新购",
    note: "隔离",
  });
  await send({
    type: "student.bindClassIn",
    id: student.id,
    phone: "13900000001",
    uid: "12346",
  });
  await page.goto(origin + "/schedule");
  await page.getByLabel("账号", { exact: true }).fill(c.login);
  await page.getByLabel("密码", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("tab", { name: "按学员排课" })).toBeVisible();
  await page.getByPlaceholder("搜索姓名或 ID").fill(name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  for (const time of ["10:00", "10:25"]) {
    if (time === "10:25") {
      await page.goto(origin + "/students/" + student.id + "?tab=courses");
      await page.getByRole("button", { name: "安排课程", exact: true }).click();
    }
    await page.getByRole("button", { name: "自定义排课", exact: true }).click();
    await page.getByRole("button", { name: "下一周", exact: true }).click();
    // The first column in the weekly calendar is Monday.
    await page.getByRole("button", { name: new RegExp(time + " 可排课") }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(teacher.name) }).click();
    await page.getByRole("button", { name: "加入课表", exact: true }).click();
    await page.getByRole("button", { name: "预览排课", exact: true }).click();
    await page.getByRole("button", { name: "确认排课", exact: true }).click();
    await expect.poll(async () => (await readState()).lessons
      .filter(l => l.studentId === student.id && l.teacherId === teacher.id)
      .map(l => l.time).sort()).toEqual(time === "10:00" ? ["10:00"] : ["10:00", "10:25"]);
  }
});
