import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { transition, payrollTotal, isAvailable } from "./domain";
import { demoRepository } from "./repository";
import type { Command, DemoState } from "./model";

function normalPending(data: DemoState) {
  const lesson = data.lessons.find(
    (item) => item.status === "待确认" && item.attendance === "正常",
  );
  if (!lesson) throw new Error("Seed must contain a normal pending lesson");
  return lesson;
}
function schedule(studentId: string, teacherId = "t1"): Command {
  return {
    type: "lesson.schedule",
    studentId,
    teacherId,
    slots: [{ date: "2026-11-20", time: "16:00" }],
    duration: 25,
    kind: "固定课",
    material: "Power Up 3",
  };
}

describe("运营业务闭环", () => {
  it("按原表正常订单建档与排课，手动确认课时并产生扣课流水", () => {
    let data = createSeed();
    const template = data.students[0];
    const {
      id: _id,
      createdAt: _createdAt,
      balance: _balance,
      lastLesson: _lastLesson,
      ...student
    } = template;
    data = transition(data, {
      type: "student.create",
      student: {
        ...student,
        code: "TEST0001",
        name: "Demo pupil",
        phone: "13812345678",
        status: "待排课",
        teacherId: "",
      },
    }).data;
    const created = data.students.find((s) => s.code === "TEST0001");
    expect(created).toBeDefined();
    if (!created) throw new Error("Creation did not return a student");
    expect(created).toMatchObject({ balanceKnown: true, balance: 0 });
    data = transition(data, {
      type: "credit.add",
      studentId: created.id,
      units: 24,
      kind: "新购",
      note: "",
    }).data;
    data = transition(data, schedule(created.id)).data;
    expect(data.students.find((s) => s.id === created.id)?.status).toBe("待排课");
    const lesson = data.lessons.find((l) => l.studentId === created.id);
    if (!lesson) throw new Error("Scheduling did not create a lesson");
    lesson.status = "待确认";
    data = transition(data, {
      type: "lesson.resolve",
      ids: [lesson.id],
      decision: "扣课",
      reason: "正常上完",
      units: 1,
    }).data;
    expect(data.students.find((s) => s.id === created.id)).toMatchObject({
      status: "在读",
      balance: 23,
      teacherId: "t1",
    });
    expect(
      data.credits
        .filter((c) => c.studentId === created.id)
        .map((c) => c.units),
    ).toEqual([-1, 24]);
  });

  it("同一节课重复确认不二次扣课", () => {
    const before = createSeed();
    const lesson = normalPending(before);
    const confirmed = transition(before, {
      type: "lesson.resolve",
      ids: [lesson.id],
      decision: "扣课",
      reason: "正常",
    }).data;
    expect(() =>
      transition(confirmed, {
        type: "lesson.resolve",
        ids: [lesson.id],
        decision: "扣课",
        reason: "正常",
      }),
    ).toThrow("已经处理");
    expect(
      confirmed.credits.filter((c) =>
        c.note.includes(`${lesson.date} ${lesson.time}`),
      ),
    ).toHaveLength(1);
  });

  it("欠课学员续费先冲抵欠额，补偿必须有原因", () => {
    const before = createSeed();
    const student = before.students.find((s) => s.balance < 0);
    if (!student) throw new Error("Seed lacks indebted student");
    const after = transition(before, {
      type: "credit.add",
      studentId: student.id,
      units: 24,
      kind: "续费",
      note: "",
    }).data;
    expect(after.students.find((s) => s.id === student.id)?.balance).toBe(
      student.balance + 24,
    );
    expect(() =>
      transition(before, {
        type: "credit.add",
        studentId: student.id,
        units: 1,
        kind: "补偿",
        note: "",
      }),
    ).toThrow("原因");
  });

  it("批量排课中后一个时间冲突时，前一个也不写入", () => {
    const before = createSeed();
    const copy = structuredClone(before);
    expect(() =>
      transition(before, {
        type: "lesson.schedule",
        studentId: "s4",
        teacherId: "t1",
        slots: [
          { date: "2026-11-20", time: "16:00" },
          { date: "2026-11-20", time: "16:30" },
        ],
        duration: 50,
        kind: "固定课",
        material: "Power Up 3",
      }),
    ).toThrow("已经有课");
    expect(before).toEqual(copy);
  });

  it("老师未完成培训、少儿授课限制和关闭时间均阻断排课", () => {
    const data = createSeed();
    expect(() => transition(data, schedule("s4", "t8"))).toThrow("培训");
    expect(() => transition(data, schedule("s4", "t7"))).toThrow("少儿");
    expect(isAvailable(data, "t1", "2026-11-20", "09:00", 25, "s4")).toContain(
      "不在老师的可上课时间内",
    );
  });

  it("无法确认的账号关联课使整个批量确认保持原状", () => {
    const data = createSeed();
    const normal = normalPending(data);
    const unlinked = data.lessons.find((l) => l.attendance === "账号待关联");
    if (!unlinked) throw new Error("Seed lacks unlinked account");
    const before = structuredClone(data);
    expect(() =>
      transition(data, {
        type: "lesson.resolve",
        ids: [normal.id, unlinked.id],
        decision: "扣课",
        reason: "正常",
      }),
    ).toThrow("关联");
    expect(data).toEqual(before);
  });

  it("退款停用保留余额、取消未来课程，并保留待重新更新的业务影响", () => {
    const before = createSeed();
    const after = transition(before, {
      type: "student.lifecycle",
      studentId: "s1",
      status: "退费",
      reason: "家长确认退费",
      simulateFailure: true,
    }).data;
    expect(after.students.find((s) => s.id === "s1")).toMatchObject({
      status: "退费",
      orderStatus: "退款",
      balance: before.students.find((student) => student.id === "s1")?.balance,
    });
    const future = after.lessons.filter(
      (l) => l.studentId === "s1" && l.date >= "2026-10-31",
    );
    expect(future.length).toBeGreaterThan(0);
    expect(
      future.every((l) => l.status === "已取消" && l.sync === "未同步"),
    ).toBe(true);
    expect(() =>
      transition(after, {
        type: "credit.add",
        studentId: "s1",
        units: 24,
        kind: "续费",
        note: "",
      }),
    ).toThrow("冻结");
    const retry = transition(after, {
      type: "lesson.retry",
      id: future[0].id,
    }).data;
    expect(retry.lessons.find((l) => l.id === future[0].id)).toMatchObject({
      sync: "已同步",
      status: "已取消",
    });
  });

  it("反馈处理、责任判定与待确认扣款进入工资，重复判定被拒绝", () => {
    let data = createSeed();
    const before = payrollTotal(data, "p4").total;
    data = transition(data, {
      type: "feedback.process",
      id: "FB20261030-0001",
      note: "设备问题属实",
      complete: false,
    }).data;
    data = transition(data, {
      type: "feedback.verdict",
      id: "FB20261030-0001",
      verdict: "老师有责",
      note: "需更换设备",
      measures: ["提醒", "扣款"],
      amount: 80,
      deductionConfirmed: false,
    }).data;
    expect(payrollTotal(data, "p4").total).toBe(before);
    const deduction = data.actions.find(
      (a) => a.feedbackId === "FB20261030-0001" && a.type === "扣款",
    );
    if (!deduction) throw new Error("Verdict lacks deduction");
    data = transition(data, {
      type: "action.confirm",
      id: deduction.id,
      approve: true,
    }).data;
    expect(payrollTotal(data, "p4").total).toBe(before - 80);
    expect(() =>
      transition(data, {
        type: "feedback.verdict",
        id: "FB20261030-0001",
        verdict: "老师有责",
        note: "重复判定",
        measures: ["扣款"],
        amount: 80,
        deductionConfirmed: true,
      }),
    ).toThrow("已完成");
  });

  it("已确认薪资不允许调整，待确认扣款会阻断薪资确认", () => {
    const data = createSeed();
    expect(() =>
      transition(data, {
        type: "payroll.adjust",
        id: "p3",
        amount: 100,
        note: "不允许的调整",
      }),
    ).toThrow("不能修改");
    expect(() =>
      transition(data, {
        type: "payroll.status",
        ids: ["p4"],
        status: "已确认",
      }),
    ).toThrow("待确认扣款");
    expect(() =>
      transition(data, {
        type: "payroll.status",
        ids: ["p1"],
        status: "已发放",
      }),
    ).toThrow("先确认");
  });

  it("停用负责人需要转交，系统管理员不能停用", () => {
    const data = createSeed();
    const account = data.accounts.find((a) => a.name === "Rita");
    if (!account) throw new Error("Seed lacks Rita");
    expect(() =>
      transition(data, {
        type: "account.save",
        account: { ...account, enabled: false },
      }),
    ).toThrow("接手人");
    const after = transition(data, {
      type: "account.save",
      account: { ...account, enabled: false },
      handoverTo: "Roma",
    }).data;
    expect(after.students.some((s) => s.owner === "Rita")).toBe(false);
    expect(
      after.feedback.some((f) => f.owner === "Rita" && f.status !== "已完成"),
    ).toBe(false);
  });
});

describe("撤销扣课", () => {
  it("撤销后恢复余额，并保留其间发生的续费流水", () => {
    demoRepository.reset();
    const before = demoRepository.read();
    const lesson = normalPending(before);
    const student = before.students.find((s) => s.id === lesson.studentId);
    if (!student) throw new Error("Seed lacks lesson student");
    const confirmation = demoRepository.execute({
      type: "lesson.resolve",
      ids: [lesson.id],
      decision: "扣课",
      reason: "正常",
    });
    demoRepository.execute({
      type: "credit.add",
      studentId: student.id,
      units: 24,
      kind: "续费",
      note: "确认后续费",
    });
    expect(confirmation.undo).toBeTypeOf("function");
    confirmation.undo?.();
    const after = demoRepository.read();
    expect(after.students.find((s) => s.id === student.id)?.balance).toBe(
      student.balance + 24,
    );
    expect(after.lessons.find((l) => l.id === lesson.id)?.status).toBe(
      "待确认",
    );
    expect(after.credits.some((c) => c.note === "确认后续费")).toBe(true);
    expect(after.credits.some((c) => c.type === "撤销扣课")).toBe(true);
    expect(() => confirmation.undo?.()).toThrow("撤销时间已过");
  });
});

describe("跨模块边界回归", () => {
  it("更换老师与排课遵守同一少儿授课限制", () => {
    const data = createSeed();
    expect(() =>
      transition(data, {
        type: "lesson.changeTeacher",
        studentId: "s1",
        teacherId: "t7",
        from: "2026-11-20",
        reason: "家长要求",
      }),
    ).toThrow("少儿");
  });

  it("老师单价变更不回写已经确认的历史工资", () => {
    const data = createSeed();
    const before = payrollTotal(data, "p-sep-t1").total;
    const teacher = data.teachers.find((t) => t.id === "t1");
    if (!teacher) throw new Error("Seed lacks teacher");
    const changed = transition(data, {
      type: "teacher.save",
      teacher: { ...teacher, rate: teacher.rate + 100 },
    }).data;
    expect(payrollTotal(changed, "p-sep-t1").total).toBe(before);
  });

  it("部分时段请假不会封锁同一天其他上课时间", () => {
    const data = createSeed();
    const withLeave = transition(data, {
      type: "teacher.leave",
      teacherId: "t1",
      start: "2026-11-20T16:00",
      end: "2026-11-20T17:00",
      reason: "临时有事",
      cancelLessons: false,
    }).data;
    expect(
      isAvailable(withLeave, "t1", "2026-11-20", "15:00", 25, "s4"),
    ).toEqual([]);
    expect(
      isAvailable(withLeave, "t1", "2026-11-20", "16:00", 25, "s4"),
    ).toContain("老师这段时间请假");
  });
});
