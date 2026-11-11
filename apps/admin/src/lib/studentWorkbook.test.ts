import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Workbook } from "exceljs";
import { createSeed, emptyStudentProfile, transition } from "@crazytalk/shared";
import {
  originalStudentMonth,
  readStudentWorkbook,
  studentWorkbookHeaders,
  studentWorkbookRow,
} from "./studentWorkbook";

const source = new URL(
  "../../../../../docs/学生课程信息表.xlsx",
  import.meta.url,
);
function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}
async function workbook(headers: string[], rows: (string | number)[][]) {
  const book = new Workbook();
  const sheet = book.addWorksheet("学生课程信息");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return arrayBuffer(new Uint8Array(await book.xlsx.writeBuffer()));
}

describe("学生课程信息表导入导出", () => {
  it("原表七月两格留空会清空旧七月，保留系统新增月份", async () => {
    const data = createSeed();
    const student = data.students[0];
    student.monthlyRecords = [
      {
        id: "old",
        month: originalStudentMonth,
        planned: 8,
        actual: 6,
        note: "旧原表",
      },
      { id: "nov", month: "2026-11", planned: 10, actual: 2, note: "后续月份" },
    ];
    const profile = {
      ...emptyStudentProfile(),
      id: student.id,
      code: student.code,
      name: student.name,
      groupName: student.groupName,
      teacherName: student.teacherName,
    };
    const imported = await readStudentWorkbook(
      await workbook(studentWorkbookHeaders, [studentWorkbookRow(profile)]),
      data,
    );
    expect(imported.rows[0].monthlyRecords).toEqual([
      {
        id: "original-2",
        month: originalStudentMonth,
        planned: null,
        actual: null,
        note: "",
      },
    ]);
    const updated = transition(data, {
      type: "student.import",
      students: imported.rows,
      mode: "update",
    }).data.students.find((record) => record.id === student.id);
    expect(updated?.monthlyRecords).toEqual([
      { id: "nov", month: "2026-11", planned: 10, actual: 2, note: "后续月份" },
      {
        id: "original-2",
        month: originalStudentMonth,
        planned: null,
        actual: null,
        note: "",
      },
    ]);
  });
  it("按真实两行表头读取 55 位学员，跳过仅序号行，保留 27 个字段", async () => {
    const result = await readStudentWorkbook(
      arrayBuffer(await readFile(source)),
      createSeed(),
    );
    expect(result.rows).toHaveLength(55);
    expect(result.skipped).toBe(2);
    expect(result.rows.every((row) => row.phone === "")).toBe(true);
    expect(result.rows[0]).toMatchObject({
      code: "",
      name: "Victor",
      sourceSequence: "1",
      channel: "许老师",
      orderStatus: "正常",
      status: "在读",
      purchaseDate: "2026-04-28",
      totalUnits: 100,
      teacherName: "Marlah",
      material: "Power up 4",
      age: 12,
      gender: "男",
      personality: "开朗活泼",
      foreignTeacherExperience: "无",
    });
    expect(result.rows[0].monthlyRecords[0]).toMatchObject({
      month: originalStudentMonth,
      planned: 18,
      actual: 16,
    });
    expect(result.rows.find((row) => row.name === "Sky Jr")).toMatchObject({
      code: "",
      originalTeacher: "Criz",
      firstChangedTeacher: "Feonah",
    });
    expect(result.rows.find((row) => row.name === "Yusanda")?.code).toBe("");
    expect(result.rows.some((row) => row.legacyComplaints === "/")).toBe(true);
    expect(result.rows.filter((row) => row.ageText === "/")).toHaveLength(2);
    expect(
      result.rows
        .filter((row) => row.ageText === "/")
        .every((row) => row.age === null),
    ).toBe(true);
    expect(result.rows.filter((row) => row.status === "退费")).toHaveLength(4);
    expect(result.rows.at(-1)?.name).toBe("Richard");
  });

  it("完整导出原表 27 列后可复读，不用当前月份替代原表七月", async () => {
    const original = await readStudentWorkbook(
      arrayBuffer(await readFile(source)),
      createSeed(),
    );
    original.rows[0].monthlyRecords.push({
      id: "new",
      month: "2026-11",
      planned: 99,
      actual: 88,
      note: "新记录",
    });
    const exported = original.rows.map((row) => studentWorkbookRow(row));
    const reread = await readStudentWorkbook(
      await workbook(studentWorkbookHeaders, exported),
      createSeed(),
    );
    expect(reread.rows).toHaveLength(55);
    expect(reread.rows.map((row) => studentWorkbookRow(row))).toEqual(exported);
    expect(reread.rows[0].monthlyRecords[0].actual).toBe(16);
  });

  it("按名称匹配重排表头，保留零和空值，未知编号不自动编造", async () => {
    const profile = {
      ...emptyStudentProfile(),
      name: "Sky Jr",
      groupName: "尚未编号的群",
      teacherName: "Unknown teacher",
      age: null,
      legacyComplaints: "0",
      legacyCompensations: "/",
      totalUnits: 0,
      monthlyRecords: [
        {
          id: "m",
          month: originalStudentMonth,
          planned: 0,
          actual: null,
          note: "",
        },
      ],
    };
    const result = await readStudentWorkbook(
      await workbook([...studentWorkbookHeaders].reverse(), [
        studentWorkbookRow(profile).reverse(),
      ]),
      createSeed(),
    );
    expect(result.rows[0]).toMatchObject({
      code: "",
      name: "Sky Jr",
      age: null,
      totalUnits: 0,
      phone: "",
      teacherName: "Unknown teacher",
      teacherId: "",
      legacyComplaints: "0",
      legacyCompensations: "/",
    });
    expect(result.rows[0].monthlyRecords[0]).toMatchObject({
      planned: 0,
      actual: null,
    });
    expect(result.warnings.some((warning) => warning.includes("编号"))).toBe(
      false,
    );
  });

  it("拒绝误用两列姓名手机文件，阻止缺列静默丢失", async () => {
    await expect(
      readStudentWorkbook(
        await workbook(["姓名", "手机号"], [["Lucy", "13812345678"]]),
        createSeed(),
      ),
    ).rejects.toThrow("无法识别表头");
  });
});
