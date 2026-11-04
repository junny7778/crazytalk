import { it, expect } from "vitest";
import { createSeed } from "./seed";
import { getFixedSchedulePlans } from "./fixedPlans";
import { addDays, type ScheduleIntent } from "./model";
function fixture() {
  const data = createSeed();
  data.lessons = [];
  data.leaves = [];
  data.teachers = data.teachers.slice(0, 3);
  data.teachers.forEach((t) => {
    t.status = "在职";
    t.trained = true;
    t.needConfirm = false;
    t.availabilityFrom = "";
    t.categories = ["少儿"];
    t.availability = [{ day: 1, start: "19:00", end: "19:25" }];
  });
  const student = data.students[3];
  student.status = "待排课";
  const intent: ScheduleIntent = {
    mode: "fixed",
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
  const student =
    data.students.find((s) => s.name === "Richard") || data.students[0];
  const intent: ScheduleIntent = {
    mode: "fixed",
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
 const result=transition(data,{type:'lesson.schedule',studentId:student.id,teacherId:teacher.id,slots:[{date:intent.startDate,time:'19:00',teacherId:teacher.id},{date:intent.startDate,time:'20:00',teacherId:teacher.id,extra:true}],duration:25,kind:'固定课',material:student.material});
 expect(result.data.lessons[1]).toMatchObject({kind:'临时课',scheduleExtra:true});
 expect(result.data.lessons[1].fixedOrigin).toBeUndefined();
 expect(getStudentScheduleProgress(result.data,student.id,intent)).toMatchObject({complete:true,scheduledCount:1});
});
