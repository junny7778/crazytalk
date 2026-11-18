import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { readState, writeState } from "../store";

export async function verifyIntake(origin: string, headers: Record<string, string>, db: PrismaClient, studentId: string) {
  const answers = { chineseName: "问卷原子验证", gender: "女", level: "L2(基础)能日常简单交流", personality: "内向型（慢热 一开始比较害羞，需要老师耐心引导）", membership: "2-4个月", listening: "300小时内" };
  const issue = async () => {
    const response = await fetch(origin + "/api/intake", { method: "POST", headers, body: JSON.stringify({ chineseName: "原名" }) });
    assert.equal(response.status, 201);
    const entry = await response.json();
    const bind = await fetch(origin + "/api/commands", { method: "POST", headers, body: JSON.stringify({ requestId: randomUUID(), command: { type: "survey.issue", id: studentId, ...entry } }) });
    assert.equal(bind.status, 201, await bind.clone().text());
    return entry;
  };
  const submit = (token: string) => fetch(origin + "/api/intake/" + token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(answers) });
  const first = await issue();
  const results = await Promise.all([submit(first.token), submit(first.token)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const saved = await db.intake.findUniqueOrThrow({ where: { token: first.token } });
  const student = (await readState(db)).students.find(item => item.id === studentId)!;
  assert.deepEqual(student.surveyOriginal, saved.answers);
  assert.equal(student.surveySubmittedAt, saved.submittedAt?.toISOString());
  assert.equal(student.chineseName, answers.chineseName);
  const revoked = await issue();
  assert.equal((await fetch(origin + "/api/intake/" + revoked.token, { method: "DELETE", headers: { authorization: "Bearer " + revoked.secret } })).status, 200);
  assert.equal((await submit(revoked.token)).status, 404);
  assert.equal((await db.intake.findUniqueOrThrow({ where: { token: revoked.token } })).submittedAt, null);
  const rollback = await issue();
  await db.$transaction(async tx => {
    const state = await readState(tx);
    state.students.find(item => item.id === studentId)!.surveySubmittedAt = new Date().toISOString();
    await writeState(tx, state);
  });
  assert.notEqual((await submit(rollback.token)).status, 201);
  const unchanged = await db.intake.findUniqueOrThrow({ where: { token: rollback.token } });
  assert.equal(unchanged.submittedAt, null);
  assert.equal(unchanged.answers, null);
  console.log("PASS intake concurrent single submission, original/profile atomicity, revoked link, transaction rollback");
}
