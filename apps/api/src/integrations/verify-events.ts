import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, lockBusiness, readState, writeState } from "../store";
import { createSeed } from "../../../../packages/shared/src/seed";
import { applyClassInEvent } from "./webhook-events";

async function verify() {
  const rollback = new Error("rollback verification fixture");
  try {
    await database.$transaction(async tx => {
      await lockBusiness(tx);
      const state = createSeed();
      const lesson = state.lessons.find(item => item.status === "未开始")!;
      const classId = randomUUID(), courseId = randomUUID();
      lesson.attendance = "无数据";
      await writeState(tx, state);
      await tx.classInLesson.create({ data: { lessonId: lesson.id, classId, courseId, teacherUid: "test-teacher", studentUid: "test-student" } });
      const start = Date.parse(lesson.date+"T"+lesson.time+":00+08:00")/1000;
      const end = start + lesson.duration * 60;
      const envelope = { ClassID: classId, CourseID: courseId };
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: 67371107, UID: "test-teacher", Identity: 3, ActionTime: start }), null);
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: "Attendance", ClassEndTime: end, Data: [
        { Uid: "test-teacher", AttendanceTime: lesson.duration*60, FirstInTime: start, LastOutTime: end, Identity: 3 },
        { Uid: "test-student", AttendanceTime: lesson.duration*60, FirstInTime: start, LastOutTime: end, Identity: 1 },
      ] }), null);
      let actual = await readState(tx);
      assert.equal(actual.lessons.find(item=>item.id===lesson.id)?.status, "待确认");
      assert.deepEqual(actual.lessons.find(item=>item.id===lesson.id)?.teacherAttendance, ["正常"]);
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: "Rating", TUID: "test-teacher", Comments: { "test-student": { S2T: { Score: 5, Comment: "test feedback" } } } }), null);
      actual = await readState(tx);
      assert(actual.feedback.some(item=>item.lessonId===lesson.id&&item.content==="test feedback"));
      assert.equal(await applyClassInEvent(tx, { ...envelope, Cmd: "Net", UID: "test-teacher", ActionTime: end, Data: { poor: 10 } }), null);
      actual = await readState(tx);
      assert(actual.events.some(item=>item.relatedId===lesson.id&&item.type==="网络报告待核实"));
      throw rollback;
    }, { timeout: 30000 });
  } catch(error) {
    if(error !== rollback) throw error;
  } finally { await database.$disconnect(); }
  console.log("PASS real-DB enter, attendance, rating, network mapping; fixtures rolled back");
}
verify().catch(error=>{console.error(error.message);process.exitCode=1;});
