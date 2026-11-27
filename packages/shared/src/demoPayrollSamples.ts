import { applyHalfMonthCommand, halfMonthStatement, payrollReadiness, rememberLessonPay } from "./halfMonthPayroll";
import {
  emptyStudentProfile,
  feedbackSchema,
  lessonSchema,
  studentSchema,
  type DemoState,
  type Teacher,
  type Lesson,
} from "./model";
import { nextStudentId, resolveStudentId } from "./studentIds";
import { minutes } from "./domain";
import { createSeed, endTime } from "./seed";
import { refreshPackageBalances } from "./packageBalances";

const batch = "payroll-samples-202610-v1";
const modes: Record<string, Teacher["payMode"]> = {
  t1: "NP",
  t2: "OP",
  t3: "NP",
  t4: "OP",
  t5: "NP",
  t6: "NP",
  t7: "NP",
  t8: "NP",
};

// One pupil's purchase, lessons and renewal span two actual settlement periods.
const erikaLessons = [
  ["2026-10-08", 25, "正常"],
  ["2026-10-12", 50, "正常"],
  ["2026-10-19", 25, "正常"],
  ["2026-10-22", 50, "正常"],
  ["2026-10-26", 25, "老师迟到"],
  ["2026-10-29", 25, "学员缺席"],
] as const;

export function withErikaSamples(before: DemoState): DemoState {
  if (before.importedBatches?.includes(batch)) return before;
  const data = structuredClone(before);
  (data.importedBatches ??= []).push(batch);
  data.revision++;
  data.officePayRates = { BigBrains: 60, CleverOaks: 65, WeTalk: 55, Mellany: 60, ...data.officePayRates };
  for (const teacher of data.teachers) {
    if (modes[teacher.id]) teacher.payMode ??= modes[teacher.id];
  }

  const teacher = data.teachers.find((t) => t.id === "t8");
  if (!teacher || teacher.status !== "在职") return data;
  // Add the example only to periods still untouched in this browser.
  const lessons = erikaLessons.filter(([date, duration]) => {
    const period = date <= "2026-10-15" ? "2026-10-1" : "2026-10-2";
    if (data.halfMonthPayroll?.some((r) => r.teacherId === teacher.id && r.period === period)) return false;
    if (teacher.startDate && teacher.startDate > date) return false;
    const start = 19 * 60;
    return !data.lessons.some(
      (l) =>
        l.teacherId === teacher.id &&
        l.date === date &&
        l.status !== "已取消" &&
        minutes(l.time) < start + duration &&
        minutes(l.time) + l.duration > start,
    );
  });
  if (!lessons.length) return data;
  if (
    !teacher.trained &&
    !teacher.newTutorTraining &&
    !data.events.some((e) => e.type === "修改老师" && e.teacherId === teacher.id)
  ) {
    teacher.trained = true;
    teacher.newTutorTraining = "已完成";
    teacher.teacherTraining ??= "2026/10/05 已完成入职培训及试讲。";
  }

  const id = nextStudentId(data.students);
  const orderId = "demo-payroll-package-erika";
  const purchased = "2026-10-05";
  const student = studentSchema.parse({
    ...emptyStudentProfile(),
    id,
    name: "许安宁",
    chineseName: "许安宁",
    englishName: "Annie",
    teacherId: teacher.id,
    teacherName: teacher.name,
    owner: "Rita",
    project: "K12",
    channel: "ToC",
    status: "在读",
    orderStatus: "已开课",
    groupName: "许安宁学习群",
    level: "A1",
    material: "Power Up 1",
    balance: 8,
    totalUnits: 8,
    createdAt: purchased,
    purchaseDate: purchased,
    firstLessonDate: lessons[0][0],
    lastLesson: "",
  });
  data.students.push(student);
  const order = {
    id: orderId,
    studentIds: [id],
    units: 8,
    balance: 8,
    date: purchased,
    kind: "新购",
    channel: student.channel,
    project: student.project,
  };
  (data.orders ??= []).push(order);
  data.credits.unshift({
    id: orderId,
    purchaseId: orderId,
    purchaseStudentIds: [id],
    studentId: id,
    orderId,
    date: purchased,
    recordedAt: purchased + "T10:00:00+08:00",
    type: "新购",
    units: 8,
    balance: 8,
    note: "首次购买 8 课时",
    operator: "Rita",
  });

  for (const [date, duration, attendance] of lessons) {
    const units = duration / 25;
    const end = duration === 25 ? "19:25" : "19:50";
    const at = date + "T20:00:00+08:00";
    const lessonId = "demo-payroll-erika-" + date;
    const late = attendance === "老师迟到",
      absent = attendance === "学员缺席";
    const lesson: Lesson = {
      id: lessonId,
      studentId: id,
      orderId,
      teacherId: teacher.id,
      date,
      time: "19:00",
      duration,
      kind: "临时课",
      scheduleExtra: true,
      confirmation: { at: date + "T12:00:00+08:00", operator: "Rita", note: "已与老师确认上课时间" },
      status: "已完成",
      attendance,
      teacherIn: late ? "19:03" : "19:00",
      teacherOut: end,
      studentIn: absent ? "" : "19:00",
      studentOut: absent ? "" : end,
      deducted: true,
      confirmedUnits: units,
      material: student.material,
      sync: "已同步",
      syncReason: "",
      note: "",
      conflict: false,
      leaveFlag: false,
    };
    if (late || absent) {
      lesson.incident = {
        reason: attendance,
        ...(late ? { minutes: 3 } : {}),
        note: late ? "已核对入堂记录，老师迟到 3 分钟。" : "老师全程在堂，教务已核实学员缺席。",
        at,
        operator: "Rita",
      };
      lesson.attendanceFinal = late ? { 老师: true } : { 学员: true };
    }
    data.lessons.push(lesson);
    rememberLessonPay(data, lesson, at);
    order.balance -= units;
    student.balance = order.balance;
    if (!absent) student.lastLesson = date;
    data.credits.unshift({
      id: lessonId + "-credit",
      studentId: id,
      orderId,
      lessonId,
      date,
      recordedAt: at,
      type: "上课扣课",
      units: -units,
      balance: order.balance,
      note: date + " 19:00 · " + attendance,
      operator: "Rita",
    });
    if (date === "2026-10-22") {
      data.feedback.push(
        feedbackSchema.parse({
          id: lessonId + "-praise",
          studentId: id,
          teacherId: teacher.id,
          lessonId,
          date,
          teacherName: teacher.name,
          so: teacher.so,
          source: student.project,
          owner: "Rita",
          rating: "好评",
          category: "教学表扬",
          categories: ["教学表扬"],
          grade: "五星",
          stage: "课中问题",
          content: "老师让孩子用完整句子复述故事，孩子这节课能独立说出来了。",
          repeat: false,
          status: "已完成",
          customerProgress: "已完成",
          customerResult: "处理成功",
          processNote: "已向老师转达家长反馈。",
          verdict: "",
          measures: [],
          tmResult: "处理成功",
          tmDate: date,
          tmNote: "已核实本节课反馈。",
        }),
      );
    }
  }
  if (order.balance === 0) {
    data.credits.unshift({
      id: orderId + "-renewal",
      purchaseId: orderId + "-renewal",
      type: "续费",
      studentId: id,
      orderId,
      purchaseStudentIds: [id],
      units: 12,
      balance: 12,
      date: "2026-10-30",
      recordedAt: "2026-10-30T10:00:00+08:00",
      note: "原课包已用完，续购 12 课时",
      operator: "Rita",
    });
    student.totalUnits = 20;
    student.balance = order.balance = 12;
  }

  // Freeze only a slip made up entirely of this example's own records.
  for (const [period, at] of [
    ["2026-10-1", "2026-10-15T20:00:00+08:00"],
    ["2026-10-2", "2026-10-31T18:00:00+08:00"],
  ]) {
    if (data.halfMonthPayroll?.some((r) => r.teacherId === teacher.id && r.period === period)) continue;
    const { rows } = halfMonthStatement(data, teacher, period, Date.parse(at));
    if (
      !rows.length ||
      !payrollReadiness(rows, period, Date.parse(at)).canConfirm ||
      rows.some((r) => !r.source.startsWith("demo-payroll-"))
    )
      continue;
    if (period === "2026-10-1" && teacher.newTutorTraining === "已完成") {
      applyHalfMonthCommand(
        data,
        {
          type: "halfPay.adjust",
          teacherId: teacher.id,
          period,
          side: "teacher",
          amount: 100,
          note: "10 月 5 日入职培训补贴",
          operator: "Rita",
        },
        "2026-10-15T18:00:00+08:00",
      );
    }
    const command = { type: "halfPay.status", teacherId: teacher.id, period } as const;
    applyHalfMonthCommand(data, { ...command, status: "已确认" }, at);
    if (period === "2026-10-1") applyHalfMonthCommand(data, { ...command, status: "已发放" }, at);
  }
  return data;
}

const settledBatch = "payroll-settlement-examples-202610";
const settledPeriod = "2026-10-2";
const closingTime = "2026-10-31T18:00:00+08:00";
const finalStatuses = {
  t2: "已确认",
  t3: "已确认",
  t5: "已确认",
  t7: "已发放",
  "demo-tutor-nora": "已确认",
} as const;
const outcomes = {
  l89: "正常",
  l90: "正常",
  l91: "正常",
  l92: "学员缺席",
  l94: "老师迟到",
  l96: "提前请假",
  l23: "正常",
  l24: "正常",
} as const;

export function withDemoPayrollSamples(before: DemoState): DemoState {
  if (before.importedBatches?.includes(settledBatch)) return before;
  const data = structuredClone(before);
  for (const teacher of data.teachers) {
    if (teacher.id === "demo-tutor-nora") teacher.payMode ??= "OP";
    if (teacher.id === "demo-tutor-theo") teacher.payMode ??= "NP";
  }
  const original = createSeed();
  const originals = new Map(original.lessons.map((l) => [l.id, l]));
  const hasRecord = (teacherId: string) =>
    data.halfMonthPayroll?.some((r) => r.teacherId === teacherId && r.period === settledPeriod);
  for (const [id, outcome] of Object.entries(outcomes)) {
    const lesson = data.lessons.find((l) => l.id === id);
    const sample = originals.get(id)!;
    if (!lesson || hasRecord(lesson.teacherId)) continue;
    const expected = {
      ...sample,
      studentId: resolveStudentId(data, sample.studentId),
      orderId: lesson.orderId,
    };
    // Upgrade only the original sample. Staff edits, including rescheduling or a manual review, take precedence.
    if (JSON.stringify(lessonSchema.parse(lesson)) !== JSON.stringify(lessonSchema.parse(expected))) continue;
    if (id === "l23") lesson.time = "15:30";
    if (id === "l24") lesson.time = "16:00";
    const end = endTime(lesson.time, lesson.duration);
    const at = lesson.date + "T" + end + ":00+08:00";
    if (outcome === "提前请假") {
      const cancelledAt = "2026-10-29T18:00:00+08:00";
      lesson.status = "已取消";
      lesson.attendance = "正常";
      lesson.cancellation = { kind: "学员请假", at: cancelledAt, responsibility: "学员", waived: false };
      lesson.note = "学员提前一天请假，本节未上课。";
      rememberLessonPay(data, lesson, cancelledAt);
      continue;
    }
    const pack = data.orders?.find((o) => o.id === lesson.orderId && o.studentIds.includes(lesson.studentId));
    const units = lesson.confirmedUnits!;
    if (!pack || pack.balance < units) continue;
    const student = data.students.find((s) => s.id === lesson.studentId)!;
    const absent = outcome === "学员缺席";
    const late = outcome === "老师迟到";
    lesson.status = "已完成";
    lesson.attendance = outcome;
    lesson.teacherIn = late ? endTime(lesson.time, 8) : lesson.time;
    lesson.teacherOut = end;
    lesson.studentIn = absent ? "" : lesson.time;
    lesson.studentOut = absent ? "" : end;
    lesson.attendanceFinal = { 老师: true, 学员: true };
    lesson.deducted = true;
    lesson.note = late
      ? "核对入堂时间，老师迟到 8 分钟，其余课程正常完成。"
      : absent
        ? "老师全程在堂，学员缺席已核实。"
        : "双方考勤正常，已核定完课。";
    if (absent || late)
      lesson.incident = {
        reason: outcome,
        ...(late ? { minutes: 8 } : {}),
        at,
        operator: "Rita",
        note: lesson.note,
      };
    rememberLessonPay(data, lesson, at);
    pack.balance -= units;
    if (!absent && student.lastLesson < lesson.date) student.lastLesson = lesson.date;
    data.credits.unshift({
      id: "demo-payroll-settlement-" + id,
      lessonId: id,
      studentId: student.id,
      orderId: pack.id,
      date: lesson.date,
      recordedAt: at,
      type: "上课扣课",
      units: -units,
      balance: pack.balance,
      note: lesson.date + " " + lesson.time + " · " + outcome,
      operator: "Rita",
    });
  }
  refreshPackageBalances(data);

  for (const [teacherId, status] of Object.entries(finalStatuses)) {
    const teacher = data.teachers.find((t) => t.id === teacherId);
    if (!teacher || teacher.status !== "在职" || hasRecord(teacherId)) continue;
    const { rows } = halfMonthStatement(data, teacher, settledPeriod, Date.parse(closingTime));
    if (
      !rows.some((r) => r.category === "底薪" && r.teacher > 0) ||
      !payrollReadiness(rows, settledPeriod, Date.parse(closingTime)).canConfirm
    )
      continue;
    // Only pre-confirm sample work. A user's new course, bonus or deduction stays open for review.
    if (
      rows.some(
        (r) => !r.key.startsWith("op:") && !originals.has(r.source) && !r.source.startsWith("roster-lesson-"),
      )
    )
      continue;
    const command = { type: "halfPay.status", teacherId, period: settledPeriod } as const;
    applyHalfMonthCommand(data, { ...command, status: "已确认" }, closingTime);
    if (status === "已发放") applyHalfMonthCommand(data, { ...command, status }, closingTime);
  }
  (data.importedBatches ??= []).push(settledBatch);
  data.revision++;
  return data;
}
