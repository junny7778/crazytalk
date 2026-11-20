import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { requireIdentity } from "../auth";
import { database, lockBusiness, readState, writeState } from "../store";
import {
  canBusiness,
  scopeState,
  type BusinessIdentity,
} from "../../../../packages/shared/src/access";
import type { DemoState } from "../../../../packages/shared/src/model";

function candidates(state: DemoState, identity: BusinessIdentity) {
  const actor = state.accounts.find((a) => a.id === identity.accountId)!;
  const scoped = scopeState(state, identity);
  const staff = state.accounts.filter(
    (a) =>
      a.enabled &&
      ["ops", "tm"].includes(a.roleId) &&
      a.classInUid &&
      (actor.roleId === "admin" ||
        actor.scope === "全部" ||
        (a.team === actor.team &&
          (actor.scope === "本队" || a.group === actor.group))),
  );
  return [
    ...staff.map((a) => ({
      key: "staff:" + a.id,
      name: a.name,
      uid: a.classInUid!,
    })),
    ...scoped.teachers
      .filter((t) => t.classInUid && t.status !== "已离职")
      .map((t) => ({
        key: "teacher:" + t.id,
        name: t.name,
        uid: t.classInUid!,
      })),
  ];
}

@Controller("classin-classes")
export class ClassInClassesController {
  @Get()
  async list(@Req() request: IncomingMessage) {
    const identity = await requireIdentity(request);
    const state = await readState();
    if (!canBusiness(state, identity, "lesson.view"))
      throw new ForbiddenException();
    const scoped = scopeState(state, identity);
    const studentIds = scoped.students.map((s) => s.id);
    const groups = await database.classInClass.findMany({
      where: {
        studentId: { in: studentIds },
        teacherId: { in: scoped.teachers.map((t) => t.id) },
      },
    });
    const mappings = await database.classInLesson.findMany({
      where: {
        lessonId: { in: scoped.lessons.map((l) => l.id) },
        courseId: { not: null },
      },
    });
    const courseIds = [
      ...new Set(
        [
          ...groups.map((g) => g.courseId),
          ...mappings.map((m) => m.courseId),
        ].filter((v): v is string => !!v),
      ),
    ];
    const jobs = await database.classInJob.findMany({
      where: { operation: { startsWith: "course." } },
      orderBy: { createdAt: "desc" },
    });
    return {
      candidates: canBusiness(state, identity, "student.reschedule")
        ? candidates(state, identity)
        : [],
      classes: courseIds.map((courseId) => {
        const group = groups.find((g) => g.courseId === courseId);
        const lessons = scoped.lessons.filter((l) =>
          mappings.some((m) => m.courseId === courseId && m.lessonId === l.id),
        );
        const studentId = group?.studentId ?? lessons[0].studentId;
        const jobsHere = jobs.filter(
          (j) =>
            z.object({ courseId: z.string() }).parse(j.payload).courseId ===
            courseId,
        );
        const completed = jobsHere.filter((j) => j.status === "completed");
        const lastOwner = completed.find((j) => j.operation === "course.owner");
        const ownerResult = lastOwner
          ? z
              .object({
                ownerMode: z.string().optional(),
                ownerUid: z.string().optional(),
              })
              .parse(lastOwner.payload)
          : undefined;
        const lastStudent = completed.find(
          (j) => j.operation === "course.student",
        );
        const legacyStudent = lastStudent
          ? z.object({ studentUid: z.string() }).parse(lastStudent.payload)
              .studentUid
          : mappings.find((m) => m.courseId === courseId)?.studentUid;
        const legacyTeachers = [
          ...new Set(
            completed.flatMap((j) => {
              const p = z
                .object({
                  memberUid: z.string().optional(),
                  ownerUid: z.string().optional(),
                })
                .parse(j.payload);
              return [p.memberUid, p.ownerUid].filter(
                (uid): uid is string => !!uid,
              );
            }),
          ),
        ];
        return {
          courseId,
          studentId,
          isLegacy: !group,
          teacherId: group?.teacherId ?? lessons[0].teacherId,
          name: group?.name ?? `历史班级 ${courseId}`,
          owner:
            state.students.find((s) => s.id === studentId)?.owner ?? "待分配",
          mainTeacherUid:
            group?.mainTeacherUid ??
            (ownerResult?.ownerMode === "headteacher"
              ? ownerResult.ownerUid
              : undefined) ??
            "待核实",
          ownerMode: group?.ownerMode ?? ownerResult?.ownerMode ?? "legacy",
          studentUid: group
            ? (group.studentUid ?? "成员待核实")
            : (legacyStudent ?? "待核实"),
          teacherUids: group?.teacherUids ?? legacyTeachers,
          lessonCount: lessons.length,
          lessons: lessons.map((l) => ({
            id: l.id,
            date: l.date,
            time: l.time,
            status: l.status,
            classId: mappings.find((m) => m.lessonId === l.id)?.classId ?? "",
            activityId:
              mappings.find((m) => m.lessonId === l.id)?.activityId ?? "",
          })),
          jobs: jobsHere.map((j) => ({
            id: j.id,
            operation: j.operation,
            status: j.status,
            error: j.error ?? "",
            memberUid:
              z.object({ memberUid: z.string().optional() }).parse(j.payload)
                .memberUid ?? "",
          })),
        };
      }),
    };
  }

  @Post()
  async change(@Req() request: IncomingMessage, @Body() input: unknown) {
    const identity = await requireIdentity(request, true);
    const parsed = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("member"),
          courseId: z.string().min(1),
          memberKey: z.string().min(1),
        }),
        z.object({ action: z.literal("retry"), jobId: z.string().min(1) }),
      ])
      .safeParse(input);
    if (!parsed.success) throw new BadRequestException("操作参数无效");
    const body = parsed.data;
    return database.$transaction(async (tx) => {
      await lockBusiness(tx);
      const state = await readState(tx);
      if (
        !canBusiness(
          state,
          identity,
          body.action === "member" ? "student.reschedule" : "sync.retry",
        )
      )
        throw new ForbiddenException();
      const scoped = scopeState(state, identity);
      const job =
        body.action === "retry"
          ? await tx.classInJob.findUnique({ where: { id: body.jobId } })
          : null;
      if (
        body.action === "retry" &&
        (!job ||
          !job.operation.startsWith("course.") ||
          !["failed", "blocked"].includes(job.status))
      )
        throw new BadRequestException(
          "该操作不可直接重试，外部结果未知时请先核实",
        );
      const courseId =
        body.action === "member"
          ? body.courseId
          : z.object({ courseId: z.string() }).parse(job!.payload).courseId;
      const group = await tx.classInClass.findUnique({ where: { courseId } });
      const mapping = await tx.classInLesson.findFirst({
        where: { courseId, lessonId: { in: scoped.lessons.map((l) => l.id) } },
      });
      const studentId =
        group?.studentId ??
        scoped.lessons.find((l) => l.id === mapping?.lessonId)?.studentId;
      if (
        !studentId ||
        !scoped.students.some((s) => s.id === studentId) ||
        (group && !scoped.teachers.some((t) => t.id === group.teacherId))
      )
        throw new ForbiddenException();
      let jobId = job?.id;
      if (body.action === "retry") {
        await tx.classInJob.update({
          where: { id: job!.id },
          data: { status: "pending", error: null },
        });
      } else {
        const member = candidates(state, identity).find(
          (c) => c.key === body.memberKey,
        );
        if (!member)
          throw new BadRequestException("成员未关联 ClassIn 或不在授权范围内");
        if (
          group?.teacherUids.includes(member.uid) ||
          group?.mainTeacherUid === member.uid
        )
          throw new BadRequestException("该成员已在班级中");
        const active = await tx.classInJob.findFirst({
          where: {
            operation: "course.member",
            status: { in: ["pending", "processing", "uncertain", "failed", "blocked"] },
            AND: [
              { payload: { path: ["courseId"], equals: courseId } },
              { payload: { path: ["memberUid"], equals: member.uid } },
            ],
          },
        });
        if (active?.status === "uncertain" || active?.status === "blocked") throw new BadRequestException("暂时无法确认成员添加结果，请联系管理员");
        if (active) {
          jobId = active.id;
          if (active.status === "failed") await tx.classInJob.update({where:{id:active.id},data:{status:"pending",error:null,retryAt:null}});
        } else {
          const created = await tx.classInJob.create({
            data: {
              operation: "course.member",
              classLocalId: group?.id,
              payload: {
                courseId,
                studentId,
                memberUid: member.uid,
                operator: identity.name,
              },
            },
          });
          jobId = created.id;
        }
      }
      return { jobId, message: "正在添加成员" };
    });
  }
  @Get("logs")
  async logs(@Req() request: IncomingMessage) { return this.jobs(request, true); }

  @Get("jobs")
  async jobs(@Req() request: IncomingMessage, all = false) {
    const identity = await requireIdentity(request);
    const state = await readState();
    if (!canBusiness(state, identity, all ? "lesson.view" : "sync.retry"))
      throw new ForbiddenException();
    const scoped = scopeState(state, identity);
    const jobs = await database.classInJob.findMany({
      where: all ? {} : { status: { in: ["failed", "blocked", "uncertain"] } },
      orderBy: { createdAt: "desc" },
    });
    const records = await database.classInLesson.findMany({
      where: { lessonId: { in: scoped.lessons.map((l) => l.id) } },
    });
    const groupIds = await database.classInClass.findMany({
      where: {
        studentId: { in: scoped.students.map((s) => s.id) },
        teacherId: { in: scoped.teachers.map((t) => t.id) },
      },
    });
    const visible = jobs.filter((job) =>
      job.lessonId
        ? scoped.lessons.some((l) => l.id === job.lessonId)
        : scoped.students.some(
            (s) =>
              s.id ===
              z.object({ studentId: z.string() }).parse(job.payload).studentId,
          ) &&
          (job.classLocalId
            ? groupIds.some((g) => g.id === job.classLocalId)
            : records.some(
                (m) =>
                  m.courseId ===
                  z.object({ courseId: z.string() }).parse(job.payload)
                    .courseId,
              )),
    );
    const notices = await database.classInWebhook.findMany({
      where: all ? {} : { error: { not: null } },
      orderBy: { receivedAt: "desc" },
    });
    return {
      jobs: visible.map((job) => ({
        id: job.id,
        lessonId: job.lessonId ?? "",
        createdAt: job.createdAt.toISOString(),
        studentId: job.lessonId ? scoped.lessons.find(l => l.id === job.lessonId)?.studentId ?? "" : z.object({studentId:z.string()}).parse(job.payload).studentId,
        attempts: job.attempts,
        operation: job.operation,
        status: job.status,
        error: job.error ?? "",
        step:
          z.object({ classinStep: z.string().optional() }).parse(job.payload)
            .classinStep ?? "",
        courseId:
          records.find((m) => m.lessonId === job.lessonId)?.courseId ??
          groupIds.find((g) => g.id === job.classLocalId)?.courseId ??
          z.object({ courseId: z.string().optional() }).parse(job.payload)
            .courseId ??
          "",
      })),
      notices: notices
        .filter((row) => {
          const payload = z
            .object({
              CourseId: z.coerce.string().optional(),
              CourseID: z.coerce.string().optional(),
            })
            .parse(row.payload);
          const courseId = payload.CourseId ?? payload.CourseID;
          return (
            identity.roleId === "admin" ||
            records.some((m) => m.courseId === courseId) ||
            groupIds.some((g) => g.courseId === courseId)
          );
        })
        .map((row) => {
          const payload = z
            .object({
              CourseId: z.coerce.string().optional(),
              CourseID: z.coerce.string().optional(),
              ClassID: z.coerce.string().optional(),
            })
            .parse(row.payload);
          return {
            id: row.id,
            command: row.command,
            error: row.error ?? "",
            receivedAt: row.receivedAt.toISOString(),
            courseId: payload.CourseId ?? payload.CourseID ?? "",
            classId: payload.ClassID ?? "",
          };
        }),
    };
  }

  @Post("verify")
  async verify(@Req() request: IncomingMessage, @Body() input: unknown) {
    const identity = await requireIdentity(request, true);
    const id = z.string().regex(/^[1-9]\d*$/);
    const parsed = z
      .object({
        jobId: z.string(),
        outcome: z.enum(["applied", "not-applied", "never-created"]),
        evidence: z.string().trim().min(1),
        courseId: id.optional(),
        classId: id.optional(),
        activityId: id.optional(),
      })
      .safeParse(input);
    if (!parsed.success)
      throw new BadRequestException("请填写核实结论、外部编号及依据");
    const body = parsed.data;
    return database.$transaction(async (tx) => {
      await lockBusiness(tx);
      const state = await readState(tx);
      if (!canBusiness(state, identity, "sync.retry"))
        throw new ForbiddenException();
      const scoped = scopeState(state, identity);
      const job = await tx.classInJob.findUnique({ where: { id: body.jobId } });
      if (!job || !["uncertain", "failed", "blocked"].includes(job.status))
        throw new BadRequestException("同步状态已变化，请刷新后核实");
      const payload = z
        .object({
          classinStep: z.string().optional(),
          studentId: z.string(),
          teacherId: z.string().optional(),
          courseId: z.string().optional(),
          memberUid: z.string().optional(),
          studentUid: z.string().optional(),
          ownerAccountId: z.string().optional(),
        })
        .passthrough()
        .parse(job.payload);
      const lesson = job.lessonId
        ? scoped.lessons.find((l) => l.id === job.lessonId)
        : undefined;
      if (
        job.lessonId
          ? !lesson
          : !scoped.students.some((s) => s.id === payload.studentId)
      )
        throw new ForbiddenException();
      if (!job.lessonId && job.classLocalId) {
        const group = await tx.classInClass.findUniqueOrThrow({
          where: { id: job.classLocalId },
        });
        if (!scoped.teachers.some((t) => t.id === group.teacherId))
          throw new ForbiddenException();
      }
      const mapping = job.lessonId
        ? await tx.classInLesson.findUnique({
            where: { lessonId: job.lessonId },
          })
        : null;
      const step = payload.classinStep;
      let completed = false;
      if (body.outcome === "never-created") {
        if (job.operation !== "cancel" || mapping?.classId)
          throw new BadRequestException(
            "只有缺少外部课堂映射的取消任务可登记从未创建",
          );
        await tx.classInJob.updateMany({
          where: {
            lessonId: job.lessonId,
            status: "uncertain",
            operation: "create",
          },
          data: { status: "superseded", error: "已人工核实原课堂从未创建" },
        });
        completed = true;
      }
      if (body.outcome === "applied") {
        if (step === "lesson.create") {
          if (
            !body.classId ||
            !body.activityId ||
            !body.courseId ||
            body.courseId !== mapping?.courseId
          )
            throw new BadRequestException(
              "请填写属于原班级的课堂 ID 和活动 ID，班级编号必须与本地记录一致",
            );
          if (
            await tx.classInLesson.findFirst({
              where: {
                OR: [
                  { courseId: body.courseId, classId: body.classId },
                  { activityId: body.activityId },
                ],
                lessonId: { not: job.lessonId! },
              },
            })
          )
            throw new BadRequestException("该课堂已关联其他课程");
          await tx.classInLesson.update({
            where: { lessonId: job.lessonId! },
            data: {
              classId: body.classId,
              activityId: body.activityId,
              teacherUid: state.teachers.find(
                (t) => t.id === payload.teacherId,
              )!.classInUid,
            },
          });
          completed = true;
        } else if (step === "course.create") {
          if (!body.courseId || !job.classLocalId)
            throw new BadRequestException("请填写已核实的原班级 ID");
          if (
            await tx.classInClass.findFirst({
              where: { courseId: body.courseId, id: { not: job.classLocalId } },
            })
          )
            throw new BadRequestException("该班级已关联其他学员与老师组合");
          const group = await tx.classInClass.findUniqueOrThrow({
            where: { id: job.classLocalId },
          });
          await tx.classInClass.update({
            where: { id: group.id },
            data: {
              courseId: body.courseId,
              mainTeacherUid: state.accounts.find(
                (a) => a.id === group.ownerAccountId,
              )?.classInUid,
            },
          });
        } else if (step === "lesson.edit" || step === "lesson.cancel")
          completed = true;
        else if (step === "owner.headteacher") {
          const owner = state.accounts.find(
            (a) => a.id === payload.ownerAccountId,
          )!;
          payload.ownerUid = owner.classInUid;
          payload.ownerMode = "headteacher";
          await tx.classInClass.updateMany({
            where: { courseId: payload.courseId },
            data: {
              mainTeacherUid: owner.classInUid,
              ownerAccountId: owner.id,
              ownerMode: "headteacher",
            },
          });
          completed = true;
        } else if (step === "member.replace.remove") {
          await tx.classInClass.updateMany({
            where: { courseId: payload.courseId },
            data: { studentUid: payload.studentUid },
          });
          completed = true;
        }
      }
      await tx.classInJob.update({
        where: { id: job.id },
        data: {
          status: completed ? "completed" : "pending",
          error: null,
          payload: JSON.parse(
            JSON.stringify({
              ...payload,
              verification: {
                outcome: body.outcome,
                evidence: body.evidence,
                operator: identity.name,
                at: new Date().toISOString(),
              },
            }),
          ),
        },
      });
      if (job.lessonId)
        await tx.classInJob.updateMany({
          where: { lessonId: job.lessonId, status: "blocked" },
          data: { status: "pending", error: null },
        });
      const localLesson = state.lessons.find((l) => l.id === job.lessonId);
      const newer = await tx.classInJob.count({
        where: {
          lessonId: job.lessonId,
          createdAt: { gt: job.createdAt },
          status: { not: "superseded" },
        },
      });
      const sameIntent =
        localLesson &&
        ["studentId", "teacherId", "date", "time", "duration", "status"].every(
          (key) => Reflect.get(localLesson, key) === payload[key],
        );
      if (localLesson && !newer && sameIntent) {
        localLesson.sync = completed ? "已同步" : "处理中";
        localLesson.syncState = completed ? "completed" : "pending";
        localLesson.syncReason = completed
          ? "人工核实外部结果"
          : "核实后继续同步";
        localLesson.syncRetryable = false;
      }
      state.events.unshift({
        id: crypto.randomUUID(),
        studentId: payload.studentId,
        teacherId: payload.teacherId ?? "",
        date: new Date().toISOString(),
        type: "核实 ClassIn 同步",
        operator: identity.name,
        content: `${job.operation} / ${step ?? "未发出请求"}：${body.outcome === "applied" ? "确认已执行" : body.outcome === "never-created" ? "确认原课堂从未创建" : "确认未执行"}；${body.evidence}`,
        relatedType: job.lessonId ? "lesson" : "student",
        relatedId: job.lessonId ?? payload.studentId,
      });
      await writeState(tx, state);
      return {
        message: completed
          ? "核实结果已记录"
          : "核实结果已记录，已恢复同步队列",
      };
    });
  }
}
