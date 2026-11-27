import { operationsNow } from "./clock";
import { initializeTeacherNumbers } from "./teacherNumbers";
import { finishStudentAccountChange } from "./classInChanges";
import { initializeTeacherTags } from "./teacherTags";
import { createOpeningPackage, migratePackageBalances, refreshPackageBalances } from "./packageBalances";
import { splitRosterName } from "./studentNames";
import { assignSampleTeams, migrateStudentOwners, migrateTeamCatalog, migrateProjectChannels } from "./organization";
import { finalizeDemoLessonHistory } from "./rosterActivity";
import { withDemoSchedulingSamples } from "./demoSchedulingSamples";
import { withDemoPayrollSamples, withErikaSamples } from "./demoPayrollSamples";
import LZString from "lz-string";
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
import { transition } from "./domain";
import { migrateStudentIds, resolveStudentCommand } from "./studentIds";
const storageKey = "crazytalk-demo-standard-v1";
export const STUDENT_ID_BACKUP_KEY = `${storageKey}:before-student-id-v2`;
const storedFeedbackPresenceSchema = z.object({
  students: z.array(z.object({ id: z.string(), code: z.unknown().optional() })),
  feedback: z.array(z.object({ id: z.string() }).passthrough()),
});
let memory: DemoState | undefined;
function writeSnapshot(data: DemoState) {
  const json = JSON.stringify(data);
  try {
    localStorage.setItem(storageKey, json);
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "QuotaExceededError")
      throw error;
    localStorage.setItem(storageKey, "lz:" + LZString.compressToUTF16(json));
  }
}
const previousCopy = new Map([
  ["示例待办，可在学生档案记录处理结果。", "请回访学习情况，并在学员档案记录处理结果。"],
  ["演示课包", "期初课时"],
  ["模拟考勤：开课满 10 分钟，老师仍未到堂，待核实。", "开课满 10 分钟，老师仍未到堂，待核实。"],
  ["演示期初课酬（预设汇总减可追溯课酬），非真实结算凭据", "按汇总金额扣除可追溯课酬后计入期初。"],
  ["当前Demo没有外部候课名单，需确认实际停用范围。", "外部候课名单待核实，需确认停用范围。"],
  ["仅模拟停止本地排课；不冻结真实ClassIn或其他账号。", "已停止本地排课，外部账号权限待核实。"],
  ["更新机构连接，密钥不保存到演示数据", "更新机构连接信息，密钥未保存"],
]);

function updateStoredCopy(data: DemoState) {
  let changed = false;
  function update(message: string) {
    const next = previousCopy.get(message) ?? message;
    changed ||= next !== message;
    return next;
  }
  function updateReminder(message: string) {
    const next = message
      .replace(/^(剩余 -?[\d.]+ 课时，)本次演示提醒线为/, "$1提醒阈值为")
      .replace(/^(最近 \d+ 天已确认缺席 \d+ 节，)本次演示条件为/, "$1提醒阈值为");
    changed ||= next !== message;
    return next;
  }
  for (const task of data.tasks) {
    if (task.id === "task-demo-1") task.note = update(task.note);
    if (task.sourceType === "reminder") task.note = updateReminder(task.note);
  }
  for (const credit of data.credits) {
    if (credit.type === "期初课时") credit.note = update(credit.note);
  }
  for (const lesson of data.lessons) {
    if (/^demo-teacher-no-show-[123]$/.test(lesson.id)) lesson.note = update(lesson.note);
  }
  for (const item of data.payroll) {
    if (item.opening) item.opening.source = update(item.opening.source);
    if (item.breakdownSnapshot) {
      item.breakdownSnapshot.opening.source = update(item.breakdownSnapshot.opening.source);
    }
  }
  for (const student of data.students)
    for (const item of student.serviceStopResults ?? []) item.detail = update(item.detail);
  for (const event of data.events) {
    for (const item of event.serviceStopResults ?? []) item.detail = update(item.detail);
    if (event.type === "课程连接") event.content = update(event.content);
    if (event.type === "跟进提醒") event.content = updateReminder(event.content);
  }
  return changed;
}

function read(): DemoState {
  if (memory) return memory;
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const input: unknown = JSON.parse(raw.startsWith("lz:") ? LZString.decompressFromUTF16(raw.slice(3)) : raw);
        const legacy = z.object({students: z.array(z.record(z.unknown())), orders: z.array(z.record(z.unknown())).optional()}).safeParse(input);
        let balancesMigrated = false;
        if (legacy.success && legacy.data.students.some(s => "balanceKnown" in s || typeof s.balance === "number" && s.balance < 0)) {
          for (const [i, s] of legacy.data.students.entries()) {
            if (typeof s.balance === "number" && s.balance < 0) s.balance = 0;
            if (s.balanceKnown === false && !legacy.data.orders?.some(o => Array.isArray(o.studentIds) && o.studentIds.includes(s.id))) {
              s.balance = s.status === "退费" || s.status === "结课" ? 0 : [24, 36, 0, 12][i % 4];
            }
            delete s.balanceKnown;
          }
          for (const order of legacy.data.orders ?? []) {
            if (typeof order.balance === "number" && order.balance < 0) order.balance = 0;
            if (order.kind === "期初余额" && typeof order.units === "number" && order.units < 0) order.units = 0;
          }
          Object.assign(input as object, legacy.data);
          balancesMigrated = true;
        }
        const result = stateSchema.safeParse(input);
        if (result.success) {
          memory = result.data;
          const original = storedFeedbackPresenceSchema.parse(input);
          const catalog = migrateFeedbackCatalog(memory.catalog);
          const copyUpdated = updateStoredCopy(memory);
          let upgraded = initializeTeacherNumbers(memory) || balancesMigrated;
          upgraded = catalog !== memory.catalog || copyUpdated || upgraded;
          for (const student of memory.students) {
            if (!student.surveySubmittedAt && student.surveyOriginal && student.surveyPreviousSubmittedAt) {
              student.surveySubmittedAt = student.surveyPreviousSubmittedAt;
              upgraded = true;
            }
          }
          const tagsUpdated = initializeTeacherTags(memory);
          upgraded ||= tagsUpdated;
          const teamsUpdated = assignSampleTeams(memory);
          upgraded ||= teamsUpdated;
          memory.catalog = catalog;
          upgraded = migrateTeamCatalog(memory) || upgraded;
          upgraded = migrateProjectChannels(memory) || upgraded;
          upgraded = migrateStudentOwners(memory) || upgraded;
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
          const migrated = migrateStudentIds(memory);
          if (migrated.changed) {
            if (!localStorage.getItem(STUDENT_ID_BACKUP_KEY))
              localStorage.setItem(STUDENT_ID_BACKUP_KEY, raw);
          }
          const packagesMigrated = migratePackageBalances(migrated.data);
          if (balancesMigrated) {
            const funded = new Set(migrated.data.orders?.flatMap(o => o.studentIds));
            for (const student of migrated.data.students)
              if (student.balance > 0 && !funded.has(student.id)) createOpeningPackage(migrated.data, student, student.balance);
            refreshPackageBalances(migrated.data);
          }
          if (migrated.changed || upgraded || packagesMigrated) {
            writeSnapshot(migrated.data);
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
  memory = createDemoBase();
  return memory;
}

function createDemoBase() {
  const base = migrateStudentIds(createSeed()).data;
  migratePackageBalances(base);
  return base;
}

function save(data: DemoState) {
  migratePackageBalances(data);
  refreshPackageBalances(data);
  if (typeof localStorage !== "undefined") writeSnapshot(data);
  memory = data;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("crazytalk-change"));
}
const standardDemoBatch = "standard-demo-october-2026";

function buildStandardDemo(base: DemoState) {
  const data = withDemoSchedulingSamples(withErikaSamples(base));
  const names = ["金泽宇", "唐书瑶", "梁子涵", "黄梓萌", "徐思齐", "姜一凡",
    "刘雨桐", "何嘉言", "陆明轩", "钱若宁", "宋欣悦", "顾远航",
    "郑书妍", "蔡一诺", "蒋辰星", "曹安琪", "田思源", "吴诗涵"];
  for (const [index, name] of names.entries()) {
    const student = data.students.find(s => s.id === data.studentIdAliases?.[`s${index + 7}`]);
    if (!student) continue;
    student.name = student.chineseName = name;
    student.groupName = name + "专属学习群";
  }
  const result = finalizeDemoLessonHistory(withDemoPayrollSamples(data));
  (result.importedBatches ??= []).push(standardDemoBatch);
  return result;
}

export const demoRepository = {
  read,
  initializeDemoSamples() {
    const before = read();
    if (!before.importedBatches?.includes(standardDemoBatch)) save(buildStandardDemo(before));
  },
  restoreStandardDemo() {
    save(buildStandardDemo(createDemoBase()));
  },
  settleCompletedLessons(now = operationsNow()) {
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
    if (command.type === "student.bindClassIn" && result.data.students.find(s => s.id === command.id)?.classInChange) {
      finishStudentAccountChange(result.data,command.id);
      delete result.data.students.find(s => s.id === command.id)!.classInChange;
    }
    result.data = autoSettleLessons(result.data, operationsNow());
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
            if (!order)
              throw new Error("找不到原扣课套餐，无法撤销");
            const units = now.confirmedUnits;
            if (units === undefined)
              throw new Error("缺少已确认扣课数量，不能撤销余额");
            order.balance += units;
            latest.credits.unshift({
              id: crypto.randomUUID(),
              studentId: s.id,
              date: DEMO_TODAY,
              type: "撤销扣课",
              units,
              balance: order.balance,
              orderId: order.id, lessonId: now.id,
              note: `撤销 ${now.date} ${now.time} 的确认`,
              operator: "Rita",
            });
          }
          latest.lessons[latest.lessons.indexOf(now)] = { ...old, autoSettlementPaused: true };
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
