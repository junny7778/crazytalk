import { splitRosterName } from "./studentNames";
import { assignSampleTeams } from "./organization";
import { unifyRoster } from "./unifyRoster";
import { withRosterActivity } from "./rosterActivity";
import LZString from "lz-string";
import { initializePayroll } from "./payroll";
import { autoSettleLessons } from "./autoLessonSettlement";
import { restoreLessonSyncNotice } from "./restoreLessonSyncNotice";
import { migrateFeedbackCatalog } from "./feedbackCatalog";
import { z } from "zod";
import {
  stateSchema,
  studentOrderStatus,
  type Command,
  type DemoState,
  DEMO_TODAY,
} from "./model";
import { createSeed } from "./seed";
import { transition, payrollTotal } from "./domain";
import { migrateStudentIds, resolveStudentCommand } from "./studentIds";
const storageKey = "crazytalk-demo-v1";
export const STUDENT_ID_BACKUP_KEY = `${storageKey}:before-student-id-v2`;
const storedFeedbackPresenceSchema = z.object({
  students: z.array(z.object({ id: z.string(), code: z.unknown().optional() })),
  feedback: z.array(z.object({ id: z.string() }).passthrough()),
});
let memory: DemoState | undefined;
function serialize(data: DemoState) {
  const json=JSON.stringify(data);
  return json.length>1000000 ? "lz:"+LZString.compressToUTF16(json) : json;
}
function read(): DemoState {
  if (memory) return memory;
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const input: unknown = JSON.parse(raw.startsWith("lz:") ? LZString.decompressFromUTF16(raw.slice(3)) : raw);
        const result = stateSchema.safeParse(input);
        if (result.success) {
          memory = result.data;
          const payrollUpgrade = memory.payroll.some((p) => p.status === "待确认" ? !p.opening : !p.breakdownSnapshot);
          initializePayroll(memory);
          const original = storedFeedbackPresenceSchema.parse(input);
          const catalog = migrateFeedbackCatalog(memory.catalog);
          let upgraded = catalog !== memory.catalog || payrollUpgrade;
          const teamsUpdated = assignSampleTeams(memory);
          upgraded ||= teamsUpdated;
          memory.catalog = catalog;
          const noticeRecoveryKey = `${storageKey}:nancy-sync-notice-2026-11-05`;
          const noticeRestored = !localStorage.getItem(noticeRecoveryKey) && restoreLessonSyncNotice(memory);
          upgraded ||= noticeRestored;
          const storedTeachers = z
            .object({ teachers: z.array(z.record(z.unknown())) })
            .safeParse(input);
          if (
            storedTeachers.success &&
            storedTeachers.data.teachers.some(
              (teacher) => !("availability" in teacher),
            )
          )
            upgraded = true;
          const legacyCodes = new Map(original.students.filter(s => typeof s.code === "string").map(s => [s.id, String(s.code)]));
          upgraded ||= legacyCodes.size > 0;
          for (const learner of memory.students) {
            if (learner.englishName === undefined) {
              const raw = learner.roster?.fields["学生"];
              const names = splitRosterName(raw || learner.name);
              learner.chineseName ||= names.chineseName;
              learner.englishName = raw && learner.name !== raw && !/\p{Script=Han}/u.test(learner.name)
                ? learner.name : names.englishName;
              learner.name = learner.chineseName || learner.englishName || learner.name;
              upgraded = true;
            }
            if (
              !learner.orderStatus &&
              !learner.sourceSequence &&
              legacyCodes.has(learner.id) &&
              !legacyCodes.get(learner.id)!.startsWith("SYS-")
            ) {
              learner.orderStatus = studentOrderStatus(learner.status);
              upgraded = true;
            }
          }
          for (const lesson of memory.lessons) {
            if (
              lesson.deducted &&
              lesson.confirmedUnits === undefined &&
              (lesson.duration === 25 || lesson.duration === 50)
            ) {
              lesson.confirmedUnits = lesson.duration === 25 ? 1 : 2;
              upgraded = true;
            }
          }
          for (const record of memory.feedback) {
            const stored = original.feedback.find(
              (item) => item.id === record.id,
            );
            if (!stored) continue;
            const learner = memory.students.find(
              (item) => item.id === record.studentId,
            );
            const tutor = memory.teachers.find(
              (item) => item.id === record.teacherId,
            );
            if (!("source" in stored)) {
              record.source = learner?.project || "";
              upgraded = true;
            }
            if (!("teacherName" in stored)) {
              record.teacherName = tutor?.name || "";
              upgraded = true;
            }
            if (!("so" in stored)) {
              record.so = tutor?.so || "";
              upgraded = true;
            }
          }
          for (const p of memory.payroll)
            if (p.status !== "待确认" && !p.snapshot)
              p.snapshot = payrollTotal(memory, p.id);
          const migrated = migrateStudentIds(memory);
          if (migrated.changed) {
            if (!localStorage.getItem(STUDENT_ID_BACKUP_KEY))
              localStorage.setItem(STUDENT_ID_BACKUP_KEY, raw);
          }
          if (migrated.changed || upgraded) {
            localStorage.setItem(storageKey, serialize(migrated.data));
            if (noticeRestored) localStorage.setItem(noticeRecoveryKey, "done");
            memory = migrated.data;
          }
          return memory;
        }
        throw new Error("本地资料格式未通过校验");
      } catch {
        memory = undefined;
        throw new Error("本地资料升级未完成，原始资料未删除，请勿重置数据");
      }
    }
  }
  memory = migrateStudentIds(createSeed()).data;
  initializePayroll(memory);
  return memory;
}
function save(data: DemoState) {
  initializePayroll(data);
  if (typeof localStorage !== "undefined")
    localStorage.setItem(storageKey, serialize(data));
  memory = data;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("crazytalk-change"));
}
export const demoRepository = {
  read,
  populateRosterActivity() {
    const before = read();
    const after = withRosterActivity(unifyRoster(before));
    if (after !== before) save(after);
  },
  settleCompletedLessons(now = Date.now()) {
    const before = read();
    let updated = before;
    for (const l of before.lessons) {
      if (l.status === "已取消" || l.attendance === "账号待关联" || l.attendance === "无数据") continue;
      for (const person of ["学员", "老师"] as const) {
        const tags = person === "老师" ? l.teacherAttendance : l.studentAttendance;
        const absent = tags ? tags.includes("缺席") : l.attendance === person + "缺席";
        if (!absent) continue;
        const start = Date.parse(l.date + "T" + l.time + ":00+08:00");
        if (now < start || now >= start + l.duration * 60_000) continue;
        if (l.attendanceMessages?.[person] || l.status === "已完成" || l.status === "缺席") continue;
        updated = transition(updated, {
          type: "lesson.attendance", id: l.id, person,
          result: "未到堂", at: new Date(now).toISOString(),
          operator: "系统考勤",
        }).data;
      }
    }
    const after = autoSettleLessons(updated, now);
    if (after !== before) save(after);
    return after;
  },
  execute(command: Command) {
    const before = read();
    const result = transition(before, resolveStudentCommand(before, command));
    result.data = autoSettleLessons(result.data);
    save(result.data);
    let undo: (() => void) | undefined;
    if (command.type === "lesson.resolve") {
      const until = Date.now() + 10000;
      let used = false;
      const ids = command.ids;
      undo = () => {
        if (used || Date.now() > until)
          throw new Error("撤销时间已过，请在上课记录中更正");
        const latest = structuredClone(read());
        for (const lessonId of ids) {
          const old = before.lessons.find((l) => l.id === lessonId);
          const now = latest.lessons.find((l) => l.id === lessonId);
          const completed = result.data.lessons.find((l) => l.id === lessonId);
          if (
            !old ||
            !now ||
            !completed ||
            JSON.stringify(now) !== JSON.stringify(completed)
          )
            throw new Error("课程已有新的变更，请在上课记录中更正");
          const s = latest.students.find((s) => s.id === now.studentId);
          if (s && now.deducted && !old.deducted) {
            const order = now.orderId ? latest.orders?.find(o => o.id === now.orderId) : undefined;
            if (!order && !s.balanceKnown)
              throw new Error("请先补录期初余额，再撤销扣课");
            const units = now.confirmedUnits;
            if (units === undefined)
              throw new Error("缺少已确认扣课数量，不能撤销余额");
            if (order) order.balance += units; else s.balance += units;
            latest.credits.unshift({
              id: crypto.randomUUID(),
              studentId: s.id,
              date: DEMO_TODAY,
              type: "撤销扣课",
              units,
              balance: order?.balance ?? s.balance,
              orderId: order?.id, lessonId: now.id,
              note: `撤销 ${now.date} ${now.time} 的确认`,
              operator: "Rita",
            });
          }
          Object.assign(now, old);
          now.autoSettlementPaused = true;
          const p = latest.payroll.find(
            (p) =>
              p.teacherId === now.teacherId &&
              p.month === now.date.slice(0, 7) &&
              p.status === "待确认",
          );
          if (p && command.decision === "扣课" && now.attendance === "正常")
            p.lessons--;
        }
        latest.revision++;
        latest.events.unshift({
          id: crypto.randomUUID(),
          studentId: "",
          teacherId: "",
          date: DEMO_TODAY,
          type: "撤销确认",
          content: `撤销 ${ids.length} 节课的确认`,
          operator: "Rita",
        });
        save(latest);
        used = true;
      };
    }
    return { message: result.message, data: result.data, undo };
  },
  reset() {
    save(migrateStudentIds(createSeed()).data);
  },
  refresh() {
    memory = undefined;
    return read();
  },
};
export const DEMO_STORAGE_KEY = storageKey;
