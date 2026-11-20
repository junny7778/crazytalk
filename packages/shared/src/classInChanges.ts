import {
  DEMO_TODAY,
  schedulingNow,
  type DemoState,
  type Lesson,
} from "./model";
import { refreshPackageBalances } from "./packageBalances";

export function isUnstartedBooking(lesson: Lesson) {
  return (
    lesson.status === "未开始" &&
    Date.parse(`${lesson.date}T${lesson.time}:00+08:00`) > schedulingNow()
  );
}

export function cancelForRebooking(
  data: DemoState,
  studentId: string,
  reason: string,
  teacherId?: string,
) {
  const lessons = data.lessons.filter(
    (l) =>
      l.studentId === studentId &&
      (!teacherId || l.teacherId === teacherId) &&
      isUnstartedBooking(l),
  );
  for (const lesson of lessons) {
    lesson.status = "已取消";
    lesson.note = reason;
    lesson.conflict = false;
  }
  data.slotLocks = data.slotLocks?.filter(
    (lock) =>
      lock.studentId !== studentId ||
      (!!teacherId && lock.teacherId !== teacherId),
  );
  const student = data.students.find((s) => s.id === studentId)!;
  student.scheduleRevision = (student.scheduleRevision ?? 0) + 1;
  student.rebookingLessonIds = [
    ...new Set([
      ...(student.rebookingLessonIds ?? []),
      ...lessons.map((l) => l.id),
    ]),
  ];
  return lessons.map((l) => l.id);
}

// Called only after cancellation is confirmed, in the same transaction as account membership changes.
export function finishStudentAccountChange(data: DemoState, studentId: string) {
  const student = data.students.find((s) => s.id === studentId)!;
  const change = student.classInChange!;
  if (change.phase !== "canceling") return;
  const accounts = data.classInAccounts!;
  const source = accounts.find((a) => a.studentIds.includes(studentId))!;
  let target = accounts.find((a) => a.uid === change.uid);
  if (!target) {
    target = {
      id: crypto.randomUUID(),
      phone: change.phone,
      uid: change.uid,
      studentIds: [],
    };
    accounts.push(target);
  }
  const sources = (data.orders ?? []).filter(
    (o) =>
      o.classInAccountId === source.id ||
      (!o.classInAccountId && o.studentIds.includes(studentId)),
  );
  const shared = source.studentIds.length > 1;
  const carried = shared ? 0 : sources.reduce((n, o) => n + o.balance, 0);
  source.studentIds = source.studentIds.filter((id) => id !== studentId);
  target.studentIds.push(studentId);
  if (change.phone) target.phone = change.phone;
  for (const order of sources) {
    order.classInAccountId = source.id;
    order.purchaseStudentIds ??= [...order.studentIds];
    order.studentIds = [...source.studentIds];
    if (!shared) order.balance = 0;
  }
  let destination = data.orders?.find(
    (o) =>
      o.classInAccountId === target.id ||
      o.studentIds.some((id) => target.studentIds.includes(id)),
  );
  if (!destination) {
    destination = {
      id: crypto.randomUUID(),
      classInAccountId: target.id,
      studentIds: [...target.studentIds],
      units: 0,
      balance: 0,
      date: DEMO_TODAY,
      kind: "账号余额",
      channel: student.channel,
      project: student.project,
    };
    (data.orders ??= []).push(destination);
  }
  destination.purchaseStudentIds ??= [...destination.studentIds];
  destination.classInAccountId = target.id;
  destination.studentIds = [...target.studentIds];
  destination.balance += carried;
  // Transfer rows are not purchase revenue or gifts; original lessons keep their orderId.
  if (carried) {
    for (const order of sources) {
      const previous = data.credits.filter((c) => c.orderId === order.id);
      for (const entry of previous)
        entry.purchaseStudentIds ??= [...order.purchaseStudentIds!];
    }
    data.events.unshift({
      id: crypto.randomUUID(),
      date: DEMO_TODAY,
      type: "账号余额转移",
      studentId,
      teacherId: "",
      operator: change.operator,
      content: `原 UID ${source.uid} → 新 UID ${target.uid}：${carried} 课时；原来源 ${sources.map((o) => o.id).join("、")}，目标来源 ${destination.id}`,
    });
  }
  change.phase = "members";
  refreshPackageBalances(data);
}
