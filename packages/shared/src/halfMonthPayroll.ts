import { operationsNow } from "./clock";
import { addDays, type DemoState, type Lesson, type Teacher } from "./model";
import {
  defaultPayRules,
  type HalfMonthCommand,
  type HalfMonthRecord,
  type PayEntry,
} from "./halfMonthPayrollSchema";
import { halfMonthLastDay, lessonAttendanceBlocker, personAttendance } from "./lessonAttendance";
export { hasFinalPayrollAttendance } from "./lessonAttendance";
import { scheduleUnits } from "./scheduleCredits";
import { packagePurchases } from "./packagePurchases";

export const roundPay = (amount: number) => Math.round(amount * 100) / 100;
const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const stamp = (lesson: Lesson) =>
  Date.parse(lesson.date + "T" + lesson.time + ":00+08:00");
const completedAt = (lesson: Lesson) => stamp(lesson) + lesson.duration * 60000;
const periodOf = (date: string) =>
  date.slice(0, 7) + (Number(date.slice(8, 10)) <= 15 ? "-1" : "-2");
function lessonAttendanceForPay(l: Lesson, lateLimit: number) {
  const issue =
    l.status === "已取消" && l.cancellation
      ? l.cancellation.kind
      : [l.incident?.reason, l.attendance].join(" ");
  const summary = l.classInAttendanceReceived && !l.incident && l.status !== "已取消";
  const teacher = summary ? l.teacherAttendance ?? ["待核实"] : personAttendance(l, "老师");
  const student = summary ? l.studentAttendance ?? ["待核实"] : personAttendance(l, "学员");
  const late =
    /老师迟到|老师早退/.test(issue) ||
    teacher.some((t) => t === "迟到" || t === "早退");
  const minutes = l.incident ? l.incident.minutes : l.classInTeacherExceptionMinutes;
  const absent =
    /老师缺席/.test(issue) ||
    teacher.includes("缺席") ||
    (late && (minutes ?? 0) > lateLimit);
  const studentAbsent = /学员缺席/.test(issue) || student.includes("缺席");
  const reviewed = l.status === "已完成" && l.incident !== undefined;
  const pendingAttendance =
    !reviewed && (teacher.includes("待核实") || student.includes("待核实"));
  const completed =
    (l.status === "已完成" || (l.status !== "已取消" && l.classInAttendanceReceived === true)) &&
    !absent &&
    !studentAbsent &&
    !pendingAttendance &&
    !/教材/.test(issue) &&
    (!/网络/.test(issue) || l.incident?.networkOutcome === "正常完课");
  return { issue, late, minutes, absent, studentAbsent, pendingAttendance, completed };
}

export function payrollReadiness(rows: PayEntry[], period: string, now = operationsNow()) {
  const waiting = rows.filter(row => row.category === "等待").length;
  const review = rows.filter(row => row.category === "待核").length;
  const last = payDates(period).at(-1)!;
  const canConfirm = !waiting && !review && now >= Date.parse(last + "T00:00:00+08:00");
  return { waiting, review, canConfirm };
}

export function changeTeacherRate(teacher: Teacher, rate: number, at: string) {
  if (teacher.rate === rate) return;
  const date = new Date(Date.parse(at) + 8 * 3600000)
    .toISOString()
    .slice(0, 10);
  const history = (teacher.payRateHistory ??= []);
  if (history.at(-1)?.until !== date)
    history.push({ until: date, rate: teacher.rate });
  teacher.rate = rate;
}
function rateOn(teacher: Teacher, date: string) {
  return (
    teacher.payRateHistory?.find((entry) => date < entry.until)?.rate ??
    teacher.rate
  );
}

export function payDates(period: string) {
  const month = period.slice(0, 7);
  const second = period.endsWith("-2");
  const first = second ? 16 : 1;
  const last = halfMonthLastDay(month + (second ? "-16" : "-01"));
  return Array.from(
    { length: last - first + 1 },
    (_, index) => month + "-" + String(first + index).padStart(2, "0"),
  );
}

export function rulesForPeriod(data: DemoState, _period?: string) {
  return data.payRuleChanges?.at(-1)?.values ?? defaultPayRules;
}

function rulesAt(data: DemoState, time: number) {
  const changes = data.payRuleChanges ?? [];
  for (let index = changes.length - 1; index >= 0; index--) {
    if (Date.parse(changes[index].at) <= time) return changes[index].values;
  }
  return defaultPayRules;
}

function eventRules(data: DemoState, version: number | undefined, time: number) {
  if (version === undefined) return rulesAt(data, time);
  return version === 0 ? defaultPayRules : data.payRuleChanges![version - 1].values;
}

function endOfPayDay(date: string) {
  return Date.parse(date + "T23:59:59.999+08:00");
}

export function rememberLessonPay(data: DemoState, lesson: Lesson, at: string) {
  const teacher = data.teachers.find(t => t.id === lesson.teacherId)!;
  (data.lessonPayBasis ??= {})[lesson.id] ??= {
    at,
    so: teacher.so,
    teacherRate: teacher.rate,
    mode: teacher.payMode,
    officeRate: data.officePayRates?.[teacher.so],
    rules: rulesForPeriod(data),
  };
}

export function halfMonthStatement(
  data: DemoState,
  teacher: Teacher,
  period: string,
  now = operationsNow(),
): NonNullable<HalfMonthRecord["snapshot"]> {
  return calculateStatement(data, teacher, period, now, false);
}

function calculateStatement(
  data: DemoState,
  teacher: Teacher,
  period: string,
  now: number,
  lessonsOnly: boolean,
): NonNullable<HalfMonthRecord["snapshot"]> {
  const record = data.halfMonthPayroll?.find(
    (item) => item.teacherId === teacher.id && item.period === period,
  );
  if (record?.snapshot) return record.snapshot;
  const dates = payDates(period);
  const first = dates[0],
    last = dates[dates.length - 1];
  const includes = (date: string) =>
    date.slice(0, 10) >= first && date.slice(0, 10) <= last;
  const rules = rulesForPeriod(data);
  const teacherRate = teacher.rate;
  const officeRate = data.officePayRates?.[teacher.so];
  const rows: PayEntry[] = [];
  function add(
    category: PayEntry["category"],
    key: string,
    date: string,
    title: string,
    detail: string,
    source: string,
    teacherAmount = 0,
    officeAmount = 0,
    calculation?: Pick<PayEntry, "quantity" | "quantityUnit" | "teacherUnitPrice" | "officeUnitPrice" | "payRatio">,
  ) {
    const row: PayEntry = {
      category,
      key,
      date,
      title,
      detail,
      source,
      teacher: roundPay(teacherAmount),
      office: roundPay(officeAmount),
      ...calculation,
    };
    rows.push(row);
    return row;
  }
  function pending(
    key: string,
    date: string,
    title: string,
    detail: string,
    source: string,
  ) {
    const decision =
      key.startsWith("lesson-review:") || key.startsWith("complaint-fee:")
        ? undefined
        : record?.decisions?.[key];
    return add(
      decision ? "人工调整" : "待核",
      key,
      date,
      title,
      decision ?? detail,
      source,
    );
  }
  function courseRate(date: string, capturedRate?: number) {
    const rate = capturedRate || (record?.verifiedRates?.[date] ?? capturedRate ?? rateOn(teacher, date));
    const key = "historical-rate:" + date;
    if (rate <= 0 && teacherRate > 0 && !rows.some((row) => row.key === key)) {
      add(
        "待核",
        key,
        date,
        "历史课时单价待核",
        "请核定该日期的老师课时单价",
        teacher.id,
      );
    }
    return rate;
  }
  function base(
    key: string,
    date: string,
    title: string,
    source: string,
    units: number,
    ratio = 1,
    basis?: NonNullable<DemoState["lessonPayBasis"]>[string],
  ) {
    const rate = courseRate(date, basis?.teacherRate);
    const office =
      basis?.officeRate ??
      data.officeRateHistory?.[teacher.so]?.find((entry) => date < entry.until)
        ?.rate ??
      officeRate;
    const teacherPrice = rate > 0 ? "₱" + rate : "单价待核";
    const officePrice = office !== undefined ? "₱" + office : "单价待设置";
    const row = add(
      "底薪",
      key,
      date,
      title,
      `${units} 课时 × 老师 ${teacherPrice} / SO ${officePrice} × ${ratio * 100}%`,
      source,
      units * rate * ratio,
      units * (office ?? 0) * ratio,
      { quantity: units, quantityUnit: "课时", teacherUnitPrice: rate > 0 ? rate : undefined, officeUnitPrice: office, payRatio: ratio },
    );
    if (rate <= 0) row.pendingRates = ["teacher"];
    if (office === undefined) (row.pendingRates ??= []).push("office");
  }
  if (!teacher.payMode)
    add(
      "待核",
      "mode",
      first,
      "未设置计薪方式",
      "请在老师中心设置 OP 或 NP",
      teacher.id,
    );
  if (officeRate === undefined)
    add(
      "待核",
      "office",
      first,
      "未设置 SO 单价",
      "请在薪资单价页设置所属 SO 的课时单价",
      teacher.so,
    );
  if (teacherRate <= 0)
    add(
      "待核",
      "teacher-rate",
      first,
      "未设置老师单价",
      "请在薪资单价页设置老师课时单价",
      teacher.id,
    );
  const paidSlots = new Map<string, Set<number>>();
  const dayMode = (date: string) => teacher.payModeHistory?.find(entry => date < entry.until)?.mode ?? teacher.payMode;
  if (dates.some(date => dayMode(date) === "OP")) {
    for (const date of dates) {
      if (teacher.payrollEndDate && date > teacher.payrollEndDate) break;
      if (dayMode(date) !== "OP") continue;
      const history = teacher.payScheduleHistory?.find(
        (item) => date >= item.from && date < item.until,
      );
      const schedule = history
        ? {
            ...teacher,
            availability: history.slots,
            availabilityFrom: history.from,
          }
        : teacher;
      const paidStarts = new Set<number>();
      paidSlots.set(date, paidStarts);
      if (date < (schedule.availabilityFrom || teacher.startDate || ""))
        continue;
      const day = new Date(date + "T00:00:00Z").getUTCDay();
      for (const slot of schedule.availability.filter(
        (item) => item.day === day,
      )) {
        const start = minute(slot.start);
        const end = slot.end === "23:59" ? 24 * 60 : minute(slot.end);
        const units = Math.floor((end - start) / 30);
        for (let i = 0; i < units; i++) paidStarts.add(start + i * 30);
        const midnight = Date.parse(date + "T00:00:00+08:00");
        if (units && now < midnight + end * 60000) {
          add("等待", `op-unfinished:${date}:${slot.start}`, date, "固定时段尚未结束",
            "时段结束后可确认工资单", `${slot.start}–${slot.end}`).nextChangeAt = midnight + end * 60000;
        }
        if (units)
          base(
            `op:${date}:${slot.start}`,
            date,
            "OP 固定时段",
            `${slot.start}–${slot.end}`,
            units,
          );
      }
    }
    if (
      teacher.status !== "已离职" &&
      !teacher.availability.length &&
      !rows.some((row) => row.category === "底薪")
    )
      add(
        "待核",
        "schedule",
        first,
        "OP 课表未登记",
        "请核对老师中心的每周课表",
        teacher.id,
      );
  }
  const lessons = data.lessons.filter(
    (l) => l.teacherId === teacher.id && includes(l.date),
  );
  let finished = 0;
  const unresolvedAttendance: PayEntry[] = [];
  let possibleUnits = 0;
  let attendanceIssue = data.lessons.some(
    (lesson) =>
      lesson.teacherId === teacher.id &&
      lesson.teacherRescheduleDates?.some(includes),
  );
  for (const l of lessons) {
    const basis = data.lessonPayBasis?.[l.id];
    const rules = basis?.rules ?? rulesAt(data, completedAt(l));
    const outcome = lessonAttendanceForPay(l, rules.lateLimit);
    const blocker = lessonAttendanceBlocker(l, now);
    if (blocker) {
      const row = add(blocker.category, "lesson-review:" + l.id, l.date, blocker.title, blocker.detail, l.id);
      row.lessonId = l.id;
      if (blocker.nextChangeAt !== undefined) row.nextChangeAt = blocker.nextChangeAt;
      unresolvedAttendance.push(row);
      possibleUnits += scheduleUnits(l.duration, l.plannedUnits ?? l.confirmedUnits) ?? Infinity;
      continue;
    }
    if (l.status === "已取消" && l.cancellation?.kind === "老师离职") continue;
    const cancellation = l.cancellation;
    const leadMinutes = cancellation
      ? (stamp(l) - Date.parse(cancellation.at)) / 60000
      : null;
    const { issue, late, absent, pendingAttendance, completed } = outcome;
    const minutes = outcome.minutes;
    const teacherCancel =
      l.status === "已取消" &&
      (cancellation?.responsibility === "老师" ||
        /老师取消|老师请假|老师.*天取消|老师.*小时内取消/.test(issue));
    const material = /教材/.test(issue);
    const net = /网络/.test(issue);
    const networkCancelled = net && l.status === "已取消";
    const networkCompleted = net && completed;
    const studentCancel =
      l.status === "已取消" &&
      (cancellation?.responsibility === "学员" ||
        /学员请假|学员取消/.test(issue));
    const studentAbsent =
      outcome.studentAbsent ||
      (studentCancel &&
        leadMinutes !== null &&
        leadMinutes < rules.studentCancelMinutes);
    let agreedUnits = l.plannedUnits ?? l.confirmedUnits;
    if (l.deducted && l.confirmedUnits && l.confirmedUnits !== agreedUnits) {
      const reviewed = l.incident || !l.classInAttendanceReceived || data.events.some(event =>
        event.relatedType === "lesson" && event.relatedId === l.id &&
        (event.type === "更正结果" || (event.type === "确认上课" && event.operator !== "系统自动扣课")));
      if (reviewed) agreedUnits = l.confirmedUnits;
    }
    const units = scheduleUnits(l.duration, agreedUnits);
    if (!units) {
      pending("lesson-units:" + l.id, l.date, "课程计薪课时待核", "请核实该时长对应的课时数，并登记薪资调整", l.id);
      continue;
    }
    const mode = basis?.mode ?? dayMode(l.date);
    const rate = courseRate(l.date, basis?.teacherRate);
    const fee = units * rate;
    let fine = 0;
    let multiple = 0;
    let fineTitle = "";
    if (
      attendanceIssue ||
      late ||
      absent ||
      teacherCancel ||
      l.status === "已取消" ||
      l.status === "缺席" ||
      studentAbsent
    )
      attendanceIssue = true;
    if (!material && !net) {
      if (absent) {
        multiple = rules.absenceMultiple;
        fineTitle = "老师缺席";
      } else if (teacherCancel && !cancellation?.waived) {
        if (leadMinutes === null)
          pending(
            "cancel:" + l.id,
            l.date,
            "老师取消待核",
            "缺少取消时间",
            l.id,
          );
        else {
          multiple =
            leadMinutes <= 1440
              ? rules.shortCancelMultiple
              : leadMinutes <= 7200
                ? rules.earlyCancelMultiple
                : 0;
          fineTitle = "老师取消";
        }
      } else if (late) {
        if (minutes === undefined)
          pending(
            "late:" + l.id,
            l.date,
            "迟到或早退待核",
            "缺少已核实分钟数",
            l.id,
          );
        else {
          fine = Math.min(rules.lateCap, minutes * rules.latePerMinute);
          fineTitle = "迟到或早退";
        }
      }
    }
    const ratePending = multiple > 0 && fee <= 0;
    if (multiple > 0 && !ratePending) fine = fee * multiple;
    if (fine || ratePending) {
      const feeLabel = ratePending ? "课时费待核" : "课时费 ₱" + fee;
      const row = add(
        "扣款",
        "attendance:" + l.id,
        l.date,
        fineTitle,
        fineTitle === "迟到或早退"
          ? `${minutes} 分钟 × ₱${rules.latePerMinute} / 分钟${fine === rules.lateCap ? `，单节上限 ₱${rules.lateCap}` : ""}`
          : `${feeLabel} × ${multiple}`,
        l.id,
        fine ? -fine : 0,
        0,
        multiple > 0
          ? { quantity: units, quantityUnit: "课时", teacherUnitPrice: ratePending ? undefined : rate, payRatio: multiple }
          : { quantity: minutes, quantityUnit: "分钟", teacherUnitPrice: rules.latePerMinute },
      );
      if (ratePending) row.pendingRates = ["teacher"];
    }
    const paidStarts = paidSlots.get(l.date);
    if (mode === "OP" && paidStarts && (material || fine || ratePending || networkCancelled)) {
      const start = minute(l.time);
      const end = start + l.duration;
      const covered = [...paidStarts].filter(
        (slot) => slot < end && slot + 30 > start,
      );
      const coveredMinutes = covered.reduce(
        (sum, slot) => sum + Math.min(slot + 30, end) - Math.max(slot, start),
        0,
      );
      const reversed = Math.min(
        covered.length,
        Math.floor(coveredMinutes / 25),
      );
      for (const slot of covered.slice(0, reversed)) paidStarts.delete(slot);
      if (reversed)
        base("reversal:" + l.id, l.date, "OP 底薪冲减", l.id, reversed, -1);
    }
    if (networkCancelled) {
      const key = "network-pay:" + l.id;
      const decision = record?.networkPay?.[key];
      if (decision)
        add(
          "底薪",
          "lesson:" + l.id,
          l.date,
          "网络取消核定课酬",
          record?.decisions?.[key] ?? "",
          l.id,
          decision.teacher,
          decision.office,
        );
      else
        add(
          "待核",
          key,
          l.date,
          "网络取消课酬待核",
          "请逐项核定老师及 SO 本节应得课酬（含零金额）",
          l.id,
        );
      continue;
    }
    if (completed) finished += units;
    if (
      mode === "NP" &&
      !absent &&
      !material &&
      (!net || networkCompleted) &&
      (completed || (studentAbsent && !pendingAttendance))
    )
      base(
        "lesson:" + l.id,
        l.date,
        studentAbsent ? "NP 学员缺席" : "NP 正常完课",
        l.id,
        units,
        studentAbsent ? rules.absentRatio : 1,
        basis,
      );
    if (
      !material &&
      !absent &&
      (!studentAbsent || pendingAttendance) &&
      ((net && !networkCompleted) || pendingAttendance)
    )
      pending(
        "lesson-review:" + l.id,
        l.date,
        "课程结果待核",
        "请在上课记录核定 ClassIn 考勤和课程结果",
        l.id,
      );
  }
  const lessonStatement = {
    rows,
    rules,
    name: teacher.name,
    so: teacher.so,
    mode: teacher.payMode,
    teacherRate,
    officeRate,
  };
  if (lessonsOnly) return lessonStatement;
  const sourcePeriods = new Map<
    string,
    NonNullable<HalfMonthRecord["snapshot"]>
  >([[period, lessonStatement]]);
  const bookedFeedback = new Set(
    data.halfMonthPayroll?.flatMap(
      (item) =>
        item.snapshot?.rows
          .filter((row) => /^(praise|complaint|serious):/.test(row.key))
          .map((row) => row.source) ?? [],
    ),
  );
  const feedback = data.feedback
    .filter(
      (f) =>
        f.teacherId === teacher.id &&
        f.tmResult === "处理成功" &&
        !bookedFeedback.has(f.id) &&
        includes(f.tmDate || f.date),
    )
    .sort(
      (a, b) =>
        (a.tmDate || a.date).localeCompare(b.tmDate || b.date) ||
        a.id.localeCompare(b.id),
    );
  const praised = new Set<string>();
  for (const f of feedback) {
    const date = (f.tmDate || f.date).slice(0, 10);
    const rules = eventRules(data, f.tmPayRuleVersion, endOfPayDay(date));
    if (f.rating === "好评") {
      if (!praised.has(f.studentId))
        add(
          "奖金",
          "praise:" + f.id,
          date,
          "好评奖",
          "本期该学员首条 TM 确认好评",
          f.id,
          rules.praise,
          0,
          { quantity: 1, quantityUnit: "次", teacherUnitPrice: rules.praise },
        ).lessonId = f.lessonId;
      praised.add(f.studentId);
      continue;
    }
    if (record?.seriousComplaints?.includes(f.id)) {
      pending(
        "serious:" + f.id,
        date,
        "严重违规待核",
        "请核定本半月处理金额并登记人工调整",
        f.id,
      ).lessonId = f.lessonId;
      continue;
    }
    const l = data.lessons.find(
      (item) => item.id === f.lessonId && item.teacherId === teacher.id,
    );
    if (!l)
      pending("complaint:" + f.id, date, "差评待核", "未关联涉事课程", f.id);
    else {
      const lessonPeriod = periodOf(l.date);
      let source = sourcePeriods.get(lessonPeriod);
      if (!source) {
        source = calculateStatement(data, teacher, lessonPeriod, now, true);
        sourcePeriods.set(lessonPeriod, source);
      }
      const mode = data.lessonPayBasis?.[l.id]?.mode ?? dayMode(l.date) ?? source.mode;
      const blockers = source.rows.filter(row => {
        if (row.dependsOn || (row.category !== "待核" && row.category !== "等待")) return false;
        if (row.source === l.id || row.key === "historical-rate:" + l.date) return true;
        if (row.key === "teacher-rate") return !(data.lessonPayBasis?.[l.id]?.teacherRate || rateOn(teacher, l.date));
        if (row.key === "mode") return !mode;
        if (mode !== "OP") return false;
        if (row.key === "schedule") return true;
        if (row.date !== l.date || !row.key.startsWith("op-unfinished:")) return false;
        const [from, to] = row.source.split("–");
        return minute(from) < minute(l.time) + l.duration && (to === "23:59" ? 1440 : minute(to)) > minute(l.time);
      });
      if (blockers.length) {
        const row = add("等待", "complaint-fee:" + f.id, date, "等待涉事课程课酬",
          blockers.map(item => item.title).join("、"), l.id);
        row.lessonId = l.id;
        row.dependsOn = blockers.map(item => item.key);
        const times = blockers.flatMap(item => item.nextChangeAt ?? []);
        if (times.length) row.nextChangeAt = Math.min(...times);
        continue;
      }
      const courseRow = source.rows.find((row) => row.key === "lesson:" + l.id);
      let courseFee = courseRow?.teacher ?? 0;
      if (mode === "OP" && !courseRow) {
        const start = minute(l.time);
        const end = start + l.duration;
        let paidFee = 0;
        for (const row of source.rows.filter(
          (row) => row.date === l.date && row.key.startsWith("op:"),
        )) {
          const [from, to] = row.source.split("–");
          const slotStart = minute(from);
          const slotEnd =
            slotStart +
            30 *
              Math.floor(
                ((to === "23:59" ? 1440 : minute(to)) - slotStart) / 30,
              );
          const overlap = Math.max(
            0,
            Math.min(end, slotEnd) - Math.max(start, slotStart),
          );
          const paidUnits = (slotEnd - slotStart) / 30;
          if (paidUnits)
            paidFee += (Math.floor(overlap / 25) * row.teacher) / paidUnits;
        }
        const reversal = source.rows.find(
          (row) => row.key === "reversal:" + l.id,
        );
        courseFee = Math.max(0, roundPay(paidFee) + (reversal?.teacher ?? 0));
      }
      add(
        "扣款",
        "complaint:" + f.id,
        date,
        "差评扣款",
        `涉事课酬 ₱${courseFee} × ${rules.complaintRatio * 100}%`,
        f.id,
        -courseFee * rules.complaintRatio,
        0,
        { quantity: 1, quantityUnit: "次", teacherUnitPrice: courseFee, payRatio: rules.complaintRatio },
      ).lessonId = l.id;
    }
  }
  const attendanceRules = rulesAt(data, Math.min(now, endOfPayDay(last)));
  if (
    now >= Date.parse(last + "T00:00:00+08:00") &&
    finished + possibleUnits >= attendanceRules.attendanceUnits &&
    !attendanceIssue &&
    !data.leaves.some(
      (l) =>
        l.teacherId === teacher.id &&
        l.start.slice(0, 10) <= last &&
        l.end.slice(0, 10) >= first &&
        l.status !== "已驳回",
    ) &&
    !data.feedback.some(
      (f) =>
        f.teacherId === teacher.id &&
        f.rating === "差评" &&
        !bookedFeedback.has(f.id) &&
        includes(f.tmDate || f.date),
    )
  ) {
    if (unresolvedAttendance.length) {
      const row = add("等待", "attendance-award", last, "等待全勤奖核算", "等待本期课程的最终考勤", period);
      row.dependsOn = unresolvedAttendance.map(item => item.key);
      row.lessonId = unresolvedAttendance[0].lessonId;
    } else add(
      "奖金",
      "attendance-award",
      last,
      "全勤奖",
      `完课 ${finished} 课时`,
      period,
      attendanceRules.attendanceAward,
      0,
      { quantity: 1, quantityUnit: "次", teacherUnitPrice: attendanceRules.attendanceAward },
    );
  }
  const renewals = new Set<string>();
  const bookedRenewals = new Map<
    string,
    { period: string; teacherId: string; name: string; amount: number }
  >();
  const resolvedTransfers = new Set<string>();
  const frozenPeriods = new Set<string>();
  for (const statement of data.halfMonthPayroll ?? []) {
    if (!statement.snapshot) continue;
    if (statement.teacherId === teacher.id) frozenPeriods.add(statement.period);
    for (const row of statement.snapshot.rows) {
      if (row.category === "奖金" && row.key.startsWith("renewal:")) {
        bookedRenewals.set(row.source, {
          period: statement.period,
          teacherId: statement.teacherId,
          name: statement.snapshot.name,
          amount: row.teacher,
        });
      }
      if (
        statement.teacherId === teacher.id &&
        row.category === "人工调整" &&
        row.key.startsWith("renewal-correction:")
      )
        resolvedTransfers.add(row.source);
    }
  }
  for (const order of packagePurchases(data)) {
    if (order.kind !== "续费" || order.date > last || renewals.has(order.id))
      continue;
    const booked = bookedRenewals.get(order.id);
    if (!includes(order.date)) {
      if (
        !booked ||
        booked.teacherId === teacher.id ||
        resolvedTransfers.has(order.id)
      )
        continue;
      let next = periodOf(order.date);
      while (frozenPeriods.has(next)) {
        const lastDay = payDates(next).at(-1)!;
        next = periodOf(addDays(lastDay, 1));
      }
      if (next !== period) continue;
    }
    renewals.add(order.id);
    const purchase = data.credits.find(
      (entry) => (entry.purchaseId || entry.id) === order.id,
    );
    const purchaseTime = purchase?.recordedAt ? Date.parse(purchase.recordedAt) : NaN;
    const candidates = data.lessons
      .filter(
        (l) =>
          order.studentIds.includes(l.studentId) &&
          (l.date < order.date ||
            (l.date === order.date &&
              (!Number.isFinite(purchaseTime) ||
                completedAt(l) <= purchaseTime))),
      )
      .sort((a, b) => completedAt(b) - completedAt(a));
    const possibleOwners = new Set<string>();
    const unresolved = new Set<string>();
    let nextCandidateChange = Infinity;
    let lastCompleted: Lesson | undefined;
    for (const studentId of order.studentIds) {
      for (const lesson of candidates.filter(
        (l) => l.studentId === studentId,
      )) {
        const result = lessonAttendanceForPay(
          lesson,
          (data.lessonPayBasis?.[lesson.id]?.rules ?? rulesAt(data, completedAt(lesson))).lateLimit,
        );
        const blocker = lessonAttendanceBlocker(lesson, now);
        if (!blocker && result.completed) {
          lastCompleted = lesson;
          possibleOwners.add(lesson.teacherId);
          break;
        }
        if (
          blocker || (lesson.status !== "已取消" && lesson.status !== "缺席" &&
            !result.absent && !result.studentAbsent && result.pendingAttendance)
        ) {
          possibleOwners.add(lesson.teacherId);
          unresolved.add(lesson.id);
          if (blocker?.nextChangeAt !== undefined) nextCandidateChange = Math.min(nextCandidateChange, blocker.nextChangeAt);
        }
      }
    }
    if (!possibleOwners.has(teacher.id)) continue;
    const key = "renewal:" + order.id;
    if (unresolved.size) {
      if (!includes(order.date)) continue;
      const dependency = add(
        "等待",
        "renewal-lesson:" + order.id,
        order.date,
        "等待复购奖归属",
        "等待续费前的课程结果：" + [...unresolved].join("、"),
        order.id,
      );
      dependency.dependsOn = [...unresolved].map(id => "lesson-review:" + id);
      dependency.lessonId = [...unresolved][0];
      if (Number.isFinite(nextCandidateChange)) dependency.nextChangeAt = nextCandidateChange;
      continue;
    }
    if (booked) {
      if (booked.teacherId !== teacher.id && !resolvedTransfers.has(order.id)) {
        pending(
          "renewal-correction:" + order.id,
          includes(order.date) ? order.date : first,
          "复购奖归属更正待核",
          `订单原奖在 ${booked.period} 的 ${booked.name} 工资单计入 ₱${booked.amount}；核定归属为 ${periodOf(order.date)} 的 ${teacher.name}。请按订单号登记原奖冲减、正确老师补发及处理说明。`,
          order.id,
        );
      }
      continue;
    }
    if (
      order.studentIds.length > 1 ||
      (!Number.isFinite(purchaseTime) &&
        candidates.some((l) => l.date === order.date))
    ) {
      pending(
        key,
        order.date,
        "复购奖待核",
        order.studentIds.length > 1
          ? "多人续费需确认奖金归属"
          : "缺少同日续费时间",
        order.id,
      );
    } else if (lastCompleted) {
      const award = eventRules(data, purchase?.renewalPayRuleVersion, Number.isFinite(purchaseTime) ? purchaseTime : endOfPayDay(order.date)).renewal;
      add(
        "奖金",
        key,
        order.date,
        "复购奖",
        "复购前最后一节完课 " + lastCompleted.id,
        order.id,
        award,
        0,
        { quantity: 1, quantityUnit: "次", teacherUnitPrice: award },
      ).lessonId = lastCompleted.id;
    }
  }
  for (const action of data.actions.filter(
    (a) =>
      a.teacherId === teacher.id &&
      includes(a.date) &&
      a.type === "扣款" &&
      a.status !== "已作废",
  )) {
    const feedback = data.feedback.find(f => f.id === action.feedbackId);
    if (feedback?.rating === "差评" && feedback.tmResult === "处理成功") continue;
    if (action.status === "待确认")
      pending(
        "action:" + action.id,
        action.date,
        "原扣款待核",
        action.reason,
        action.id,
      ).lessonId = feedback?.lessonId;
    else
      add(
        "扣款",
        "action:" + action.id,
        action.date,
        "已确认扣款",
        action.reason,
        action.id,
        -action.amount,
      ).lessonId = feedback?.lessonId;
  }
  for (const item of record?.adjustments ?? [])
    add(
      "人工调整",
      item.key,
      item.at,
      "人工" + (item.amount > 0 ? "加款" : "扣款"),
      item.note + " · " + item.operator,
      item.key,
      item.side === "teacher" ? item.amount : 0,
      item.side === "office" ? item.amount : 0,
    );
  return {
    rows,
    rules,
    name: teacher.name,
    so: teacher.so,
    mode: teacher.payMode,
    teacherRate,
    officeRate,
  };
}

export function applyHalfMonthCommand(
  data: DemoState,
  command: HalfMonthCommand & { operator?: string },
  recordedAt: string,
) {
  if (command.type === "halfPay.rules") {
    const current = rulesForPeriod(data);
    const values = { ...current, ...command.values };
    if (Object.entries(values).some(([key, value]) => current[key as keyof typeof current] !== value)) {
      (data.payRuleChanges ??= []).push({ at: recordedAt, values });
    }
    return;
  }
  if (command.type === "halfPay.officeRate") {
    if (!data.teachers.some((t) => t.so === command.so))
      throw new Error("找不到该 SO");
    if (!Number.isFinite(command.rate) || command.rate < 0)
      throw new Error("SO 单价不能小于零");
    const previous = data.officePayRates?.[command.so];
    if (previous === command.rate) return;
    if (previous !== undefined) {
      const date = new Date(Date.parse(recordedAt) + 8 * 3600000).toISOString().slice(0, 10);
      const history = ((data.officeRateHistory ??= {})[command.so] ??= []);
      if (history.at(-1)?.until !== date) history.push({ until: date, rate: previous });
    }
    data.officePayRates = {
      ...data.officePayRates,
      [command.so]: command.rate,
    };
    return;
  }
  const teacher = data.teachers.find((t) => t.id === command.teacherId);
  if (!teacher) throw new Error("找不到该老师");
  if (command.type === "halfPay.teacherRate") {
    if (!Number.isFinite(command.rate) || command.rate <= 0)
      throw new Error("课时单价必须大于零");
    changeTeacherRate(teacher, command.rate, recordedAt);
    return;
  }
  const records = (data.halfMonthPayroll ??= []);
  let record = records.find(
    (item) => item.teacherId === teacher.id && item.period === command.period,
  );
  if (!record) {
    record = {
      teacherId: teacher.id,
      period: command.period,
      status: "待确认",
      adjustments: [],
    };
    records.push(record);
  }
  if (command.type === "halfPay.status" && command.status === "已发放") {
    if (record.status !== "已确认") throw new Error("请先确认薪资");
    record.status = "已发放";
    return;
  }
  if (record.status !== "待确认") throw new Error("本期工资单已经确认");
  if (command.type === "halfPay.serious") {
    const day = data.feedback.find(
      (item) =>
        item.id === command.feedbackId &&
        item.teacherId === teacher.id &&
        item.rating === "差评" &&
        item.tmResult === "处理成功",
    );
    if (
      !day ||
      !payDates(command.period).includes((day.tmDate || day.date).slice(0, 10))
    )
      throw new Error("请选择本期已核实的差评");
    if (!record.seriousComplaints?.includes(day.id))
      (record.seriousComplaints ??= []).push(day.id);
    return;
  }
  if (command.type === "halfPay.adjust") {
    if (
      !Number.isFinite(command.amount) ||
      !command.amount ||
      !command.note.trim()
    )
      throw new Error("请填写有效金额和调整原因");
    record.adjustments.push({
      key: `adjustment:${record.adjustments.length + 1}`,
      side: command.side,
      amount: command.amount,
      note: command.note,
      at: recordedAt,
      operator: command.operator || "教务",
    });
    return;
  }
  const statement = halfMonthStatement(
    data,
    teacher,
    command.period,
    Date.parse(recordedAt),
  );
  if (command.type === "halfPay.review") {
    if (
      !statement.rows.some(
        (row) => row.key === command.key && row.category === "待核",
      ) ||
      command.key.startsWith("op-unfinished:") ||
      command.key.startsWith("renewal-lesson:") ||
      command.key.startsWith("lesson-review:") ||
      command.key.startsWith("complaint-fee:") ||
      ["mode", "office", "teacher-rate", "schedule"].includes(
        command.key,
      )
    )
      throw new Error("请通过对应业务入口核定该项");
    if (command.key.startsWith("historical-rate:")) {
      if (!command.historicalRate) throw new Error("请核定当日课时单价");
      (record.verifiedRates ??= {})[
        command.key.slice("historical-rate:".length)
      ] = command.historicalRate;
    }
    if (command.key.startsWith("network-pay:")) {
      if (!command.networkPay) throw new Error("请填写老师和 SO 的核定课酬");
      (record.networkPay ??= {})[command.key] = command.networkPay;
    }
    (record.decisions ??= {})[command.key] =
      command.note + " · " + (command.operator || "教务") + " · " + recordedAt;
    return;
  }
  const ready = payrollReadiness(statement.rows, command.period, Date.parse(recordedAt));
  if (ready.review) throw new Error("请先处理所有待核项目");
  if (ready.waiting) throw new Error("请等待课程、固定时段或关联项目完成");
  if (!ready.canConfirm) throw new Error("结算周期最后一天起才能确认");
  record.snapshot = statement;
  record.status = "已确认";
}
