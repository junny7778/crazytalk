import { describe, expect, it } from "vitest";
import { transition } from "./domain";
import { emptyStudentProfile, stateSchema } from "./model";
import { createSeed } from "./seed";

const profile = (name: string) => ({
  ...emptyStudentProfile(),
  name,
  groupName: `${name}学习群`,
});

describe("八位数字学员ID", () => {
  it("新建时自动生成八位ID，连续建档不重复且不更改旧档案", () => {
    const before = createSeed();
    const first = transition(before, {
      type: "student.create",
      student: profile("第一位"),
    }).data;
    expect(first.students[0].id).toBe("10000001");
    const second = transition(first, {
      type: "student.create",
      student: profile("第二位"),
    }).data;
    expect(second.students[0].id).toBe("10000002");
    expect(second.students[1].id).toBe("10000001");
    expect(second.students.slice(2)).toEqual(before.students);
    expect(new Set(second.students.map((student) => student.id)).size).toBe(
      second.students.length,
    );
  });

  it("导入新学员同样跳过已占用ID，更新与重新读取时保持原ID和关联", () => {
    const before = transition(createSeed(), {
      type: "student.create",
      student: profile("已有学员"),
    }).data;
    const imported = transition(before, {
      type: "student.import",
      students: [profile("导入甲"), profile("导入乙")],
      mode: "skip",
    }).data;
    const learner = imported.students.find(
      (student) => student.name === "导入甲",
    );
    expect(learner?.id).toBe("10000002");
    expect(
      imported.students.find((student) => student.name === "导入乙")?.id,
    ).toBe("10000003");
    if (!learner) throw new Error("未导入学员");
    const credited = transition(imported, {
      type: "student.balance.open",
      id: learner.id,
      balance: 10,
      reason: "核对余额",
    }).data;
    const updated = transition(credited, {
      type: "student.import",
      students: [{ ...profile("导入甲"), material: "新教材" }],
      mode: "update",
    }).data;
    const restored = stateSchema.parse(JSON.parse(JSON.stringify(updated)));
    expect(
      restored.students.find((student) => student.name === "导入甲"),
    ).toMatchObject({ id: learner.id, material: "新教材" });
    expect(restored.students).toHaveLength(imported.students.length);
    expect(
      restored.credits.find((credit) => credit.studentId === learner.id),
    ).toMatchObject({ units: 10 });
  });
});
