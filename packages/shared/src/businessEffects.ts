import { DEMO_TODAY, type Command, type DemoState } from "./model";
import { transition } from "./domain";
import { sharedBalanceGroup, refreshPackageBalances } from "./packageBalances";

// Domain transitions preserve the Demo. Business integrations supply actual external status.
export function applyBusinessEffects(state: DemoState, command: Command) {
  if (command.type !== "student.lifecycle" || command.status !== "退费") return;
  const members = refundMembers(state, command.studentId);
  const changed = new Set([...members].filter(id => id === command.studentId || state.students.find(s => s.id === id)!.status !== "退费"));
  for (const studentId of changed) {
    if (studentId !== command.studentId)
      Object.assign(state, transition(state, { ...command, studentId }).data);
  }
  for (const order of state.orders ?? []) {
    if (!order.studentIds.some(id => members.has(id)) || order.balance === 0) continue;
    state.credits.unshift({
      id: crypto.randomUUID(), studentId: command.studentId, orderId: order.id,
      date: DEMO_TODAY, type: "退费", units: -order.balance, balance: 0,
      note: command.reason, operator: command.operator || "教务", recordedAt: new Date().toISOString(),
    });
    order.balance = 0;
  }
  refreshPackageBalances(state);
  for (const student of state.students.filter(item => members.has(item.id))) {
    student.balance = 0;
    if (!changed.has(student.id)) continue;
    student.serviceStopResults = [
      { step: "固定安排", status: "已完成", detail: "账号共享课时已清零，所有关联学员停止继续排课，历史安排保留。" },
      { step: "未来课程", status: "待同步", detail: "本地未开始课程已取消，ClassIn 取消结果由同步记录确认。" },
      { step: "候课名单", status: "不涉及", detail: "外部群及其他平台服务不属于本系统退款范围。" },
      { step: "服务权限", status: "已完成", detail: "本系统已停止继续排课；保留账号与历史，不冻结 ClassIn 账号。" },
    ];
    const event = state.events.find(item => item.studentId === student.id && item.type === "退费");
    if (event) event.serviceStopResults = structuredClone(student.serviceStopResults);
  }
  state.tasks = state.tasks.filter(task => !(members.has(task.studentId) &&
    task.status === "待处理" && ["退款停用：候课名单", "退款停用：服务权限"].includes(task.title)));
}

export function refundMembers(state: DemoState, studentId: string) {
  const members = new Set(sharedBalanceGroup(state, studentId).members);
  for (const member of members) {
    for (const account of state.classInAccounts ?? [])
      if (account.studentIds.includes(member))
        account.studentIds.forEach(id => members.add(id));
    sharedBalanceGroup(state, member).members.forEach(id => members.add(id));
  }
  return members;
}
