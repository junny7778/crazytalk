import { transition } from "./domain";
import { bindSchedulingStaff } from "../../../tests/fixtures/scheduling";
import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { getFixedSchedulePlans } from "./fixedPlans";
import { addDays, type ScheduleIntent } from "./model";
function fixture() {
  const data = createSeed();
  bindSchedulingStaff(data);
  data.classInAccounts = data.students.map((student, index) => ({id: `verified-${student.id}`, phone: "", uid: String(990000 + index), studentIds: [student.id]}));
  data.lessons = [];
  data.leaves = [];
  data.teachers = data.teachers.slice(0, 3);
  data.teachers.forEach((t) => {
    t.status = "在职";
    t.trained = true;
    t.needConfirm = false;
    t.availabilityFrom = "";
    t.team = "B队";
    t.group = "一组";
    t.categories = ["少儿"];
    t.availability = [{ day: 1, start: "19:00", end: "19:25" }];
  });
  const student = data.students[3];
  student.status = "待排课";
  const intent: ScheduleIntent = {
    mode: "fixed", materialIds: data.catalog.filter(c => c.type === "教材" && c.name === student.material).map(c => c.id),
    startDate: "2026-11-23",
    weeks: 8,
    duration: 25,
    frequency: 1,
    windows: [{ day: 1, start: "19:00", end: "19:25" }],
  };
  return { data, student, intent };
}
it("独立验收：完整8节中主老师7节优先于6节，并自动补齐", () => {
  const { data, student, intent } = fixture();
  const [a, b, c] = data.teachers;
  for (const [t, weeks] of [
    [a, [7]],
    [b, [6, 7]],
    [c, [0, 1, 2, 3, 4, 5, 6]],
  ] as const) {
    for (const w of weeks)
      data.lessons.push({
        ...createSeed().lessons[0],
        id: `${t.id}-${w}`,
        studentId: "other",
        teacherId: t.id,
        date: addDays(intent.startDate, w * 7),
        time: "19:00",
        duration: 25,
        status: "未开始",
      });
  }
  const plans = getFixedSchedulePlans(data, student.id, intent);
  expect(plans[0]).toMatchObject({
    complete: true,
    coveredCount: 8,
    primaryCount: 7,
    primaryTeacherId: a.id,
  });
  expect(plans[0].slots.filter((s) => s.teacherId === c.id)).toHaveLength(1);
});
it("独立验收：部分覆盖方案不优先于完整可补齐时段", () => {
  const { data, student, intent } = fixture();
  intent.weeks = 2;
  intent.windows = [
    { day: 1, start: "19:00", end: "19:25" },
    { day: 3, start: "19:00", end: "19:25" },
  ];
  data.teachers[1].availability = [{ day: 3, start: "19:00", end: "19:25" }];
  data.teachers[2].availability = [];
  data.lessons = [
    {
      ...createSeed().lessons[0],
      id: "blocked",
      studentId: "other",
      teacherId: data.teachers[0].id,
      date: "2026-11-30",
      time: "19:00",
      duration: 25,
      status: "未开始",
    },
  ];
  const plans = getFixedSchedulePlans(data, student.id, intent);
  expect(plans[0].complete).toBe(true);
  expect(plans[0].primaryTeacherId).toBe(data.teachers[1].id);
});
it("独立验收：Richard真实种子意向生成8节，记录计算耗时", () => {
  const data = createSeed();
  bindSchedulingStaff(data);
  data.classInAccounts = data.students.map((student, index) => ({id: `verified-${student.id}`, phone: "", uid: String(990000 + index), studentIds: [student.id]}));
  const student =
    data.students.find((s) => s.name === "Richard") || data.students[0];
  const intent: ScheduleIntent = {
    mode: "fixed", materialIds: data.catalog.filter(c => c.type === "教材" && c.name === student.material).map(c => c.id),
    startDate: "2026-11-04",
    weeks: 4,
    duration: 25,
    frequency: 2,
    windows: [1, 2, 3].map((day) => ({ day, start: "19:00", end: "21:00" })),
  };
  const start = performance.now();
  const plans = getFixedSchedulePlans(data, student.id, intent);
  const ms = performance.now() - start;
  console.info(`Richard方案耗时: ${ms.toFixed(0)} ms; ${plans.length}方案`);
  expect(plans[0].slots).toHaveLength(8);
  expect(plans[0].coveredCount).toBe(8);
  expect(ms).toBeLessThan(5000);
});

it('独立验收：单次加课不改变固定计划完成状态', async () => {
 const {transition}=await import('./domain');const {getStudentScheduleProgress}=await import('./scheduling');
 const {data,student,intent}=fixture();intent.weeks=1;const teacher=data.teachers[0];teacher.availability=[{day:1,start:'19:00',end:'21:00'}];
 data.classInAccounts = [{id:"login",phone:"13900001234",uid:"101",studentIds:[student.id]}];
 const result=transition(data,{type:'lesson.schedule',studentId:student.id,teacherId:teacher.id,slots:[{date:intent.startDate,time:'19:00',teacherId:teacher.id},{date:intent.startDate,time:'20:00',teacherId:teacher.id,extra:true}],duration:25,kind:'固定课',material:student.material});
 expect(result.data.lessons[1]).toMatchObject({kind:'临时课',scheduleExtra:true});
 expect(result.data.lessons[1].fixedOrigin).toBeUndefined();
 expect(getStudentScheduleProgress(result.data,student.id,intent)).toMatchObject({complete:true,scheduledCount:1});
});

it("老师优先：主老师节数相同时选备选老师能补齐的时段", () => {
  const { data, student, intent } = fixture();
  const [primary, backup] = data.teachers;
  data.teachers = [primary, backup];
  student.personality = "内向";
  primary.tags = ["tt-34", "tt-35"];
  backup.tags = [];
  const windows = [1, 2, 3].map(day => ({ day, start: "19:00", end: "19:25" }));
  primary.availability = [windows[0]];
  backup.availability = [windows[2]];
  const [plan] = getFixedSchedulePlans(data, student.id, {
    ...intent, priority: "teacher", weeks: 1, frequency: 2, windows,
  });
  expect(plan).toMatchObject({
    primaryTeacherId: primary.id, primaryCount: 1, coveredCount: 2,
    slots: [
      { date: "2026-11-23", teacherId: primary.id },
      { date: "2026-11-25", teacherId: backup.id },
    ],
  });
});

it("不限按10课时排成3+3+3+1，分天优先，只有一个意向日时保留缺口", () => {
  const {data, student, intent} = fixture();
  data.orders = [];
  student.balance = 10;
  const windows = [1, 3, 5].map(day => ({day, start:"19:00", end:"21:00"}));
  for (const teacher of data.teachers) teacher.availability = windows;
  const saved = transition(data, {type:"student.scheduleIntent.update", studentId:student.id,
    intent:{...intent, unlimited:true, frequency:3, dailyLimit:1, windows}}).data;
  const settings = saved.students.find(s => s.id === student.id)!.scheduleIntent!;
  expect(settings).toMatchObject({weeks:4, targetLessons:10, dailyLimit:1});
  for (const dailyLimit of [1, 2]) {
    const [plan] = getFixedSchedulePlans(saved, student.id, {...settings, dailyLimit});
    expect(plan.requiredCount).toBe(10);
    expect(plan.coveredCount).toBe(10);
    expect(new Set(plan.slots.map(s => s.date)).size).toBe(10);
    expect([0,1,2,3].map(i => plan.slots.filter(s => s.date >= addDays(intent.startDate, i*7) && s.date < addDays(intent.startDate, (i+1)*7)).length)).toEqual([3,3,3,1]);
  }
  const [limited] = getFixedSchedulePlans(saved, student.id, {...settings, windows:windows.slice(0,1)});
  expect(limited).toMatchObject({requiredCount:10, coveredCount:4});
});

it("历史课程只占时间，本方案分批确认不能绕过每日上限", () => {
  const {data, student, intent} = fixture();
  data.teachers[0].availability = [{day:1,start:"18:00",end:"21:00"}];
  const base = {type:"lesson.schedule" as const, studentId:student.id, teacherId:data.teachers[0].id,
    duration:25, kind:"固定课" as const, material:student.material};
  const date = intent.startDate;
  const prior = transition(data, {...base, slots:[{date,time:"18:00"}]}).data;
  const saved = transition(prior, {type:"student.scheduleIntent.update", studentId:student.id, intent:{...intent,dailyLimit:1}}).data;
  const schedulePlanId = saved.students.find(s => s.id === student.id)!.scheduleIntent!.planId!;
  const first = transition(saved, {...base, schedulePlanId, slots:[{date,time:"19:00"}]}).data;
  expect(first.lessons).toHaveLength(2);
  expect(() => transition(first, {...base, schedulePlanId, slots:[{date,time:"19:30"}]})).toThrow(/每天最多 1 节/);
});

it("不限方案的自动目标用完后，运营仍可用新增余额手动加课", () => {
  const {data, student, intent} = fixture();
  data.orders = [];
  student.balance = 1;
  data.teachers[0].availability = [{day:1, start:"19:00", end:"21:00"}];
  const saved = transition(data, {type:"student.scheduleIntent.update", studentId:student.id,
    intent:{...intent, dailyLimit:1, unlimited:true}}).data;
  const learner = saved.students.find(s => s.id === student.id)!;
  expect(learner.scheduleIntent!.targetLessons).toBe(1);
  learner.balance = 2;
  const command = {type:"lesson.schedule" as const, studentId:student.id, teacherId:data.teachers[0].id,
    schedulePlanId:learner.scheduleIntent!.planId, duration:25, kind:"固定课" as const, material:student.material,
    slots:[{date:intent.startDate,time:"19:00"}, {date:intent.startDate,time:"19:30",extra:true}]};
  expect(() => transition(saved, {...command, selectionMode:"recommended"})).toThrow(/每天最多/);
  expect(transition(saved, {...command, selectionMode:"manual"}).data.lessons).toHaveLength(2);
});
