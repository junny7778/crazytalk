import { describe, it, expect, vi } from "vitest";
import { createSeed } from "./seed";
import { transition } from "./domain";
import {
  emptyStudentProfile,
  studentProfileSchema,
  studentHistorySchema,
  studentSchema,
  stateSchema,
  type Command,
} from "./model";
import { assertStudentCommandAccess } from "./react";
import { demoRepository, DEMO_STORAGE_KEY } from "./repository";
const profile = () => ({
  ...emptyStudentProfile(),
  code: "IMP001",
  name: "原表学员",
  teacherName: "未建档老师",
  groupName: "学习群",
  orderStatus: "正常",
  status: "在读" as const,
  ageText: "/",
  sourceSequence: "25",
  purchaseDate: "2026-07-01",
  scheduleText: "周一18:00",
  frequencyText: "2*25mins",
  firstLessonDate: "2026-07-02",
  gender: "女",
  personality: "/",
  foreignTeacherExperience: "无",
  renewalStatus: "是",
  legacyComplaints: "0",
  legacyCompensations: "1",
  legacyMissed: "",
  originalTeacher: "原老师",
  firstChangedTeacher: "第一次",
  secondChangedTeacher: "第二次",
  monthlyRecords: [
    {
      id: "m1",
      month: "7月（原表，年份未注明）",
      planned: null,
      actual: 0,
      note: "原表",
    },
  ],
});
describe("student digital profiles", () => {
  it("preserves original fields, blanks and zero through import, history correction and serialization", () => {
    const p = profile();
    const made = transition(createSeed(), {
      type: "student.import",
      students: [p],
      mode: "skip",
    }).data;
    const stored = stateSchema.parse(JSON.parse(JSON.stringify(made)));
    const learner = stored.students.find((student) => student.code === p.code);
    if (!learner) throw new Error("原表学员未导入");
    expect(studentProfileSchema.parse(learner)).toEqual(p);
    expect(learner.age).toBeNull();
    expect(learner.ageText).toBe("/");
    expect(learner.totalUnits).toBeNull();
    expect(learner.balanceKnown).toBe(false);
    const edited = transition(stored, {
      type: "student.details.update",
      id: learner.id,
      patch: { age: 0, ageText: "" },
      expected: { age: learner.age, ageText: learner.ageText },
    }).data;
    const result = transition(edited, {
      type: "student.history.update",
      id: learner.id,
      history: studentHistorySchema.parse({ ...learner, totalUnits: 0 }),
      reason: "核对原表课时为0",
    }).data.students.find((student) => student.id === learner.id);
    expect(result?.age).toBe(0);
    expect(result?.totalUnits).toBe(0);
  });
  it("defaults old JSON without erasing existing data", () => {
    const old: Record<string, unknown> = { ...createSeed().students[1] };
    for (const key of Object.keys(emptyStudentProfile()))
      if (
        ![
          "code",
          "name",
          "chineseName",
          "age",
          "project",
          "channel",
          "owner",
          "phone",
          "status",
          "level",
          "material",
          "unit",
          "teacherId",
          "preferences",
          "goal",
        ].includes(key)
      )
        delete old[key];
    delete old.balanceKnown;
    delete old.teacherChanges;
    const restored = studentSchema.parse(old);
    expect(restored.name).toBe(old.name);
    expect(restored.balance).toBe(old.balance);
    expect(restored.balanceKnown).toBe(true);
    expect(restored.monthlyRecords).toEqual([]);
  });
  it("accepts missing phone but rejects malformed phones and imports atomically", () => {
    const before = createSeed();
    expect(() =>
      transition(before, {
        type: "student.import",
        students: [profile(), { ...profile(), code: "IMP002", phone: "123" }],
        mode: "skip",
      }),
    ).toThrow();
    expect(before.students.some((s) => s.code === "IMP001")).toBe(false);
    expect(() =>
      transition(before, {
        type: "student.import",
        students: [profile(), profile()],
        mode: "skip",
      }),
    ).toThrow(/重复/);
  });
  it("imports unknown teacher names and skips or updates only workbook fields", () => {
    const first = transition(createSeed(), {
      type: "student.import",
      students: [profile()],
      mode: "skip",
    }).data;
    const learner = first.students.at(-1)!;
    expect(learner.teacherName).toBe("未建档老师");
    expect(learner.teacherId).toBe("");
    expect(learner.balanceKnown).toBe(false);
    learner.owner = "原负责人";
    learner.project = "原项目";
    learner.balance = 12;
    learner.balanceKnown = true;
    learner.teacherChanges = [
      {
        id: "h",
        date: "2026-01-01",
        fromTeacher: "A",
        toTeacher: "B",
        reason: "换老师",
      },
    ];
    const changed = {
      ...profile(),
      name: "更新名字",
      phone: "",
      owner: "不要覆盖",
      project: "不要覆盖",
      teacherId: "t1",
      status: "退费" as const,
    };
    expect(
      transition(first, {
        type: "student.import",
        students: [changed],
        mode: "skip",
      }).data.students.at(-1)?.name,
    ).toBe("原表学员");
    const updated = transition(first, {
      type: "student.import",
      students: [changed],
      mode: "update",
    }).data.students.at(-1)!;
    expect(updated.name).toBe("更新名字");
    expect(updated.owner).toBe("原负责人");
    expect(updated.project).toBe("原项目");
    expect(updated.balance).toBe(12);
    expect(updated.status).toBe("在读");
    expect(updated.teacherId).toBe("");
    expect(updated.teacherChanges).toEqual(learner.teacherChanges);
  });
  it("records an opening balance once before credit operations, including confirmed zero", () => {
    const imported = transition(createSeed(), {
      type: "student.import",
      students: [profile()],
      mode: "skip",
    }).data;
    const id = imported.students.at(-1)!.id;
    expect(() =>
      transition(imported, {
        type: "credit.add",
        studentId: id,
        units: 3,
        kind: "购课",
        note: "",
      }),
    ).toThrow(/期初余额/);
    const opened = transition(imported, {
      type: "student.balance.open",
      id,
      balance: 0,
      reason: "核对原账本",
    }).data;
    expect(opened.students.at(-1)?.balanceKnown).toBe(true);
    expect(opened.credits[0].units).toBe(0);
    expect(() =>
      transition(opened, {
        type: "student.balance.open",
        id,
        balance: 2,
        reason: "重复",
      }),
    ).toThrow();
    expect(
      transition(opened, {
        type: "credit.add",
        studentId: id,
        units: 3,
        kind: "购课",
        note: "",
      }).data.students.at(-1)?.balance,
    ).toBe(3);
  });
  it("retains legacy teachers and appends business teacher-change history", () => {
    const before = createSeed();
    before.lessons = [];
    const learner = before.students[0];
    learner.age = null;
    learner.originalTeacher = "原表老师";
    const changed = transition(before, {
      type: "lesson.changeTeacher",
      studentId: learner.id,
      teacherId: "t2",
      from: "2026-11-01",
      reason: "家长申请",
    }).data.students[0];
    expect(changed.originalTeacher).toBe("原表老师");
    expect(changed.teacherChanges).toHaveLength(1);
    expect(changed.teacherChanges[0].reason).toBe("家长申请");
    expect(changed.teacherChanges[0].fromTeacher).toBe(
      before.teachers.find((t) => t.id === learner.teacherId)?.name,
    );
  });
  it("guards business state and teacher relationship from profile bypass", () => {
    const state = createSeed(),
      learner = state.students[0],
      p = studentProfileSchema.parse(learner);
    expect(() =>
      transition(state, {
        type: "student.profile",
        id: learner.id,
        profile: { ...p, status: "停课" },
      }),
    ).toThrow(/停课/);
    expect(() =>
      transition(state, {
        type: "student.profile",
        id: learner.id,
        profile: { ...p, teacherId: "t2" },
      }),
    ).toThrow(/换老师/);
  });
  it("atomically rejects deductions with unknown balances and permits nonfinancial service stop", () => {
    const before = createSeed();
    const pending = before.lessons.filter(
      (item) => item.status === "待确认" && item.attendance === "正常",
    );
    const first = pending[0];
    const unknown = {
      ...first,
      id: "unknown-lesson",
      studentId: before.students[1].id,
    };
    before.lessons.push(unknown);
    before.students[1].balanceKnown = false;
    before.students[1].balance = 0;
    const snapshot = structuredClone(before);
    expect(() =>
      transition(before, {
        type: "lesson.resolve",
        ids: [first.id, unknown.id],
        decision: "扣课",
        reason: "",
      }),
    ).toThrow(/期初余额/);
    expect(before).toEqual(snapshot);
    expect(() =>
      transition(before, {
        type: "lesson.correct",
        id: unknown.id,
        deduct: true,
        reason: "核对",
      }),
    ).toThrow(/期初余额/);
    unknown.deducted = true;
    expect(() =>
      transition(before, {
        type: "lesson.correct",
        id: unknown.id,
        deduct: false,
        reason: "退回",
      }),
    ).toThrow(/期初余额/);
    const stopped = transition(before, {
      type: "student.lifecycle",
      studentId: before.students[1].id,
      status: "退费",
      reason: "申请",
    }).data.students[1];
    expect(stopped).toMatchObject({
      balanceKnown: false,
      balance: 0,
      orderStatus: "退款",
    });
    expect(stopped.serviceStopResults).toHaveLength(4);
    expect(before.students[1].balance).toBe(0);
    expect(before.students[1].status).toBe(snapshot.students[1].status);
  });
  it("rejects undo when the current balance is unknown without partially reverting lessons", () => {
    const state = createSeed();
    const lesson = state.lessons.find(
      (item) => item.status === "待确认" && item.attendance === "正常",
    )!;
    const store = new Map([[DEMO_STORAGE_KEY, JSON.stringify(state)]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    try {
      demoRepository.refresh();
      const action = demoRepository.execute({
        type: "lesson.resolve",
        ids: [lesson.id],
        decision: "扣课",
        reason: "",
      });
      const current = demoRepository.read();
      current.students.find(
        (item) =>
          item.id ===
          current.lessons.find((record) => record.id === lesson.id)?.studentId,
      )!.balanceKnown = false;
      const snapshot = structuredClone(current);
      expect(() => action.undo?.()).toThrow(/期初余额/);
      expect(demoRepository.read()).toEqual(snapshot);
    } finally {
      vi.unstubAllGlobals();
      demoRepository.refresh();
    }
  });
  it("updates only imported months, preserving other months and clearing original blank values", () => {
    const initial = transition(createSeed(), {
      type: "student.import",
      students: [profile()],
      mode: "skip",
    }).data;
    const learner = initial.students.at(-1)!;
    learner.monthlyRecords.push({
      id: "future",
      month: "2026-11",
      planned: 8,
      actual: 2,
      note: "系统登记",
    });
    const incoming = {
      ...profile(),
      monthlyRecords: [
        {
          id: "new-original",
          month: profile().monthlyRecords[0].month,
          planned: null,
          actual: null,
          note: "",
        },
      ],
    };
    const result = transition(initial, {
      type: "student.import",
      students: [incoming],
      mode: "update",
    }).data.students.at(-1)!;
    expect(result.monthlyRecords).toHaveLength(2);
    expect(
      result.monthlyRecords.find((record) => record.month === "2026-11"),
    ).toEqual(learner.monthlyRecords[1]);
    expect(
      result.monthlyRecords.find(
        (record) => record.month === incoming.monthlyRecords[0].month,
      )?.actual,
    ).toBeNull();
  });
  it("matches student codes without case sensitivity for create, profile and import", () => {
    const state = createSeed();
    const learner = state.students[0];
    expect(() =>
      transition(state, {
        type: "student.create",
        student: { ...profile(), code: learner.code.toLowerCase() },
      }),
    ).toThrow(/编号/);
    const other = state.students[1];
    expect(() =>
      transition(state, {
        type: "student.profile",
        id: other.id,
        profile: {
          ...studentProfileSchema.parse(other),
          code: learner.code.toLowerCase(),
        },
      }),
    ).toThrow(/编号/);
    expect(() =>
      transition(state, {
        type: "student.import",
        mode: "update",
        students: [
          profile(),
          { ...profile(), code: profile().code.toLowerCase() },
        ],
      }),
    ).toThrow(/重复/);
    const skipped = transition(state, {
      type: "student.import",
      mode: "skip",
      students: [{ ...profile(), code: learner.code.toLowerCase() }],
    }).data;
    expect(skipped.students).toHaveLength(state.students.length);
    const updated = transition(state, {
      type: "student.import",
      mode: "update",
      students: [
        {
          ...profile(),
          code: learner.code.toLowerCase(),
          teacherName: learner.teacherName,
          teacherId: learner.teacherId,
        },
      ],
    }).data;
    expect(updated.students).toHaveLength(state.students.length);
    expect(updated.students[0].name).toBe(profile().name);
  });
  it("records signed opening balances and applies purchased credits against owed lessons", () => {
    const imported = transition(createSeed(), {
      type: "student.import",
      students: [profile()],
      mode: "skip",
    }).data;
    const id = imported.students.at(-1)!.id;
    expect(() =>
      transition(imported, {
        type: "student.balance.open",
        id,
        balance: Number.NaN,
        reason: "核对欠课",
      }),
    ).toThrow(/有效/);
    const opened = transition(imported, {
      type: "student.balance.open",
      id,
      balance: -3,
      reason: "核对原账本欠课3节",
    }).data;
    expect(opened.students.at(-1)?.balance).toBe(-3);
    expect(opened.students.at(-1)?.balanceKnown).toBe(true);
    expect(opened.credits[0]).toMatchObject({
      type: "期初余额",
      units: -3,
      balance: -3,
      note: "核对原账本欠课3节",
    });
    const paid = transition(opened, {
      type: "credit.add",
      studentId: id,
      units: 5,
      kind: "购课",
      note: "",
    }).data;
    expect(paid.students.at(-1)?.balance).toBe(2);
    expect(paid.credits[0]).toMatchObject({ units: 5, balance: 2 });
  });
  it("requires edit, import and credit permissions for the new actions", () => {
    const commands: Command[] = [
      { type: "student.profile", id: "s1", profile: profile() },
      { type: "student.import", students: [profile()], mode: "skip" },
      { type: "student.balance.open", id: "s1", balance: 0, reason: "核对" },
    ];
    commands.forEach((command, i) => {
      expect(() => assertStudentCommandAccess(command, () => false)).toThrow(
        /权限/,
      );
      expect(() =>
        assertStudentCommandAccess(
          command,
          (p) => p === ["student.edit", "student.import", "credit.add"][i],
        ),
      ).not.toThrow();
    });
  });
  it("reads original stored students without resetting the repository", () => {
    const old = createSeed();
    const raw = JSON.parse(JSON.stringify(old));
    delete raw.students[0].groupName;
    delete raw.students[0].balanceKnown;
    raw.students[0].name = "旧档案保留";
    const store = new Map([[DEMO_STORAGE_KEY, JSON.stringify(raw)]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) || null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    expect(demoRepository.refresh().students[0].name).toBe("旧档案保留");
    expect(demoRepository.read().students[0].balanceKnown).toBe(true);
    vi.unstubAllGlobals();
    demoRepository.refresh();
  });
});
