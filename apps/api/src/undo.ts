import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  lessonSchema,
  DEMO_TODAY,
  type DemoState,
} from "../../../packages/shared/src/model";
import { refreshPackageBalances } from "../../../packages/shared/src/packageBalances";
export const undoSchema = z.object({
  before: z.array(lessonSchema),
  after: z.array(lessonSchema),
  decision: z.string(),
  capturedPayIds: z.array(z.string()).optional(),
});
export function undoConfirmation(
  state: DemoState,
  snapshot: z.infer<typeof undoSchema>,
  operator: string,
) {
  for (const before of snapshot.before) {
    const current = state.lessons.find((lesson) => lesson.id === before.id);
    const completed = snapshot.after.find((lesson) => lesson.id === before.id);
    if (!current || !completed || !isDeepStrictEqual(current, completed))
      throw new Error("课程已有新的变更，请在上课记录中更正");
    if (current.deducted && !before.deducted) {
      const order = state.orders?.find((order) => order.id === current.orderId);
      if (!order || current.confirmedUnits === undefined)
        throw new Error("找不到原扣课套餐，无法撤销");
      order.balance += current.confirmedUnits;
      state.credits.unshift({
        id: randomUUID(),
        studentId: current.studentId,
        date: DEMO_TODAY,
        type: "撤销扣课",
        units: current.confirmedUnits,
        balance: order.balance,
        orderId: order.id,
        lessonId: current.id,
        note: "撤销本次确认",
        operator,
      });
    }
    state.lessons[state.lessons.indexOf(current)] = {
      ...before,
      autoSettlementPaused: true,
    };
    const payroll = state.payroll.find(
      (item) =>
        item.teacherId === current.teacherId &&
        item.month === current.date.slice(0, 7) &&
        item.status === "待确认",
    );
    if (
      payroll &&
      snapshot.decision === "扣课" &&
      current.attendance === "正常"
    )
      payroll.lessons--;
  }
  for (const id of snapshot.capturedPayIds ?? []) delete state.lessonPayBasis?.[id];
  state.revision++;
  state.events.unshift({
    id: randomUUID(),
    studentId: "",
    teacherId: "",
    date: DEMO_TODAY,
    type: "撤销确认",
    content: "撤销 " + snapshot.before.length + " 节课的确认",
    operator,
  });
  refreshPackageBalances(state);
  return state;
}
