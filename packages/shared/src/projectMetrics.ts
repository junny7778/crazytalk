import { packagePurchases } from "./packagePurchases";
import type { DemoState, Student } from "./model";
import { personAttendance } from "./lessonAttendance";
export function projectMetrics(
  data: DemoState,
  student: Student,
  month: string,
) {
  const history = student.monthlyRecords.find(
    (r) => r.month === month && r.planned !== null,
  );
  const project = data.catalog.find(
    (p) =>
      p.type === "项目" &&
      p.name === student.project &&
      data.catalog.some(
        (c) => [...(p.channelIds || []), ...(p.historicalChannelIds || [])].includes(c.id) && c.name === student.channel,
      ),
  );
  const applicable = project?.targetHistory
    ?.filter((h) => h.at.slice(0, 7) <= month)
    .at(-1);
  const target =
    history?.planned ??
    applicable?.lessons ??
    (project?.targetHistory?.length ? null : (project?.monthlyLessons ?? null));
  const lessons = data.lessons.filter(
    (l) => l.studentId === student.id && l.date.startsWith(month),
  );
  const ended = lessons.filter((l) => ["已完成", "缺席"].includes(l.status));
  const present = ended.filter(
    (l) =>
      !personAttendance(l, "学员").some(
        (t) => t === "缺席" || t === "待核实",
      ) && personAttendance(l, "学员").length > 0,
  );
  const used = lessons
    .filter((l) => l.deducted)
    .reduce((n, l) => n + (l.confirmedUnits ?? 0), 0);
  return {
    id: student.id,
    name: student.name,
    target,
    used,
    expected: ended.length,
    present: present.length,
    lessons,
  };
}

export function purchasedDelivery(data: DemoState, students: Student[], month: string) {
  const ids = new Set(students.map(s => s.id));
  const orders = (data.orders ?? []).filter(o => o.studentIds.some(id => ids.has(id)));
  const ordersById = new Map(orders.map(o => [o.id, o]));
  const purchases = packagePurchases(data).filter(p =>
    ordersById.has(p.packageId) && p.date.slice(0, 7) <= month);
  const purchased = purchases.reduce((sum, purchase) => sum + purchase.units, 0);
  const firstPurchase = new Map<string, string>();
  for (const purchase of purchases) {
    if (purchase.date < (firstPurchase.get(purchase.packageId) ?? "9999"))
      firstPurchase.set(purchase.packageId, purchase.date);
  }
  const lessons = [];
  for (const lesson of data.lessons) {
    const order = lesson.orderId && ordersById.get(lesson.orderId);
    if (!order || !order.studentIds.includes(lesson.studentId) || lesson.date < (firstPurchase.get(order.id) ?? "9999") ||
      lesson.date.slice(0, 7) > month || lesson.status !== "已完成") continue;
    const attended = (["老师", "学员"] as const).every(person =>
      personAttendance(lesson, person).some(tag => ["正常", "迟到", "早退"].includes(tag)));
    if (attended && [25, 50].includes(lesson.duration)) lessons.push(lesson);
  }
  return { purchased, lessons, delivered: lessons.reduce((sum, lesson) => sum + lesson.duration / 25, 0) };
}
