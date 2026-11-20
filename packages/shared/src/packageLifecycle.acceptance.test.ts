import { expect, it } from "vitest";
import { transition } from "./domain";
import { emptyStudentProfile, type Command } from "./model";
import { createSeed } from "./seed";
import { getScheduleCredits } from "./scheduleCredits";
import { purchasedDelivery } from "./projectMetrics";
import { getStudentSummary } from "./studentSummary";

it("购课、后续加入、续费、补赠和不同学员上课均落到同一套餐", () => {
  let data = createSeed();
  const execute = (cmd: Command) => { data = transition(data, cmd).data; };
  const enroll = (name: string) => {
    execute({ type: "student.create", student: { ...emptyStudentProfile(), chineseName: name } });
    return data.students[0].id;
  };
  const a = enroll("小安");
  execute({ type: "order.buy", id: "family", studentId: a, studentIds: [a], units: 72,
    date: "2026-10-31", kind: "新购", note: "" });
  const pack = () => data.orders!.find(item => item.id === "family")!;
  const takeLesson = (studentId: string, date: string, duration: number) => {
    execute({ type: "lesson.schedule", studentId, teacherId: data.teachers[0].id,
      slots: [{ date, time: "19:00" }], kind: "临时课", confirmedTeacher: true, duration, material: "绘本" });
    const lesson = data.lessons.find(item => item.studentId === studentId && item.date === date)!;
    expect(lesson.orderId).toBe(pack().id);
    expect(getScheduleCredits(data, a, 1, 1).reserved).toBe(duration / 25);
    lesson.status = "待确认";
    execute({ type: "lesson.resolve", ids: [lesson.id], decision: "扣课", units: duration / 25, reason: "完课" });
    expect(data.credits[0]).toMatchObject({ studentId, orderId: pack().id, lessonId: lesson.id });
  };
  const b = enroll("小贝");
  const c = enroll("小辰");

  expect(() => takeLesson(b, "2026-11-23", 25)).toThrow("绑定 ClassIn");
  for (const id of [a,b,c]) execute({type:"student.bindClassIn",id,phone:"13900001234",uid:"101"});
  expect(data.classInAccounts!.find(account => account.uid === "101")!.studentIds.sort()).toEqual([a,b,c].sort());
  expect(pack().balance).toBe(72);
  takeLesson(a, "2026-11-23", 50);
  expect(pack().balance).toBe(70);
  expect(pack()).toMatchObject({ studentIds: [a, b, c], balance: 70 });
  const renew = { type: "credit.add" as const, studentId: b, orderId: "family",
    kind: "续费", units: 72, date: "2026-10-31", note: "", purchaseId: "renew1" };
  execute(renew);
  execute(renew);
  expect(pack().balance).toBe(142);
  execute({ type: "credit.add", studentId: a, kind: "补偿", units: 1, note: "课程中断" });
  execute({ type: "credit.add", studentId: c, kind: "赠送", units: 2, note: "活动赠课" });
  takeLesson(b, "2026-11-24", 25);
  expect(pack().balance).toBe(144);
  for (const id of [a, b, c]) {
    expect(getScheduleCredits(data, id, 1, 1).available).toBe(144);
    expect(data.students.find(s => s.id === id)?.balance).toBe(144);
  }
  expect(getStudentSummary(data, c).purchaseDate).toBe("2026-10-31");
  expect(purchasedDelivery(data, data.students.filter(s => [a,b,c].includes(s.id)), "2026-11").purchased).toBe(144);
});
