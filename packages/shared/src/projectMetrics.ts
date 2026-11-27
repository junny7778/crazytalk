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

export type ChannelProjectSettlementRow = {
  channel: string;
  project: string;
  studentCount: number;
  newPurchaseUnits: number;
  newPurchaseAmount: number;
  renewalUnits: number;
  renewalAmount: number;
  compUnits: number;
  deliveredLessons: number;
  deliveredUnits: number;
  unitPrice: number | null;
  settlementAmount: number;
};

export type ChannelSettlementGroup = {
  channel: string;
  projects: ChannelProjectSettlementRow[];
  studentCount: number;
  newPurchaseUnits: number;
  newPurchaseAmount: number;
  renewalUnits: number;
  renewalAmount: number;
  compUnits: number;
  deliveredLessons: number;
  deliveredUnits: number;
  settlementAmount: number;
};

export function channelProjectSettlement(
  data: DemoState,
  options?: { from?: string; to?: string; channel?: string; project?: string },
) {
  const from = options?.from || "";
  const to = options?.to || "";
  const filterChannel = options?.channel && options.channel !== "全部渠道" ? options.channel : "";
  const filterProject = options?.project && options.project !== "全部项目" ? options.project : "";

  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const channelsById = new Map(
    data.catalog.filter((c) => c.type === "渠道").map((c) => [c.id, c]),
  );
  const projectPrices = new Map<string, number>();
  for (const p of data.catalog) {
    if (p.type !== "项目" || p.unitPrice === undefined) continue;
    const linkedChannelIds = [
      ...(p.parentId ? [p.parentId] : []),
      ...(p.channelIds ?? []),
    ];
    if (!linkedChannelIds.length) {
      projectPrices.set(`*:${p.name}`, p.unitPrice);
    } else {
      for (const cid of linkedChannelIds) {
        const ch = channelsById.get(cid);
        if (ch) projectPrices.set(`${ch.name}:${p.name}`, p.unitPrice);
      }
      if (!projectPrices.has(`*:${p.name}`)) projectPrices.set(`*:${p.name}`, p.unitPrice);
    }
  }

  type Bucket = {
    channel: string;
    project: string;
    students: Set<string>;
    newPurchaseUnits: number;
    newPurchaseAmount: number;
    renewalUnits: number;
    renewalAmount: number;
    compUnits: number;
    deliveredLessons: number;
    deliveredUnits: number;
  };

  const buckets = new Map<string, Bucket>();
  const ensure = (rawChannel: string, rawProject: string): Bucket | null => {
    const channel = rawChannel.trim() || "未归类渠道";
    const project = rawProject.trim() || "未归类项目";
    if (filterChannel && channel !== filterChannel) return null;
    if (filterProject && project !== filterProject) return null;
    const key = `${channel}\u0000${project}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        channel,
        project,
        students: new Set<string>(),
        newPurchaseUnits: 0,
        newPurchaseAmount: 0,
        renewalUnits: 0,
        renewalAmount: 0,
        compUnits: 0,
        deliveredLessons: 0,
        deliveredUnits: 0,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const s of data.students) {
    const bucket = ensure(s.channel, s.project);
    if (bucket) bucket.students.add(s.id);
  }

  for (const entry of data.credits) {
    if ((from && entry.date < from) || (to && entry.date > to)) continue;
    const learner = studentById.get(entry.studentId);
    const bucket = ensure(
      entry.channel ?? learner?.channel ?? "",
      entry.project ?? learner?.project ?? "",
    );
    if (!bucket) continue;
    if (learner) bucket.students.add(learner.id);
    if (["新购", "购课", "充值"].includes(entry.type)) {
      bucket.newPurchaseUnits += entry.units;
      bucket.newPurchaseAmount += entry.amount ?? 0;
    } else if (entry.type === "续费") {
      bucket.renewalUnits += entry.units;
      bucket.renewalAmount += entry.amount ?? 0;
    } else if (["补偿", "赠送"].includes(entry.type)) {
      bucket.compUnits += entry.units;
    }
  }

  for (const lesson of data.lessons) {
    if ((from && lesson.date < from) || (to && lesson.date > to)) continue;
    if (lesson.status !== "已完成" && !lesson.deducted) continue;
    const learner = studentById.get(lesson.studentId);
    const bucket = ensure(learner?.channel ?? "", learner?.project ?? "");
    if (!bucket) continue;
    if (learner) bucket.students.add(learner.id);
    bucket.deliveredLessons += 1;
    bucket.deliveredUnits += lesson.deducted
      ? (lesson.confirmedUnits ?? lesson.duration / 25)
      : lesson.duration / 25;
  }

  const rows: ChannelProjectSettlementRow[] = [...buckets.values()]
    .map((b) => {
      const price =
        projectPrices.get(`${b.channel}:${b.project}`) ??
        projectPrices.get(`*:${b.project}`) ??
        null;
      const recordedAmount = b.newPurchaseAmount + b.renewalAmount;
      const settlementAmount =
        price !== null
          ? Math.round(b.deliveredUnits * price * 100) / 100
          : Math.round(recordedAmount * 100) / 100;
      return {
        channel: b.channel,
        project: b.project,
        studentCount: b.students.size,
        newPurchaseUnits: Math.round(b.newPurchaseUnits * 100) / 100,
        newPurchaseAmount: Math.round(b.newPurchaseAmount * 100) / 100,
        renewalUnits: Math.round(b.renewalUnits * 100) / 100,
        renewalAmount: Math.round(b.renewalAmount * 100) / 100,
        compUnits: Math.round(b.compUnits * 100) / 100,
        deliveredLessons: b.deliveredLessons,
        deliveredUnits: Math.round(b.deliveredUnits * 100) / 100,
        unitPrice: price,
        settlementAmount,
      };
    })
    .sort(
      (a, b) =>
        b.settlementAmount - a.settlementAmount ||
        b.deliveredUnits - a.deliveredUnits ||
        a.channel.localeCompare(b.channel, "zh-CN") ||
        a.project.localeCompare(b.project, "zh-CN"),
    );

  const groupMap = new Map<string, ChannelProjectSettlementRow[]>();
  for (const row of rows) {
    const list = groupMap.get(row.channel) ?? [];
    list.push(row);
    groupMap.set(row.channel, list);
  }

  const byChannel: ChannelSettlementGroup[] = [...groupMap.entries()].map(
    ([channel, projects]) => ({
      channel,
      projects,
      studentCount: projects.reduce((sum, r) => sum + r.studentCount, 0),
      newPurchaseUnits: Math.round(projects.reduce((sum, r) => sum + r.newPurchaseUnits, 0) * 100) / 100,
      newPurchaseAmount: Math.round(projects.reduce((sum, r) => sum + r.newPurchaseAmount, 0) * 100) / 100,
      renewalUnits: Math.round(projects.reduce((sum, r) => sum + r.renewalUnits, 0) * 100) / 100,
      renewalAmount: Math.round(projects.reduce((sum, r) => sum + r.renewalAmount, 0) * 100) / 100,
      compUnits: Math.round(projects.reduce((sum, r) => sum + r.compUnits, 0) * 100) / 100,
      deliveredLessons: projects.reduce((sum, r) => sum + r.deliveredLessons, 0),
      deliveredUnits: Math.round(projects.reduce((sum, r) => sum + r.deliveredUnits, 0) * 100) / 100,
      settlementAmount: Math.round(projects.reduce((sum, r) => sum + r.settlementAmount, 0) * 100) / 100,
    }),
  );

  const totals = {
    studentCount: rows.reduce((sum, r) => sum + r.studentCount, 0),
    newPurchaseUnits: Math.round(rows.reduce((sum, r) => sum + r.newPurchaseUnits, 0) * 100) / 100,
    newPurchaseAmount: Math.round(rows.reduce((sum, r) => sum + r.newPurchaseAmount, 0) * 100) / 100,
    renewalUnits: Math.round(rows.reduce((sum, r) => sum + r.renewalUnits, 0) * 100) / 100,
    renewalAmount: Math.round(rows.reduce((sum, r) => sum + r.renewalAmount, 0) * 100) / 100,
    compUnits: Math.round(rows.reduce((sum, r) => sum + r.compUnits, 0) * 100) / 100,
    deliveredLessons: rows.reduce((sum, r) => sum + r.deliveredLessons, 0),
    deliveredUnits: Math.round(rows.reduce((sum, r) => sum + r.deliveredUnits, 0) * 100) / 100,
    settlementAmount: Math.round(rows.reduce((sum, r) => sum + r.settlementAmount, 0) * 100) / 100,
  };

  return { rows, byChannel, totals };
}
