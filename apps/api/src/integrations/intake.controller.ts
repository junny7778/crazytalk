import { Body, Controller, Delete, Get, Param, Patch, Post, Req, ForbiddenException, NotFoundException, ConflictException } from "@nestjs/common";
import { IncomingMessage } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { requireIdentity } from "../auth";
import { transition } from "../../../../packages/shared/src/domain";
import { canBusiness } from "../../../../packages/shared/src/access";
import { database, readState, writeState, lockBusiness } from "../store";
import { matchingSurveyAnswers } from "../../../../packages/shared/src/studentSurvey";

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
      return { submitted: !!entry.submittedAt, answers: entry.answers, nameEdited: entry.nameEdited, submittedAt: entry.submittedAt?.toISOString() };
    return { submitted: !!entry.submittedAt, ...(!entry.submittedAt && { chineseName: entry.chineseName }) };
  }

  @Patch(":token")
  async rename(@Req() request: IncomingMessage, @Param("token") token: string, @Body() body: unknown) {
    const entry = await this.entry(token);
    if (!this.authorized(request, entry.secretHash)) throw new ForbiddenException();
    const input = nameSchema.parse(body);
    await database.intake.updateMany({ where: { token, submittedAt: null, revokedAt: null }, data: { chineseName: input.chineseName } });
    return this.read(request, token);
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
      const submittedAt = new Date().toISOString();
      const nameEdited = input.initialName !== answers.chineseName;
      const result = await tx.intake.updateMany({
        where: { token, submittedAt: null, revokedAt: null },
        data: { answers, nameEdited, submittedAt },
      });
      if (result.count !== 1) throw new ConflictException("问卷已提交或作废");
      const next = transition(state, { type: "survey.submit", token, answers, nameEdited, submittedAt, operator: "家长问卷" });
      await writeState(tx, next.data);
    });
    return {};
  }
}
