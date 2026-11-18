import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { projectMetrics, purchasedDelivery } from "./projectMetrics";
it("缺席可消课，取消不计出勤；未配置目标与 0 分母分别保留", () => {
  const d = createSeed(),
    s = d.students[0];
  const base = {
    ...d.lessons[0],
    studentId: s.id,
    date: "2026-11-02",
    status: "已完成" as const,
    deducted: true,
    confirmedUnits: 1,
  };
  d.lessons = [
    { ...base, studentAttendance: ["正常"] },
    { ...base, id: "absent", studentAttendance: ["缺席"] },
    { ...base, id: "canceled", status: "已取消", deducted: false },
  ];
  expect(projectMetrics(d, s, "2026-11")).toMatchObject({
    target: null,
    used: 2,
    expected: 2,
    present: 1,
  });
  s.monthlyRecords.push({
    id: "confirmed",
    month: "2026-11",
    planned: 12,
    actual: null,
    note: "",
  });
  expect(projectMetrics(d, s, "2026-11").target).toBe(12);
});

it("共用套餐按订单累计交付，缺席扣课不增加交付", () => {
  const d = createSeed();
  const [a,b] = d.students;
  d.orders = [{id:"family",studentIds:[a.id,b.id],units:72,balance:68,date:"2026-09-01",kind:"新购",channel:"",project:""}];
  const held = {...d.lessons[0], orderId:"family", studentId:a.id, date:"2026-09-20", duration:50, status:"已完成" as const, teacherIn:"09:00",teacherOut:"09:50",studentIn:"09:00",studentOut:"09:50",attendance:"正常" as const};
  d.lessons = [held,{...held,studentId:b.id,date:"2026-10-05",duration:25},{...held,deducted:true,attendance:"学员缺席"}];
  expect(purchasedDelivery(d,[a,b],"2026-10")).toMatchObject({purchased:72,delivered:3});
  expect(purchasedDelivery(d,[a],"2026-09")).toMatchObject({purchased:72,delivered:2});
  expect(purchasedDelivery(d,[a],"2026-08")).toMatchObject({purchased:0,delivered:0});
});

it("只有续费流水的旧采购订单仍计入首次购课，期初余额本身不算新购买", () => {
  const data = createSeed();
  const [a] = data.students;
  const original = { id: "old", studentIds: [a.id], units: 72, balance: 140, date: "2026-09-01", kind: "新购", channel: "", project: "" };
  data.orders = [original, { ...original, id: "opening", kind: "期初余额", units: 17, balance: 17 }];
  data.credits = [{ id: "transaction", purchaseId: "renewal", studentId: a.id, orderId: "old", date: "2026-10-01", type: "续费", units: 72, balance: 140, note: "", operator: "教务" }];
  expect(purchasedDelivery(data, [a], "2026-09").purchased).toBe(72);
  expect(purchasedDelivery(data, [a], "2026-10").purchased).toBe(144);
});
