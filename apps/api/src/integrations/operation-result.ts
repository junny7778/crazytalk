import type { AppliedCommand } from "@prisma/client";
import { z } from "zod";
import {
  assertCommandAccess,
  type BusinessIdentity,
} from "../../../../packages/shared/src/access";
import { parseCommand } from "../../../../packages/shared/src/commandSchema";
import type { DemoState } from "../../../../packages/shared/src/model";
import { writeState, type Transaction } from "../store";

export function operationFailure(type: string, reason: string) {
  const prefix =
    type === "teacher.offboard"
      ? "老师已离职，部分课程尚未取消，请到课程列表查看"
      : type === "lesson.changeTeacher"
      ? "原老师部分课程尚未取消，暂时无法重新排课"
      : type === "lesson.schedule"
        ? "部分课程未排成，请在课程列表查看"
        : type === "student.bindClassIn"
          ? "账号更换未完成，请查看当前账号与课时"
          : [
                "student.details.update",
                "student.profile",
                "student.edit",
                "account.save",
              ].includes(type)
            ? "负责人已更新，部分 ClassIn 班级交接未完成"
            : type === "lesson.reschedule"
              ? "改期未完成"
              : type === "student.lifecycle"
                ? "服务状态已保存，部分课程尚未取消"
                : "课程同步未完成";
  return (
    prefix +
    "。" +
    (/ClassIn (errno|v2 code|HTTP|v2 HTTP)/.test(reason)
      ? "平台未能完成操作，请联系管理员查看原因。"
      : reason)
  );
}

export async function commandOperationResult(
  tx: Transaction,
  command: AppliedCommand,
  state: DemoState,
) {
  const jobs = await tx.classInJob.findMany({
    where: { operationId: command.id },
  });
  const type = z.object({ type: z.string() }).parse(command.command).type;
  const change = state.students.find(
    (s) => s.classInChange?.operationId === command.id,
  )?.classInChange;
  // Finish all independent batch items before reporting the final result.
  if (jobs.some((j) => ["pending", "processing"].includes(j.status)))
    return { status: "processing", message: "正在处理" };
  const failed = jobs.find((j) =>
    ["failed", "uncertain", "blocked"].includes(j.status),
  );
  if (failed || change?.error)
    return {
      status: "failed",
      message: operationFailure(
        type,
        change?.error || failed!.error || "请联系管理员",
      ),
      retryable: !jobs.some((j) => ["uncertain", "blocked"].includes(j.status)),
    };
  if (jobs.some((j) => j.status === "superseded"))
    return {
      status: "failed",
      message: "本次操作已被后续操作替代，请查看当前课程结果。",
      retryable: false,
    };
  if (change) return { status: "processing", message: "正在更换账号" };
  return {
    status: "completed",
    message:
      type === "teacher.offboard"
        ? command.message
        : type === "lesson.changeTeacher"
        ? "原预约已全部取消，可以重新选择老师和时间"
        : type === "student.bindClassIn"
          ? "ClassIn 账号已更新，课时已按规则处理"
          : jobs.length
            ? type === "lesson.schedule"
              ? "排课完成"
              : "操作完成"
            : command.message,
  };
}

export async function resumeCommandOperation(
  tx: Transaction,
  command: AppliedCommand,
  state: DemoState,
  identity: BusinessIdentity,
) {
  const parsed = parseCommand(command.command);
  const result = await commandOperationResult(tx, command, state);
  if (result.status !== "failed") return;
  assertCommandAccess(state, identity, parsed);
  if (!result.retryable) throw new Error(result.message);
  const unfinished = await tx.classInJob.findMany({
    where: { operationId: command.id, status: "failed" },
  });
  for (const lesson of state.lessons.filter((l) =>
    unfinished.some((j) => j.lessonId === l.id),
  )) {
    lesson.sync = "处理中";
    lesson.syncState = "pending";
    lesson.syncReason = "正在处理";
    lesson.syncRetryable = false;
  }
  await tx.classInJob.updateMany({
    where: { operationId: command.id, status: "failed" },
    data: { status: "pending", retryAt: null, error: null },
  });
  const change = state.students.find(
    (s) => s.classInChange?.operationId === command.id,
  )?.classInChange;
  if (change) delete change.error;
  await writeState(tx, state);
}
