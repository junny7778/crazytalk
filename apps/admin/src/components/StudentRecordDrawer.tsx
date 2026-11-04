import { creditTypeLabel } from "../lib/creditLabels";
import type { ReactNode } from "react";
import { useDemo } from "@crazytalk/shared/react";
import type { Student } from "@crazytalk/shared";
import { Badge, Button, Drawer, EmptyState } from "@crazytalk/ui";
import type { StudentRecordTarget } from "../lib/studentActivity";

export function RecordFields({ values }: { values: [string, ReactNode][] }) {
  return (
    <dl className="student-record-fields">
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value === "" || value === undefined || value === null ? (
              <span className="muted">未记录</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function recordTime(value?: string) {
  if (!value) return "未记录";
  if (!value.includes("T")) return value;
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Singapore",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export default function StudentRecordDrawer({
  student,
  target,
  onClose,
  onOpenFeedback,
  onOpenLesson,
  onOpen,
}: {
  student: Student;
  target: StudentRecordTarget | null;
  onClose: () => void;
  onOpenFeedback: (id: string) => void;
  onOpenLesson: (id: string) => void;
  onOpen: (target: StudentRecordTarget) => void;
}) {
  const { data, can } = useDemo();
  if (!target) return null;
  let title = "业务记录";
  let body: ReactNode = <EmptyState title="没有找到这条记录" />;
  if (target.kind === "credit") {
    const item = data.credits.find(
      (item) =>
        item.id === target.id &&
        (item.studentId === student.id ||
          data.referrals.some(
            (relation) =>
              relation.id === item.referralId &&
              (relation.studentId === student.id ||
                relation.referrerStudentId === student.id),
          )),
    );
    if (item) {
      title = `${creditTypeLabel(item.type)}记录`;
      body = (
        <>
          <RecordFields
            values={[
              [
                "学员",
                data.students.find((learner) => learner.id === item.studentId)
                  ?.name,
              ],
              ["业务日期", item.date],
              ["课时变动", `${item.units > 0 ? "+" : ""}${item.units} 课时`],
              [
                "变动前余额",
                `${(item.balance - item.units).toLocaleString("zh-CN", { maximumFractionDigits: 8 })} 课时`,
              ],
              ["变动后余额", `${item.balance} 课时`],
              ["登记金额", item.amount ?? "未登记"],
              ["说明", item.note],
              ["经办人", item.operator],
              ["登记时间", recordTime(item.recordedAt)],
            ]}
          />
          <div className="student-record-links">
            {item.lessonId && can("lesson.view") && (
              <Button size="sm" onClick={() => onOpenLesson(item.lessonId!)}>
                查看对应课程
              </Button>
            )}
            {item.feedbackId && can("feedback.view") && (
              <Button
                size="sm"
                onClick={() => onOpenFeedback(item.feedbackId!)}
              >
                查看关联反馈
              </Button>
            )}
            {item.referralId && (
              <Button
                size="sm"
                onClick={() =>
                  onOpen({ kind: "referral", id: item.referralId! })
                }
              >
                查看转介绍关系
              </Button>
            )}
          </div>
        </>
      );
    }
  } else if (target.kind === "referral") {
    const item = data.referrals.find(
      (item) =>
        item.id === target.id &&
        (item.studentId === student.id ||
          item.referrerStudentId === student.id),
    );
    if (item) {
      title = "转介绍记录";
      const name = (id: string) =>
        data.students.find((student) => student.id === id)?.name ||
        "未关联学员";
      const credits = data.credits.filter(
        (credit) => credit.referralId === item.id,
      );
      body = (
        <>
          <RecordFields
            values={[
              ["介绍人", name(item.referrerStudentId)],
              ["被介绍人", name(item.studentId)],
              ["业务日期", item.date],
              ["说明", item.note],
              ["经办人", item.operator],
              ["登记时间", recordTime(item.recordedAt)],
            ]}
          />
          <h3 className="student-record-heading">关联充值与课时</h3>
          {credits.length ? (
            <div className="student-linked-records">
              {credits.map((credit) => (
                <button
                  key={credit.id}
                  onClick={() => onOpen({ kind: "credit", id: credit.id })}
                >
                  <span>
                    <strong>
                      {creditTypeLabel(credit.type)} ·{" "}
                      {credit.units > 0 ? "+" : ""}
                      {credit.units} 课时
                    </strong>
                    <small>
                      {credit.date}
                      {credit.amount === undefined
                        ? ""
                        : ` · 金额 ${credit.amount}`}
                    </small>
                  </span>
                  <span aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">暂无关联记录。转介绍关系本身不增加课时。</p>
          )}
        </>
      );
    }
  } else if (target.kind === "task") {
    const item = data.tasks.find(
      (item) => item.id === target.id && item.studentId === student.id,
    );
    if (item) {
      title = item.title;
      body = (
        <>
          <Badge tone={item.status === "已完成" ? "success" : "warning"}>
            {item.status}
          </Badge>
          <RecordFields
            values={[
              ["负责人", item.owner || "待分配"],
              ["处理期限", item.dueDate || "未安排"],
              ["事项说明", item.note],
              ["创建人", item.createdBy],
              ["创建时间", recordTime(item.createdAt)],
              ["完成人", item.completedBy],
              ["完成时间", recordTime(item.completedAt)],
              ["补充说明", item.result || "未补充"],
            ]}
          />
          <div className="student-record-links">
            {item.lessonIds?.map((id) => {
              const lesson = data.lessons.find((lesson) => lesson.id === id);
              return lesson && can("lesson.view") ? (
                <Button key={id} size="sm" onClick={() => onOpenLesson(id)}>
                  {lesson.date} {lesson.time} 的课程
                </Button>
              ) : null;
            })}
            {item.sourceType === "feedback" &&
              item.sourceId &&
              can("feedback.view") && (
                <Button
                  size="sm"
                  onClick={() => onOpenFeedback(item.sourceId!)}
                >
                  查看原反馈
                </Button>
              )}
          </div>
        </>
      );
    }
  } else if (target.kind === "teacherChange") {
    const item = student.teacherChanges[target.index];
    if (item) {
      title = "换老师记录";
      body = (
        <RecordFields
          values={[
            ["学员", student.name],
            ["生效日期", item.date],
            ["原老师", item.fromTeacher],
            ["新老师", item.toTeacher],
            ["原因", item.reason],
          ]}
        />
      );
    }
  } else {
    const item = data.events.find(
      (item) => item.id === target.id && item.studentId === student.id,
    );
    if (item) {
      title =
        item.type === "在读" ? "复课记录" : `${creditTypeLabel(item.type)}记录`;
      const latestRefund = data.events.find(
        (event) => event.studentId === student.id && event.type === "退费",
      );
      const stopResults =
        item.serviceStopResults ||
        (item.id === latestRefund?.id ? student.serviceStopResults : []);
      body = (
        <>
          <RecordFields
            values={[
              ["日期", item.date],
              ["内容", item.content],
              ["经办人", item.operator],
              ["登记时间", recordTime(item.recordedAt)],
            ]}
          />
          {stopResults.length > 0 && (
            <section aria-label="服务停用进展">
              <h3>服务停用进展</h3>
              {stopResults.map((result) => (
                <div key={result.step} className="student-task-completed">
                  <strong>{result.step}</strong>
                  <Badge
                    tone={
                      result.status.includes("完成") ? "success" : "warning"
                    }
                  >
                    {result.status === "本地模拟完成"
                      ? "已处理（演示）"
                      : result.status === "待确认范围"
                        ? "待核实"
                        : result.status}
                  </Badge>
                  <p>{result.detail}</p>
                </div>
              ))}
            </section>
          )}
          <div className="student-record-links">
            {item.relatedType === "lesson" &&
              item.relatedId &&
              can("lesson.view") && (
                <Button size="sm" onClick={() => onOpenLesson(item.relatedId!)}>
                  查看相关课程
                </Button>
              )}
          </div>
        </>
      );
    }
  }
  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      description={student.name}
      width={600}
    >
      {body}
    </Drawer>
  );
}
