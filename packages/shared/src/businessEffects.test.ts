import { expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { applyBusinessEffects } from "./businessEffects";
import { DEMO_TODAY, type Command } from "./model";

it("账号退款清零共享余额并取消所有关联学员未来课，保留独立账号及历史", () => {
  const state = createSeed();
  const [a, b, other] = state.students;
  state.packageBalanceVersion = 2;
  state.orders = [{ id: "shared", studentIds: [a.id, b.id], units: 72, balance: 48, date: DEMO_TODAY, kind: "新购", channel: a.channel, project: a.project },
    { id: "other", studentIds: [other.id], units: 72, balance: 60, date: DEMO_TODAY, kind: "新购", channel: other.channel, project: other.project }];
  for (const s of [a, b, other]) { s.status = "在读"; }
  const base = state.lessons[0];
  state.lessons = [a, b, other].map((s, i) => ({ ...base, id: `future-${i}`, studentId: s.id, date: DEMO_TODAY, status: "未开始" }));
  state.lessons.push({ ...base, id: "history", studentId: a.id, date: "2020-01-01", status: "已取消" });
  const command: Command = { type: "student.lifecycle", studentId: a.id, status: "退费", reason: "账号退款", operator: "验收" };
  const result = transition(state, command).data;
  applyBusinessEffects(result, command);
  for (const id of [a.id, b.id]) {
    expect(result.students.find(s => s.id === id)).toMatchObject({ balance: 0, status: "退费" });
    expect(result.events.find(e => e.studentId === id && e.type === "退费")?.serviceStopResults).toBeDefined();
  }
  expect(result.students.find(s => s.id === other.id)).toMatchObject({ balance: 60, status: "在读" });
  expect(result.lessons.map(l => l.status)).toEqual(["已取消", "已取消", "未开始", "已取消"]);
  expect(result.credits.filter(c => c.type === "退费")).toMatchObject([{ units: -48, balance: 0, orderId: "shared", operator: "验收" }]);
  expect(result.tasks.some(t => [a.id, b.id].includes(t.studentId) && t.title === "退款停用：服务权限")).toBe(false);
  expect(state.orders[0].balance).toBe(48);
  const siblingEvents = result.events.filter(e => e.studentId === b.id);
  const siblingResults = structuredClone(result.students.find(s => s.id === b.id)!.serviceStopResults);
  const resumed = transition(result, { type: "student.lifecycle", studentId: a.id, status: "在读", reason: "复课" }).data;
  const again = transition(resumed, command).data;
  applyBusinessEffects(again, command);
  expect(again.events.filter(e => e.studentId === b.id)).toEqual(siblingEvents);
  expect(again.students.find(s => s.id === b.id)!.serviceStopResults).toEqual(siblingResults);
  expect(again.credits.filter(c => c.type === "退费")).toHaveLength(1);
});

it("联系方式和普通资料编辑保留已关联 UID，显式改绑需单独处理", () => {
  const state = createSeed();
  state.teachers[0].classInUid = "400";
  const teacher = state.teachers[0];
  const { classInUid: _uid, ...withoutUid } = teacher;
  const same = transition(state, { type: "teacher.save", teacher: { ...withoutUid, teachingPhilosophy: "资料修改" } }).data;
  expect(same.teachers[0].classInUid).toBe("400");
  const changed = transition(state, { type: "teacher.save", teacher: { ...withoutUid, phone: "13812345678" } }).data;
  expect(changed.teachers[0].classInUid).toBe("400");
  expect(()=>transition(state,{type:"teacher.save",teacher:{...teacher,classInUid:"401"}})).toThrow("不能直接改绑");
});
