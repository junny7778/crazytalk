import type { DemoState } from "./model";

export function scheduleUnits(duration: number, manualUnits?: number) {
  return duration === 25 ? 1 : duration === 50 ? 2 : manualUnits;
}
export function getScheduleCredits(
  data: DemoState,
  studentId: string,
  count: number,
  unitsPerLesson: number,
) {
  const student = data.students.find((item) => item.id === studentId);
  const memberOrders = data.orders?.filter(o => o.studentIds.includes(studentId)) || [];
  const pendingLessons=data.lessons.filter(l=>!l.deducted && ["未开始","待确认","缺席"].includes(l.status));
  const sources=memberOrders.map(order=>{
    const reserved=pendingLessons.filter(l=>l.orderId===order.id).reduce((n,l)=>n+(scheduleUnits(l.duration,l.plannedUnits)??0),0);
    return {id:order.id,available:order.balance-reserved};
  });
  const useOrders=sources.some(o=>o.available>=unitsPerLesson);
  const pending=pendingLessons.filter(l=>useOrders ? memberOrders.some(o=>o.id===l.orderId) : !l.orderId && l.studentId===studentId);
  const unknownCount = pending.filter(
    (lesson) =>
      scheduleUnits(lesson.duration, lesson.plannedUnits) === undefined,
  ).length;
  const reserved = Number(
    pending
      .reduce(
        (sum, lesson) =>
          sum + (scheduleUnits(lesson.duration, lesson.plannedUnits) ?? 0),
        0,
      )
      .toFixed(8),
  );
  const balance = useOrders ? memberOrders.reduce((n,o)=>n+o.balance,0) : student?.balance ?? 0;
  const available = Number((balance - reserved).toFixed(8));
  const required = Number((count * unitsPerLesson).toFixed(8));
  let error = "";
  if (!student) error = "请选择学员";
  else if (!useOrders && !student.balanceKnown) error = "请先核实并录入剩余课时";
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
  return { allocations, balance, reserved, available, required, unknownCount, error };
}
