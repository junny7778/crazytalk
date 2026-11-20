import { packagePurchases } from "./packagePurchases";
import { DEMO_TODAY, type DemoState, type Student } from "./model";

export function createOpeningPackage(
  data: DemoState,
  student: Student,
  balance: number,
) {
  const orders = (data.orders ??= []);
  const openingId = `opening-${student.id}`;
  const account = data.classInAccounts?.find(a => a.studentIds.includes(student.id));
  const order: NonNullable<DemoState["orders"]>[number] = {
    classInAccountId: account?.studentIds.length === 1 ? account.id : undefined,
    id: orders.some((order) => order.id === openingId)
      ? crypto.randomUUID()
      : openingId,
    studentIds: [student.id],
    units: balance,
    balance,
    date: DEMO_TODAY,
    kind: "期初余额",
    channel: student.channel,
    project: student.project,
  };
  orders.push(order);
  for (const lesson of data.lessons)
    if (!lesson.orderId && lesson.studentId === student.id)
      lesson.orderId = order.id;
  for (const credit of data.credits)
    if (!credit.orderId && credit.studentId === student.id)
      credit.orderId = order.id;
  return order;
}

export function refreshPackageBalances(data: DemoState) {
  const balances = new Map<string, number>();
  for (const order of data.orders ?? [])
    for (const id of order.studentIds)
      balances.set(id, (balances.get(id) ?? 0) + order.balance);
  for (const student of data.students) {
    const balance = balances.get(student.id);
    if (balance !== undefined) {
      student.balance = balance;
      student.balanceKnown = true;
    }
  }
}

export function migratePackageBalances(data: DemoState) {
  if (data.packageBalanceVersion === 2) return false;
  if (!data.packageBalanceVersion) {
    const hasHistory = new Set(
      [...data.lessons, ...data.credits]
        .filter((record) => !record.orderId)
        .map((record) => record.studentId),
    );
    for (const student of data.students) {
      if (
        student.balanceKnown &&
        (student.balance !== 0 || hasHistory.has(student.id))
      )
        createOpeningPackage(data, student, student.balance);
    }
  }
  const byMembers = new Map<string, Balance[]>();
  for (const pack of data.orders ?? []) {
    const key = JSON.stringify([...pack.studentIds].sort());
    const sameMembers = byMembers.get(key) ?? [];
    sameMembers.push(pack);
    byMembers.set(key, sameMembers);
  }
  for (const packs of byMembers.values())
    if (packs.length > 1)
      mergeBalanceSources(data, packs[0], packs, packs[0].studentIds);
  data.packageBalanceVersion = 2;
  refreshPackageBalances(data);
  return true;
}

export function sharedBalanceGroup(
  data: DemoState,
  studentId: string,
  targetId?: string,
) {
  const orders = data.orders ?? [];
  const account = data.classInAccounts?.find(a => a.studentIds.includes(studentId));
  if (account && !targetId) {
    const sources = orders.filter(o => o.classInAccountId === account.id || (!o.classInAccountId && o.studentIds.some(id => account.studentIds.includes(id))));
    return {members:[...account.studentIds],sources,balance:sources.reduce((n,o) => n+o.balance,0)};
  }
  const members = new Set([studentId]);
  const target = orders.find((order) => order.id === targetId);
  target?.studentIds.forEach((id) => members.add(id));
  for (const member of members) {
    for (const order of orders) {
      if (order.studentIds.includes(member))
        order.studentIds.forEach((id) => members.add(id));
    }
  }
  const sources = orders.filter((order) =>
    order.studentIds.some((id) => members.has(id)),
  );
  return {
    members: [...members],
    sources,
    balance: sources.reduce((sum, order) => sum + order.balance, 0),
  };
}

type Balance = NonNullable<DemoState["orders"]>[number];

export function mergeBalanceSources(
  data: DemoState,
  order: Balance,
  packs: Balance[],
  members: string[],
) {
  const sources = new Set(packs.map((pack) => pack.id));
  // Imported purchase orders may have no ledger row yet. Preserve their purchase history on merge.
  for (const purchase of packagePurchases(data)) {
    if (!sources.has(purchase.packageId)) continue;
    const existing = data.credits.find(
      (entry) =>
        entry.orderId === purchase.packageId &&
        (entry.purchaseId === purchase.id || entry.id === purchase.id),
    );
    if (existing) {
      existing.purchaseStudentIds ??= [...purchase.studentIds];
    } else {
      data.credits.push({
        id: crypto.randomUUID(),
        purchaseId: purchase.id,
        orderId: order.id,
        purchaseStudentIds: [...purchase.studentIds],
        studentId: purchase.studentIds[0],
        type: purchase.kind,
        units: purchase.units,
        balance: purchase.units,
        date: purchase.date,
        operator: "历史订单",
        note: "原始购课记录",
      });
    }
  }
  for (const row of [...data.credits, ...data.lessons])
    if (row.orderId && sources.has(row.orderId)) row.orderId = order.id;
  data.orders = data.orders!.filter(
    (pack) => pack.id === order.id || !sources.has(pack.id),
  );
  order.studentIds = [...new Set([...order.studentIds, ...members])];
  order.balance = packs.reduce((sum, pack) => sum + pack.balance, 0);
}

export function sharedClassIn(data: DemoState, members: string[]) {
  const accounts = (data.classInAccounts ?? []).filter(account => members.some(id => account.studentIds.includes(id)));
  const account = accounts[0];
  const issue = accounts.some(item => !item.uid) ? "请先核实 UID，再共享课时"
    : accounts.length > 1 ? "只有绑定同一 ClassIn UID 的学员才能共享课时" : "";
  const unbound = members.filter(id => !accounts.some(item => item.studentIds.includes(id)));
  return { account, issue, unbound };
}

export function schedulingAccountIssue(data: DemoState, id: string) {
  const student = data.students.find(s => s.id === id);
  if (student?.classInChange) return "账号更换尚未完成，请先处理原预约和班级成员同步";
  if (student?.rebookingLessonIds?.some(id => data.lessons.some(l => l.id === id && l.syncState && l.syncState !== "completed"))) return "原老师课程取消尚未确认，请先完成取消同步再重新排课";
  return data.classInAccounts?.some(account => account.uid && account.studentIds.includes(id))
    ? "" : "请先绑定 ClassIn 账号并核实 UID，再为学员排课";
}

// Imported balances may repeat the same household balance on multiple student rows.
export function accountBalanceReviewIssue(data: DemoState, members: string[]) {
  const sources = (data.orders ?? []).filter(order => order.studentIds.some(id => members.includes(id)));
  if (members.some(id => data.students.some(student => student.id === id && student.roster && !student.balanceKnown)))
    return "历史学员余额待核实，请先核实历史余额再关联共享账号";
  if (sources.length > 1 && sources.some(order => order.kind === "期初余额" && order.studentIds.some(id => data.students.some(student => student.id === id && student.roster))))
    return "存在历史导入的多份余额，可能重复记录家庭余额，请先核实历史余额再合并";
  return "";
}

export function accountBalanceAlignmentIssue(data: DemoState, studentId: string) {
  const account = data.classInAccounts?.find(item => item.studentIds.includes(studentId));
  if (!account) return "";
  const sources = (data.orders ?? []).filter(order => order.studentIds.some(id => account.studentIds.includes(id)));
  return sources.length > 1 || sources.some(order => order.studentIds.length !== account.studentIds.length || order.studentIds.some(id => !account.studentIds.includes(id)))
    ? "账号与历史余额成员未统一，请先核实余额并重新关联 ClassIn 账号" : "";
}
