import { assertCommandAccess } from "../../../../packages/shared/src/access";
import { accountBalanceAlignmentIssue } from "../../../../packages/shared/src/packageBalances";
import { finishStudentAccountChange } from "../../../../packages/shared/src/classInChanges";
import { database, lockBusiness, readState, writeState } from "../store";

export async function advanceAccountChanges() {
  await database.$transaction(async (tx) => {
    await lockBusiness(tx);
    const state = await readState(tx);
    const before = structuredClone(state);
    for (const student of state.students) {
      const change = student.classInChange;
      if (!change || change.error) continue;
      if (change.phase === "canceling") {
        const jobs = await tx.classInJob.findMany({
          where: {
            lessonId: { in: change.lessonIds },
            operation: "cancel",
            status: { not: "superseded" },
          },
        });
        if (
          change.lessonIds.some(
            (id) =>
              !jobs.some(
                (j) => j.lessonId === id && j.status === "completed",
              ) ||
              jobs.some((j) => j.lessonId === id && j.status !== "completed"),
          )
        )
          continue;
        try {
          const source = state.classInAccounts?.find((a) =>
            a.studentIds.includes(student.id),
          );
          if (source?.uid !== change.sourceUid)
            throw new Error("原账号归属已经变化，请核实后继续更换");
          const target = state.classInAccounts?.find(
            (a) => a.uid === change.uid,
          );
          const issue =
            accountBalanceAlignmentIssue(state, student.id) ||
            (target?.studentIds[0]
              ? accountBalanceAlignmentIssue(state, target.studentIds[0])
              : "");
          if (issue) throw new Error(issue);
          if (change.requestedByAccountId) {
            const actor = state.accounts.find(
              (a) => a.id === change.requestedByAccountId && a.enabled,
            );
            if (!actor)
              throw new Error("申请账号已停用，请由有权限的教务继续处理");
            assertCommandAccess(
              state,
              { accountId: actor.id, roleId: actor.roleId, name: actor.name },
              {
                type: "student.bindClassIn",
                id: student.id,
                uid: change.uid,
                phone: change.phone,
              },
            );
          }
        } catch (error) {
          change.error =
            error instanceof Error ? error.message : "账号归属待核实";
          continue;
        }
        const groups = await tx.classInClass.findMany({
          where: { studentId: student.id },
        });
        const mappings = await tx.classInLesson.findMany({
          where: {
            lessonId: {
              in: state.lessons
                .filter((l) => l.studentId === student.id)
                .map((l) => l.id),
            },
          },
        });
        const courseIds = new Set(
          [
            ...groups.map((g) => g.courseId),
            ...mappings.map((m) => m.courseId),
          ].filter((v): v is string => !!v),
        );
        finishStudentAccountChange(state, student.id);
        for (const courseId of courseIds)
          await tx.classInJob.create({
            data: {
              operation: "course.student",
              operationId: change.operationId,
              classLocalId: groups.find((g) => g.courseId === courseId)?.id,
              payload: {
                courseId,
                studentId: student.id,
                sourceUid: change.sourceUid,
                studentUid: change.uid,
              },
            },
          });
      }
      const memberJobs = await tx.classInJob.findMany({
        where: {
          operation: "course.student",
          AND: [
            { payload: { path: ["studentId"], equals: student.id } },
            { payload: { path: ["studentUid"], equals: change.uid } },
          ],
        },
      });
      if (
        change.phase === "members" &&
        memberJobs.every((j) => j.status === "completed")
      )
        delete student.classInChange;
    }
    await writeState(tx, state, before);
  });
}
