import type { Teacher } from "./model";

export function newTeacherNumber(teachers: Teacher[]): string {
  const used = new Set(teachers.map(t => t.teacherNumber));
  let number: string;
  do {
    number = String(10000000 + crypto.getRandomValues(new Uint32Array(1))[0] % 90000000);
  } while (used.has(number));
  return number;
}

export function initializeTeacherNumbers(state: {teachers: Teacher[]}): boolean {
  let changed = false;
  for (const teacher of state.teachers) {
    if (teacher.teacherNumber) continue;
    teacher.teacherNumber = newTeacherNumber(state.teachers);
    changed = true;
  }
  return changed;
}
