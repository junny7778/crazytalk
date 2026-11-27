import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, lockBusiness, readState, writeState } from "../store";
import { createSeed } from "../../../../packages/shared/src/seed";
import { halfMonthStatement, applyHalfMonthCommand } from "../../../../packages/shared/src/halfMonthPayroll";
import { transition } from "../../../../packages/shared/src/domain";
import { autoSettleLessons } from "../../../../packages/shared/src/autoLessonSettlement";
import { applyClassInEvent } from "./webhook-events";

async function verify() {
  const rollback = new Error("rollback verification fixture");
  try {
    await database.$transaction(async tx => {
      await lockBusiness(tx);
      const state = createSeed();
      const lesson = state.lessons.find(item => item.status === "未开始")!;
      const teacher = state.teachers.find(t => t.id === lesson.teacherId)!;
      Object.assign(teacher, { payMode: "NP", rate: 180, startDate: "" });
      state.officePayRates = { [teacher.so]: 60 };
      state.feedback = [];
      state.actions = [];
      state.orders = [{ id: "empty-account", studentIds: [lesson.studentId], balance: 0, units: 1, date: "2025-01-01", kind: "购课", channel: "", project: "" }];
      state.credits = [];
      state.halfMonthPayroll = [];
      Object.assign(lesson, {
        date: "2025-01-06", time: "19:00", duration: 25, plannedUnits: 1,
        confirmedUnits: undefined, deducted: false, attendance: "无数据",
        orderId: "empty-account", autoSettlementPaused: false,
      });
      const officeTeacher = state.teachers.find(t => t.id !== teacher.id)!;
      Object.assign(officeTeacher, {
        payMode: "OP", rate: 180, startDate: "2025-01-06", payrollEndDate: "2025-01-06",
        availabilityFrom: "2025-01-06", availability: [{ day: 1, start: "19:00", end: "19:30" }],
      });
      state.officePayRates[officeTeacher.so] = 60;
      const period = "2025-01-1", after = "2025-01-16T10:00:00+08:00";
      const start = Date.parse(lesson.date + "T19:00:00+08:00") / 1000;
      const end = start + 25 * 60;
      const scenarios = [
        { id: "normal", late: 0, early: 0, teacherPresent: true, studentPresent: true, amounts: [[180,60]] },
        { id: "teacher-only", late: 0, early: 0, teacherPresent: true, studentPresent: false, amounts: [[90,30]] },
        { id: "student-absent", late: 0, early: 0, teacherPresent: true, studentPresent: false, amounts: [[90,30]] },
        { id: "teacher-absent", late: 0, early: 0, teacherPresent: false, studentPresent: true, amounts: [[-540,0]] },
        { id: "both-absent", late: 0, early: 0, teacherPresent: false, studentPresent: false, amounts: [[-540,0]] },
        { id: "op-absent", late: 0, early: 0, teacherPresent: false, studentPresent: true, amounts: [[-540,0],[-180,-60]] },
        { id: "under-minute", late: 10, early: 49, teacherPresent: true, studentPresent: true, amounts: [[180,60]] },
        { id: "combined", late: 109, early: 75, teacherPresent: true, studentPresent: true, amounts: [[-6,0],[180,60]] },
        { id: "over-limit", late: 329, early: 331, teacherPresent: true, studentPresent: true, amounts: [[-540,0]] },
      ];
      state.lessons = scenarios.map(c => ({ ...lesson, id: c.id, teacherId: c.id === "op-absent" ? officeTeacher.id : teacher.id }));
      await writeState(tx, state);
      const courseId = randomUUID();
      const envelope = { ClassID: "normal", CourseID: courseId };
      const member = (Uid: string, Identity: number, present: boolean, late = 0, early = 0) => ({
        Uid, Identity, AttendanceTime: present ? end - start - late - early : 0,
        FirstInTime: present ? start + late : 0, LastOutTime: present ? end - early : 0,
      });
      for (const c of scenarios) {
        await tx.classInLesson.create({ data: { lessonId: c.id, classId: c.id, courseId, teacherUid: "test-teacher", studentUid: "test-student" } });
        const summary = { Cmd: "Attendance", ClassID: c.id, CourseID: courseId, ClassEndTime: end, Data: [
          member("test-teacher", 3, c.teacherPresent, c.late, c.early),
          member("test-student", 1, c.studentPresent),
        ] };
        if (c.id === "teacher-only") summary.Data = [summary.Data[0]];
        if (c.id === "student-absent") {
          for (const conflictingStudent of [
            member("other-student", 1, true),
            { ...member("test-student", 1, true), AttendanceTime: 0 },
          ]) {
            await applyClassInEvent(tx, { ...summary, Data: [summary.Data[0], conflictingStudent] });
            const unresolved = await readState(tx);
            assert.ok(!unresolved.lessons.find(l => l.id === c.id)?.studentAttendance?.includes("缺席"));
            const rows = halfMonthStatement(unresolved, teacher, period).rows.filter(r => r.source === c.id);
            assert.deepEqual(rows.map(r => [r.category, r.teacher, r.office]), [["待核", 0, 0]]);
          }
        }
        if (c.id === "normal") {
          assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: 67371107, UID: "test-teacher", Identity: 3, ActionTime: start }), null);
          const noSummary = await readState(tx);
          const sourceAt = (time: string) => halfMonthStatement(noSummary, teacher, period, Date.parse(time)).rows.filter(r => r.source === c.id);
          assert.deepEqual(sourceAt("2025-01-14T23:59:59+08:00").map(r => r.category), ["等待"]);
          const missing = sourceAt("2025-01-15T00:00:00+08:00");
          assert.deepEqual(missing.map(r => [r.category, r.teacher, r.office]), [["待核", 0, 0]]);
          assert.match(missing[0].title + missing[0].detail, /数据缺失/);
          const incomplete = { ...summary, Data: summary.Data.slice(1) };
          await applyClassInEvent(tx, incomplete);
          const pending = await readState(tx);
          const source = halfMonthStatement(pending, teacher, period).rows.filter(r => r.source === c.id);
          assert.deepEqual(source.map(r => r.category), ["待核"]);
        }
        const final = c.id === "student-absent"
          ? { ...summary, Data: [summary.Data[0], { Uid: "test-student", Identity: 1, AttendanceTime: 0 }] }
          : summary;
        assert.equal(await applyClassInEvent(tx, final), null);
        assert.equal(await applyClassInEvent(tx, final), null);
        const actual = await readState(tx);
        const recorded = actual.lessons.find(l => l.id === c.id)!;
        if (c.id === "teacher-only" || c.id === "student-absent") {
          assert.equal(recorded.attendance, "学员缺席");
          assert.deepEqual(recorded.teacherAttendance, ["正常"]);
          assert.deepEqual(recorded.studentAttendance, ["缺席"]);
          assert.equal(recorded.classInAttendanceIssue, undefined);
        }
        if (c.late && c.early) {
          assert.deepEqual(recorded.teacherAttendance, ["迟到", "早退"]);
          assert.equal(recorded.classInTeacherExceptionMinutes, Math.floor((c.late + c.early) / 60));
        }
        const statement = halfMonthStatement(actual, c.id === "op-absent" ? officeTeacher : teacher, period);
        if (c.id === "op-absent") {
          const slot = statement.rows.filter(r => r.category === "底薪" && r.key.startsWith("op:"));
          assert.deepEqual(slot.map(r => [r.teacher, r.office]), [[180,60]]);
        }
        const rows = statement.rows.filter(r => r.source === c.id);
        assert.deepEqual(rows.map(r => [r.teacher, r.office]).sort((a,b) => a[0]-b[0]), c.amounts, c.id);
      }
      let actual = autoSettleLessons(await readState(tx), Date.parse(after));
      assert.equal(actual.lessons.find(l => l.id === "normal")?.deducted, false);
      const conflictId = "cancelled-with-attendance";
      actual.lessons.push({
        ...lesson, id: conflictId, status: "已取消",
        cancellation: { at: "2025-01-05T10:00:00+08:00", kind: "学员请假", responsibility: "学员", waived: false },
      });
      await writeState(tx, actual);
      await tx.classInLesson.create({ data: {
        courseId, classId: conflictId, lessonId: conflictId, teacherUid: "test-teacher", studentUid: "test-student",
      } });
      const conflictSummary = { ...envelope, ClassID: conflictId, Cmd: "Attendance", ClassEndTime: end, Data: [
        member("test-teacher", 3, true), member("test-student", 1, true),
      ] };
      await applyClassInEvent(tx, conflictSummary);
      actual = await readState(tx);
      const rowsForConflict = () => halfMonthStatement(actual, teacher, period).rows.filter(r => r.source === conflictId);
      assert.deepEqual(rowsForConflict().map(r => r.category), ["待核"]);
      const resolve = { type: "lesson.resolve", ids: [conflictId], decision: "不扣", reason: "核对课后记录" } as const;
      assert.throws(() => transition(actual, { ...resolve, ids: [conflictId] }));
      actual = transition(actual, { ...resolve, ids: [conflictId], conclusion: "正常上课" }).data;
      assert.equal(actual.lessons.find(l => l.id === conflictId)?.classInAttendanceIssue, undefined);
      assert.deepEqual(rowsForConflict().map(r => [r.teacher, r.office]), [[180,60]]);
      await writeState(tx, actual);
      await applyClassInEvent(tx, conflictSummary);
      actual = await readState(tx);
      assert.deepEqual(rowsForConflict().map(r => [r.teacher, r.office]), [[180,60]]);
      const normalBasis = actual.lessonPayBasis?.normal;
      assert.equal(normalBasis?.teacherRate, 180);
      assert.equal(normalBasis?.officeRate, 60);
      const confirmed = { type: "halfPay.status", status: "已确认", teacherId: teacher.id, period } as const;
      applyHalfMonthCommand(actual, confirmed, after);
      const frozen = halfMonthStatement(actual, teacher, period);
      await writeState(tx, actual);
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: "Attendance", ClassEndTime: end, Data: [
        member("test-teacher", 3, true), member("test-student", 1, true),
      ] }), null);
      actual = await readState(tx);
      assert.deepEqual(halfMonthStatement(actual, teacher, period), frozen);
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: "Rating", TUID: "test-teacher", Comments: { "test-student": { S2T: { Score: 5, Comment: "test feedback" } } } }), null);
      actual = await readState(tx);
      assert(actual.feedback.some(item=>item.lessonId==="normal"&&item.content==="test feedback"));
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: "Net", UID: "test-teacher", ActionTime: end, Data: { poor: 10 } }), null);
      actual = await readState(tx);
      assert(actual.events.some(item=>item.relatedId==="normal"&&item.type==="网络报告待核实"));
      throw rollback;
    }, { timeout: 30000 });
  } catch(error) {
    if(error !== rollback) throw error;
  } finally { await database.$disconnect(); }
  console.log("PASS real-DB ClassIn attendance, payroll amounts and freeze, rating, network mapping; fixtures rolled back");
}
verify().catch(error=>{console.error(error.message);process.exitCode=1;});
