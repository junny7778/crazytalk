import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  businessMode,
  businessRequest,
  useDemo,
} from "@crazytalk/shared/react";
import { Button, Panel, Select } from "@crazytalk/ui";
const resultSchema = z.object({
  candidates: z.array(
    z.object({ key: z.string(), name: z.string(), uid: z.string() }),
  ),
  classes: z.array(
    z.object({
      courseId: z.string(),
      studentId: z.string(),
      teacherId: z.string(),
      name: z.string(),
      isLegacy: z.boolean(),
      owner: z.string(),
      mainTeacherUid: z.string(),
      ownerMode: z.string(),
      studentUid: z.string(),
      teacherUids: z.array(z.string()),
      lessonCount: z.number(),
      lessons: z.array(
        z.object({
          id: z.string(),
          date: z.string(),
          time: z.string(),
          status: z.string(),
          classId: z.string(),
          activityId: z.string(),
        }),
      ),
      jobs: z.array(
        z.object({
          id: z.string(),
          operation: z.string(),
          status: z.string(),
          error: z.string(),
          memberUid: z.string(),
        }),
      ),
    }),
  ),
});
export default function StudentClasses({ studentId }: { studentId?: string }) {
  const { data, can, accountId } = useDemo();
  const query = useQuery({
    queryKey: ["classin-classes", accountId, data.revision],
    enabled: businessMode() && can("lesson.view"),
    queryFn: async () =>
      resultSchema.parse(await businessRequest("/classin-classes")),
    refetchInterval: 5000,
  });
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  if (!businessMode())
    return (
      <Panel title="ClassIn 班级">
        <p>真实班级记录在业务模式中显示；首次排课时自动创建。</p>
      </Panel>
    );
  async function submit(
    body:
      { action: "member"; courseId: string; memberKey: string },
  ) {
    setBusy(true);
    setMessage("");
    try {
      const saved = z.object({jobId:z.string()}).parse(await businessRequest("/classin-classes", "POST", body));
      const deadline=Date.now()+120000;
      while(true) {
        const current=await query.refetch();
        if(current.error) throw new Error("暂时无法获取处理结果，请稍后查看");
        const job=current.data?.classes.flatMap(g=>g.jobs).find(j=>j.id===saved.jobId);
        if(job?.status==="completed") {setMessage("成员已加入班级");break;}
        if(job && ["failed","uncertain","blocked"].includes(job.status)) throw new Error("成员添加未完成。"+(/ClassIn (errno|v2)/.test(job.error)?"请联系管理员查看原因":job.error));
        if(Date.now()>=deadline) throw new Error("成员仍在添加中，可以稍后查看");
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  const classes = (query.data?.classes ?? []).filter(
    (group) => !studentId || group.studentId === studentId,
  );
  return (
    <Panel title={studentId ? "ClassIn 班级" : "班级同步事项"}>
      {query.error && (
        <p role="alert">班级记录读取失败：{query.error.message}</p>
      )}
      {message && <p role="status">{message}</p>}
      {!query.isLoading && !classes.length && (
        <p>首次排课后自动创建班级；课程同步进度可在课程记录中查看。</p>
      )}
      {classes.map((group) => (
        <details key={group.courseId} className="inset">
          <summary>
            {group.name}
            {group.isLegacy && "（历史班级）"} · {group.lessonCount} 条课程记录
          </summary>
          <p>
            负责教务：{group.owner} · ClassIn 班主任 UID：{group.mainTeacherUid}
            {group.ownerMode === "member" && "（接手教务已作为教师成员加入）"}
          </p>
          <p>
            班级 ID：{group.courseId} · 学员 UID：{group.studentUid} ·
            教师成员：{group.teacherUids.join("、") || "暂无已确认记录"}
          </p>
          <ul>
            {group.lessons.map((lesson) => (
              <li key={lesson.id}>
                {lesson.date} {lesson.time} · {lesson.status} · 课堂{" "}
                {lesson.classId || "待同步"} / 活动{" "}
                {lesson.activityId || "旧课未登记"}
              </li>
            ))}
          </ul>
          {group.jobs.some(j=>["pending","processing"].includes(j.status))&&<p role="status">正在更新班级</p>}
          {group.jobs.find(j=>["failed","uncertain","blocked"].includes(j.status))&&<p role="alert">班级更新未完成，请检查成员账号或联系管理员。</p>}
          {studentId && can("student.reschedule") && (
            <div className="row">
              <Select
                aria-label={`为 ${group.name} 添加成员`}
                value={selection[group.courseId] || ""}
                onValueChange={(value) =>
                  setSelection({ ...selection, [group.courseId]: value })
                }
              >
                <option value="">选择教务、老师或 TM</option>
                {query.data?.candidates
                  .filter(
                    (c) =>
                      c.uid !== group.mainTeacherUid &&
                      !group.teacherUids.includes(c.uid),
                  )
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name} · UID {c.uid}
                    </option>
                  ))}
              </Select>
              <Button
                loading={busy}
                disabled={busy || group.jobs.some(j=>["pending","processing"].includes(j.status)) || !selection[group.courseId]}
                onClick={() =>
                  submit({
                    action: "member",
                    courseId: group.courseId,
                    memberKey: selection[group.courseId],
                  })
                }
              >
                {busy ? "正在添加成员" : "加入班级"}
              </Button>
              <small>按教师成员加入，不改变主讲老师。</small>
            </div>
          )}
        </details>
      ))}
    </Panel>
  );
}
