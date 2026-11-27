import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import {
  applyHalfMonthCommand,
  halfMonthStatement,
  payDates,
  payrollReadiness,
} from "./halfMonthPayroll";
import { canAutoSettleLesson } from "./autoLessonSettlement";
import { defaultPayRules } from "./halfMonthPayrollSchema";
import { stateSchema, type Lesson } from "./model";

const period = "2026-11-1";
const afterPeriod = "2026-11-16T01:00:00+08:00";

function setup(mode: "OP" | "NP" = "NP") {
  const data = createSeed();
  const teacher = data.teachers[0];
  teacher.payMode = mode;
  teacher.rate = 180;
  teacher.availability = [{ day: 1, start: "19:00", end: "22:00" }];
  teacher.availabilityFrom = "2026-11-01";
  data.officePayRates = { [teacher.so]: 60 };
  const original = data.lessons[0];
  const lesson: Lesson = {
    ...original,
    id: "pay-test",
    date: "2026-11-02",
    time: "19:00",
    duration: 25,
    teacherId: teacher.id,
    status: "已完成",
    attendance: "正常",
    teacherAttendance: ["正常"],
    studentAttendance: ["正常"],
    classInAttendanceReceived: true,
    requiresScreenshot: true,
    cancellation: undefined,
    incident: undefined,
    fixedOrigin: undefined,
  };
  data.lessons = [];
  data.feedback = [];
  data.actions = [];
  data.orders = [];
  data.credits = [];
  return { data, teacher, lesson };
}

describe("half-month payroll", () => {
  it("splits calendar months and pays recurring OP time even without booked lessons", () => {
    const { data, teacher } = setup("OP");
    expect(payDates(period).at(-1)).toBe("2026-11-15");
    expect(payDates("2028-02-2").at(-1)).toBe("2028-02-29");
    const rows = halfMonthStatement(data, teacher, period).rows;
    expect(
      rows.map(({ date, teacher, office }) => ({ date, teacher, office })),
    ).toEqual([
      { date: "2026-11-02", teacher: 1080, office: 360 },
      { date: "2026-11-09", teacher: 1080, office: 360 },
    ]);
  });

  it("uses OP schedule history and separately reverses pay and applies an absence penalty", () => {
    const { data, teacher, lesson } = setup("OP");
    teacher.payScheduleHistory = [
      { from: "2026-11-01", until: "2026-11-08", slots: teacher.availability },
    ];
    teacher.availabilityFrom = "2026-11-08";
    teacher.availability = [{ day: 1, start: "19:00", end: "19:30" }];
    data.lessons = [
      {
        ...lesson,
        attendance: "老师缺席",
        status: "缺席",
        teacherAttendance: ["缺席"],
      },
    ];
    expect(halfMonthStatement(data, teacher, period).rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "op:2026-11-02:19:00",
          teacher: 1080,
          office: 360,
        }),
        expect.objectContaining({
          key: "op:2026-11-09:19:00",
          teacher: 180,
          office: 60,
        }),
        expect.objectContaining({
          key: "reversal:pay-test",
          teacher: -180,
          office: -60,
        }),
        expect.objectContaining({
          key: "attendance:pay-test",
          teacher: -540,
          office: 0,
        }),
      ]),
    );
  });

  it("pays normal ClassIn NP attendance without a screenshot and halves qualifying student cancellations", () => {
    const { data, teacher, lesson } = setup();
    data.lessons = [
      lesson,
      {
        ...lesson,
        id: "half",
        status: "已取消",
        cancellation: {
          at: "2026-11-02T18:31:00+08:00",
          kind: "学员请假",
          responsibility: "学员",
          waived: false,
        },
      },
      {
        ...lesson,
        id: "zero",
        status: "已取消",
        cancellation: {
          at: "2026-11-02T18:30:00+08:00",
          kind: "学员请假",
          responsibility: "学员",
          waived: false,
        },
      },
    ];
    const statement = halfMonthStatement(data, teacher, period);
    expect(statement.rows).toEqual([
      expect.objectContaining({ source: "pay-test", teacher: 180, office: 60 }),
      expect.objectContaining({ source: "half", teacher: 90, office: 30 }),
    ]);
    const draft = {
      ...lesson,
      status: "待确认" as const,
      deducted: false,
      confirmedUnits: 1,
      attendanceMessages: undefined,
    };
    expect(canAutoSettleLesson(draft, Date.parse(afterPeriod))).toBe(true);
    expect(
      canAutoSettleLesson(
        { ...draft, classInAttendanceReceived: undefined },
        Date.parse(afterPeriod),
      ),
    ).toBe(false);
  });

  it("pays a minor late NP lesson, excludes an absence and applies inclusive cancel boundaries", () => {
    const { data, teacher, lesson } = setup();
    data.lessons = [3, 10, 11].map((minutes) => ({
      ...lesson,
      id: "late-" + minutes,
      incident: {
        reason: "老师迟到",
        minutes,
        at: afterPeriod,
        operator: "TM",
        note: "已核实",
      },
    }));
    data.lessons[1].incident = undefined;
    data.lessons[1].teacherAttendance = ["迟到"];
    data.lessons[1].classInTeacherExceptionMinutes = 10;
    for (const [id, at] of [
      ["24h", "2026-11-01T19:00:00+08:00"],
      ["5d", "2026-10-28T19:00:00+08:00"],
      ["early", "2026-10-28T18:59:00+08:00"],
    ])
      data.lessons.push({
        ...lesson,
        id,
        status: "已取消",
        cancellation: {
          at,
          kind: "老师取消",
          responsibility: "老师",
          waived: false,
        },
      });
    const rows = halfMonthStatement(data, teacher, period).rows;
    expect(
      rows.filter((r) => r.category === "扣款").map((r) => r.teacher),
    ).toEqual([-6, -18, -540, -360, -180]);
    expect(rows.find(r => r.key === "attendance:late-10")).toMatchObject({
      quantity: 10, quantityUnit: "分钟", teacherUnitPrice: 2, teacher: -18,
    });
    expect(rows.filter(r => r.title === "迟到或早退").map(r => r.detail)).toEqual([
      "3 分钟 × ₱2 / 分钟", "10 分钟 × ₱2 / 分钟，单节上限 ₱18",
    ]);
    expect(
      rows.filter((r) => r.category === "底薪").map((r) => r.source),
    ).toEqual(["late-3", "late-10"]);
  });

  it("uses global rules across periods and freezes both amounts on confirmation", () => {
    const { data, teacher, lesson } = setup();
    data.lessons = [lesson];
    applyHalfMonthCommand(
      data,
      {
        type: "halfPay.rules",
        values: { ...defaultPayRules, renewal: 1200 },
      },
      afterPeriod,
    );
    applyHalfMonthCommand(
      data,
      {
        type: "halfPay.adjust",
        teacherId: teacher.id,
        period,
        side: "office",
        amount: -10,
        note: "补扣",
        operator: "财务",
      },
      afterPeriod,
    );
    applyHalfMonthCommand(
      data,
      {
        type: "halfPay.status",
        teacherId: teacher.id,
        period,
        status: "已确认",
      },
      afterPeriod,
    );
    const before = halfMonthStatement(data, teacher, period);
    expect(before.rules.renewal).toBe(1200);
    expect(halfMonthStatement(data, teacher, "2026-12-2").rules.renewal).toBe(1200);
    applyHalfMonthCommand(data, { type: "halfPay.rules", values: defaultPayRules }, afterPeriod);
    expect(before.rows[1]).toMatchObject({
      teacher: 0,
      office: -10,
      category: "人工调整",
    });
    teacher.rate = 300;
    data.lessons = [];
    applyHalfMonthCommand(
      data,
      {
        type: "halfPay.status",
        teacherId: teacher.id,
        period,
        status: "已发放",
      },
      afterPeriod,
    );
    expect(halfMonthStatement(data, teacher, period)).toEqual(before);
    const saved = stateSchema.parse(data).halfMonthPayroll![0];
    expect(saved.status).toBe("已发放");
    expect(saved.snapshot?.rows[0]).toMatchObject({
      quantity: 1, quantityUnit: "课时", teacherUnitPrice: 180, officeUnitPrice: 60, payRatio: 1,
    });
    expect(saved.snapshot?.rows[1].quantity).toBeUndefined();
    expect(() =>
      applyHalfMonthCommand(
        data,
        {
          type: "halfPay.adjust",
          teacherId: teacher.id,
          period,
          side: "teacher",
          amount: 10,
          note: "补发",
        },
        afterPeriod,
      ),
    ).toThrow("已经确认");
  });

  it("keeps empty attendance pending and requires an explicit reviewed outcome", () => {
    const { data, teacher, lesson } = setup();
    data.lessons = [{ ...lesson, status: "待确认", attendance: "无数据" }];
    const confirm = {
      type: "halfPay.status",
      status: "已确认",
      period,
      teacherId: teacher.id,
    } as const;
    expect(() => applyHalfMonthCommand(data, confirm, afterPeriod)).toThrow(
      "先处理",
    );
    expect(() => applyHalfMonthCommand(
      data,
      {
        type: "halfPay.review",
        teacherId: teacher.id,
        period,
        key: "lesson-review:pay-test",
        note: "核对后本期不计薪",
      },
      afterPeriod,
    )).toThrow("业务入口");
    data.halfMonthPayroll![0].decisions = { "lesson-review:pay-test": "旧版备注" };
    expect(() => applyHalfMonthCommand(data, confirm, afterPeriod)).toThrow("先处理");
    expect(halfMonthStatement(data, teacher, period).rows[0]).toMatchObject({
      category: "待核",
      teacher: 0,
    });
  });
});

it("applies attendance threshold, TM praise deduplication and same-day renewal attribution", () => {
  const { data, teacher, lesson } = setup();
  data.lessons = Array.from({ length: 35 }, (_, i) => ({
    ...lesson,
    id: `class-${i}`,
    duration: 50,
    date: i === 34 ? "2026-11-10" : "2026-11-02",
  }));
  const f = createSeed().feedback[0];
  data.feedback = ["a", "b"].map((id) => ({
    ...f,
    id,
    lessonId: "class-34",
    studentId: lesson.studentId,
    teacherId: teacher.id,
    rating: "好评",
    tmResult: "处理成功",
    tmDate: "2026-11-10",
  }));
  data.orders = [
    {
      id: "renewed",
      studentIds: [lesson.studentId],
      units: 10,
      balance: 10,
      kind: "续费",
      date: "2026-11-10",
      channel: "",
      project: "",
    },
  ];
  data.credits = [
    {
      id: "renewal",
      orderId: "renewed",
      purchaseId: "renewed",
      studentId: lesson.studentId,
      date: "2026-11-10",
      type: "续费",
      units: 10,
      balance: 10,
      note: "",
      operator: "财务",
      recordedAt: "2026-11-10T21:00:00+08:00",
    },
  ];
  data.lessons.push({ ...lesson, id: "later-absent", date: "2026-11-10", time: "19:52",
    teacherId: data.teachers[1].id, duration: 25, attendance: "老师缺席", teacherAttendance: ["缺席"] });
  const awards = () =>
    halfMonthStatement(data, teacher, period).rows.filter(
      (r) => r.category === "奖金",
    );
  expect(awards().map((r) => [r.title, r.teacher])).toEqual([
    ["好评奖", 50],
    ["全勤奖", 500],
    ["复购奖", 1000],
  ]);
  data.lessons[0].teacherRescheduleDates = ["2026-11-01"];
  expect(awards().some((r) => r.title === "全勤奖")).toBe(false);
  data.lessons[0].teacherRescheduleDates = [];
  data.lessons[0].duration = 25;
  expect(awards().some((r) => r.title === "全勤奖")).toBe(false);
});

it("moves a serious complaint to manual review and avoids duplicating legacy complaint fines across periods", () => {
  const { data, teacher, lesson } = setup();
  const f = createSeed().feedback[0];
  data.lessons = [lesson];
  data.feedback = [
    {
      ...f,
      id: "verified",
      teacherId: teacher.id,
      lessonId: lesson.id,
      rating: "差评",
      date: "2026-11-04",
      tmDate: "2026-11-17",
      tmResult: "处理成功",
    },
  ];
  data.actions = [
    {
      id: "old",
      teacherId: teacher.id,
      feedbackId: "verified",
      type: "扣款",
      amount: 180,
      status: "已确认",
      reason: "原差评扣款",
      date: "2026-11-04",
    },
  ];
  expect(
    halfMonthStatement(data, teacher, period).rows.some(
      (r) => r.category === "扣款",
    ),
  ).toBe(false);
  expect(halfMonthStatement(data, teacher, "2026-11-2").rows).toEqual([
    expect.objectContaining({ title: "差评扣款", teacher: -180 }),
  ]);
  applyHalfMonthCommand(
    data,
    {
      type: "halfPay.serious",
      teacherId: teacher.id,
      period: "2026-11-2",
      feedbackId: "verified",
    },
    "2026-11-19T08:00:00Z",
  );
  expect(halfMonthStatement(data, teacher, "2026-11-2").rows).toEqual([
    expect.objectContaining({
      title: "严重违规待核",
      category: "待核",
      teacher: 0,
    }),
  ]);
});

it("calculates half-month statements independently of historical monthly settlements", () => {
  const { data, teacher, lesson } = setup();
  data.lessons = [lesson];
  data.settlements = [
    {
      teacherId: teacher.id,
      month: "2026-11",
      so: teacher.so,
      at: afterPeriod,
      lines: [],
    },
  ];
  expect(halfMonthStatement(data, teacher, period).rows).toEqual([
    expect.objectContaining({ source: lesson.id, category: "底薪", teacher: 180 }),
  ]);
  applyHalfMonthCommand(data, { type: "halfPay.status", teacherId: teacher.id, period, status: "已确认" }, afterPeriod);
  expect(data.halfMonthPayroll?.[0].status).toBe("已确认");
});

it("只冲减已计入的 OP 课时，并将周历午夜算作日末", () => {
  const { data, teacher, lesson } = setup("OP");
  teacher.availability = [
    { day: 1, start: "19:00", end: "19:55" },
    { day: 1, start: "23:30", end: "23:59" },
  ];
  data.lessons = [{ ...lesson, time: "19:30", attendance: "老师缺席", teacherAttendance: ["缺席"] }];
  const rows = halfMonthStatement(data, teacher, period).rows.filter(r => r.date === lesson.date);
  expect(rows.map(r => [r.key, r.teacher, r.office])).toEqual([
    ["op:2026-11-02:19:00", 180, 60], ["op:2026-11-02:23:30", 180, 60],
    ["attendance:pay-test", -540, 0],
  ]);
});

it("先核老师考勤再计学员缺席半薪，已核定的正常授课照计底薪", () => {
  const { data, teacher, lesson } = setup();
  data.lessons = [{ ...lesson, status: "待确认", attendance: "学员缺席",
    teacherAttendance: ["待核实"], studentAttendance: ["缺席"] }];
  expect(halfMonthStatement(data, teacher, period, Date.parse(afterPeriod)).rows.map(r => r.category)).toEqual(["待核"]);
  data.lessons = [{ ...lesson, attendance: "老师迟到", teacherAttendance: ["迟到"], studentAttendance: ["待核实"],
    incident: { reason: "老师迟到", minutes: 3, operator: "教务", note: "正常完课", at: afterPeriod } }];
  expect(halfMonthStatement(data, teacher, period).rows.map(r => [r.category, r.teacher, r.office])).toEqual([
    ["扣款", -6, 0], ["底薪", 180, 60],
  ]);
});

it("已入账的好差评改期后不再入账，新差评按原课酬结算", () => {
  const { data, teacher, lesson } = setup();
  const sample = createSeed().feedback[0];
  data.lessons = [lesson];
  data.feedback = (["好评", "差评"] as const).map(rating => ({ ...sample, id: rating, rating,
    teacherId: teacher.id, lessonId: lesson.id, tmResult: "处理成功", tmDate: "2026-11-14" }));
  applyHalfMonthCommand(data, { type: "halfPay.status", teacherId: teacher.id, period, status: "已确认" }, afterPeriod);
  expect(data.halfMonthPayroll?.[0].snapshot?.rows.map(r => r.teacher).sort((a, b) => a - b)).toEqual([-180, 50, 180]);
  data.feedback.forEach(f => { f.tmDate = "2026-11-17"; });
  data.feedback.push({ ...data.feedback[1], id: "new-complaint" });
  teacher.rate = 240;
  expect(halfMonthStatement(data, teacher, "2026-11-2").rows.map(r => [r.key, r.teacher]))
    .toEqual([["complaint:new-complaint", -180]]);
});

it.each([
  ["2026-11-1", "2026-11-14", "2026-11-15"],
  ["2028-02-2", "2028-02-28", "2028-02-29"],
])("北京时间在 %s 最后一天零点可以确认工资单", (period, previous, last) => {
  const { data, teacher } = setup();
  const command = { type: "halfPay.status", status: "已确认", teacherId: teacher.id, period } as const;
  expect(() => applyHalfMonthCommand(data, command, previous + "T23:59:59+08:00")).toThrow();
  applyHalfMonthCommand(data, command, last + "T00:00:00+08:00");
  expect(data.halfMonthPayroll?.[0].status).toBe("已确认");
});

it("最后一天的 OP 保障时段未结束时保留应得金额，结束当刻允许确认", () => {
  const { data, teacher } = setup("OP");
  teacher.availability = [{ day: 0, start: "19:00", end: "20:00" }];
  const command = { type: "halfPay.status", status: "已确认", teacherId: teacher.id, period } as const;
  const beforeEnd = "2026-11-15T19:59:59+08:00";
  const rows = halfMonthStatement(data, teacher, period, Date.parse(beforeEnd)).rows;
  expect(rows).toContainEqual(expect.objectContaining({key: "op:2026-11-15:19:00", teacher: 360, office: 120}));
  expect(rows).toContainEqual(expect.objectContaining({
    category: "等待", title: "固定时段尚未结束", detail: "时段结束后可确认工资单",
  }));
  expect(() => applyHalfMonthCommand(data, command, beforeEnd)).toThrow("等待");
  applyHalfMonthCommand(data, command, "2026-11-15T20:00:00+08:00");
  expect(data.halfMonthPayroll?.[0].status).toBe("已确认");
});

it("缺单价时保留适用的倍数扣款并复用单价核定，免扣和零倍率课程无扣款", () => {
  const { data, teacher, lesson } = setup();
  teacher.rate = 0;
  const cancel = {
    ...lesson,
    status: "已取消" as const,
    cancellation: {
      kind: "老师取消",
      responsibility: "老师",
      at: "2026-11-02T12:00:00+08:00",
      waived: false,
    },
  };
  data.lessons = [
    {
      ...lesson,
      id: "absent",
      attendance: "老师缺席",
      teacherAttendance: ["缺席"],
      status: "缺席",
    },
    { ...cancel, id: "late-cancel" },
    {
      ...cancel,
      id: "waived",
      cancellation: { ...cancel.cancellation, waived: true },
    },
    {
      ...cancel,
      id: "early",
      cancellation: { ...cancel.cancellation, at: "2026-10-20T12:00:00+08:00" },
    },
  ];
  const rows = () => halfMonthStatement(data, teacher, period).rows;
  expect(
    rows()
      .filter((r) => r.category === "待核")
      .map((r) => r.key),
  ).toEqual(["teacher-rate"]);
  expect(
    rows()
      .filter((r) => r.category === "扣款")
      .map((r) => [r.key, r.detail, r.pendingRates]),
  ).toEqual([
    ["attendance:absent", "课时费待核 × 3", ["teacher"]],
    ["attendance:late-cancel", "课时费待核 × 2", ["teacher"]],
  ]);
  data.payRuleChanges = [
    {
      at: "2026-10-01T00:00:00+08:00",
      values: { ...defaultPayRules, shortCancelMultiple: 0 },
    },
  ];
  expect(rows().some((r) => r.key === "attendance:late-cancel")).toBe(false);
  teacher.rate = 180;
  expect(rows().find((r) => r.key === "attendance:absent")).toMatchObject({
    teacher: -540,
    detail: "课时费 ₱180 × 3",
  });
});

it("结算日仅把之前仍缺摘要的课程转为待核，当日课等待到次日零点", () => {
  const { data, teacher, lesson } = setup();
  const draft = {
    ...lesson, status: "待确认" as const,
    attendance: "无数据" as const, classInAttendanceReceived: false,
  };
  data.lessons = [draft, { ...draft, id: "last-day", date: "2026-11-15" }];
  const confirm = { type: "halfPay.status", status: "已确认", teacherId: teacher.id, period } as const;
  for (const [timestamp, waiting, review] of [
    ["2026-11-14T23:59:59+08:00", 2, 0],
    ["2026-11-15T00:00:00+08:00", 1, 1],
    ["2026-11-15T19:15:00+08:00", 1, 1],
    ["2026-11-15T23:59:59+08:00", 1, 1],
    ["2026-11-16T00:00:00+08:00", 0, 2],
  ] as const) {
    const now = Date.parse(timestamp);
    const rows = halfMonthStatement(data, teacher, period, now).rows;
    expect(payrollReadiness(rows, period, now)).toEqual({ waiting, review, canConfirm: false });
    expect(() => applyHalfMonthCommand(data, confirm, timestamp)).toThrow();
  }
});

it("结算日的待确认课程收到完整考勤后，本节结束当刻可关账", () => {
  const { data, teacher, lesson } = setup();
  data.lessons = [{ ...lesson, date: "2026-11-15", status: "待确认", deducted: false }];
  const confirm = { type: "halfPay.status", status: "已确认", teacherId: teacher.id, period } as const;
  const before = "2026-11-15T19:24:59+08:00";
  const end = "2026-11-15T19:25:00+08:00";
  expect(() => applyHalfMonthCommand(data, confirm, before)).toThrow("等待");
  applyHalfMonthCommand(data, confirm, end);
  const frozen = data.halfMonthPayroll?.find(r => r.teacherId === teacher.id)?.snapshot;
  expect(frozen?.rows.map(r => [r.teacher, r.office])).toEqual([[180, 60]]);
});
