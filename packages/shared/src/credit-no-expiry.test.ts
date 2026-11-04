// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createSeed } from "./seed";
import { stateSchema } from "./model";
import { transition } from "./domain";
import { migrateStudentIds } from "./studentIds";
it("old saved expiry fields are discarded without losing balances or records", async () => {
  const seed = createSeed();
  const legacy = {
    ...seed,
    students: seed.students.map((student) => ({
      ...student,
      expires: "2000-01-01",
    })),
    rules: { ...seed.rules, expireDays: 30 },
  };
  const parsed = stateSchema.parse(legacy);
  expect(parsed.students).toEqual(seed.students);
  expect(parsed.rules).toEqual(seed.rules);
  localStorage.clear();
  localStorage.setItem("crazytalk-demo-v1", JSON.stringify(legacy));
  vi.resetModules();
  const { demoRepository } = await import("./repository");
  const restored = demoRepository.read();
  expect(restored.students[0]).not.toHaveProperty("expires");
  expect(restored.rules).not.toHaveProperty("expireDays");
  const expected = migrateStudentIds(seed).data;
  expect(restored.credits).toEqual(expected.credits);
  expect(restored.lessons).toEqual(expected.lessons);
  expect(restored.students.map((student) => student.balance)).toEqual(
    seed.students.map((student) => student.balance),
  );
  localStorage.clear();
});
it("adding credits requires no expiry and retains credit amount and business date", () => {
  const before = createSeed();
  const student = before.students[0];
  const { data } = transition(before, {
    type: "credit.add",
    studentId: student.id,
    units: 12,
    kind: "续费",
    note: "已核对",
    date: "2026-10-28",
    amount: 600,
  });
  expect(data.students[0].balance).toBe(student.balance + 12);
  expect(data.students[0]).not.toHaveProperty("expires");
  expect(data.credits[0]).toMatchObject({
    units: 12,
    amount: 600,
    date: "2026-10-28",
  });
});
