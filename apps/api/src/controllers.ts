import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  ForbiddenException,
  Post,
  Patch,
  Param,
  Req,
  Res,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { database, readState, writeState, lockBusiness } from "./store";
import {
  requireIdentity,
  assertOrigin,
  passwordHash,
  passwordMatches,
  tokenHash,
  sessionToken,
} from "./auth";
import { applyBusinessEffects } from "../../../packages/shared/src/businessEffects";
import { loadClassInConfiguration } from "./integrations/credentials";
import { ClassInClient } from "./integrations/classin";
import { retryClassInLesson } from "./integrations/worker";
import { commandOperationResult, resumeCommandOperation } from "./integrations/operation-result";
import { queueClassInChanges } from "./integrations/outbox";
import { undoSchema, undoConfirmation } from "./undo";
import {
  accountPasswordHint,
  accountPasswordSchema,
} from "../../../packages/shared/src/accountPassword";
import { parseCommand } from "../../../packages/shared/src/commandSchema";
import {
  assertCommandAccess,
  scopeState,
  canBusiness,
} from "../../../packages/shared/src/access";
import { transition } from "../../../packages/shared/src/domain";
import { configureBusinessClock } from "../../../packages/shared/src/model";
async function accountState(
  tx: Prisma.TransactionClient,
  state: Awaited<ReturnType<typeof readState>>,
  identity: Awaited<ReturnType<typeof requireIdentity>>,
) {
  const scoped = scopeState(state, identity);
  const account = await tx.account.findUniqueOrThrow({
    where: { id: identity.accountId },
  });
  const preferences = account.preferences as { language?: "en" | "zh" };
  scoped.language = preferences.language || "zh";
  return scoped;
}

function storedCommand(command: ReturnType<typeof parseCommand>) {
  return JSON.parse(
    JSON.stringify(
      command.type === "account.save" && command.initialPassword
        ? { ...command, initialPassword: passwordHash(command.initialPassword) }
        : command,
    ),
  );
}
function matchesStoredCommand(
  stored: unknown,
  command: ReturnType<typeof parseCommand>,
) {
  if (command.type !== "account.save" || !command.initialPassword)
    return isDeepStrictEqual(stored, JSON.parse(JSON.stringify(command)));
  const record = z
    .object({ initialPassword: z.string() })
    .passthrough()
    .parse(stored);
  const { initialPassword, ...rest } = record;
  const { initialPassword: submitted, ...input } = command;
  return (
    passwordMatches(submitted, initialPassword) &&
    isDeepStrictEqual(rest, JSON.parse(JSON.stringify(input)))
  );
}
const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});
@Controller()
export class BusinessController {
  @Post("session")
  async login(
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
    @Body() input: unknown,
  ) {
    assertOrigin(req);
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException("请填写账号和密码");
    const account = await database.account.findUnique({
      where: { login: parsed.data.login },
    });
    if (
      !account?.enabled ||
      !passwordMatches(parsed.data.password, account.passwordHash)
    )
      throw new UnauthorizedException("账号或密码错误");
    const token = randomBytes(32).toString("hex"),
      csrfToken = randomBytes(32).toString("hex");
    await database.session.create({
      data: {
        id: tokenHash(token),
        accountId: account.id,
        csrfToken,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    res.setHeader(
      "Set-Cookie",
      "ct_session=" +
        token +
        "; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400" +
        (process.env.NODE_ENV === "production" ? "; Secure" : ""),
    );
    return {
      accountId: account.id,
      roleId: account.roleId,
      teacherId: account.teacherId || undefined,
      name: account.name,
      csrfToken,
    };
  }
  @Get("me") me(@Req() req: IncomingMessage) {
    return requireIdentity(req);
  }
  @Delete("session") async logout(
    @Req() req: IncomingMessage,
    @Res({ passthrough: true }) res: ServerResponse,
  ) {
    await requireIdentity(req, true);
    await database.session.deleteMany({
      where: { id: tokenHash(sessionToken(req)) },
    });
    res.setHeader(
      "Set-Cookie",
      "ct_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
    );
    return { message: "已退出" };
  }
  @Post("password") async password(
    @Req() req: IncomingMessage,
    @Body() input: unknown,
  ) {
    const identity = await requireIdentity(req, true);
    const parsed = z
      .object({ current: z.string(), next: accountPasswordSchema })
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException(accountPasswordHint);
    await database.$transaction(async (tx) => {
      await lockBusiness(tx);
      const account = await tx.account.findUniqueOrThrow({
        where: { id: identity.accountId },
      });
      if (
        !account.enabled ||
        !passwordMatches(parsed.data.current, account.passwordHash)
      )
        throw new BadRequestException("当前密码错误");
      await tx.account.update({
        where: { id: account.id },
        data: { passwordHash: passwordHash(parsed.data.next) },
      });
      await tx.session.deleteMany({
        where: {
          accountId: account.id,
          id: { not: tokenHash(sessionToken(req)) },
        },
      });
    });
    return { message: "密码已更新" };
  }
  @Get("preferences") async preferences(@Req() req: IncomingMessage) {
    const identity = await requireIdentity(req);
    return (
      await database.account.findUniqueOrThrow({
        where: { id: identity.accountId },
      })
    ).preferences;
  }
  @Patch("preferences") async savePreferences(
    @Req() req: IncomingMessage,
    @Body() input: unknown,
  ) {
    const identity = await requireIdentity(req, true);
    const parsed = z
      .object({
        trainingDone: z.boolean().optional(),
        seenNotifications: z.array(z.string()).optional(),
      })
      .strict()
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException("偏好格式无效");
    return database.$transaction(async (tx) => {
      await lockBusiness(tx);
      const account = await tx.account.findUniqueOrThrow({
        where: { id: identity.accountId },
      });
      const preferences = {
        ...(account.preferences as object),
        ...parsed.data,
      };
      await tx.account.update({
        where: { id: account.id },
        data: { preferences },
      });
      return preferences;
    });
  }
  @Post("accounts/:id/password") async resetPassword(
    @Req() req: IncomingMessage,
    @Param("id") id: string,
    @Body() input: unknown,
  ) {
    const identity = await requireIdentity(req, true);
    const parsed = z.object({ next: accountPasswordSchema }).safeParse(input);
    if (!parsed.success) throw new BadRequestException(accountPasswordHint);
    await database.$transaction(async (tx) => {
      await lockBusiness(tx);
      const state = await readState(tx);
      const operator = state.accounts.find(
        (item) =>
          item.id === identity.accountId &&
          item.enabled &&
          item.roleId === identity.roleId,
      );
      if (!operator || !canBusiness(state, identity, "account.manage"))
        throw new UnauthorizedException("无账号管理权限");
      const account = state.accounts.find((item) => item.id === id);
      if (!account) throw new BadRequestException("账号不存在");
      await tx.account.upsert({
        where: { id },
        create: {
          id,
          login: account.phone,
          name: account.name,
          enabled: account.enabled,
          roleId: account.roleId,
          passwordHash: passwordHash(parsed.data.next),
        },
        update: { passwordHash: passwordHash(parsed.data.next) },
      });
      await tx.session.deleteMany({ where: { accountId: id } });
    });
    return { message: "密码已重置" };
  }
  @Get("classin/connection")
  @Header("Cache-Control", "no-store")
  async classInConnection(@Req() req: IncomingMessage) {
    const identity = await requireIdentity(req);
    if (!canBusiness(await readState(), identity, "classin.view")) {
      throw new ForbiddenException("没有查看 ClassIn 连接的权限");
    }
    const configuration = await loadClassInConfiguration().catch(() => null);
    if (!configuration) {
      return { status: "配置不可用", sid: null, maskedSecret: null };
    }
    const secret = configuration.CLASSIN_SECRET;
    const maskedSecret = secret.length > 2 ? `${secret[0]}••••••••${secret.at(-1)}` : "••••••••";
    const status = await new ClassInClient(configuration).checkCredentials().then(
      () => "正常",
      () => "验证失败",
    );
    return { status, sid: configuration.CLASSIN_SID, maskedSecret };
  }
  @Get("state") async state(@Req() req: IncomingMessage) {
    const identity = await requireIdentity(req);
    configureBusinessClock();
    return database.$transaction(
      async (tx) => accountState(tx, await readState(tx), identity),
      { isolationLevel: "RepeatableRead" },
    );
  }
  @Post("undo") async undo(
    @Req() req: IncomingMessage,
    @Body() input: unknown,
  ) {
    const identity = await requireIdentity(req, true);
    const parsed = z.object({ token: z.string().uuid() }).safeParse(input);
    if (!parsed.success) throw new BadRequestException("撤销标识无效");
    return database.$transaction(
      async (tx) => {
        await lockBusiness(tx);
        const record = await tx.appliedCommand.findUnique({
          where: { id: parsed.data.token },
        });
        if (
          !record ||
          record.accountId !== identity.accountId ||
          !record.undo ||
          Date.now() - record.createdAt.getTime() > 10000
        )
          throw new BadRequestException("撤销时间已过，请在上课记录中更正");
        const before = await readState(tx);
        const snapshot = undoSchema.parse(record.undo);
        assertCommandAccess(before, identity, {
          type: "lesson.resolve",
          ids: snapshot.before.map((lesson) => lesson.id),
          decision: "不扣",
          reason: "撤销确认",
        });
        configureBusinessClock();
        const state = undoConfirmation(
          structuredClone(before),
          snapshot,
          identity.name,
        );
        await writeState(tx, state, before);
        await tx.appliedCommand.update({
          where: { id: record.id },
          data: { undo: Prisma.DbNull },
        });
        return {
          message: "已撤销",
          data: await accountState(tx, state, identity),
        };
      },
      { timeout: 30000 },
    );
  }
  @Get("classin-operations") async operations(@Req() req: IncomingMessage) {
    const identity = await requireIdentity(req);
    const state = await readState();
    const scoped = scopeState(state, identity);
    const jobs = await database.classInJob.findMany({where:{operationId:{not:null},status:{notIn:["completed","superseded"]}}});
    const ids = [...new Set([...jobs.map(j=>j.operationId!), ...state.students.flatMap(s=>s.classInChange?.operationId?[s.classInChange.operationId]:[])])];
    const commands = await database.appliedCommand.findMany({where:{id:{in:ids},accountId:identity.accountId},orderBy:{createdAt:"desc"}});
    const results = [];
    for (const command of commands) {
      const students = [...new Set([...jobs.filter(j=>j.operationId===command.id).flatMap(j=>{
        const id = j.lessonId ? state.lessons.find(l=>l.id===j.lessonId)?.studentId : z.object({studentId:z.string()}).parse(j.payload).studentId;
        return id?[id]:[];
      }), ...state.students.filter(s=>s.classInChange?.operationId===command.id).map(s=>s.id)])];
      if (!students.length || students.some(id=>!scoped.students.some(s=>s.id===id))) continue;
      results.push({id:command.id, type:z.object({type:z.string()}).parse(command.command).type, studentIds:students, ...await commandOperationResult(database,command,state)});
    }
    return results;
  }

  @Post("commands/:id/continue") async continueOperation(@Req() req: IncomingMessage, @Param("id") id: string) {
    const identity = await requireIdentity(req, true);
    return database.$transaction(async tx=>{
      await lockBusiness(tx);
      const command=await tx.appliedCommand.findUnique({where:{id}});
      if (!command || command.accountId!==identity.accountId) throw new ForbiddenException();
      const state=await readState(tx);
      try { await resumeCommandOperation(tx,command,state,identity); }
      catch(error) { throw new BadRequestException(error instanceof Error?error.message:"无法继续操作"); }
      return {operationId:id};
    });
  }

  @Get("commands/:id") async commandResult(@Req() req: IncomingMessage, @Param("id") id: string) {
    const identity = await requireIdentity(req);
    const command = await database.appliedCommand.findUnique({ where: { id } });
    if (!command || command.accountId !== identity.accountId) throw new ForbiddenException();
    const state = await readState();
    return { ...await commandOperationResult(database, command, state), data: await accountState(database, state, identity) };
  }

  @Post("commands") async command(
    @Req() req: IncomingMessage,
    @Body() input: unknown,
  ) {
    const identity = await requireIdentity(req, true);
    const parsed = z
      .object({ requestId: z.string().uuid(), command: z.unknown() })
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException("请求格式无效");
    let command;
    try {
      command = parseCommand(parsed.data.command);
    } catch {
      throw new BadRequestException("操作参数无效");
    }
    try {
      return await database.$transaction(
        async (tx) => {
          await lockBusiness(tx);
          configureBusinessClock();
          const state = await readState(tx);
          const previous = await tx.appliedCommand.findUnique({
            where: { id: parsed.data.requestId },
          });
          if (previous) {
            if (
              previous.accountId !== identity.accountId ||
              !matchesStoredCommand(previous.command, command)
            )
              throw new ConflictException("请求标识已被其他操作使用");
            await resumeCommandOperation(tx, previous, state, identity);
            return {
              operationId: previous.id,
              message: previous.message,
              data: await accountState(tx, state, identity),
              undoToken:
                previous.undo &&
                Date.now() - previous.createdAt.getTime() < 10000
                  ? previous.id
                  : undefined,
            };
          }
          assertCommandAccess(state, identity, command);
          if (command.type === "lesson.changeTeacher" && state.lessons.some(l=>l.studentId===command.studentId && l.teacherId===command.originalTeacherId && l.status==="已取消" && l.syncState && l.syncState!=="completed"))
            throw new BadRequestException("原老师部分课程尚未取消，请先完成原操作，暂时无法重新排课");
          if (command.type === "account.save") {
            if (
              command.account.roleId !== "admin" &&
              !state.roles.some((role) => role.id === command.account.roleId)
            )
              throw new BadRequestException("角色不存在");
            const existing = state.accounts.find(
              (account) => account.id === command.account.id,
            );
            if (
              existing?.roleId === "admin" &&
              existing.enabled &&
              (!command.account.enabled ||
                command.account.roleId !== "admin") &&
              !state.accounts.some(
                (account) =>
                  account.id !== existing.id &&
                  account.enabled &&
                  account.roleId === "admin",
              )
            )
              throw new BadRequestException("至少保留一个启用的管理员");
          }
          if (command.type === "survey.issue") {
            const intake = command.token
              ? await tx.intake.findUnique({ where: { token: command.token } })
              : null;
            if (
              !intake ||
              intake.creatorAccountId !== identity.accountId ||
              !command.secret ||
              tokenHash(command.secret) !== intake.secretHash
            )
              throw new BadRequestException("问卷授权无效");
          }
          const fileReferences =
            JSON.stringify(command).match(/\/api\/files\/[a-f0-9-]{36}/g) || [];
          const visible = JSON.stringify(scopeState(state, identity));
          for (const reference of new Set(fileReferences)) {
            const attachment = await tx.attachment.findUnique({
              where: { id: reference.split("/").pop()! },
            });
            if (
              !attachment ||
              (attachment.ownerId !== identity.accountId &&
                !visible.includes(reference))
            )
              throw new BadRequestException("附件不在授权范围内");
          }
          if (command.type === "lesson.retry") {
            try { await retryClassInLesson(command.id, tx); }
            catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "同步恢复失败"); }
          }
          if (command.type === "language.set") {
            const account = await tx.account.findUniqueOrThrow({
              where: { id: identity.accountId },
            });
            await tx.account.update({
              where: { id: account.id },
              data: {
                preferences: {
                  ...(account.preferences as object),
                  language: command.language,
                },
              },
            });
            const message = "语言已更新";
            await tx.appliedCommand.create({
              data: {
                id: parsed.data.requestId,
                accountId: identity.accountId,
                command,
                message,
              },
            });
            return { message, data: await accountState(tx, state, identity) };
          }
          const originalTeacher =
            command.type === "teacher.save"
              ? state.teachers.find(
                  (teacher) => teacher.id === command.teacher.id,
                )
              : undefined;
          let appliedCommand =
            command.type === "teacher.save" &&
            originalTeacher &&
            !canBusiness(state, identity, "field.pay_amount") &&
            !canBusiness(state, identity, "pay_rate.edit")
              ? {
                  ...command,
                  teacher: { ...command.teacher, rate: originalTeacher.rate },
                }
              : command;
          if (
            appliedCommand.type === "teacher.save" &&
            originalTeacher &&
            !identity.teacherId &&
            !canBusiness(state, identity, "teacher.view") &&
            !canBusiness(state, identity, "schedule.view")
          ) {
            const {
              phone,
              notes,
              teachingPhilosophy,
              educationBackground,
              classInAccount,
              photo,
              photos,
              introVideo,
              certificates,
              teacherTraining,
              quizScore,
              availabilityNote,
              tags,
            } = originalTeacher;
            appliedCommand = {
              ...appliedCommand,
              teacher: {
                ...appliedCommand.teacher,
                phone,
                notes,
                teachingPhilosophy,
              educationBackground,
              classInAccount,
                photo,
                photos,
                introVideo,
                certificates,
                teacherTraining,
                quizScore,
                availabilityNote,
                tags,
              },
            };
          }
          if (command.type === "student.lifecycle" && command.status === "退费" &&
              state.students.find(item => item.id === command.studentId)?.status === "退费")
            throw new BadRequestException("该账号已退费，请勿重复提交");
          const result = transition(state, {
            ...appliedCommand,
            operator: identity.name,
          });
          if (command.type === "student.bindClassIn") {
            const change = result.data.students.find(s => s.id === command.id)?.classInChange;
            if (change) { change.requestedByAccountId = identity.accountId; change.operationId = parsed.data.requestId; }
          }
          if (command.type === "lesson.retry") {
            const lesson = result.data.lessons.find(
              (item) => item.id === command.id,
            )!;
            lesson.sync = "处理中";
            lesson.syncReason = "等待 ClassIn 同步";
            result.message = "已加入同步队列";
          }
          applyBusinessEffects(result.data, { ...command, operator: identity.name });
          await queueClassInChanges(tx, state, result.data, parsed.data.requestId);
          await writeState(tx, result.data, state);
          if (command.type === "account.save") {
            const account = result.data.accounts.find(
              (a) => a.id === command.account.id,
            );
            if (account) {
              const existing = await tx.account.findUnique({
                where: { id: account.id },
              });
              if (!existing && !command.initialPassword)
                throw new BadRequestException("请设置初始密码");
              if (existing)
                await tx.account.update({
                  where: { id: account.id },
                  data: {
                    name: account.name,
                    login: account.phone,
                    enabled: account.enabled,
                    roleId: account.roleId,
                  },
                });
              else
                await tx.account.create({
                  data: {
                    id: account.id,
                    name: account.name,
                    login: account.phone,
                    enabled: account.enabled,
                    roleId: account.roleId,
                    passwordHash: passwordHash(command.initialPassword!),
                  },
                });
            }
          }
          await tx.appliedCommand.create({
            data: {
              id: parsed.data.requestId,
              accountId: identity.accountId,
              command: storedCommand(command),
              message: result.message,
              undo:
                command.type === "lesson.resolve"
                  ? JSON.parse(
                      JSON.stringify({
                        before: state.lessons.filter((lesson) =>
                          command.ids.includes(lesson.id),
                        ),
                        after: result.data.lessons.filter((lesson) =>
                          command.ids.includes(lesson.id),
                        ),
                        decision: command.decision,
                      }),
                    )
                  : Prisma.DbNull,
            },
          });
          return {
            operationId: (await tx.classInJob.count({where:{operationId:parsed.data.requestId}})) || result.data.students.some(s=>s.classInChange?.operationId===parsed.data.requestId) ? parsed.data.requestId : undefined,
            message: result.message,
            data: await accountState(tx, result.data, identity),
            undoToken:
              command.type === "lesson.resolve"
                ? parsed.data.requestId
                : undefined,
          };
        },
        { timeout: 30000 },
      );
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientUnknownRequestError
      )
        throw new ServiceUnavailableException("数据保存失败，请核对操作状态");
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
