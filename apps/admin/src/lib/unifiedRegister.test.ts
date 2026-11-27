import { it, expect } from "vitest";
import { Workbook } from "exceljs";
import {
  createSeed,
  transition,
  emptyStudentProfile,
  DEMO_TODAY,
  organizationView,
  type Command,
} from "@crazytalk/shared";
import { migrateStudentIds } from "../../../../packages/shared/src/studentIds";
import { rosterValues, rosterHeaders } from "./customerRoster";
import { readStudentWorkbook } from "./studentWorkbook";
import { bookingSummary } from "./dashboard";

it("B队新增学员、共享订单、50分钟课、反馈与改名导出回导使用同一ID", async () => {
  let data = migrateStudentIds(createSeed()).data;
  const owner = data.accounts.find(a => a.name === "Roma")!;
  owner.classInUid = "98009001";
  data.teachers[0].classInUid = "98009002";
  const run = (cmd: Command) => {
    data = transition(data, cmd).data;
  };
  const bookEntry = data.catalog.find(c => c.type === "教材" && c.enabled)!;
  data.teachers[0].materialIds = [bookEntry.id];
  const profile = {
    ...emptyStudentProfile(),
    material: bookEntry.name,
    materialIds: [bookEntry.id],
    name: "同名",
    chineseName: "同名",
    owner: "Roma",
    ownerAccountId: owner.id,
  };
  await run({ type: "student.create", student: profile });
  const id = data.students[0].id;
  await run({ type: "student.create", student: profile });
  const sibling = data.students[0].id;
  expect(id).not.toBe(sibling);
  await run({
    type: "student.bindClassIn",
    id,
    phone: "13800001111",
    uid: "99911",
  });
  await run({
    type: "student.bindClassIn",
    id: sibling,
    phone: "13800001111",
    uid: "99911",
  });
  const t = data.teachers[0],
    material = bookEntry.name;
  await run({
    type: "order.buy",
    id: "family",
    studentId: id,
    studentIds: [id, sibling],
    units: 72,
    date: DEMO_TODAY,
    kind: "新购",
    note: "",
  });
  await run({
    type: "lesson.schedule",
    studentId: id,
    teacherId: t.id,
    kind: "固定课",
    slots: [{ date: DEMO_TODAY, time: "11:00" }],
    duration: 50,
    material,
    confirmedTeacher: true,
  });
  const lesson = data.lessons.at(-1)!;
  const report: Command = {
    type: "report.save",
    report: {
      studentId: id,
      teacherId: t.id,
      lessonId: lesson.id,
      date: DEMO_TODAY,
      material,
      from: "1",
      to: "2",
      rating: 5,
      comment: "",
      suggestedLevel: "",
      screenshot: "data:image/png;base64,iVBORw0KGgo=",
    },
  };
  await run(report);
  await run(report);
  expect(data.orders!.find((o) => o.id === "family")?.balance).toBe(70);
  await run({
    type: "feedback.create",
    feedback: {
      studentId: id,
      teacherId: t.id,
      lessonId: lesson.id,
      category: "教学表扬",
      rating: "好评",
      content: "讲解清楚",
    },
  });
  const scoped = organizationView(
    data,
    new URLSearchParams({
      team: "B队",
      group: "一组",
      sourceRoster: "customer",
    }),
  );
  expect(scoped.feedback.some((f) => f.lessonId === lesson.id)).toBe(true);
  expect(
    bookingSummary(
      scoped.lessons.filter((l) => l.studentId === id),
      DEMO_TODAY,
      DEMO_TODAY,
    ).completed,
  ).toBe(1);
  expect(
    organizationView(data, new URLSearchParams({ team: "A队" })).lessons.some(
      (l) => l.id === lesson.id,
    ),
  ).toBe(false);
  await run({
    type: "student.details.update",
    id,
    expected: { chineseName: "同名" },
    patch: { chineseName: "改名后" },
  });
  const student = data.students.find((s) => s.id === id)!;
  const values = rosterValues(student, data);
  const book = new Workbook(),
    sheet = book.addWorksheet("学生信息表");
  sheet.addRow(["学员ID", ...rosterHeaders]);
  sheet.addRow([id, ...rosterHeaders.map((h) => values[h] ?? "")]);
  const { rows } = await readStudentWorkbook(
    new Uint8Array(await book.xlsx.writeBuffer()).buffer,
    data,
  );
  expect(rows[0]).toMatchObject({ name: "改名后", importStudentId: id });
  const count = data.students.length;
  await run({ type: "student.import", mode: "update", students: rows });
  expect(data.students.length).toBe(count);
  expect(data.students.find((s) => s.id === sibling)?.name).toBe("同名");
});
