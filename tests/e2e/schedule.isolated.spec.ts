import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { emptyStudentProfile } from "../../packages/shared/src/model";
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
  const name = "双入口" + Date.now();
  let state = await send({
    type: "student.create",
    student: { ...emptyStudentProfile(), name, chineseName: name },
  });
  const student = state.students[0];
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
  for (const [entry, time] of [
    ["schedule", "10:00"],
    ["student", "11:00"],
  ]) {
    if (entry === "student")
      await page.goto(origin + "/students/" + student.id + "?tab=courses");
    await page.getByRole("button", { name: "安排课程", exact: true }).click();
    if (entry === "student") {
      await page.getByRole("tab", {name:"灵活排课",exact:true}).click();
      await page.getByRole("button", {name:"保存排课信息",exact:true}).click();
      await expect(page.locator(".flex-time-cell.available").first()).toHaveAttribute("aria-label", /10:25 可排课/);
      await page.locator(".flex-time-cell.available").first().click();
      await page.locator(".flex-teacher-choice").first().click();
      await page.getByRole("button", {name:"加入课表",exact:true}).click();
      await page.getByRole("button", {name:"确认排课",exact:true}).click();
      await expect.poll(async()=>{const current=await(await request.get(origin+"/api/state")).json();return current.lessons.filter((l:{studentId:string})=>l.studentId===student.id).length;}).toBe(2);
      continue;
    }
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("学员", { exact: true }).click();
    await page.getByRole("option", { name, exact: true }).click();
    await dialog.getByLabel("排课方式", { exact: true }).click();
    await page.getByRole("option", { name: "灵活排课", exact: true }).click();
    await dialog.getByLabel("第1节上课时间", { exact: true }).fill(time);
    await dialog.getByLabel("第1节老师", { exact: true }).click();
    await page
      .locator('[role="option"]:not([aria-disabled="true"])')
      .nth(1)
      .click();
    await dialog.getByLabel("选择第1节", { exact: true }).check();
    const confirmTeacher = dialog.getByRole("button", {
      name: "已与老师确认选中课次",
      exact: true,
    });
    if (await confirmTeacher.count()) await confirmTeacher.click();
    await dialog.getByRole("button", { name: "确认排课", exact: true }).click();
    await expect(dialog.getByRole("button", {name:"确认排课",exact:true})).toBeHidden();
  }
  state = await (await request.get(origin + "/api/state")).json();
  expect(
    state.lessons.filter(
      (l: { studentId: string }) => l.studentId === student.id,
    ),
  ).toHaveLength(2);
  expect(state.lessons.filter((l: {studentId:string})=>l.studentId===student.id).map((l:{time:string})=>l.time).sort()).toEqual(["10:00","10:25"]);
});
