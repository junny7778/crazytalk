import { describe, expect, it, vi } from "vitest";
import { createSeed } from "../packages/shared/src/seed";
import { parseCommand } from "../packages/shared/src/commandSchema";
import { transition } from "../packages/shared/src/domain";
import { halfMonthStatement } from "../packages/shared/src/halfMonthPayroll";
import { defaultPayRules } from "../packages/shared/src/halfMonthPayrollSchema";
import type { Lesson } from "../packages/shared/src/model";

const period = "2025-01-1";
function fixture() {
  let data = createSeed();
  const [a, b] = data.teachers;
  for (const t of [a, b]) Object.assign(t, { payMode: "NP", rate: 180 });
  data.officePayRates = { [a.so]: 60, [b.so]: 60 };
  const studentId = data.students[0].id;
  const course: Lesson = {
    ...data.lessons[0],
    id: "verified",
    teacherId: a.id,
    studentId,
    orderId: "purchase",
    date: "2025-01-06",
    time: "19:00",
    duration: 25,
    plannedUnits: 1,
    confirmedUnits: 1,
    status: "待确认",
    attendance: "无数据",
    teacherAttendance: ["待核实"],
    studentAttendance: ["待核实"],
    classInAttendanceReceived: false,
    deducted: false,
    incident: undefined,
    cancellation: undefined,
  };
  data.lessons = [course];
  data.feedback = [];
  data.actions = [];
  data.credits = [];
  data.settlements = [];
  data.packageBalanceVersion = 2;
  data.orders = [
    {
      id: "purchase",
      studentIds: [studentId],
      units: 10,
      balance: 10,
      project: "",
      channel: "",
      kind: "购课",
      date: "2025-01-01",
    },
  ];
  const send = (command: unknown) => {
    data = transition(data, parseCommand(command)).data;
  };
  const resolve = (conclusion: string, fields: object = {}) =>
    send({
      type: "lesson.resolve",
      ids: [course.id],
      reason: "教务核对原始记录",
      decision: "不扣",
      conclusion,
      ...fields,
    });
  const rows = (id = a.id, p = period) =>
    halfMonthStatement(data, data.teachers.find((t) => t.id === id)!, p).rows;
  const confirm = (id = a.id) =>
    send({ type: "halfPay.status", status: "已确认", period, teacherId: id });
  return { state: () => data, a, b, course, resolve, rows, send, confirm };
}
describe("核定结果贯通学员账和双方工资单", () => {
  it.each([
    ["老师24小时内取消", "2025-01-05T19:00:00+08:00", -360],
    ["学员提前3小时取消", "2025-01-06T16:00:00+08:00", 0],
    ["教材错误或重复", undefined, 0],
  ] as const)("%s", (conclusion, cancelledAt, fine) => {
    const f = fixture();
    f.resolve(conclusion, { cancelledAt });
    expect(f.state().lessons[0]).toMatchObject({
      status: "已取消",
      deducted: false,
    });
    expect(f.state().orders![0].balance).toBe(10);
    expect(f.rows().map((r) => [r.teacher, r.office])).toEqual(
      fine ? [[fine, 0]] : [],
    );
  });
  it("更正迟到为正常，移除原扣款", () => {
    const f = fixture();
    f.resolve("老师迟到", { decision: "扣课", minutes: 3, units: 1 });
    expect(f.rows().find((r) => r.category === "扣款")?.teacher).toBe(-6);
    f.send({
      type: "lesson.correct",
      id: f.course.id,
      deduct: true,
      units: 1,
      attendance: "正常",
      result: "已完成",
      reason: "核对出勤时间",
    });
    expect(f.rows().map((r) => [r.teacher, r.office])).toEqual([[180, 60]]);
    expect(f.state().orders![0].balance).toBe(9);
  });
  it.each([
    ["扣课", 2, 360, 120, 8], ["不扣", undefined, 270, 90, 10],
  ] as const)("55 分钟正常完课，学员%s，老师和 SO 仍按本节课时计酬", (decision, units, teacher, office, balance) => {
    const f = fixture();
    Object.assign(f.course, {duration:55, plannedUnits:1.5, confirmedUnits:undefined});
    f.resolve("正常上课", {decision, units});
    expect(f.rows().filter(r=>r.source===f.course.id).map(r=>[r.teacher, r.office])).toEqual([[teacher, office]]);
    expect(f.state().orders![0].balance).toBe(balance);
  });
  it("核定后由 NP 转 OP，已核定课程保留按课计薪", () => {
    const f = fixture();
    f.resolve("正常上课", {decision:"扣课", units:1});
    const teacher = f.state().teachers[0];
    f.send({type:"teacher.save", teacher:{...teacher,payMode:"OP"}});
    expect(f.rows().filter(r=>r.source===f.course.id).map(r=>[r.teacher,r.office])).toEqual([[180,60]]);
  });
  it("网络恢复后正常完课", () => {
    const f = fixture();
    f.resolve("老师网络设备问题", {
      networkOutcome: "正常完课",
      decision: "扣课",
      units: 1,
    });
    expect(f.state().lessons[0]).toMatchObject({
      status: "已完成",
      deducted: true,
    });
    expect(f.rows().map((r) => [r.teacher, r.office])).toEqual([[180, 60]]);
  });
  it.each([
    [75, 20],
    [0, 0],
  ])("网络取消逐课明确 %i/%i", (teacher, office) => {
    const f = fixture();
    f.resolve("学员网络设备问题", { networkOutcome: "取消" });
    expect(f.state().lessons[0]).toMatchObject({
      status: "已取消",
      deducted: false,
    });
    const key = "network-pay:" + f.course.id;
    expect(f.rows()).toContainEqual(
      expect.objectContaining({ key, category: "待核" }),
    );
    expect(() => f.confirm()).toThrow();
    const review = {
      type: "halfPay.review",
      teacherId: f.a.id,
      period,
      key,
      note: "核定双方应付",
    };
    expect(() => f.send(review)).toThrow();
    f.send({ ...review, networkPay: { teacher, office } });
    f.confirm();
    const amounts = f
      .rows()
      .reduce(([t, o], r) => [t + r.teacher, o + r.office], [0, 0]);
    expect(amounts).toEqual([teacher, office]);
  });
  it("同一半月两节学员缺席课，改全局比例及双方单价只影响之后核定的课", () => {
    const f = fixture();
    f.state().lessons.push({ ...f.course, id: "new-lesson", date: "2025-01-07" });
    f.resolve("学员缺席", { decision: "缺席", units: 1 });
    f.send({ type: "halfPay.teacherRate", teacherId: f.a.id, rate: 240 });
    f.send({ type: "halfPay.officeRate", so: f.a.so, rate: 80 });
    f.send({ type: "halfPay.rules", values: { ...defaultPayRules, absentRatio: 0.75 } });
    f.resolve("学员缺席", { ids: ["new-lesson"], decision: "缺席", units: 1 });
    expect(f.rows().map(r => [r.source, r.teacher, r.office])).toEqual([
      [f.course.id, 90, 30], ["new-lesson", 180, 60],
    ]);
  });
  it("跨期工资单冻结半薪90后差评只扣90", () => {
    const f = fixture();
    f.resolve("学员缺席", { decision: "缺席", units: 1 });
    expect(f.rows().map((r) => [r.teacher, r.office])).toEqual([[90, 30]]);
    f.confirm();
    f.send({ type: "halfPay.teacherRate", teacherId: f.a.id, rate: 300 });
    f.state().feedback.push({
      ...createSeed().feedback[0],
      id: "complaint",
      lessonId: f.course.id,
      teacherId: f.a.id,
      rating: "差评",
      tmResult: "处理成功",
      date: "2025-01-07",
      tmDate: "2025-01-16",
    });
    expect(
      f.rows(f.a.id, "2025-01-2").map((r) => [r.teacher, r.office]),
    ).toEqual([[-90, 0]]);
  });
});

function renewalFixture() {
  const f = fixture();
  f.resolve("正常上课", { decision: "扣课", units: 1 });
  const state = f.state();
  state.lessons.push({
    ...f.course,
    id: "second",
    teacherId: f.b.id,
    date: "2025-01-07",
  });
  state.orders!.push({
    ...state.orders![0],
    id: "renew",
    kind: "续费",
    date: "2025-01-07",
  });
  state.credits.push({
    id: "entry",
    purchaseId: "renew",
    orderId: "renew",
    studentId: f.course.studentId,
    type: "续费",
    date: "2025-01-07",
    recordedAt: "2025-01-07T20:00:00+08:00",
    units: 10,
    balance: 10,
    note: "",
    operator: "验收",
  });
  return f;
}
it("两名候选老师都等待最近课程核定，仅最后授课者领到复购奖", () => {
  const f = renewalFixture();
  for (const t of [f.a, f.b]) {
    expect(
      f.rows(t.id).some((r) => r.category === "待核" && r.source === "renew"),
    ).toBe(true);
    expect(() => f.confirm(t.id)).toThrow();
  }
  f.resolve("正常上课", { ids: ["second"], decision: "扣课", units: 1 });
  f.confirm(f.b.id);
  f.confirm(f.a.id);
  expect(
    [f.a, f.b].map((t) =>
      f
        .rows(t.id)
        .filter((r) => r.key === "renewal:renew")
        .map((r) => r.teacher),
    ),
  ).toEqual([[], [1000]]);
});
it("原老师发放后最近课程由缺席更正为完课，不再自动发第二笔", () => {
  const f = renewalFixture();
  f.resolve("老师缺席", { ids: ["second"] });
  f.confirm();
  f.send({
    type: "halfPay.status",
    teacherId: f.a.id,
    period,
    status: "已发放",
  });
  f.send({
    type: "lesson.correct",
    id: "second",
    attendance: "正常",
    result: "已完成",
    deduct: true,
    units: 1,
    reason: "已核实完课",
  });
  expect(
    f
      .rows()
      .filter((r) => r.key === "renewal:renew")
      .map((r) => r.teacher),
  ).toEqual([1000]);
  expect(f.rows(f.b.id).filter((r) => r.category === "奖金")).toEqual([]);
  expect(f.rows(f.b.id)).toContainEqual(
    expect.objectContaining({
      category: "待核",
      source: "renew",
      detail: expect.stringContaining(f.a.name),
    }),
  );
});

it("上期仍开放，差评先在下期结算也只扣原课半薪", () => {
  const f = fixture();
  f.resolve("学员缺席", { decision: "缺席", units: 1 });
  f.send({ type: "halfPay.teacherRate", teacherId: f.a.id, rate: 300 });
  f.state().feedback.push({
    ...createSeed().feedback[0],
    id: "later",
    lessonId: f.course.id,
    teacherId: f.a.id,
    rating: "差评",
    tmResult: "处理成功",
    date: "2025-01-07",
    tmDate: "2025-01-16",
  });
  f.send({
    type: "halfPay.status",
    teacherId: f.a.id,
    period: "2025-01-2",
    status: "已确认",
  });
  expect(f.rows(f.a.id, "2025-01-2").map((r) => r.teacher)).toEqual([-90]);
  f.confirm();
  expect(f.rows().map((r) => r.teacher)).toEqual([90]);
});
it("未核定原课程时差评没有可扣金额，不能用备注确认", () => {
  const f = fixture();
  f.state().feedback.push({
    ...createSeed().feedback[0],
    id: "pending",
    lessonId: f.course.id,
    teacherId: f.a.id,
    rating: "差评",
    tmResult: "处理成功",
    date: "2025-01-07",
    tmDate: "2025-01-10",
  });
  expect(f.rows()).toContainEqual(
    expect.objectContaining({
      key: "complaint-fee:pending",
      category: "待核",
      teacher: 0,
    }),
  );
  expect(f.rows().filter((r) => r.category === "扣款")).toEqual([]);
  expect(() =>
    f.send({
      type: "halfPay.review",
      teacherId: f.a.id,
      period,
      key: "complaint-fee:pending",
      note: "已核",
    }),
  ).toThrow();
  expect(() => f.confirm()).toThrow();
});
it("两份工资单均已锁定，归属更正在下份账单处理一次", () => {
  const f = renewalFixture();
  f.resolve("老师缺席", { ids: ["second"] });
  f.confirm();
  f.confirm(f.b.id);
  f.send({
    type: "lesson.correct",
    id: "second",
    attendance: "正常",
    result: "已完成",
    deduct: true,
    units: 1,
    reason: "核实出勤",
  });
  const next = "2025-01-2";
  const key = "renewal-correction:renew";
  expect(f.rows(f.b.id, next)).toContainEqual(
    expect.objectContaining({
      key,
      source: "renew",
      teacher: 0,
      category: "待核",
      detail: expect.stringContaining("1000"),
    }),
  );
  expect(f.rows(f.b.id, next).filter((r) => r.category === "奖金")).toEqual([]);
  f.send({
    type: "halfPay.review",
    teacherId: f.b.id,
    period: next,
    key,
    note: "已完成跨老师调账核对",
  });
  f.send({
    type: "halfPay.status",
    teacherId: f.b.id,
    period: next,
    status: "已确认",
  });
  expect(
    f.rows(f.b.id, "2025-02-1").filter((r) => r.source === "renew"),
  ).toEqual([]);
});

it("历史半薪单价缺失，先补当日单价再核次期差评", () => {
  const f = fixture();
  f.resolve("学员缺席", { decision: "缺席", units: 1 });
  delete f.state().lessonPayBasis?.[f.course.id];
  f.state().teachers[0].payRateHistory = [{ until: "2025-01-08", rate: 0 }];
  f.state().feedback.push({
    ...createSeed().feedback[0],
    id: "rate",
    lessonId: f.course.id,
    teacherId: f.a.id,
    rating: "差评",
    tmResult: "处理成功",
    date: "2025-01-07",
    tmDate: "2025-01-16",
  });
  const key = "historical-rate:" + f.course.date;
  const review = {
    type: "halfPay.review",
    teacherId: f.a.id,
    period,
    key,
    note: "查原始合同确认当日单价",
  };
  expect(f.rows()).toContainEqual(
    expect.objectContaining({ key, category: "待核" }),
  );
  expect(f.rows(f.a.id, "2025-01-2")).toContainEqual(
    expect.objectContaining({ key: "complaint-fee:rate", category: "待核" }),
  );
  expect(() => f.send(review)).toThrow();
  expect(() => f.send({ ...review, historicalRate: 0 })).toThrow();
  f.send({ ...review, historicalRate: 180 });
  expect(
    f
      .rows()
      .filter((r) => r.category === "底薪")
      .map((r) => r.teacher),
  ).toEqual([90]);
  expect(f.rows(f.a.id, "2025-01-2").map((r) => r.teacher)).toEqual([-90]);
});

it("学员早于三小时取消覆盖原来的缺席考勤", () => {
  const f = fixture();
  Object.assign(f.state().lessons[0], {
    attendance: "学员缺席",
    studentAttendance: ["缺席"],
  });
  f.resolve("学员取消", { cancelledAt: "2025-01-06T15:00:00+08:00" });
  expect(f.state().lessons[0]).toMatchObject({
    status: "已取消",
    deducted: false,
  });
  expect(f.state().orders![0].balance).toBe(10);
  expect(f.rows().filter((r) => r.teacher !== 0 || r.office !== 0)).toEqual([]);
});

it("OP 网络取消先冲回本节保障，再加核定的实际金额", () => {
  const f = fixture();
  Object.assign(f.a, {
    payMode: "OP",
    availability: [{ day: 1, start: "19:00", end: "20:00" }],
    availabilityFrom: "2025-01-01",
  });
  f.resolve("老师网络设备问题", { networkOutcome: "取消" });
  const rows = () => f.rows().filter((r) => r.date === f.course.date);
  expect(rows()).toContainEqual(
    expect.objectContaining({
      key: "reversal:verified",
      teacher: -180,
      office: -60,
    }),
  );
  f.send({
    type: "halfPay.review",
    teacherId: f.a.id,
    period,
    key: "network-pay:verified",
    note: "双方确认",
    networkPay: { teacher: 75, office: 20 },
  });
  f.confirm();
  expect(
    rows().reduce(([t, o], r) => [t + r.teacher, o + r.office], [0, 0]),
  ).toEqual([255, 80]);
});

it("好评与续费保留事件当时的规则，全勤采用周期末的规则", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2025-01-08T12:00:00+08:00"));
    const f = fixture();
    f.resolve("正常上课", { decision: "扣课", units: 1 });
    f.send({ type: "halfPay.rules", values: { praise: 75, renewal: 800, attendanceUnits: 1 } });
    f.state().feedback.push({
      ...createSeed().feedback[0], id: "praise", teacherId: f.a.id,
      studentId: f.course.studentId, date: "2025-01-07", rating: "好评", tmResult: "",
    });
    f.send({ type: "feedback.tm", id: "praise", date: "2025-01-08", result: "处理成功", jointVerdict: "", note: "核实" });
    f.send({ type: "credit.add", studentId: f.course.studentId, orderId: "purchase",
      purchaseId: "renew", kind: "续费", date: "2025-01-08", units: 72, note: "" });
    f.send({ type: "halfPay.rules", values: { praise: 100, renewal: 900, attendanceAward: 650 } });
    expect(f.rows().some(row => row.key === "attendance-award")).toBe(false);
    vi.setSystemTime(new Date("2025-01-16T00:00:00+08:00"));
    f.send({ type: "halfPay.rules", values: { attendanceAward: 999 } });
    expect(f.rows().filter(row => row.category === "奖金").map(row => [row.key, row.teacher])).toEqual([
      ["praise:praise", 75], ["attendance-award", 650], ["renewal:renew", 800],
    ]);
  } finally {
    vi.useRealTimers();
  }
});
