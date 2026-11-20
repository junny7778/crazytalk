import { createHash } from "node:crypto";
import { z } from "zod";
import type { DemoState, Lesson } from "../../../../packages/shared/src/model";
import { database } from "../store";
import {
  ClassInApiError,
  ClassInClient,
  ClassInUncertainError,
} from "./classin";

export function bookingIdentities(
  state: DemoState,
  lesson: Pick<Lesson, "studentId" | "teacherId">,
) {
  const student = state.students.find((s) => s.id === lesson.studentId)!;
  const teacher = state.teachers.find((t) => t.id === lesson.teacherId)!;
  const account = state.classInAccounts?.find((a) =>
    a.studentIds.includes(student.id),
  );
  const owner = state.accounts.find((a) => a.id === student.ownerAccountId);
  if (!student.chineseName.trim() || !student.id || !teacher.name.trim())
    throw new Error("请补全学员中文名、学员 ID 和老师英文名");
  if (!account?.uid) throw new Error("请先关联学员 ClassIn 账号");
  if (!teacher.classInUid) throw new Error("请先关联老师 ClassIn 账号");
  if (!owner?.enabled || !owner.classInUid)
    throw new Error("请先选择负责教务并关联该教务的 ClassIn 账号");
  return { student, teacher, account, owner };
}

export async function ensureClass(
  state: DemoState,
  lesson: Lesson,
  client: ClassInClient,
  step: (value: string) => Promise<void>,
  jobId: string,
) {
  const { student, teacher, account, owner } = bookingIdentities(state, lesson);
  let group = await database.classInClass.upsert({
    where: {
      studentId_teacherId: { studentId: student.id, teacherId: teacher.id },
    },
    create: {
      studentId: student.id,
      teacherId: teacher.id,
      name: `${student.chineseName} ${student.id} - ${teacher.name} 学习群`,
      ownerAccountId: owner.id,
    },
    update: {},
  });
  await database.classInJob.update({
    where: { id: jobId },
    data: { classLocalId: group.id },
  });
  if (
    await database.classInJob.count({
      where: {
        classLocalId: group.id,
        status: "uncertain",
        id: { not: jobId },
      },
    })
  )
    throw new Error("该班级存在结果未知的操作，请先核实同步记录");
  if (!group.courseId) {
    if ([...group.name].length > 90)
      throw new Error(
        "班级名称超过 ClassIn 的 90 字限制，请缩短学员或老师名称",
      );
    await step("course.create");
    const raw = await client.createCourse(
      group.name,
      createHash("md5")
        .update(JSON.stringify([student.id, teacher.id]))
        .digest("hex"),
      owner.classInUid,
    );
    const parsed = z
      .union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()])
      .safeParse(raw);
    if (!parsed.success)
      throw new ClassInUncertainError(
        "建班返回成功，但班级 ID 无法解析，请核对外部记录",
      );
    group = await database.classInClass.update({
      where: { id: group.id },
      data: {
        courseId: String(parsed.data),
        mainTeacherUid: owner.classInUid,
        ownerAccountId: owner.id,
      },
    });
  }
  const external = z
    .object({
      values: z
        .object({
          courseStatus: z.number().optional(),
          studentInfos: z
            .array(z.object({ studentUid: z.string() }))
            .optional(),
        })
        .optional(),
    })
    .parse(group.externalFacts ?? {});
  if ([3, 4].includes(external.values?.courseStatus ?? 0))
    throw new Error("ClassIn 班级已结课或删除，请先核实班级状态");
  if (external.values?.studentInfos && !group.studentUid)
    throw new Error("ClassIn 班级成员存在差异，请先核实");
  const courseId = group.courseId!;
  if (group.studentUid && group.studentUid !== account.uid)
    throw new Error("班级学员账号正在更换，请先完成成员同步");
  if (!group.studentUid) {
    await step("member.add");
    await client.call("addCourseStudent", {
      courseId,
      identity: "1",
      studentUid: account.uid,
    });
    group = await database.classInClass.update({
      where: { id: group.id },
      data: { studentUid: account.uid },
    });
  }
  for (const uid of [teacher.classInUid!, owner.classInUid!]) {
    if (group.mainTeacherUid === uid || group.teacherUids.includes(uid))
      continue;
    await step("teacher.add");
    await client.addCourseTeacher(courseId, uid);
    group = await database.classInClass.update({
      where: { id: group.id },
      data: { teacherUids: { push: uid } },
    });
  }
  return group;
}

export async function syncCourseOwner(
  courseId: string,
  ownerUid: string,
  client: ClassInClient,
  step: (value: string) => Promise<void>,
  added = false,
) {
  if (!added) {
    await step("owner.add");
    await client.addCourseTeacher(courseId, ownerUid);
  }
  await step("owner.headteacher");
  try {
    await client.call("editCourse", {
      courseId,
      mainTeacherUid: ownerUid,
      stamp: "1",
    });
    return "headteacher";
  } catch (error) {
    // 这两个明确拒绝更换的返回码允许按业务约定仅加入班级。
    if (error instanceof ClassInApiError && [314, 369].includes(error.code))
      return "member";
    throw error;
  }
}
