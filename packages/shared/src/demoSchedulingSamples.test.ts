// @vitest-environment jsdom
import { expect, it } from "vitest";
import { demoRepository } from "./repository";
import { addDays, DEMO_TODAY, stateSchema } from "./model";
import { isAvailable } from "./domain";
import { getScheduleCredits } from "./scheduleCredits";
import { studentMaterials } from "./materials";
import { withDemoSchedulingSamples } from "./demoSchedulingSamples";
import { schedulingBookingIssue } from "./schedulingAccounts";

it("demo 启动后可从 Micha 为有余额的学员排课，刷新后保留且不重复", () => {
  demoRepository.reset();
  demoRepository.initializeDemoSamples();
  const data = demoRepository.read();
  const micha = data.teachers.find(t => t.name === "T. Micha")!;
  const orders = data.orders!.filter(o => o.id.startsWith("demo-schedule-order-"));
  expect(orders).toHaveLength(11);
  expect(stateSchema.safeParse(data).success).toBe(true);
  for (const order of orders) {
    const id = order.studentIds[0];
    const learner = data.students.find(s => s.id === id)!;
    expect(Boolean(schedulingBookingIssue(data, id, [micha.id]))).toBe(learner.englishName === "Ivy");
    expect(studentMaterials(data, learner).length === 0).toBe(learner.englishName === "Max");
    expect(getScheduleCredits(data, id, 4, 1).error).toBe("");
  }
  expect(data.lessons.some(l => orders.some(o => o.id === l.orderId))).toBe(true);
  const student = data.students.find(s => s.id === orders[0].studentIds[0])!;
  const dates = Array.from({length:14}, (_, i) => addDays(DEMO_TODAY, i + 1));
  const date = dates.find(d => !isAvailable(data, micha.id, d, "19:30", 25, student.id).length)!;
  demoRepository.execute({type:"lesson.schedule", schedulingMode:"flex", kind:"临时课", studentId:student.id,
    teacherId:micha.id, slots:[{date, time:"19:30"}], duration:25, material:student.material});
  demoRepository.refresh();
  demoRepository.initializeDemoSamples();
  const after = demoRepository.read();
  expect(after.students.length).toBe(data.students.length);
  expect(after.lessons.find(l => l.studentId === student.id && l.teacherId === micha.id && l.date === date && l.time === "19:30")?.orderId).toBe(orders[0].id);
});

it("多数在职老师和在读、待排学员有可用的排课组合，保留单项缺失样例", () => {
  demoRepository.reset();
  demoRepository.initializeDemoSamples();
  const data = demoRepository.read();
  const teachers = data.teachers.filter(t => t.status === "在职");
  const learners = data.students.filter(s => ["在读", "待排课"].includes(s.status));
  const readyTeachers = teachers.filter(t => t.classInUid && t.availability.length && t.materialIds?.length);
  expect(readyTeachers).toHaveLength(8);
  expect(data.teachers.find(t => t.name === "T. Nora")).toMatchObject({status: "已离职", payMode: "OP", payrollEndDate: "2026-10-31"});
  expect(teachers.find(t => t.name === "T. Theo")).toMatchObject({classInUid: expect.any(String), materialIds: []});
  for (const learner of data.students) {
    const {balance, reserved} = getScheduleCredits(data, learner.id, 1, 1);
    expect(reserved, learner.name).toBeLessThanOrEqual(balance);
  }
  const ready = learners.filter(s => !schedulingBookingIssue(data, s.id) &&
    !getScheduleCredits(data, s.id, 1, 1).error &&
    studentMaterials(data, s).some(c => readyTeachers.some(t => t.materialIds?.includes(c.id))));
  expect(ready.length).toBeGreaterThan(learners.length / 2);
});

it("已有旧版样例的 demo 只补新场景，刷新保留后续编辑", () => {
  demoRepository.reset();
  const before = demoRepository.read();
  before.importedBatches = ["demo-scheduling-samples-v1"];
  const migrated = withDemoSchedulingSamples(before);
  expect(migrated.students.length - before.students.length).toBe(2);
  expect(migrated.teachers.length - before.teachers.length).toBe(2);
  migrated.teachers.find(t => t.name === "T. Theo")!.materialIds = ["m0"];
  expect(withDemoSchedulingSamples(migrated)).toBe(migrated);
});

it("过去的完课各有一次扣课，同一师生的课表时间不重叠，未来课程保留预约", () => {
  demoRepository.reset();
  demoRepository.initializeDemoSamples();
  const data = demoRepository.read();
  const courses = data.lessons.filter(l => l.status !== "已取消");
  for (const [i, lesson] of courses.entries()) {
    const start = Date.parse(lesson.date + "T" + lesson.time + ":00+08:00");
    for (const other of courses.slice(i + 1).filter(l => l.date === lesson.date &&
      (l.teacherId === lesson.teacherId || l.studentId === lesson.studentId))) {
      const otherStart = Date.parse(other.date + "T" + other.time + ":00+08:00");
      expect(start + lesson.duration * 60000 <= otherStart ||
        otherStart + other.duration * 60000 <= start, lesson.id + "/" + other.id).toBe(true);
    }
    if (lesson.deducted) {
      expect(data.credits.filter(c => c.lessonId === lesson.id && c.type === "上课扣课")
        .map(c => c.units), lesson.id).toEqual([-lesson.confirmedUnits!]);
    }
    if (lesson.date > "2026-10-31") expect(lesson.status).toBe("未开始");
  }
});
