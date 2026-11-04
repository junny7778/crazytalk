import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import { DEMO_TODAY, stateSchema, addDays } from "./model";

describe("学员跟进自动关联", () => {
  it("不填总结和期限也能完成待办，自动记录经办信息，不改课程和余额", () => {
    const before = createSeed();
    const learner = before.students[0];
    learner.owner = "";
    const added = transition(before, {
      type: "task.add",
      studentId: learner.id,
      title: "联系家长",
      owner: "",
      operator: "验收教务",
    }).data;
    const task = added.tasks[0];
    expect(task).toMatchObject({
      owner: "待分配",
      dueDate: "",
      sourceType: "manual",
      createdBy: "验收教务",
    });
    const completed = transition(added, {
      type: "task.complete",
      id: task.id,
      result: "",
      operator: "接手教务",
    }).data;
    expect(completed.tasks[0]).toMatchObject({
      status: "已完成",
      result: "",
      completedBy: "接手教务",
    });
    expect(completed.tasks[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(completed.students[0].balance).toBe(learner.balance);
    expect(completed.lessons).toEqual(before.lessons);
    expect(completed.events[0]).toMatchObject({
      relatedType: "task",
      relatedId: task.id,
    });
  });

  it("老师请假按学员派单，关联真实课程，重复操作不重复派发", () => {
    const before = createSeed();
    const teacherId = before.teachers[0].id;
    const command = {
      type: "teacher.leave" as const,
      teacherId,
      start: DEMO_TODAY,
      end: addDays(DEMO_TODAY, 10),
      reason: "老师请假",
      cancelLessons: false,
    };
    const changed = transition(before, command).data;
    const generated = changed.tasks.filter(
      (task) => task.sourceType === "teacher",
    );
    expect(generated.length).toBeGreaterThan(0);
    for (const task of generated) {
      expect(task.owner).toBe(
        changed.students.find((student) => student.id === task.studentId)
          ?.owner || "待分配",
      );
      expect(task.dueDate).toBe("");
      expect(task.lessonIds?.length).toBeGreaterThan(0);
      expect(
        task.lessonIds?.every(
          (id) =>
            changed.lessons.find((lesson) => lesson.id === id)?.studentId ===
            task.studentId,
        ),
      ).toBe(true);
    }
    const repeated = transition(changed, command).data;
    expect(
      repeated.tasks.filter((task) => task.sourceType === "teacher"),
    ).toHaveLength(generated.length);
  });

  it("老师离职自动关联受影响课程，不额外扣减余额", () => {
    const before = createSeed();
    const teacher = before.teachers[0];
    const changed = transition(before, {
      type: "teacher.offboard",
      teacherId: teacher.id,
      confirmName: teacher.name,
      reason: "离职",
    }).data;
    expect(
      changed.tasks.some(
        (task) => task.sourceType === "teacher" && task.title.includes("离职"),
      ),
    ).toBe(true);
    expect(changed.students.map((student) => student.balance)).toEqual(
      before.students.map((student) => student.balance),
    );
  });

  it("老师调整可上课时间仅为受影响学员生成待办", () => {
    const before = createSeed();
    const teacher = {
      ...before.teachers[0],
      availability: [],
      availabilitySource: "entered" as const,
    };
    const changed = transition(before, { type: "teacher.save", teacher }).data;
    expect(
      changed.tasks.some(
        (task) =>
          task.sourceType === "teacher" &&
          task.title.includes("调整可上课时间"),
      ),
    ).toBe(true);
    expect(
      transition(changed, { type: "teacher.save", teacher }).data.tasks,
    ).toHaveLength(changed.tasks.length);
  });

  it("提醒必须提供明确演示条件，不把未知余额和停课学生列为低课时", () => {
    const before = createSeed();
    const learner = before.students[0];
    learner.balance = 2;
    const generated = transition(before, {
      type: "student.reminder.preview",
      studentId: learner.id,
      kind: "balance",
      threshold: 3,
    }).data;
    expect(generated.tasks[0]).toMatchObject({
      sourceType: "reminder",
      title: "跟进剩余课时",
      dueDate: "",
    });
    expect(generated.tasks[0].note).toContain("剩余 2 课时");
    expect(
      transition(generated, {
        type: "student.reminder.preview",
        studentId: learner.id,
        kind: "balance",
        threshold: 3,
      }).data.tasks,
    ).toHaveLength(generated.tasks.length);
    learner.balanceKnown = false;
    expect(
      transition(before, {
        type: "student.reminder.preview",
        studentId: learner.id,
        kind: "balance",
        threshold: 3,
      }).data.tasks,
    ).toEqual(before.tasks);
    learner.balanceKnown = true;
    learner.status = "停课";
    expect(
      transition(before, {
        type: "student.reminder.preview",
        studentId: learner.id,
        kind: "balance",
        threshold: 3,
      }).data.tasks,
    ).toEqual(before.tasks);
  });

  it("出勤提醒仅使用已确认缺席，不用待核实或未来课程", () => {
    const before = createSeed();
    const learner = before.students[0];
    const lesson = before.lessons.find(
      (item) => item.studentId === learner.id,
    )!;
    lesson.date = DEMO_TODAY;
    lesson.status = "待确认";
    lesson.attendance = "学员缺席";
    const command = {
      type: "student.reminder.preview" as const,
      studentId: learner.id,
      kind: "attendance" as const,
      threshold: 1,
      lookbackDays: 7,
    };
    expect(transition(before, command).data.tasks).toEqual(before.tasks);
    lesson.status = "缺席";
    const generated = transition(before, command).data.tasks[0];
    expect(generated.title).toBe("核实近期出勤");
    expect(generated.lessonIds).toEqual([lesson.id]);
  });

  it("更正已扣1课时到1.5只扣差额，改不扣退回真实1.5", () => {
    const before = createSeed();
    const lesson = before.lessons.find(
      (item) => item.deducted && item.confirmedUnits === 1,
    )!;
    const learner = before.students.find(
      (student) => student.id === lesson.studentId,
    )!;
    const changed = transition(before, {
      type: "lesson.correct",
      id: lesson.id,
      deduct: true,
      units: 1.5,
      reason: "实际确认1.5",
      operator: "验收教务",
    }).data;
    expect(
      changed.students.find((student) => student.id === learner.id)?.balance,
    ).toBe(learner.balance - 0.5);
    expect(changed.credits[0]).toMatchObject({
      units: -0.5,
      lessonId: lesson.id,
      operator: "验收教务",
    });
    const refunded = transition(changed, {
      type: "lesson.correct",
      id: lesson.id,
      deduct: false,
      reason: "不扣",
    }).data;
    expect(
      refunded.students.find((student) => student.id === learner.id)?.balance,
    ).toBe(learner.balance + 1);
    expect(refunded.credits[0]).toMatchObject({
      units: 1.5,
      lessonId: lesson.id,
    });
  });

  it("旧存储缺少新增元数据时仍能读取，不补造历史经办时间", () => {
    const before = createSeed();
    const parsed = stateSchema.parse(JSON.parse(JSON.stringify(before)));
    expect(parsed.students).toEqual(before.students);
    expect(parsed.events[0].recordedAt).toBeUndefined();
    expect(parsed.credits[0].recordedAt).toBeUndefined();
  });

  it("结果和考勤人工更正独立于扣课，不改变薪资或复活取消课程", () => {
    const before = createSeed();
    const lesson = before.lessons.find((item) => item.status === "已完成")!;
    const changed = transition(before, {
      type: "lesson.correct",
      id: lesson.id,
      deduct: true,
      units: lesson.confirmedUnits,
      result: "缺席",
      attendance: "学员缺席",
      reason: "考勤核对",
    }).data;
    expect(changed.lessons.find((item) => item.id === lesson.id)).toMatchObject(
      {
        status: "缺席",
        attendance: "学员缺席",
        confirmedUnits: lesson.confirmedUnits,
      },
    );
    expect(changed.students.map((item) => item.balance)).toEqual(
      before.students.map((item) => item.balance),
    );
    expect(changed.payroll).toEqual(before.payroll);
    expect(changed.events[0].content).toContain("出勤 正常 → 学员缺席");
    lesson.status = "已取消";
    expect(() =>
      transition(before, {
        type: "lesson.correct",
        id: lesson.id,
        deduct: false,
        result: "已完成",
        reason: "非法复活",
      }),
    ).toThrow(/已结束课程/);
  });

  it("课程服务提醒只关联实际合适课程，不提前认定未来课已经结束", () => {
    const before = createSeed();
    const learner = before.students[0];
    const future = before.lessons.find(
      (lesson) =>
        lesson.studentId === learner.id &&
        lesson.status === "未开始" &&
        lesson.date >= DEMO_TODAY,
    )!;
    const ended = before.lessons.find(
      (lesson) => lesson.studentId === learner.id && lesson.status === "已完成",
    )!;
    const changed = transition(before, {
      type: "student.courseReminder.preview",
      studentId: learner.id,
      lessonId: future.id,
      kind: "before",
    }).data;
    expect(changed.tasks[0]).toMatchObject({
      title: "课前准备提醒",
      sourceType: "reminder",
      lessonIds: [future.id],
      dueDate: "",
    });
    expect(
      transition(changed, {
        type: "student.courseReminder.preview",
        studentId: learner.id,
        lessonId: future.id,
        kind: "before",
      }).data.tasks,
    ).toHaveLength(changed.tasks.length);
    expect(() =>
      transition(before, {
        type: "student.courseReminder.preview",
        studentId: learner.id,
        lessonId: future.id,
        kind: "feedback",
      }),
    ).toThrow(/已经结束/);
    const after = transition(changed, {
      type: "student.courseReminder.preview",
      studentId: learner.id,
      lessonId: ended.id,
      kind: "feedback",
    }).data;
    expect(after.tasks[0]).toMatchObject({
      title: "跟进课后反馈",
      lessonIds: [ended.id],
    });
    expect(after.lessons).toEqual(before.lessons);
  });

  it("调课、取消、更正显式关联对应课程，新充值精确关联本次流水", () => {
    const before = createSeed();
    const learner = before.students[0];
    const future = before.lessons.find(
      (item) =>
        item.studentId === learner.id &&
        item.status === "未开始" &&
        item.date >= DEMO_TODAY,
    )!;
    const rescheduled = transition(before, {
      type: "lesson.reschedule",
      id: future.id,
      teacherId: future.teacherId,
      date: future.date,
      time: future.time,
      reason: "确认本节安排",
      confirmedTeacher: true,
    }).data;
    expect(rescheduled.events[0]).toMatchObject({
      type: "调课",
      relatedType: "lesson",
      relatedId: future.id,
    });
    const cancelled = transition(rescheduled, {
      type: "lesson.cancel",
      id: future.id,
      responsibility: "学员",
      reason: "临时有事",
    }).data;
    expect(cancelled.events[0]).toMatchObject({
      type: "取消课程",
      relatedType: "lesson",
      relatedId: future.id,
    });
    const ended = before.lessons.find(
      (item) => item.studentId === learner.id && item.status === "已完成",
    )!;
    const corrected = transition(before, {
      type: "lesson.correct",
      id: ended.id,
      deduct: false,
      reason: "人工核实不扣",
    }).data;
    expect(corrected.events[0]).toMatchObject({
      type: "更正结果",
      relatedType: "lesson",
      relatedId: ended.id,
    });
    const purchased = transition(corrected, {
      type: "credit.add",
      studentId: learner.id,
      kind: "续费",
      units: 1.5,
      note: "同日多笔",
    }).data;
    const again = transition(purchased, {
      type: "credit.add",
      studentId: learner.id,
      kind: "续费",
      units: 2,
      note: "第二笔",
    }).data;
    const events = again.events.filter((event) => event.type === "续费");
    expect(events[0]).toMatchObject({
      relatedType: "credit",
      relatedId: again.credits[0].id,
    });
    expect(events[1]).toMatchObject({
      relatedType: "credit",
      relatedId: again.credits[1].id,
    });
    expect(events[0].relatedId).not.toBe(events[1].relatedId);
  });
});
