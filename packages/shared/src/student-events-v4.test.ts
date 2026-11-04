import { describe, it, expect } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { emptyStudentProfile, studentHistorySchema } from "./model";
import { getStudentSummary } from "./studentSummary";
describe("事件驱动学员资料", () => {
  it("普通新建为正常待排课且已知零余额；导入未知余额不冒充零", () => {
    const profile = { ...emptyStudentProfile(), name: "新同学" };
    const made = transition(createSeed(), {
      type: "student.create",
      student: profile,
    }).data.students[0];
    expect(made).toMatchObject({
      balance: 0,
      balanceKnown: true,
      status: "待排课",
      orderStatus: "正常",
      historyStartDate: "2026-10-31",
    });
    const imported = transition(createSeed(), {
      type: "student.import",
      students: [profile],
      mode: "skip",
    }).data.students.at(-1);
    expect(imported?.balanceKnown).toBe(false);
  });
  it("月统计随跨月调课和取消变化，实际出席不等于扣课", () => {
    const data = createSeed();
    const s = data.students[0];
    data.lessons = data.lessons.filter((l) => l.studentId === s.id).slice(0, 3);
    data.lessons.forEach((l) => {
      l.date = "2026-10-20";
      l.status = "已完成";
      l.attendance = "正常";
    });
    data.lessons[1].attendance = "学员缺席";
    data.lessons[2].attendance = "老师缺席";
    expect(getStudentSummary(data, s.id).monthly).toMatchObject({
      planned: 3,
      actual: 1,
    });
    data.lessons[0].date = "2026-11-01";
    data.lessons[1].status = "已取消";
    expect(getStudentSummary(data, s.id).monthly).toMatchObject({
      planned: 1,
      actual: 0,
    });
    expect(getStudentSummary(data, s.id, "2026-11").monthly.planned).toBe(1);
    expect(getStudentSummary(data, s.id).teacherAbsences.system).toBe(1);
  });
  it("差评按条补偿按笔，历史无起点不合计，有起点排除重叠", () => {
    const data = createSeed();
    const s = data.students[0];
    s.legacyComplaints = "2";
    s.legacyCompensations = "1";
    data.feedback = data.feedback.slice(0, 1);
    data.feedback[0].studentId = s.id;
    data.feedback[0].rating = "差评";
    data.feedback[0].date = "2026-10-21";
    data.credits = [
      {
        id: "c",
        studentId: s.id,
        date: "2026-10-21",
        type: "补偿",
        units: 3,
        balance: 4,
        note: "",
        operator: "Rita",
      },
    ];
    let summary = getStudentSummary(data, s.id);
    expect(summary.complaints.total).toBeNull();
    expect(summary.compensations.system).toBe(1);
    s.historyStartDate = "2026-10-20";
    summary = getStudentSummary(data, s.id);
    expect(summary.complaints.total).toBe(3);
    expect(summary.compensations.total).toBe(2);
    s.historyStartDate = "2026-10-22";
    expect(getStudentSummary(data, s.id).complaints.total).toBe(2);
    data.feedback[0].rating = "好评";
    s.historyStartDate = "2026-10-20";
    expect(getStudentSummary(data, s.id).complaints.system).toBe(0);
  });
  it("资料部分更新不覆盖报告；同字段冲突拒绝；历史更正保留前后值", () => {
    const data = createSeed();
    const s = data.students[0];
    data.reports.push({
      id: "r",
      lessonId: data.lessons.find((l) => l.studentId === s.id)!.id,
      studentId: s.id,
      teacherId: s.teacherId,
      date: "2026-10-20",
      material: "新教材",
      from: "1",
      to: "24",
      rating: 0,
      comment: "",
      suggestedLevel: "",
    });
    const updated = transition(data, {
      type: "student.details.update",
      id: s.id,
      patch: { name: "新名字" },
      expected: { name: s.name },
    }).data;
    expect(getStudentSummary(updated, s.id).progress).toMatchObject({
      material: "新教材",
      unit: "24",
    });
    expect(() =>
      transition(updated, {
        type: "student.details.update",
        id: s.id,
        patch: { name: "旧表单" },
        expected: { name: s.name },
      }),
    ).toThrow(/已更新/);
    expect(() =>
      transition(data, {
        type: "student.details.update",
        id: s.id,
        patch: { unit: "1" },
        expected: { unit: s.unit },
      }),
    ).toThrow(/课后/);
  });
  it("历史更正用业务中文记录前后值，缺起点购课不与历史合计", () => {
    const data = createSeed();
    const student = data.students[0];
    student.totalUnits = 20;
    data.credits.push({
      id: "purchase",
      studentId: student.id,
      date: "2026-10-31",
      type: "续费",
      units: 10,
      balance: 30,
      note: "",
      operator: "Rita",
    });
    expect(getStudentSummary(data, student.id).totalUnits).toBeNull();
    const history = {
      ...studentHistorySchema.parse(student),
      historyStartDate: "2026-10-30",
      legacyComplaints: "3",
    };
    const changed = transition(data, {
      type: "student.history.update",
      id: student.id,
      history,
      reason: "核对旧表",
    }).data;
    expect(getStudentSummary(changed, student.id).totalUnits).toBe(30);
    expect(changed.events[0]).toMatchObject({
      relatedType: "student",
      relatedId: student.id,
    });
    expect(changed.events[0].content).toContain("历史投诉次数");
    expect(changed.events[0].content).not.toContain("legacyComplaints");
  });
  it("更正课后记录保留归属，不影响扣课及薪资", () => {
    const data = createSeed();
    const learner = data.students[0];
    const course = data.lessons.find((item) => item.studentId === learner.id)!;
    data.reports = [
      {
        id: "report",
        lessonId: course.id,
        studentId: learner.id,
        teacherId: course.teacherId,
        date: course.date,
        material: "旧教材",
        from: "1",
        to: "2",
        rating: 3,
        comment: "原评语",
        suggestedLevel: "",
      },
    ];
    const after = transition(data, {
      type: "report.correct",
      id: "report",
      material: "新教材",
      from: "2",
      to: "9",
      reason: "核对课堂",
    }).data;
    expect(after.reports[0]).toMatchObject({
      studentId: learner.id,
      teacherId: course.teacherId,
      lessonId: course.id,
      rating: 3,
      comment: "原评语",
      material: "新教材",
      to: "9",
    });
    expect(after.credits).toEqual(data.credits);
    expect(after.payroll).toEqual(data.payroll);
    expect(after.students[0].balance).toBe(learner.balance);
    expect(getStudentSummary(after, learner.id).progress.unit).toBe("9");
    expect(() =>
      transition(data, {
        type: "report.correct",
        id: "report",
        material: "新教材",
        from: "2",
        to: "9",
        reason: "",
      }),
    ).toThrow(/原因/);
  });
  it("未来换师未生效前显示原老师，生效日显示新老师", () => {
    const data = createSeed();
    const learner = data.students[0];
    const old = data.teachers.find((item) => item.id === learner.teacherId)!;
    const next = data.teachers.find((item) => item.id !== old.id)!;
    learner.teacherChanges = [
      {
        id: "change",
        date: "2026-11-01",
        fromTeacher: old.name,
        toTeacher: next.name,
        reason: "约定",
      },
    ];
    learner.teacherId = next.id;
    learner.teacherName = next.name;
    expect(getStudentSummary(data, learner.id).teacher).toEqual({
      id: old.id,
      name: old.name,
    });
    learner.teacherChanges[0].date = "2026-10-31";
    expect(getStudentSummary(data, learner.id).teacher).toEqual({
      id: next.id,
      name: next.name,
    });
  });
  it("历史同月重复录入会拒绝，未知年份标识原样保留", () => {
    const data = createSeed();
    const learner = data.students[0];
    const month = {
      id: "m",
      month: "7月（原表）",
      planned: null,
      actual: 0,
      note: "",
    };
    const history = {
      ...studentHistorySchema.parse(learner),
      monthlyRecords: [month, { ...month, id: "m2" }],
    };
    expect(() =>
      transition(data, {
        type: "student.history.update",
        id: learner.id,
        history,
        reason: "核对",
      }),
    ).toThrow(/重复/);
    history.monthlyRecords = [month];
    const updated = transition(data, {
      type: "student.history.update",
      id: learner.id,
      history,
      reason: "核对",
    }).data;
    expect(updated.students[0].monthlyRecords[0]).toEqual(month);
  });
  it("起算日期明确但历史购课未知时不把未知当零，新建零基数可合计", () => {
    const data = createSeed();
    const learner = data.students[0];
    learner.totalUnits = null;
    learner.historyStartDate = "2026-10-01";
    data.credits = [
      {
        id: "purchase",
        studentId: learner.id,
        date: "2026-10-31",
        type: "新购",
        units: 10,
        balance: 10,
        note: "",
        operator: "Rita",
      },
    ];
    expect(getStudentSummary(data, learner.id)).toMatchObject({
      totalUnits: null,
      systemPurchaseUnits: 10,
      historicalTotalUnits: null,
    });
    const created = transition(data, {
      type: "student.create",
      student: { ...emptyStudentProfile(), name: "明确新建零基数" },
    }).data;
    const fresh = created.students[0];
    expect(fresh.totalUnits).toBe(0);
    const purchased = transition(created, {
      type: "credit.add",
      studentId: fresh.id,
      kind: "新购",
      units: 8,
      note: "新购",
    }).data;
    expect(getStudentSummary(purchased, fresh.id).totalUnits).toBe(8);
  });
  it("周上课频次保留原表内容，不随排课数量改变", () => {
    const data = createSeed();
    const learner = data.students[0];
    learner.frequencyText = "2*25mins";
    expect(getStudentSummary(data, learner.id).frequencyText).toBe("2*25mins");
    data.lessons = [];
    expect(getStudentSummary(data, learner.id).frequencyText).toBe("2*25mins");
    learner.frequencyText = "不规律";
    expect(getStudentSummary(data, learner.id).frequencyText).toBe("不规律");
    learner.frequencyText = "";
    expect(getStudentSummary(data, learner.id).frequencyText).toBe("");
  });
});
