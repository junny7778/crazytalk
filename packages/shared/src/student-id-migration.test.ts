// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeed } from "./seed";
import { emptyStudentProfile } from "./model";
import { transition } from "./domain";
import { migrateStudentIds } from "./studentIds";
import {
  demoRepository,
  DEMO_STORAGE_KEY,
  STUDENT_ID_BACKUP_KEY,
} from "./repository";

function fixture() {
  let data = createSeed();
  data = transition(data, {
    type: "student.lifecycle",
    studentId: "s1",
    status: "退费",
    reason: "历史退费",
    simulateFailure: true,
  }).data;
  data = transition(data, {
    type: "referral.add",
    studentId: "s1",
    referrerStudentId: "s2",
    date: "2026-10-20",
    note: "老带新",
  }).data;
  data = transition(data, {
    type: "credit.add",
    studentId: "s2",
    kind: "赠送",
    units: 2,
    note: "介绍奖励",
    referralId: data.referrals[0].id,
  }).data;
  data = transition(data, {
    type: "student.create",
    student: { ...emptyStudentProfile(), name: "已是八位ID" },
  }).data;
  data.events.push({
    id: "student-link",
    studentId: "s1",
    teacherId: "",
    relatedType: "student",
    relatedId: "s2",
    date: "2026-10-20",
    operator: "Rita",
    type: "关联",
    content: "保留原文s1",
  });
  data.reports.push({
    id: "progress",
    lessonId: data.lessons[0].id,
    studentId: "s1",
    teacherId: data.lessons[0].teacherId,
    date: "2026-10-20",
    material: "Book",
    from: "1",
    to: "2",
    rating: 0,
    comment: "",
    suggestedLevel: "",
  });
  return data;
}

beforeEach(() => {
  localStorage.clear();
  demoRepository.reset();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  demoRepository.refresh();
});

describe("已有学员ID迁移", () => {
  it("全量改为八位并保留已有效ID，每类关联均指向原学员，其他字段完全一致", () => {
    const before = fixture();
    const snapshot = structuredClone(before);
    const { data, changed } = migrateStudentIds(before);
    expect(changed).toBe(true);
    expect(before).toEqual(snapshot);
    expect(new Set(data.students.map((student) => student.id)).size).toBe(
      before.students.length,
    );
    for (let i = 0; i < data.students.length; i++) {
      const { id } = data.students[i];
      expect(id).toMatch(/^\d{8}$/);
    }
    const mapping = new Map(
      before.students.map((student, i) => [student.id, data.students[i].id]),
    );
    before.students.forEach((student, i) =>
      expect({ ...data.students[i], id: student.id }).toEqual(student),
    );
    expect(
      data.students.find((student) => student.name === "已是八位ID")?.id,
    ).toBe(before.students[0].id);
    for (const key of [
      "lessons",
      "feedback",
      "credits",
      "reports",
      "tasks",
      "referrals",
      "events",
    ] as const) {
      expect(data[key]).toHaveLength(before[key].length);
      before[key].forEach((record, i) => {
        const updated = data[key][i];
        expect(updated.studentId).toBe(
          mapping.get(record.studentId) ?? record.studentId,
        );
        const restored = { ...updated, studentId: record.studentId };
        if ("referrerStudentId" in restored && "referrerStudentId" in record)
          restored.referrerStudentId = record.referrerStudentId;
        if ("sourceId" in restored && "sourceId" in record)
          restored.sourceId = record.sourceId;
        if ("relatedId" in restored && "relatedId" in record)
          restored.relatedId = record.relatedId;
        expect(restored).toEqual(record);
      });
    }
    expect(data.referrals[0].referrerStudentId).toBe(mapping.get("s2"));
    expect(
      data.tasks.find((task) => task.sourceType === "student")?.sourceId,
    ).toContain(`refund:${mapping.get("s1")}:`);
    expect(
      data.events.find((event) => event.id === "student-link")?.relatedId,
    ).toBe(mapping.get("s2"));
    for (const key of [
      "teachers",
      "actions",
      "payroll",
      "rules",
      "catalog",
      "accounts",
      "leaves",
      "roles",
    ] as const)
      expect(data[key]).toEqual(before[key]);
    expect(migrateStudentIds(data)).toEqual({ data, changed: false });
  });

  it("读取时自动备份并持久保存，刷新不再编号，旧ID操作仍关联原学员", () => {
    const before = fixture();
    const raw = JSON.stringify(before);
    localStorage.setItem(DEMO_STORAGE_KEY, raw);
    const migrated = demoRepository.refresh();
    expect(localStorage.getItem(STUDENT_ID_BACKUP_KEY)).toBe(raw);
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!)).toEqual(
      migrated,
    );
    expect(demoRepository.refresh()).toEqual(migrated);
    const learner = migrated.students.find(
      (student) =>
        student.name ===
        before.students.find((student) => student.id === "s2")?.name,
    );
    if (!learner) throw new Error("学员丢失");
    const credited = demoRepository.execute({
      type: "credit.add",
      studentId: "s2",
      kind: "充值",
      units: 3,
      note: "迁移后充值",
    }).data;
    expect(
      credited.students.find((student) => student.id === learner.id)?.balance,
    ).toBe(learner.balance + 3);
    expect(credited.credits[0].studentId).toBe(learner.id);
  });

  it("持久化失败保留原数据与备份，不回退或重置演示数据", () => {
    const raw = JSON.stringify(fixture());
    localStorage.setItem(DEMO_STORAGE_KEY, raw);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === DEMO_STORAGE_KEY) throw new Error("quota");
      original.call(this, key, value);
    });
    expect(() => demoRepository.refresh()).toThrow(/原始资料未删除/);
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe(raw);
    expect(localStorage.getItem(STUDENT_ID_BACKUP_KEY)).toBe(raw);
  });

  it("重复旧ID会阻止迁移，不猜测或破坏关联", () => {
    const data = createSeed();
    data.students[1].id = data.students[0].id;
    const before = structuredClone(data);
    expect(() => migrateStudentIds(data)).toThrow(/重复/);
    expect(data).toEqual(before);
    data.students[1].id = "s2";
    data.students[0].id = "";
    expect(() => migrateStudentIds(data)).toThrow(/为空/);
  });
});
