import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createSeed, transition, studentOrganization, type StudentProfileInput } from "@crazytalk/shared";
import { readStudentWorkbook } from "./studentWorkbook";

function demoRosterRows(rows: StudentProfileInput[]): StudentProfileInput[] {
  const groups = new Map<string, number>();
  return rows.map((row, i) => {
    const members = Number.parseInt(row.roster!.fields["套餐共用"], 10);
    const status = row.orderStatus.startsWith("请假") ? "停课" : row.status;
    const closed = status === "退费" || status === "结课";
    const group = `${status}-${members}`;
    const count = groups.get(group) ?? 0;
    groups.set(group, count + 1);
    const index = members > 1 ? Math.floor(count / members) : i;
    return {
      ...row, status, orderStatus: status,
      openingGroup: members > 1 ? `demo-${group}-${index}` : undefined,
      openingBalance: closed ? 0 : [24, 36, 0, 12, 48, 16, 20, 8, 6, 30, 24, 18][index % 12],
    };
  });
}
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
  expect(() => transition(seed, cmd)).toThrow("剩余课时");
  cmd.students = demoRosterRows(rows);
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
    roster.every((s) => s.balance >= 0 && s.purchaseDate === ""),
  ).toBe(true);
  expect(transition(result, cmd).data.students.map((s) => s.id)).toEqual(
    result.students.map((s) => s.id),
  );
}, 60000);
