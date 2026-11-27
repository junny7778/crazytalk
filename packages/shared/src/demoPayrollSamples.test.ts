import { beforeEach, expect, it } from "vitest";
import { withDemoPayrollSamples, withErikaSamples } from "./demoPayrollSamples";
import { halfMonthStatement } from "./halfMonthPayroll";
import { hasFinalPayrollAttendance, lessonAttendanceBlocker } from "./lessonAttendance";
import { DEMO_NOW } from "./clock";
import { stateSchema } from "./model";
import { demoRepository } from "./repository";
beforeEach(() => demoRepository.reset());

it("links both settlement periods to lessons, package transactions and verified feedback", () => {
  const data = withDemoPayrollSamples(withErikaSamples(demoRepository.read()));
  expect(stateSchema.safeParse(data).success).toBe(true);
  const teacher = data.teachers.find((t) => t.id === "t8")!;
  const records = data.halfMonthPayroll!.filter((r) => r.teacherId === teacher.id);
  expect(records.map((r) => [r.period, r.status])).toEqual([
    ["2026-10-1", "已发放"],
    ["2026-10-2", "已确认"],
  ]);
  expect(records[0].snapshot!.rows.find((r) => r.category === "人工调整")).toMatchObject({
    teacher: 100,
    office: 0,
    detail: "10 月 5 日入职培训补贴 · Rita",
  });
  const { rows } = halfMonthStatement(data, teacher, "2026-10-2");
  expect(rows.map((r) => [r.title, r.teacher, r.office])).toEqual([
    ["NP 正常完课", 250, 60],
    ["NP 正常完课", 500, 120],
    ["迟到或早退", -6, 0],
    ["NP 正常完课", 250, 60],
    ["NP 学员缺席", 125, 30],
    ["好评奖", 50, 0],
    ["复购奖", 1000, 0],
  ]);
  const pack = data.orders!.find((o) => o.id === "demo-payroll-package-erika")!;
  const credits = data.credits.filter((c) => c.orderId === pack.id);
  expect(credits.reduce((sum, c) => sum + c.units, 0)).toBe(pack.balance);
  expect(data.students.find((s) => s.id === pack.studentIds[0])?.balance).toBe(12);
  for (const l of data.lessons.filter((l) => l.orderId === pack.id)) {
    expect(credits.filter((c) => c.lessonId === l.id).map((c) => c.units)).toEqual([-l.confirmedUnits!]);
    expect(data.lessonPayBasis?.[l.id]).toMatchObject({ teacherRate: 250, officeRate: 60 });
  }
  const praise = rows.find((r) => r.title === "好评奖")!;
  expect(praise).toMatchObject({quantity: 1, quantityUnit: "次", teacherUnitPrice: 50});
  expect(rows.find(r => r.title === "NP 学员缺席")).toMatchObject({
    quantity: 1, quantityUnit: "课时", teacherUnitPrice: 250, officeUnitPrice: 60, payRatio: 0.5,
  });
  expect(data.feedback.find((f) => f.id === praise.source)?.lessonId).toBe(praise.lessonId);
  expect(withDemoPayrollSamples(data)).toBe(data);
});

it("keeps manually set rates, modes and existing statements when adding missing demo cases", () => {
  const before = demoRepository.read();
  before.teachers[0].payMode = "OP";
  before.officePayRates = { Mellany: 70, BigBrains: 0 };
  before.halfMonthPayroll = [
    {
      teacherId: "t8",
      period: "2026-10-2",
      status: "待确认",
      adjustments: [
        {
          key: "adjustment:1",
          side: "teacher",
          amount: 80,
          note: "代课补贴",
          at: "2026-10-28",
          operator: "Rita",
        },
      ],
    },
  ];
  const data = withDemoPayrollSamples(withErikaSamples(before));
  expect(data.teachers[0].payMode).toBe("OP");
  expect(data.officePayRates).toMatchObject(before.officePayRates);
  expect(data.halfMonthPayroll?.find((r) => r.period === "2026-10-2")).toEqual(before.halfMonthPayroll[0]);
  expect(data.lessons.some((l) => l.id.startsWith("demo-payroll-erika") && l.date > "2026-10-15")).toBe(
    false,
  );
});

it("opens the demo with settled slips, outstanding evening slots and unresolved items", () => {
  demoRepository.initializeDemoSamples();
  const data = demoRepository.read();
  const period = "2026-10-2";
  const statuses = data.teachers.map((t) => {
    const { rows } = halfMonthStatement(data, t, period);
    if (rows.some((r) => r.category === "待核" || r.pendingRates?.length)) return [t.name, "待核"];
    const record = data.halfMonthPayroll?.find((r) => r.period === period && r.teacherId === t.id);
    return [t.name, record?.status ?? "可确认"];
  });
  expect(Object.fromEntries(statuses)).toEqual({
    "T. Carol": "待核",
    "T. Destiny": "可确认",
    "T. Rhea": "已确认",
    "T. Kathy": "待核",
    "T. Micha": "已确认",
    "T. Glyzel": "可确认",
    "T. Jasshiel": "已发放",
    "T. Erika": "已确认",
    "T. Nora": "可确认",
    "T. Theo": "可确认",
  });
  for (const lessonId of ["l89", "l90", "l91", "l92", "l94", "l23", "l24"]) {
    const lesson = data.lessons.find((l) => l.id === lessonId)!;
    const charges = data.credits.filter((c) => c.lessonId === lessonId && c.type === "上课扣课");
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      studentId: lesson.studentId,
      orderId: lesson.orderId,
      units: -lesson.confirmedUnits!,
    });
  }
  expect(data.lessons.find((l) => l.id === "l96")?.status).toBe("已取消");
  expect(data.credits.some((c) => c.lessonId === "l96")).toBe(false);
  expect(withDemoPayrollSamples(data)).toBe(data);
});

it("preserves a manual pay adjustment and an edited lesson when opening an existing demo", () => {
  const before = withErikaSamples(demoRepository.read());
  const lesson = before.lessons.find((l) => l.id === "l94")!;
  lesson.note = "教务已联系老师，等候考勤核实";
  before.halfMonthPayroll!.push({
    teacherId: "t7",
    period: "2026-10-2",
    status: "待确认",
    adjustments: [
      {
        key: "adjustment:1",
        side: "teacher",
        amount: 20,
        note: "代课补贴",
        at: "2026-10-30",
        operator: "Rita",
      },
    ],
  });
  const data = withDemoPayrollSamples(before);
  expect(data.lessons.find((l) => l.id === lesson.id)).toEqual(lesson);
  expect(data.halfMonthPayroll?.find((r) => r.teacherId === "t7")).toEqual(before.halfMonthPayroll!.at(-1));
  expect(data.credits.some((c) => c.id === "demo-payroll-settlement-l90")).toBe(true);
});

it("已锁定工资单可以用源记录按确认时刻逐项重算", () => {
  demoRepository.initializeDemoSamples();
  const data = structuredClone(demoRepository.read());
  for (const record of data.halfMonthPayroll!.filter(r => r.snapshot)) {
    const teacher = data.teachers.find(t => t.id === record.teacherId)!;
    const snapshot = record.snapshot!;
    delete record.snapshot;
    const at = record.period === "2026-10-1" ? "2026-10-15T20:00:00+08:00" : "2026-10-31T18:00:00+08:00";
    expect(halfMonthStatement(data, teacher, record.period, Date.parse(at)), teacher.name).toEqual(snapshot);
    record.snapshot = snapshot;
  }
});

it("最终回传的老师缺席不扣学员课时，刚结束的课继续等待，OP 按固定时段累计", () => {
  demoRepository.initializeDemoSamples();
  const data = demoRepository.read();
  const absent = data.lessons.find(l => l.id === "l93")!;
  expect(absent).toMatchObject({attendance: "老师缺席", teacherIn: "", teacherOut: "",
    studentAttendance: ["正常"], teacherAttendance: ["缺席"], status: "已完成", deducted: false});
  expect(hasFinalPayrollAttendance(absent)).toBe(true);
  expect(data.credits.filter(c => c.lessonId === absent.id)).toEqual([]);
  const teacher = data.teachers.find(t => t.id === absent.teacherId)!;
  const rows = halfMonthStatement(data, teacher, "2026-10-2", DEMO_NOW).rows.filter(r => r.source === absent.id);
  expect(rows.map(r => [r.title, r.teacher, r.office])).toEqual([["老师缺席", -3 * teacher.rate * absent.confirmedUnits!, 0]]);
  const waiting = data.lessons.find(l => l.id === "l25")!;
  expect(lessonAttendanceBlocker(waiting, DEMO_NOW)).toMatchObject({dataStatus: "等待回传"});
  expect(data.credits.some(c => c.lessonId === waiting.id)).toBe(false);
  const ended = data.lessons.filter(l => l.status === "已完成");
  expect(ended.every(l => Date.parse(l.date + "T" + l.time + ":00+08:00") + l.duration * 60000 <= DEMO_NOW)).toBe(true);
  expect(ended.every(l => hasFinalPayrollAttendance(l) || !!l.incident)).toBe(true);
  const nora = data.teachers.find(t => t.id === "demo-tutor-nora")!;
  const slots = halfMonthStatement(data, nora, "2026-10-2", DEMO_NOW).rows.filter(r => r.title === "OP 固定时段");
  expect(slots.map(r => r.teacher)).toEqual(Array(7).fill(8 * nora.rate));
  expect(halfMonthStatement(data, nora, "2026-11-1", DEMO_NOW).rows.filter(r => r.title === "OP 固定时段")).toEqual([]);
});
