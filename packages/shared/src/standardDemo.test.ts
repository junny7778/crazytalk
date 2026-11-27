// @vitest-environment jsdom
import { expect, it } from "vitest";
import { configureDemoClock } from "./clock";
import { demoRepository } from "./repository";

it("opens the small standard roster separately from the old demo, retains edits on refresh and restores the same sample", () => {
  configureDemoClock();
  localStorage.setItem("crazytalk-demo-v1", "previous demo");
  demoRepository.initializeDemoSamples();
  const initial = demoRepository.read();
  const people = (data: typeof initial) => ({
    students: data.students.map(s => [s.id, s.name]),
    teachers: data.teachers.map(t => [t.id, t.name, t.status]),
  });
  const expected = people(initial);
  expect(expected.students).toHaveLength(36);
  expect(new Set(initial.students.map(s => s.name)).size).toBe(36);
  expect(expected.teachers).toHaveLength(10);
  const lesson = initial.lessons[0];
  const mark = "已核对本期明细";
  demoRepository.execute({ type: "student.edit", id: lesson.studentId, patch: { goal: mark } });
  demoRepository.refresh();
  demoRepository.initializeDemoSamples();
  expect(demoRepository.read().students.some(s => s.goal === mark)).toBe(true);
  demoRepository.restoreStandardDemo();
  expect(people(demoRepository.read())).toEqual(expected);
  expect(demoRepository.read().students.some(s => s.goal === mark)).toBe(false);
  expect(localStorage.getItem("crazytalk-demo-v1")).toBe("previous demo");
});
