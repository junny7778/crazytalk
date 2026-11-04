import { creditTypeLabel } from "./creditLabels";
import type { DemoState } from "@crazytalk/shared";

export type StudentRecordTarget =
  | { kind: "credit" | "referral" | "event" | "task"; id: string }
  | { kind: "teacherChange"; index: number };
export type StudentActivity = {
  id: string;
  date: string;
  recordedAt?: string;
  type: string;
  title: string;
  content: string;
  person: string;
  status?: string;
  target:
    | StudentRecordTarget
    | { kind: "feedback"; id: string }
    | { kind: "lesson"; id: string };
};

function businessDate(value: string) {
  if (!value.includes("T")) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function studentActivities(
  data: DemoState,
  studentId: string,
): StudentActivity[] {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) return [];
  const items: StudentActivity[] = [];
  const credits = data.credits.filter((item) => item.studentId === studentId);
  const feedback = data.feedback.filter((item) => item.studentId === studentId);
  const referrals = data.referrals.filter(
    (item) =>
      item.studentId === studentId || item.referrerStudentId === studentId,
  );
  const tasks = data.tasks.filter(
    (item) => item.studentId === studentId && item.status === "已完成",
  );
  for (const item of credits)
    items.push({
      id: `credit-${item.id}`,
      date: item.date,
      recordedAt: item.recordedAt,
      type: ["补偿", "赠送"].includes(item.type)
        ? "补偿与赠课"
        : ["续费", "新购", "充值"].includes(item.type)
          ? "购课与续费"
          : "课时变动",
      title: creditTypeLabel(item.type),
      content: `${item.units > 0 ? "+" : ""}${item.units} 课时，变动后剩余 ${item.balance} 课时${item.note ? `。${item.note}` : ""}`,
      person: item.operator,
      target: { kind: "credit", id: item.id },
    });
  for (const item of feedback)
    items.push({
      id: `feedback-${item.id}`,
      date: item.date,
      type: "反馈",
      title: item.rating,
      content: item.content || item.categories.join("、") || "查看反馈",
      person: item.owner ? `负责教务 ${item.owner}` : "",
      status: item.status,
      target: { kind: "feedback", id: item.id },
    });
  for (const item of referrals) {
    const name = (id: string) =>
      data.students.find((student) => student.id === id)?.name || "未关联学员";
    items.push({
      id: `referral-${item.id}`,
      date: item.date,
      recordedAt: item.recordedAt,
      type: "转介绍",
      title: "登记转介绍",
      content: `${name(item.referrerStudentId)} 介绍 ${name(item.studentId)}${item.note ? `。${item.note}` : ""}`,
      person: item.operator,
      target: { kind: "referral", id: item.id },
    });
  }
  for (const item of tasks)
    items.push({
      id: `task-${item.id}`,
      date: businessDate(item.completedAt),
      recordedAt: item.completedAt,
      type: "待办",
      title: `完成${item.title}`,
      content: item.result || "已完成",
      person: item.completedBy || "",
      target: { kind: "task", id: item.id },
    });
  const events = data.events.filter((item) => item.studentId === studentId);
  student.teacherChanges.forEach((item, index) =>
    items.push({
      id: `teacher-${index}`,
      date: item.date,
      type: "换老师",
      title: "更换任课老师",
      content: `${item.fromTeacher || "未记录"} → ${item.toTeacher}${item.reason ? `。${item.reason}` : ""}`,
      person: "",
      target: { kind: "teacherChange", index },
    }),
  );
  for (const event of events) {
    if (
      event.type === "换老师" &&
      student.teacherChanges.some(
        (change) =>
          change.toTeacher &&
          change.reason &&
          event.content.includes(change.toTeacher) &&
          event.content.includes(change.reason),
      )
    )
      continue;
    if (
      event.relatedType === "credit" &&
      credits.some((item) => item.id === event.relatedId)
    )
      continue;
    if (
      event.relatedType === "referral" &&
      referrals.some((item) => item.id === event.relatedId)
    )
      continue;
    if (
      event.relatedType === "task" &&
      tasks.some((item) => item.id === event.relatedId) &&
      event.type === "完成待办"
    )
      continue;
    if (
      event.relatedType === "feedback" &&
      feedback.some((item) => item.id === event.relatedId) &&
      ["登记反馈", "新建反馈"].includes(event.type)
    )
      continue;
    if (!event.relatedId) {
      if (
        credits.some(
          (item) => item.type === event.type && item.date === event.date,
        )
      )
        continue;
      if (
        event.type === "转介绍" &&
        referrals.some((item) => item.date === event.date)
      )
        continue;
      if (
        event.type === "完成待办" &&
        tasks.some((item) => businessDate(item.completedAt) === event.date)
      )
        continue;
      if (
        ["登记反馈", "新建反馈"].includes(event.type) &&
        feedback.some((item) => item.date === event.date)
      )
        continue;
    }
    const type =
      event.type === "回访"
        ? "回访"
        : event.type === "换老师"
          ? "换老师"
          : ["停课", "在读", "结课", "退费", "历史停用结果"].includes(
                event.type,
              )
            ? "服务状态"
            : [
                  "调课",
                  "取消课程",
                  "固定排课",
                  "临时排课",
                  "更正结果",
                  "确认扣课",
                  "确认上课",
                ].includes(event.type)
              ? "课程安排"
              : event.relatedType === "feedback"
                ? "反馈"
                : "其他";
    items.push({
      id: `event-${event.id}`,
      date: event.date,
      recordedAt: event.recordedAt,
      type,
      title: event.type === "在读" ? "办理复课" : event.type,
      content: event.content,
      person: event.operator,
      target:
        event.relatedType === "feedback" && event.relatedId
          ? { kind: "feedback", id: event.relatedId }
          : event.relatedType === "lesson" && event.relatedId
            ? { kind: "lesson", id: event.relatedId }
            : { kind: "event", id: event.id },
    });
  }
  return items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.recordedAt || "").localeCompare(a.recordedAt || ""),
  );
}
