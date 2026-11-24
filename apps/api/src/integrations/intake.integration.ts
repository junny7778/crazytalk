import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { StudentEditableInput } from "../../../../packages/shared/src/model";
import { readState, writeState } from "../store";

export async function verifyIntake(origin: string, headers: Record<string, string>, db: PrismaClient, studentId: string) {
  const answers = { chineseName: "问卷原子验证", gender: "女", level: "L2(基础)能日常简单交流", personality: "内向型（慢热 一开始比较害羞，需要老师耐心引导）", membership: "2-4个月", listening: "300小时内" };
  const issue = async (id = studentId) => {
    const response = await fetch(origin + "/api/intake", { method: "POST", headers, body: JSON.stringify({ chineseName: "原名" }) });
    assert.equal(response.status, 201);
    const entry = await response.json();
    const bind = await fetch(origin + "/api/commands", { method: "POST", headers, body: JSON.stringify({ requestId: randomUUID(), command: { type: "survey.issue", id, ...entry } }) });
    assert.equal(bind.status, 201, await bind.clone().text());
    return entry;
  };
  const submit = (token: string, nextAnswers = answers) => fetch(origin + "/api/intake/" + token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(nextAnswers) });
  async function editProfile(patch: Partial<StudentEditableInput>) {
    const student = (await readState(db)).students.find((item) => item.id === studentId)!;
    const expected = Object.fromEntries(Object.keys(patch).map((key) => [key, student[key as keyof StudentEditableInput]]));
    const result = await fetch(origin + "/api/commands", {
      method: "POST", headers,
      body: JSON.stringify({ requestId: randomUUID(), command: { type: "student.details.update", id: studentId, expected, patch } }),
    });
    assert.equal(result.status, 201, await result.clone().text());
  }
  await editProfile({ gender: "男", listeningHours: "200小时内" });
  const first = await issue();
  const initial = await (await fetch(origin + "/api/intake/" + first.token)).json();
  assert.equal(initial.submitted, false);
  assert.equal(initial.prefill.gender, "男");
  assert.equal(initial.prefill.listening, "200小时内");
  const results = await Promise.all([submit(first.token), submit(first.token)]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const saved = await db.intake.findUniqueOrThrow({ where: { token: first.token } });
  const student = (await readState(db)).students.find(item => item.id === studentId)!;
  assert.deepEqual(student.surveyOriginal, saved.answers);
  assert.equal(student.surveySubmittedAt, saved.submittedAt?.toISOString());
  assert.equal(student.chineseName, answers.chineseName);
  assert.equal(student.gender, answers.gender);
  assert.equal(student.membershipDuration, answers.membership);
  assert.equal(student.listeningHours, answers.listening);
  assert.equal((await submit(first.token)).status, 409);
  const interest = "卡通动漫类（奥特曼、蜘蛛侠、漫威等）";
  await editProfile({
    gender: "男", ageGroup: "少儿(6-9岁)", interests: interest + "、唱歌",
    membershipDuration: "6个月以上", listeningHours: "500小时以上",
    preferredLessonTime: "都可以，灵活安排", learningNotes: "教务刚更新",
  });
  const reopen = await fetch(origin + "/api/intake/" + first.token + "/reopen", { method: "POST", headers });
  assert.equal(reopen.status, 201, await reopen.clone().text());
  const beforeRevision = (await readState(db)).students.find(item => item.id === studentId)!;
  assert.equal(beforeRevision.surveySubmittedAt, student.surveySubmittedAt);
  assert.deepEqual(beforeRevision.surveyOriginal, student.surveyOriginal);
  const open = await (await fetch(origin + "/api/intake/" + first.token)).json();
  assert.equal(open.submitted, false);
  assert.equal(open.prefill.gender, "男");
  assert.equal(open.prefill.ageGroup, "少儿(6-9岁)");
  assert.equal(open.prefill.membership, "6个月以上");
  assert.equal(open.prefill.listening, "500小时以上");
  assert.deepEqual(open.prefill.interests, [interest, "唱歌"]);
  assert.equal(open.prefill.times, "都可以，灵活安排");
  assert.equal(open.prefill.needs, "教务刚更新");
  const revised = { ...open.prefill, chineseName: "沿用原链接修改", needs: "家长补充" };
  const revisions = await Promise.all([submit(first.token, revised), submit(first.token, revised)]);
  assert.deepEqual(revisions.map(result => result.status).sort(), [201, 409]);
  const updated = (await readState(db)).students.find(item => item.id === studentId)!;
  assert.equal(updated.surveyToken, first.token);
  assert.equal(updated.learningNotes, "家长补充");
  assert.equal(updated.surveyOriginal && "chineseName" in updated.surveyOriginal && updated.surveyOriginal.chineseName, revised.chineseName);
  const closed = await (await fetch(origin + "/api/intake/" + first.token)).json();
  assert.deepEqual(closed, { submitted: true });

  const [revokedStudent, rollbackStudent] = (await readState(db)).students.filter(item => item.id !== studentId && !item.surveyToken);
  const revoked = await issue(revokedStudent.id);
  assert.equal((await fetch(origin + "/api/intake/" + revoked.token, { method: "DELETE", headers: { authorization: "Bearer " + revoked.secret } })).status, 200);
  assert.equal((await submit(revoked.token)).status, 404);
  assert.equal((await db.intake.findUniqueOrThrow({ where: { token: revoked.token } })).submittedAt, null);
  const rollback = await issue(rollbackStudent.id);
  await db.$transaction(async tx => {
    const state = await readState(tx);
    state.students.find(item => item.id === rollbackStudent.id)!.surveySubmittedAt = new Date().toISOString();
    await writeState(tx, state);
  });
  assert.notEqual((await submit(rollback.token)).status, 201);
  const unchanged = await db.intake.findUniqueOrThrow({ where: { token: rollback.token } });
  assert.equal(unchanged.submittedAt, null);
  assert.equal(unchanged.answers, null);
  console.log("PASS intake concurrent single submission, original/profile atomicity, fixed-link revision, revoked link, transaction rollback");
}
