import type { DemoState, PayTerms } from "./model";
import { feedbackPayItems } from "./feedbackPay";
import { personAttendance } from "./lessonAttendance";
type Line = {
  source: string;
  label: string;
  teacher: number | null;
  office: number | null;
};
const round = (n: number) => Math.round(n * 100) / 100;
export function officePay(data: DemoState, t: PayTerms): Line[] {
  const frozen = data.settlements?.find(
    (r) => r.teacherId === t.teacherId && r.month === t.month,
  );
  if (frozen) return frozen.lines;
  const rows: Line[] = [];
  const add = (
    source: string,
    label: string,
    teacher: number | null,
    office: number | null = 0,
  ) =>
    rows.push({
      source,
      label,
      teacher: teacher === null ? null : round(teacher),
      office: office === null ? null : round(office),
    });
  const base = (source: string, label: string, hours: number) =>
    add(source, label, hours * t.hourly, hours * t.soHourly);
  const lessons = data.lessons.filter(
    (l) => l.teacherId === t.teacherId && l.date.startsWith(t.month),
  );
  let finished = 0,
    teacherChange = false;
  if (t.mode === "OP")
    for (const slot of t.confirmed)
      base(slot.date + " " + slot.time, "OP 已确认时段", slot.minutes / 60);
  for (const l of lessons) {
    const cancellation = l.cancellation;
    const lead = cancellation
      ? (Date.parse(l.date + "T" + l.time + ":00+08:00") -
          Date.parse(cancellation.at)) /
        60000
      : null;
    const issue = l.incident?.reason || cancellation?.kind || l.attendance;
    const source = l.date + " " + l.time + " · " + l.id;
    const absent =
      (issue === "学员请假" && lead !== null && lead < 30) ||
      issue === "学员缺席" ||
      personAttendance(l, "学员").includes("缺席");
    const completed =
      !(
        ["老师迟到", "老师早退"].includes(issue) &&
        (l.incident?.minutes ?? 0) > 10
      ) &&
      l.status === "已完成" &&
      (!l.requiresScreenshot ||
        data.reports.some((r) => r.lessonId === l.id && r.screenshot)) &&
      !absent &&
      !issue.includes("缺席") &&
      !issue.includes("取消");
    if (completed) finished++;
    const hours =
      l.duration === 25 || l.duration === 50
        ? ((l.duration / 25) * t.paidMinutes) / 60
        : l.duration / 60;
    if (
      t.mode === "NP" &&
      (completed || absent) &&
      !issue.includes("网络") &&
      !issue.includes("教材")
    )
      base(
        source,
        absent ? "学员缺席 50%" : "NP 完课",
        hours * (absent ? 0.5 : 1),
      );
    if (l.incident && issue.includes("网络")) continue;
    if (issue.startsWith("老师")) teacherChange = true;
    if (issue === "老师取消") add(source, "取消档位待核实", null);
    if (issue === "老师缺席") add(source, "缺席扣款", -3 * t.hourly);
    if (issue === "老师24小时内取消")
      add(source, "临时取消扣款", -2 * t.hourly);
    if (issue === "老师1–5天取消") add(source, "取消扣款", -t.hourly);
    if (issue === "老师迟到" || issue === "老师早退") {
      const measured = l.incident?.minutes;
      add(
        source,
        measured === undefined
          ? "迟到早退分钟待核"
          : measured > 10
            ? "超时按缺席"
            : "迟到早退扣款",
        measured === undefined
          ? null
          : measured > 10
            ? -3 * t.hourly
            : -Math.min(18, 2 * measured),
      );
    }
  }
  const feedback = feedbackPayItems(data, t.teacherId, t.month);
  for (const f of feedback)
    add(
      f.id,
      f.rating === "好评" ? "TM 好评奖" : "TM 差评扣款",
      f.rating === "好评"
        ? t.praise
        : t.complaint === null
          ? null
          : -t.complaint,
    );
  if (
    finished >= 70 &&
    !teacherChange &&
    !data.leaves.some(
      (l) =>
        l.teacherId === t.teacherId &&
        l.start.slice(0, 7) <= t.month &&
        l.end.slice(0, 7) >= t.month &&
        l.status !== "已驳回",
    ) &&
    !feedback.some((f) => f.rating === "差评")
  )
    add(t.month, "全勤奖", t.fullAttendance);
  for (const order of data.orders || []) {
    if (order.kind !== "续费" || !order.date.startsWith(t.month)) continue;
    const prior = data.lessons
      .filter(
        (l) =>
          order.studentIds.includes(l.studentId) &&
          l.status === "已完成" &&
          l.attendance === "正常" &&
          l.date < order.date,
      )
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    if (prior[0]?.teacherId === t.teacherId)
      add(
        order.id,
        "复购奖" + (order.studentIds.length > 1 ? "（多人订单归属待核）" : ""),
        order.studentIds.length > 1 ? null : t.renewal,
      );
  }
  if (t.teacherAdjustment || t.soAdjustment)
    add(
      t.month,
      "人工调整 · " + t.adjustmentNote,
      t.teacherAdjustment,
      t.soAdjustment,
    );
  return rows;
}
