import { describe, expect, it } from "vitest";
import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { createSeed } from "./seed";
import { isAvailable, transition } from "./domain";
import { getFixedSchedulePlans } from "./fixedPlans";
import { studentActiveMaterial } from "./materials";
import { migrateTeacherTeams } from "./organization";
import { channelProjectSettlement } from "./projectMetrics";
import { commandSchema } from "./commandSchema";
import type { CatalogEntry, ScheduleIntent } from "./model";

describe("2026-11-26 迭代需求专项测试（shared）", () => {
  it("T1.1 渠道为一级、项目挂在渠道下，支持单价与按渠道/项目结算统计", () => {
    let data = createSeed();
    const channel: CatalogEntry = {
      id: "ch-vip",
      type: "渠道",
      name: "VIP渠道",
      detail: "",
      enabled: true,
    };
    const project: CatalogEntry = {
      id: "pr-ielts",
      type: "项目",
      name: "雅思VIP课包",
      parentId: channel.id,
      channelIds: [channel.id],
      detail: "",
      enabled: true,
      monthlyLessons: 12,
      unitPrice: 120,
    };
    data = transition(data, { type: "catalog.save", entry: channel }).data;
    data = transition(data, { type: "catalog.save", entry: project }).data;
    const savedProject = data.catalog.find((c) => c.id === project.id)!;
    expect(savedProject.parentId).toBe(channel.id);
    expect(savedProject.channelIds).toEqual([channel.id]);
    expect(savedProject.unitPrice).toBe(120);

    const s = data.students[0];
    data = transition(data, {
      type: "student.details.update",
      id: s.id,
      patch: { channel: "VIP渠道", project: "雅思VIP课包" },
      expected: { channel: s.channel, project: s.project },
    }).data;

    data = transition(data, {
      type: "credit.add",
      purchaseId: "p-settle-1",
      studentId: s.id,
      units: 72,
      kind: "新购",
      date: "2026-11-01",
      note: "新购雅思",
      amount: 8640,
    }).data;
    data = transition(data, {
      type: "credit.add",
      purchaseId: "p-settle-2",
      studentId: s.id,
      units: 5,
      kind: "续费",
      date: "2026-11-02",
      note: "小额续费5节",
      amount: 600,
    }).data;

    data.lessons.push({
      ...createSeed().lessons[0],
      id: "l-settle-50",
      studentId: s.id,
      teacherId: "t1",
      date: "2026-11-02",
      time: "07:00",
      duration: 50,
      kind: "固定课",
      status: "已完成",
      attendance: "正常",
      deducted: true,
      confirmedUnits: 2,
    });

    const summary = channelProjectSettlement(data, {
      from: "2026-11-01",
      to: "2026-11-30",
      channel: "VIP渠道",
    });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      channel: "VIP渠道",
      project: "雅思VIP课包",
      newPurchaseUnits: 72,
      newPurchaseAmount: 8640,
      renewalUnits: 5,
      renewalAmount: 600,
      deliveredLessons: 1,
      deliveredUnits: 2,
      unitPrice: 120,
      settlementAmount: 240,
    });
    expect(summary.byChannel[0].settlementAmount).toBe(240);
  });

  it("T1.2 老师固定单选队伍/组别：成对校验、目录改名联动", () => {
    let data = createSeed();
    const tutor = { ...data.teachers[0] };
    expect(() =>
      transition(data, {
        type: "teacher.save",
        teacher: { ...tutor, team: "A队", group: undefined },
      }),
    ).toThrow("请同时选择所属队伍和组别");

    data = transition(data, {
      type: "teacher.save",
      teacher: { ...tutor, team: "A队", group: "二组" },
    }).data;
    expect(data.teachers.find((t) => t.id === tutor.id)).toMatchObject({
      team: "A队",
      group: "二组",
    });

    const teamEntry = data.catalog.find((c) => c.type === "队伍" && c.name === "A队")!;
    data = transition(data, {
      type: "catalog.save",
      entry: { ...teamEntry, name: "精英一队" },
    }).data;
    expect(data.teachers.find((t) => t.id === tutor.id)?.team).toBe("精英一队");
  });

  it("T1.3 学员教材严格单选，且已有课后进度后允许换教材但不改历史课程", () => {
    let data = createSeed();
    let s = data.students[0];
    data = transition(data, {
      type: "student.details.update",
      id: s.id,
      patch: { materialIds: ["m2"] },
      expected: { materialIds: s.materialIds },
    }).data;
    s = data.students.find((item) => item.id === s.id)!;
    expect(() =>
      transition(data, {
        type: "student.details.update",
        id: s.id,
        patch: { materialIds: ["m1", "m2"] },
        expected: { materialIds: s.materialIds },
      }),
    ).toThrow("仅支持选择一本学习教材");

    const lessonId = data.lessons.find((l) => l.studentId === s.id)?.id || "l-rep";
    if (!data.lessons.some((l) => l.id === lessonId)) {
      data.lessons.push({
        ...createSeed().lessons[0],
        id: lessonId,
        studentId: s.id,
        material: "Power Up 3",
      });
    }
    const targetLesson = data.lessons.find((l) => l.id === lessonId)!;
    const originalLessonMaterial = targetLesson.material;
    data.reports.push({
      id: "rep-1",
      lessonId: targetLesson.id,
      studentId: s.id,
      teacherId: targetLesson.teacherId,
      date: targetLesson.date,
      material: originalLessonMaterial,
      from: "P1",
      to: "P6",
      rating: 5,
      comment: "好",
      suggestedLevel: "",
    });

    const next = transition(data, {
      type: "student.details.update",
      id: s.id,
      patch: { materialIds: ["m3"] },
      expected: { materialIds: s.materialIds },
    }).data;
    const updatedStudent = next.students.find((item) => item.id === s.id)!;
    expect(updatedStudent.materialIds).toEqual(["m3"]);
    expect(studentActiveMaterial(next, updatedStudent)?.name).toBe("Think 1");
    expect(next.events.some((e) => e.type === "更换教材" && e.studentId === s.id)).toBe(true);
    expect(next.lessons.find((l) => l.id === lessonId)?.material).toBe(
      originalLessonMaterial,
    );
  });

  it("T1.4 新购保持 72/144 套餐，续费支持自由小额（如 5 节）并记录类型及渠道项目快照", () => {
    let data = createSeed();
    bindSchedulingStaff(data);
    const s = data.students[0];
    data.orders = [];
    data.classInAccounts = [];

    expect(() =>
      transition(
        data,
        commandSchema.parse({
          type: "order.buy",
          id: "ord-bad-new",
          studentId: s.id,
          studentIds: [s.id],
          units: 5,
          date: "2026-11-01",
          kind: "新购",
          note: "新购校验",
        }),
      ),
    ).toThrow("72 或 144");

    data = transition(
      data,
      commandSchema.parse({
        type: "order.buy",
        id: "ord-renew-5",
        studentId: s.id,
        studentIds: [s.id],
        units: 5,
        date: "2026-11-01",
        kind: "续费",
        note: "小额续费5节",
        amount: 500,
      }),
    ).data;

    expect(data.credits[0]).toMatchObject({
      type: "续费",
      units: 5,
      amount: 500,
      channel: s.channel,
      project: s.project,
    });
  });

  it("T3.1 一键排课限定老师队伍/组别（不限渠道）、排除无队伍组别老师、且 50 分钟占两格次节最早 08:00", () => {
    const data = createSeed();
    bindSchedulingStaff(data);
    data.rules.trainingRequired = false;
    data.lessons = [];
    data.leaves = [];
    const student = data.students[0]; // Roma: B队 / 一组
    student.status = "在读";
    student.age = 8;
    student.materialIds = ["m1"];
    student.material = "Power Up 1";
    student.teacherId = "t-same-2";
    data.classInAccounts = [
      { id: "acc-1", phone: student.phone, uid: "990001", studentIds: [student.id] },
    ];

    const sameGroup1 = {
      ...data.teachers[0],
      id: "t-same-1",
      name: "T. Same1",
      team: "B队",
      group: "一组",
      classInUid: "880101",
      tags: [],
      categories: ["少儿"],
      materialIds: ["m1"],
      availability: [{ day: 1, start: "07:00", end: "10:00" }],
    };
    const sameGroupCurrent = {
      ...sameGroup1,
      id: "t-same-2",
      name: "T. Current",
    };
    const otherGroup = {
      ...sameGroup1,
      id: "t-other-group",
      name: "T. OtherGroup",
      team: "A队",
      group: "二组",
      classInUid: "880102",
    };
    const noGroup = {
      ...sameGroup1,
      id: "t-no-group",
      name: "T. NoGroup",
      team: undefined,
      group: undefined,
      classInUid: "880103",
    };
    data.teachers = [sameGroup1, sameGroupCurrent, otherGroup, noGroup];

    const intent: ScheduleIntent = {
      mode: "fixed",
      materialIds: ["m1"],
      startDate: "2026-11-23",
      weeks: 1,
      frequency: 1,
      duration: 50,
      windows: [{ day: 1, start: "07:00", end: "09:00" }],
    };

    const plans = getFixedSchedulePlans(data, student.id, intent);
    expect(plans.map((p) => p.primaryTeacherId)).toEqual(["t-same-2", "t-same-1"]);
    expect(plans.some((p) => p.primaryTeacherId === "t-other-group")).toBe(false);
    expect(plans.some((p) => p.primaryTeacherId === "t-no-group")).toBe(false);

    // 50分钟课程：07:00-07:50 占用 07:00 和 07:30 两格，下节最早 08:00
    const booked = transition(data, {
      type: "lesson.schedule",
      studentId: student.id,
      teacherId: "t-same-2",
      slots: [{ date: "2026-11-23", time: "07:00" }],
      duration: 50,
      kind: "固定课",
      material: "Power Up 1",
    }).data;
    expect(isAvailable(booked, "t-same-2", "2026-11-23", "07:30", 25).length).toBeGreaterThan(0);
    expect(isAvailable(booked, "t-same-2", "2026-11-23", "08:00", 25)).toEqual([]);
  });

  it("T3.5 旧版 Demo 本地缓存迁移自动补齐老师队伍/组别以恢复匹配", () => {
    const data = createSeed();
    bindSchedulingStaff(data);
    data.classInAccounts = data.students.map((s, i) => ({
      id: `ci-${s.id}`,
      phone: s.phone,
      uid: String(990200 + i),
      studentIds: [s.id],
    }));
    for (const teacher of data.teachers) {
      delete teacher.team;
      delete teacher.group;
      teacher.classInUid ||= `980100${teacher.id.slice(1)}`;
    }
    data.importedBatches = ["sample-teams-v2", "demo-scheduling-samples-v3"];

    const student = data.students.find((s) => s.ownerAccountId === "u2" && s.status === "在读")!;
    student.balance = 20;
    student.materialIds = ["m1"];
    const intent: ScheduleIntent = {
      mode: "fixed",
      materialIds: ["m1"],
      startDate: "2026-11-23",
      weeks: 1,
      frequency: 1,
      duration: 25,
      windows: [{ day: 3, start: "19:00", end: "21:00" }],
    };
    expect(getFixedSchedulePlans(data, student.id, intent)).toEqual([]);

    expect(migrateTeacherTeams(data)).toBe(true);
    expect(data.teachers.find((t) => t.id === "t2")).toMatchObject({ team: "A队", group: "二组" });
    expect(data.teachers.find((t) => t.id === "t8")?.team).toBeUndefined();
    expect(migrateTeacherTeams(data)).toBe(false);

    const plans = getFixedSchedulePlans(data, student.id, intent);
    expect(plans.length).toBeGreaterThan(0);
    expect(
      plans.every((p) => {
        const tutor = data.teachers.find((t) => t.id === p.primaryTeacherId);
        return tutor?.team === "A队" && tutor?.group === "二组";
      }),
    ).toBe(true);
  });
});
