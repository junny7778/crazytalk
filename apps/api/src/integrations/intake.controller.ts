import { Body, Controller, Delete, Get, Param, Patch, Post, Req, ForbiddenException, NotFoundException, ConflictException } from "@nestjs/common";
import { IncomingMessage } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { requireIdentity } from "../auth";
import { transition } from "../../../../packages/shared/src/domain";
import { canBusiness, scopeState } from "../../../../packages/shared/src/access";
import { database, readState, writeState, lockBusiness } from "../store";
import { matchingSurveyAnswers, studentSurveyPrefill } from "../../../../packages/shared/src/studentSurvey";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const nameSchema = z.object({ chineseName: z.string().trim().default("") });

@Controller("intake")
export class IntakeController {
  @Post()
  async issue(@Req() request: IncomingMessage, @Body() body: unknown) {
    const identity = await requireIdentity(request, true);
    if (!canBusiness(await readState(), identity, "student.edit")) throw new ForbiddenException();
    const input = nameSchema.parse(body);
    const token = randomUUID(), secret = randomUUID();
    await database.intake.create({ data: { token, secretHash: hash(secret), chineseName: input.chineseName, creatorAccountId: identity.accountId } });
    return { token, secret };
  }

  private async entry(token: string) {
    const entry = await database.intake.findUnique({ where: { token } });
    if (!entry || entry.revokedAt) throw new NotFoundException();
    return entry;
  }
  private authorized(request: IncomingMessage, secretHash: string) {
    const bearer = request.headers.authorization;
    return !!bearer?.startsWith("Bearer ") && hash(bearer.slice(7)) === secretHash;
  }

  @Get(":token")
  async read(@Req() request: IncomingMessage, @Param("token") token: string) {
    const entry = await this.entry(token);
    if (this.authorized(request, entry.secretHash))
      return { submitted: !!entry.submittedAt, revisionOpen: entry.revisionOpen, answers: entry.answers, nameEdited: entry.nameEdited, submittedAt: entry.submittedAt?.toISOString() };
    if (entry.submittedAt && !entry.revisionOpen) return { submitted: true };
    const student = (await readState()).students.find((item) => item.surveyToken === token);
    const prefill = student ? studentSurveyPrefill(student) : { chineseName: entry.chineseName };
    return { submitted: false, chineseName: prefill.chineseName, prefill };
  }

  @Patch(":token")
  async rename(@Req() request: IncomingMessage, @Param("token") token: string, @Body() body: unknown) {
    const entry = await this.entry(token);
    if (!this.authorized(request, entry.secretHash)) throw new ForbiddenException();
    const input = nameSchema.parse(body);
    await database.intake.updateMany({ where: { token, submittedAt: null, revokedAt: null }, data: { chineseName: input.chineseName } });
    return this.read(request, token);
  }

  @Post(":token/reopen")
  async reopen(@Req() request: IncomingMessage, @Param("token") token: string) {
    const identity = await requireIdentity(request, true);
    await database.$transaction(async (tx) => {
      await lockBusiness(tx);
      const state = await readState(tx);
      if (!canBusiness(state, identity, "student.edit") ||
          !scopeState(state, identity).students.some(student => student.surveyToken === token))
        throw new ForbiddenException();
      const entry = await tx.intake.findUnique({ where: { token } });
      if (!entry || entry.revokedAt) throw new NotFoundException();
      if (!entry.submittedAt) throw new ConflictException("问卷还未提交");
      await tx.intake.update({ where: { token }, data: { revisionOpen: true } });
    });
    return { revisionOpen: true };
  }

  @Delete(":token")
  async revoke(@Req() request: IncomingMessage, @Param("token") token: string) {
    const entry = await this.entry(token);
    if (!this.authorized(request, entry.secretHash)) throw new ForbiddenException();
    await database.intake.update({ where: { token }, data: { revokedAt: new Date() } });
    return { submitted: !!entry.submittedAt };
  }

  @Post(":token")
  async submit(@Param("token") token: string, @Body() body: unknown) {
    await this.entry(token);
    const answers = matchingSurveyAnswers.parse(body);
    const input = z.object({ initialName: z.string().optional() }).parse(body);
    await database.$transaction(async tx => {
      await lockBusiness(tx);
      const state = await readState(tx);
      if (!state.students.some(student => student.surveyToken === token)) throw new NotFoundException("问卷未关联学员");
      const entry = await tx.intake.findUnique({ where: { token } });
      if (!entry || entry.revokedAt) throw new NotFoundException();
      const submittedAt = new Date().toISOString();
      const nameEdited = input.initialName !== answers.chineseName;
      const result = await tx.intake.updateMany({
        where: { token, revokedAt: null, OR: [{ submittedAt: null }, { revisionOpen: true }] },
        data: { answers, nameEdited, submittedAt, revisionOpen: false },
      });
      if (result.count !== 1) throw new ConflictException("问卷已提交或作废");
      const next = transition(state, { type: "survey.submit", token, answers, nameEdited, submittedAt, revision: entry.revisionOpen, operator: "家长问卷" });
      await writeState(tx, next.data);
    });
    return {};
  }
}
