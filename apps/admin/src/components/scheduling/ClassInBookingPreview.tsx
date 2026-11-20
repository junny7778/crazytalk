import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  businessMode,
  businessRequest,
  useDemo,
} from "@crazytalk/shared/react";
const schema = z.object({
  classes: z.array(
    z.object({
      studentId: z.string(),
      teacherId: z.string(),
      courseId: z.string(),
      name: z.string(),
      isLegacy: z.boolean(),
    }),
  ),
});
export default function ClassInBookingPreview({
  studentId,
  teacherIds,
}: {
  studentId: string;
  teacherIds: string[];
}) {
  const { data } = useDemo();
  const query = useQuery({
    queryKey: ["booking-classes", studentId, data.revision],
    enabled: businessMode() && !!studentId,
    queryFn: async () =>
      schema.parse(await businessRequest("/classin-classes")),
  });
  const student = data.students.find((s) => s.id === studentId);
  if (!student || !businessMode()) return null;
  const owner = data.accounts.find((a) => a.id === student.ownerAccountId);
  const account = data.classInAccounts?.find((a) =>
    a.studentIds.includes(studentId),
  );
  return (
    <div className="inset" aria-label="ClassIn 班级预览">
      <strong>本次课程的班级</strong>
      {(!account?.uid || !owner?.classInUid || !owner.enabled) && (
        <p role="alert">请先关联学员账号，并选择已关联 ClassIn 的负责教务。</p>
      )}
      {[...new Set(teacherIds)].map((id) => {
        const teacher = data.teachers.find((t) => t.id === id);
        const group = query.data?.classes.find(
          (g) => !g.isLegacy && g.studentId === studentId && g.teacherId === id,
        );
        return (
          <p key={id}>
            {group
              ? `复用：${group.name}`
              : `${query.isLoading || query.error ? "待核实班级：" : "新建："}${student.chineseName} ${student.id} - ${teacher?.name ?? "待选老师"} 学习群`}
            {!teacher?.classInUid && "（请先关联老师 ClassIn 账号）"}
          </p>
        );
      })}
      <small>保存后进入同步队列；每节课有独立的课堂记录。</small>
    </div>
  );
}
