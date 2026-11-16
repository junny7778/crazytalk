import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSeed, transition, studentOrganization } from "@crazytalk/shared";
import { readStudentWorkbook } from "./studentWorkbook";
it("真实新版学生信息表保留全部学员行、空值与历史原答，重复导入不重发 ID", async () => {
  const bytes = await readFile(
    new URL("../../../../../docs/新材料/学生信息表.xlsx", import.meta.url),
  );
  const seed = createSeed(),
    { rows } = await readStudentWorkbook(Uint8Array.from(bytes).buffer, seed);
  expect(rows).toHaveLength(3167);
  const cmd = {
    type: "student.import" as const,
    mode: "skip" as const,
    students: rows,
  };
  const result = transition(seed, cmd).data;
  const roster = result.students.filter((s) => s.roster);
  expect(new Set(roster.map((s) => s.id)).size).toBe(3167);
  const teams = roster.reduce(
    (counts, s) => {
      const team = studentOrganization(result.accounts, s.owner, s.roster).team;
      counts[team] = (counts[team] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  expect(teams).toEqual({ A队: 2816, B队: 348, 待分配: 3 });
  expect(
    roster.every((s) => s.balanceKnown === false && s.purchaseDate === ""),
  ).toBe(true);
  expect(transition(result, cmd).data.students.map((s) => s.id)).toEqual(
    result.students.map((s) => s.id),
  );
}, 60000);
