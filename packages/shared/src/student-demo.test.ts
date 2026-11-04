import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import {
  emptyStudentProfile,
  stateSchema,
  studentProfileSchema,
} from "./model";

describe("学生表单数字化业务", () => {
  it("无需业务编号建档，保留群名原文并以内部标识关联", () => {
    const data = transition(createSeed(), {
      type: "student.create",
      student: {
        ...emptyStudentProfile(),
        name: "测试学生",
        groupName: "X0028测试学习群",
        orderStatus: "正常",
      },
    }).data;
    const student = data.students[0];
    expect(student).toMatchObject({
      name: "测试学生",
      groupName: "X0028测试学习群",
      orderStatus: "正常",
      status: "待排课",
      balance: 0,
    });
    expect(student.code).not.toBe("X0028");
    expect(student.id).toBeTruthy();
    expect(student.balanceKnown).toBe(true);
    expect(
      studentProfileSchema.safeParse({
        ...emptyStudentProfile(),
        name: "无需编号",
      }).success,
    ).toBe(true);
  });

  it("导入只匹配相同非空群名和名字，重复和歧义均原子拒绝", () => {
    const before = createSeed();
    const profile = {
      ...emptyStudentProfile(),
      name: "同名学生",
      groupName: "某学习群",
      totalUnits: 20,
    };
    const imported = transition(before, {
      type: "student.import",
      students: [profile],
      mode: "skip",
    }).data;
    const student = imported.students.at(-1)!;
    const updated = transition(imported, {
      type: "student.import",
      students: [{ ...profile, totalUnits: 40 }],
      mode: "update",
    }).data;
    expect(updated.students).toHaveLength(imported.students.length);
    expect(
      updated.students.find((item) => item.id === student.id)?.totalUnits,
    ).toBe(40);
    const renamed = transition(imported, {
      type: "student.import",
      students: [{ ...profile, groupName: "另一个学习群" }],
      mode: "update",
    }).data;
    expect(renamed.students).toHaveLength(imported.students.length + 1);
    expect(() =>
      transition(before, {
        type: "student.import",
        students: [profile, profile],
        mode: "skip",
      }),
    ).toThrow(/重复/);
    imported.students.push({ ...student, id: "another", code: "another" });
    const snapshot = structuredClone(imported);
    expect(() =>
      transition(imported, {
        type: "student.import",
        students: [profile],
        mode: "update",
      }),
    ).toThrow(/多份档案/);
    expect(imported).toEqual(snapshot);
  });

  it("停课等操作同步客户订单状态，资料编辑不能绕过服务操作", () => {
    const before = createSeed();
    const student = before.students[0];
    expect(() =>
      transition(before, {
        type: "student.profile",
        id: student.id,
        profile: {
          ...studentProfileSchema.parse(student),
          orderStatus: "退款",
        },
      }),
    ).toThrow(/服务停用/);
    const stopped = transition(before, {
      type: "student.lifecycle",
      studentId: student.id,
      status: "停课",
      reason: "家长申请",
    }).data;
    expect(stopped.students[0]).toMatchObject({
      orderStatus: "停课",
      status: "停课",
    });
    expect(
      stopped.lessons
        .filter(
          (lesson) =>
            lesson.studentId === student.id && lesson.date >= "2026-10-31",
        )
        .every((lesson) => lesson.status !== "未开始"),
    ).toBe(true);
    const resumed = transition(stopped, {
      type: "student.lifecycle",
      studentId: student.id,
      status: "在读",
      reason: "家长确认复课",
    }).data;
    expect(resumed.students[0]).toMatchObject({
      orderStatus: "正常",
      status: "在读",
    });
  });

  it("已关联老师的资料编辑和覆盖导入均不能暗改老师或未来课程", () => {
    const before = createSeed();
    const student = before.students[0];
    const changed = {
      ...studentProfileSchema.parse(student),
      teacherName: "T. Destiny",
      teacherId: "t2",
      phone: "13812345678",
    };
    const snapshot = structuredClone(before);
    expect(() =>
      transition(before, {
        type: "student.profile",
        id: student.id,
        profile: changed,
      }),
    ).toThrow(/换老师/);
    expect(() =>
      transition(before, {
        type: "student.import",
        students: [changed],
        mode: "update",
      }),
    ).toThrow(/换老师/);
    expect(before).toEqual(snapshot);
    const ordinary = transition(before, {
      type: "student.import",
      students: [
        { ...studentProfileSchema.parse(student), phone: "13812345678" },
      ],
      mode: "update",
    }).data;
    expect(ordinary.students[0].phone).toBe("13812345678");
    expect(ordinary.students[0].teacherId).toBe(student.teacherId);
    expect(ordinary.lessons).toEqual(before.lessons);
  });

  it("续费记录业务日期金额，更新是否续课", () => {
    const before = createSeed();
    const student = before.students[0];
    const after = transition(before, {
      type: "credit.add",
      studentId: student.id,
      units: 8,
      kind: "续费",
      date: "2026-10-28",
      amount: 640,
      note: "已确认充值",
    }).data;
    expect(after.students[0]).toMatchObject({
      balance: student.balance + 8,
      renewalStatus: "是",
    });
    expect(after.credits[0]).toMatchObject({
      studentId: student.id,
      type: "续费",
      date: "2026-10-28",
      amount: 640,
      units: 8,
      note: "已确认充值",
    });
    expect(() =>
      transition(before, {
        type: "credit.add",
        studentId: student.id,
        units: 8,
        kind: "充值",
        date: "2026-02-30",
        note: "",
      }),
    ).toThrow(/业务日期/);
    expect(before.students[0].balance).toBe(student.balance);
  });

  it("允许核实后的小数课时，续费保持服务状态，只有显式复课才恢复正常订单", () => {
    const before = createSeed();
    const student = before.students[0];
    student.balanceKnown = false;
    student.balance = 0;
    const opened = transition(before, {
      type: "student.balance.open",
      id: student.id,
      balance: 1.5,
      reason: "核实台账",
    }).data;
    const ended = transition(opened, {
      type: "student.lifecycle",
      studentId: student.id,
      status: "结课",
      reason: "阶段服务结束",
    }).data;
    const renewed = transition(ended, {
      type: "credit.add",
      studentId: student.id,
      units: 0.5,
      kind: "续费",
      note: "续费补课",
    }).data;
    expect(renewed.students[0]).toMatchObject({
      status: "结课",
      orderStatus: "结课",
      renewalStatus: "是",
      balance: 2,
    });
    const resumed = transition(renewed, {
      type: "student.lifecycle",
      studentId: student.id,
      status: "在读",
      reason: "家长明确确认恢复上课",
    }).data;
    expect(resumed.students[0]).toMatchObject({
      status: "在读",
      orderStatus: "正常",
      balance: 2,
    });
  });

  it("转介绍单独登记关系，充值可关联，拒绝自己介绍自己和重复关系", () => {
    const before = createSeed();
    const [student, referrer] = before.students;
    const related = transition(before, {
      type: "referral.add",
      studentId: student.id,
      referrerStudentId: referrer.id,
      date: "2026-10-31",
      note: "家长介绍",
    }).data;
    expect(related.students[0].balance).toBe(student.balance);
    expect(related.referrals[0]).toMatchObject({
      studentId: student.id,
      referrerStudentId: referrer.id,
      note: "家长介绍",
    });
    const credited = transition(related, {
      type: "credit.add",
      studentId: student.id,
      units: 12,
      kind: "充值",
      note: "转介绍充值",
      referralId: related.referrals[0].id,
    }).data;
    expect(credited.credits[0].referralId).toBe(related.referrals[0].id);
    expect(() =>
      transition(related, {
        type: "referral.add",
        studentId: student.id,
        referrerStudentId: referrer.id,
        date: "2026-10-31",
        note: "",
      }),
    ).toThrow(/重复/);
    expect(() =>
      transition(before, {
        type: "referral.add",
        studentId: student.id,
        referrerStudentId: student.id,
        date: "2026-10-31",
        note: "",
      }),
    ).toThrow(/同一人/);
  });

  it("退款停用保留已知或未知余额，逐项记录本地结果与待办", () => {
    const before = createSeed();
    const student = before.students[0];
    const after = transition(before, {
      type: "student.lifecycle",
      studentId: student.id,
      status: "退费",
      reason: "确认停止服务",
    }).data;
    expect(after.students[0]).toMatchObject({
      orderStatus: "退款",
      balance: student.balance,
      balanceKnown: true,
    });
    expect(after.credits).toHaveLength(before.credits.length);
    expect(after.students[0].serviceStopResults).toHaveLength(4);
    expect(
      after.students[0].serviceStopResults.filter(
        (result) => result.status === "待确认范围",
      ),
    ).toHaveLength(2);
    expect(
      after.tasks.filter(
        (task) =>
          task.studentId === student.id && task.title.startsWith("退款停用"),
      ),
    ).toHaveLength(2);
    const resumed = transition(after, {
      type: "student.lifecycle",
      studentId: student.id,
      status: "在读",
      reason: "确认恢复服务",
    }).data;
    expect(resumed.students[0].serviceStopResults).toEqual([]);
    expect(
      resumed.events.some(
        (event) =>
          event.studentId === student.id && event.type === "历史停用结果",
      ),
    ).toBe(true);
  });

  it("待办按真实输入创建、保存处理结果并防重复完成，旧存储补空数组", () => {
    const before = createSeed();
    const added = transition(before, {
      type: "task.add",
      studentId: before.students[0].id,
      title: "确认下周上课安排",
      owner: "Roma",
      dueDate: "2026-11-02",
      note: "联系家长",
    }).data;
    const task = added.tasks[0];
    expect(task).toMatchObject({
      status: "待处理",
      owner: "Roma",
      dueDate: "2026-11-02",
    });
    expect(
      transition(added, { type: "task.complete", id: task.id, result: "" }).data
        .tasks[0],
    ).toMatchObject({ status: "已完成", result: "" });
    const completed = transition(added, {
      type: "task.complete",
      id: task.id,
      result: "家长确认周二19点",
    }).data;
    expect(completed.tasks[0]).toMatchObject({
      status: "已完成",
      result: "家长确认周二19点",
      completedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(() =>
      transition(completed, {
        type: "task.complete",
        id: task.id,
        result: "再次完成",
      }),
    ).toThrow(/重复/);
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(before));
    delete legacy.tasks;
    delete legacy.referrals;
    expect(stateSchema.parse(legacy)).toMatchObject({
      tasks: [],
      referrals: [],
    });
  });

  it("55分钟不自动折算，手动确认的扣课数可准确退回", () => {
    const before = createSeed();
    const lesson = before.lessons.find(
      (item) => item.status === "待确认" && item.attendance === "正常",
    )!;
    lesson.duration = 55;
    delete lesson.confirmedUnits;
    expect(() =>
      transition(before, {
        type: "lesson.resolve",
        ids: [lesson.id],
        decision: "扣课",
        reason: "",
      }),
    ).toThrow(/明确确认/);
    const balance = before.students.find(
      (item) => item.id === lesson.studentId,
    )!.balance;
    const charged = transition(before, {
      type: "lesson.resolve",
      ids: [lesson.id],
      decision: "扣课",
      reason: "核实为1课时",
      units: 1,
    }).data;
    expect(
      charged.students.find((item) => item.id === lesson.studentId)?.balance,
    ).toBe(balance - 1);
    const returned = transition(charged, {
      type: "lesson.correct",
      id: lesson.id,
      deduct: false,
      reason: "取消扣课",
    }).data;
    expect(
      returned.students.find((item) => item.id === lesson.studentId)?.balance,
    ).toBe(balance);
  });

  it("取消课程不擅自应用提前几小时扣课规则，保留余额并生成核实待办", () => {
    const before = createSeed();
    const lesson = before.lessons.find((item) => item.status === "未开始")!;
    const student = before.students.find(
      (item) => item.id === lesson.studentId,
    )!;
    const after = transition(before, {
      type: "lesson.cancel",
      id: lesson.id,
      reason: "临时无法上课",
      responsibility: "学员",
    }).data;
    expect(after.lessons.find((item) => item.id === lesson.id)?.status).toBe(
      "已取消",
    );
    expect(after.students.find((item) => item.id === student.id)?.balance).toBe(
      student.balance,
    );
    expect(after.credits).toHaveLength(before.credits.length);
    expect(after.tasks[0]).toMatchObject({
      studentId: student.id,
      title: "核实取消课程课时",
      status: "待处理",
    });
  });

  it("教学进度联动教材与页码，补录旧课不覆盖较新课程进度", () => {
    const before = createSeed();
    const student = before.students[0];
    const sample = before.lessons.find(
      (item) => item.studentId === student.id,
    )!;
    const older = { ...sample, id: "old-progress", date: "2026-10-28" };
    const newer = { ...sample, id: "new-progress", date: "2026-10-30" };
    before.lessons.push(older, newer);
    const report = (lessonId: string, material: string, to: string) => ({
      lessonId,
      studentId: student.id,
      teacherId: sample.teacherId,
      date: "2026-10-31",
      material,
      from: "p.1",
      to,
      rating: 4,
      comment: "课堂互动正常",
      suggestedLevel: "",
    });
    const recent = transition(before, {
      type: "report.save",
      report: report(newer.id, "新教材", "p.20"),
    }).data;
    const backfilled = transition(recent, {
      type: "report.save",
      report: report(older.id, "旧教材", "p.4"),
    }).data;
    expect(backfilled.students[0]).toMatchObject({
      material: "新教材",
      unit: "p.20",
    });
    expect(
      backfilled.reports.filter((item) =>
        [older.id, newer.id].includes(item.lessonId),
      ),
    ).toHaveLength(2);
  });

  it("今天已结束课程可提交进度，未来与未开始课程不能提前结课", () => {
    const before = createSeed();
    const sample = before.lessons[0];
    const today = {
      ...sample,
      id: "today-completed",
      date: "2026-10-31",
      status: "已完成" as const,
    };
    const future = { ...today, id: "future-completed", date: "2026-11-02" };
    const notStarted = {
      ...today,
      id: "today-planned",
      status: "未开始" as const,
    };
    before.lessons.push(today, future, notStarted);
    const report = (lessonId: string) => ({
      lessonId,
      studentId: sample.studentId,
      teacherId: sample.teacherId,
      date: "2026-10-31",
      material: "Book",
      from: "",
      to: "p.5",
      rating: 0,
      comment: "",
      suggestedLevel: "",
    });
    expect(() =>
      transition(before, { type: "report.save", report: report(today.id) }),
    ).not.toThrow();
    expect(() =>
      transition(before, { type: "report.save", report: report(future.id) }),
    ).toThrow(/提前结课/);
    expect(() =>
      transition(before, {
        type: "report.save",
        report: report(notStarted.id),
      }),
    ).toThrow(/提前结课/);
  });
});
