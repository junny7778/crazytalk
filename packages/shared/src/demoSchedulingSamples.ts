import { addDays, DEMO_TODAY, emptyStudentProfile, studentSchema, type DemoState } from "./model";
import { nextStudentId } from "./studentIds";
import { newTeacherNumber } from "./teacherNumbers";
import { studentMaterials } from "./materials";
import { isAvailable } from "./domain";

const previousBatch = "demo-scheduling-samples-v1";
const secondBatch = "demo-scheduling-samples-v2";
const batch = "demo-scheduling-samples-v3";
const learners = [
  ["沈书言", "Evan", 8, 24], ["陆星遥", "Stella", 7, 36],
  ["周知行", "Owen", 11, 48], ["许嘉禾", "Grace", 9, 24],
  ["苏以宁", "Nina", 8, 12], ["程乐川", "Leo", 13, 36],
  ["林夏初", "Summer", 7, 16], ["方予安", "Ryan", 10, 32],
  ["陈若溪", "Iris", 12, 24], ["许清越", "Ivy", 9, 24], ["顾明朗", "Max", 10, 24],
] as const;

export function withDemoSchedulingSamples(before: DemoState): DemoState {
  if (before.importedBatches?.includes(batch)) return before;
  const data = structuredClone(before);
  (data.importedBatches ??= []).push(batch);
  data.revision++;

  const accounts = data.classInAccounts ??= [];
  for (const pack of data.orders ?? []) {
    if (!pack.openingGroup?.startsWith("demo-") || pack.studentIds.length < 2 || pack.classInAccountId) continue;
    if (accounts.some(a => a.studentIds.some(id => pack.studentIds.includes(id)))) continue;
    const member = pack.studentIds[0];
    pack.classInAccountId = "demo-household-" + member;
    accounts.push({id: pack.classInAccountId, uid:"99" + member, phone: member + "@demo.example", studentIds:[...pack.studentIds]});
  }
  if (before.importedBatches?.includes(secondBatch)) return data;

  const teachers = data.teachers.filter(t => /^t[1-8]$/.test(t.id) && t.status === "在职");
  const books = data.catalog.filter(c => c.type === "教材" && c.enabled);
  for (const teacher of teachers) {
    if (!teacher.classInUid && !teacher.classInAccount) {
      teacher.classInUid = "9800010" + teacher.id.slice(1);
      teacher.classInAccount = teacher.id + "@demo.example";
    }
    teacher.materialIds ??= books.map(c => c.id);
    if ((teacher.id === "t7" || teacher.id === "t8") && !teacher.availability.length) {
      const days = teacher.id === "t7" ? [1, 2, 3, 4, 0] : [2, 4, 6];
      teacher.availability = days.map(day => ({day, start: "18:00", end: "22:00"}));
      teacher.availabilitySource = "entered";
      teacher.availabilityNote = "演示排课时段";
    }
  }
  const owners = data.accounts.filter(a => ["u2", "u3"].includes(a.id) && a.enabled);
  for (const owner of owners) {
    if (!owner.classInUid && !owner.classInAccount) {
      owner.classInUid = "9800020" + owner.id.slice(1);
      owner.classInAccount = owner.id + "@demo.example";
    }
  }
  const availableOwners = owners.filter(a => a.classInUid);
  if (!availableOwners.length || !books.length) return data;

  for (const [id, name, hasAccount] of [
    ["demo-tutor-nora", "T. Nora", false], ["demo-tutor-theo", "T. Theo", true],
  ] as const) {
    data.teachers.push({
      id, name, teacherNumber: newTeacherNumber(data.teachers), so: "BigBrains",
      ...(id === "demo-tutor-theo" ? { team: "A队", group: "二组" } : {}),
      accent: "B+", level: "B", categories: ["少儿"], status: "在职", trained: true,
      needConfirm: false, phone: "", rate: 180, tags: [],
      availability: [2, 4, 6].map(day => ({day, start: "17:00", end: "21:00"})),
      availabilityFrom: "", availabilityNote: "", availabilitySource: "entered",
      materialIds: hasAccount ? [] : books.slice(0, 2).map(c => c.id),
      ...(hasAccount ? {classInUid: "98000110", classInAccount: "theo@demo.example"} : {}),
    });
  }

  // Fill gaps in the original demo roster as well as supplying named examples.
  const activeStudents = data.students.filter(s => ["在读", "待排课"].includes(s.status));
  activeStudents.forEach((student, i) => {
    if (data.orders?.some(o => o.id.startsWith("demo-schedule-order-") && o.studentIds.includes(student.id))) return;
    const owner = data.accounts.find(a => a.enabled && a.id === student.ownerAccountId);
    if (!student.ownerAccountId) {
      const assigned = availableOwners.find(a => a.name === student.owner) ?? availableOwners[i % availableOwners.length];
      student.ownerAccountId = assigned.id;
      student.owner = assigned.name;
    } else if (owner && !owner.classInUid && !owner.classInAccount) {
      owner.classInUid = String(98100000 + data.accounts.indexOf(owner));
      owner.classInAccount = owner.id + "@demo.example";
    }
    if (!student.materialIds && !studentMaterials(data, student).length && i % 12 !== 1) {
      const textbook = books[i % books.length];
      student.materialIds = [textbook.id];
      student.material ||= textbook.name;
    }
    const orders = data.orders?.filter(o => o.studentIds.includes(student.id)) ?? [];
    if (i % 12 !== 0 && !accounts.some(a => a.studentIds.includes(student.id)) &&
        !orders.some(o => o.studentIds.length > 1 || o.classInAccountId)) {
      const accountId = "demo-roster-account-" + student.id;
      accounts.push({id: accountId, uid: "99" + student.id, phone: student.id + "@demo.example", studentIds: [student.id]});
      for (const order of orders) order.classInAccountId = accountId;
    }

  });

  learners.forEach(([name, englishName, age, units], i) => {
    if (i < 9 && before.importedBatches?.includes(previousBatch)) return;
    const missingAccount = englishName === "Ivy";
    const missingMaterial = englishName === "Max";
    const owner = availableOwners[i % availableOwners.length];
    const primaryBook = books[i % books.length];
    const materialIds = missingMaterial ? [] : [primaryBook.id];
    const material = missingMaterial ? "" : primaryBook.name;
    const id = nextStudentId(data.students);
    const accountId = "demo-schedule-account-" + id;
    const orderId = "demo-schedule-order-" + id;
    const date = addDays(DEMO_TODAY, -3);
    const weekend = i % 3 === 0;
    const duration = age >= 11 ? 50 : 25;
    const time = weekend ? "10:00" : "19:00";
    const days = weekend ? [6, 0] : i % 2 ? [2, 4] : [1, 3];
    const student = studentSchema.parse({
      ...emptyStudentProfile(), id, name, chineseName: name, englishName, age,
      owner: owner.name, ownerAccountId: owner.id, project: "K12", channel: "ToC",
      createdAt: date, purchaseDate: date, material, materialIds,
      balance: units, totalUnits: units, orderStatus: "正常",
      status: "待排课", groupName: name + "学习群", lastLesson: "",
      scheduleIntent: {mode: "fixed", startDate: DEMO_TODAY, weeks: 4, frequency: 2, duration,
        materialIds: materialIds.slice(0, 1), windows: days.map(day => ({day, start: time, end: weekend ? "12:00" : "21:00"}))},
    });
    data.students.push(student);
    if (!missingAccount) accounts.push({id: accountId, phone: "1990000" + String(8000 + i), uid: String(98000301 + i), studentIds: [id]});
    (data.orders ??= []).push({id: orderId, classInAccountId: missingAccount ? undefined : accountId, studentIds: [id], units, balance: units,
      date, kind: "新购", channel: student.channel, project: student.project});
    data.credits.push({id: orderId, studentId: id, orderId, date, type: "新购", units, balance: units, operator: owner.name, note: "首次购买课程包"});

    if (i >= 3) return;
    for (let offset = 1; offset <= 14; offset++) {
      const lessonDate = addDays(DEMO_TODAY, offset);
      if (!days.includes(new Date(lessonDate).getUTCDay())) continue;
      const teacher = teachers.find(t => (!student.teacherId || t.id === student.teacherId) && t.classInUid &&
        t.materialIds?.includes(materialIds[0]) && !isAvailable(data, t.id, lessonDate, time, duration, id).length);
      if (!teacher) continue;
      student.teacherId = teacher.id;
      student.teacherName = teacher.name;
      student.status = "在读";
      student.firstLessonDate ||= lessonDate;
      data.lessons.push({id: orderId + "-" + lessonDate, studentId: id, orderId, teacherId: teacher.id,
        date: lessonDate, time, duration, kind: "固定课", plannedUnits: duration / 25,
        material, status: "未开始", attendance: "正常", deducted: false, sync: "已同步", syncReason: "",
        teacherIn: "", teacherOut: "", studentIn: "", studentOut: "", note: "", conflict: false, leaveFlag: false});
    }
  });
  return data;
}
