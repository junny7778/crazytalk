import { it, expect } from "vitest";
import { Workbook } from "exceljs";
import { createSeed } from "@crazytalk/shared";
import { readStudentWorkbook } from "./studentWorkbook";
it("拒绝旧版字段布局和缺失业务列的文件", async () => {
  const book = new Workbook();
  book.addWorksheet("学员").addRow(["学员ID","学生群名","学生名字","手机号码"]);
  await expect(readStudentWorkbook(new Uint8Array(await book.xlsx.writeBuffer()).buffer, createSeed())).rejects.toThrow("下载当前模板");
});

import { emptyStudentProfile, splitRosterName, transition } from "@crazytalk/shared";
import { parseCustomerRoster, rosterHeaders } from "./customerRoster";

it("从原表拆分中英文名，保留原文与同一行的多个姓名", () => {
  for (const [raw, chineseName, englishName] of [
    ["Ma高展豪 CT10001 Jensen", "高展豪", "Jensen"],
    ["文千钰10782CTCandy", "文千钰", "Candy"],
    ["罗丁力", "罗丁力", ""], ["Ba周翊扬 CT", "周翊扬", ""],
    ["郑煜炜 CT10103 Wency 郑佳钰CT10277 Angel", "郑煜炜 郑佳钰", "Wency / Angel"],
  ]) expect(splitRosterName(raw)).toEqual({chineseName, englishName});
  const sheet = new Workbook().addWorksheet("学生");
  sheet.addRow([]); sheet.addRow(rosterHeaders);
  sheet.addRow(rosterHeaders.map(h => h === "学生" ? "Ma高展豪 CT10001 Jensen" : ""));
  const row = parseCustomerRoster(sheet, createSeed())!.rows[0];
  expect(row).toMatchObject({name:"高展豪", chineseName:"高展豪", englishName:"Jensen", roster:{fields:{学生:"Ma高展豪 CT10001 Jensen"}}});
});

it("新建使用中文名，单填英文名会被拒绝", () => {
  const student = {...emptyStudentProfile(), englishName:"Jensen"};
  expect(() => transition(createSeed(), {type:"student.create", student})).toThrow("请填写学生中文名");
  const created = transition(createSeed(), {type:"student.create", student:{...student, englishName:"", chineseName:"高展豪"}}).data.students[0];
  expect(created).toMatchObject({name:"高展豪", chineseName:"高展豪", englishName:""});
});
