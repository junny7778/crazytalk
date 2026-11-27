import type { DemoState } from "./model";
import { accountBalanceAlignmentIssue } from "./packageBalances";

export function scheduleUnits(duration: number, manualUnits?: number) {
  return duration === 25 ? 1 : duration === 50 ? 2 : manualUnits;
}
function isPending(lesson: DemoState["lessons"][number]) {
  return !lesson.deducted && (["未开始", "待确认", "缺席"].includes(lesson.status) || lesson.status === "已取消" && !!lesson.syncState && lesson.syncState !== "completed");
}

export function withScopedReservations(data: DemoState, visible: DemoState): DemoState {
  if (visible.lessons === data.lessons || !visible.orders?.length) return visible;
  const visibleLessons = new Set(visible.lessons.map(lesson => lesson.id));
  const hiddenByOrder = new Map<string, { units: number; unknownCount: number }>();
  for (const lesson of data.lessons) {
    if (!lesson.orderId || visibleLessons.has(lesson.id) || !isPending(lesson)) continue;
    const totals = hiddenByOrder.get(lesson.orderId) ?? { units: 0, unknownCount: 0 };
    const units = scheduleUnits(lesson.duration, lesson.plannedUnits);
    if (units === undefined) totals.unknownCount++;
    else totals.units += units;
    hiddenByOrder.set(lesson.orderId, totals);
  }
  return { ...visible, orders: visible.orders.map(order => ({
    ...order, hiddenReservations: hiddenByOrder.get(order.id),
  })) };
}

export function getScheduleCredits(
  data: DemoState,
  studentId: string,
  count: number,
  unitsPerLesson: number,
  orderId?: string,
) {
  const student = data.students.find((item) => item.id === studentId);
  const memberOrders = data.orders?.filter(o => o.studentIds.includes(studentId) && (!orderId || o.id === orderId)) || [];
  const pendingLessons=data.lessons.filter(isPending);
  const sources=memberOrders.map(order=>{
    const reserved=pendingLessons.filter(l=>l.orderId===order.id).reduce((n,l)=>n+(scheduleUnits(l.duration,l.plannedUnits)??0),0);
    return {id:order.id,available:order.balance-reserved-(order.hiddenReservations?.units ?? 0)};
  });
  const useOrders = sources.length > 0;
  const pending=pendingLessons.filter(l=>useOrders ? memberOrders.some(o=>o.id===l.orderId) : !l.orderId && l.studentId===studentId);
  const unknownCount = pending.filter(
    (lesson) =>
      scheduleUnits(lesson.duration, lesson.plannedUnits) === undefined,
  ).length + memberOrders.reduce((sum, order) => sum + (order.hiddenReservations?.unknownCount ?? 0), 0);
  const reserved = Number(
    pending
      .reduce(
        (sum, lesson) =>
          sum + (scheduleUnits(lesson.duration, lesson.plannedUnits) ?? 0),
        memberOrders.reduce((sum, order) => sum + (order.hiddenReservations?.units ?? 0), 0),
      )
      .toFixed(8),
  );
  const balance = useOrders ? memberOrders.reduce((n,o)=>n+o.balance,0) : student?.balance ?? 0;
  const available = Math.max(0, Number((balance - reserved).toFixed(8)));
  const required = Number((count * unitsPerLesson).toFixed(8));
  let error = "";
  if (!student) error = "请选择学员";
  else if (accountBalanceAlignmentIssue(data, studentId)) error = accountBalanceAlignmentIssue(data, studentId);
  else if (
    !Number.isFinite(unitsPerLesson) ||
    unitsPerLesson <= 0 ||
    !Number.isInteger(count) ||
    count < 0
  )
    error = "请填写有效的每节预计扣课数";
  else if (unknownCount)
    error = `有 ${unknownCount} 节已排课程尚未登记预计扣课数，请先核实占用课时`;
  else if (required > available)
    error = `可用课时不足：剩余 ${balance} 课时，已占用 ${reserved} 课时，可用 ${available} 课时，本次需要 ${required} 课时`;
  const allocations:string[]=[];
  if(!error && useOrders){
    for(const source of sources){
      const slots=Math.min(count-allocations.length,Math.floor((source.available+1e-8)/unitsPerLesson));
      for(let i=0;i<slots;i++)allocations.push(source.id);
    }
    if(allocations.length<count)error="共享订单剩余课时无法覆盖每节完整课程";
  }
  const affordableLessons = useOrders
    ? sources.reduce((n, source) => n + Math.max(0, Math.floor((source.available + 1e-8) / unitsPerLesson)), 0)
    : Math.floor((available + 1e-8) / unitsPerLesson);
  return { affordableLessons, allocations, balance, reserved, available, required, unknownCount, error };
}
