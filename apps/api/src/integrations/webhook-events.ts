import { applyClassInfoEvent } from "./class-info";
import { z } from "zod";
import { Transaction, readState, writeState } from "../store";
import { transition } from "../../../../packages/shared/src/domain";
import { hasFinalPayrollAttendance, rememberLessonPay } from "../../../../packages/shared/src/halfMonthPayroll";
import { bothAttendedInClassIn, cancellationAttendanceConflict } from "../../../../packages/shared/src/lessonAttendance";
import type { Lesson } from "../../../../packages/shared/src/model";

const eventSchema = z.object({
  Cmd: z.union([z.string(), z.number()]), ClassID: z.coerce.string(),
  CourseID: z.coerce.string(), ActionTime: z.coerce.number().optional(),
}).passthrough();
const memberSchema = z.object({
  Uid: z.coerce.string(), AttendanceTime: z.number().optional(), FirstInTime: z.number().optional(), LastOutTime: z.number().optional(), Identity: z.number().optional(),
});
const clock = (seconds: number) => new Date(seconds * 1000 + 8 * 3600000).toISOString().slice(11, 16);

type AttendanceTag = NonNullable<Lesson["teacherAttendance"]>[number];
function summaryFact(person: "老师" | "学员", uid: string, data: z.infer<typeof memberSchema>[], start: number, end: number, absentFromRoll = false) {
  const members = data.filter(m => m.Uid === uid);
  const pending = (issue: string) => ({
    person, issue: person + issue, tags: ["待核实"] as AttendanceTag[], first: "", last: "", minutes: undefined,
  });
  const absent = { person, issue: "", tags: ["缺席"] as AttendanceTag[], first: "", last: "", minutes: undefined };
  if (!members.length) return absentFromRoll ? absent : pending("缺少考勤摘要");
  const [member] = members;
  if (members.length !== 1 || member.Identity !== (person === "老师" ? 3 : 1))
    return pending("的摘要成员身份不一致");
  const { FirstInTime: first, LastOutTime: last, AttendanceTime: seconds } = member;
  if (seconds === 0 && !first && !last) return absent;
  if (seconds === undefined || first === undefined || last === undefined)
    return pending("考勤数据缺失：缺少出勤时长或进出时间");
  if (seconds <= 0 || first <= 0 || last - first < seconds)
    return pending("的出勤时长与进出记录矛盾");
  const late = Math.max(0, first - start), early = Math.max(0, end - last);
  const tags: AttendanceTag[] = [];
  if (late) tags.push("迟到");
  if (early) tags.push("早退");
  if (!tags.length) tags.push("正常");
  return { person, issue: "", tags, first: clock(first), last: clock(last), minutes: Math.floor((late + early) / 60) };
}

export async function applyClassInEvent(tx: Transaction, input: unknown) {
  const command = z.object({Cmd:z.union([z.string(),z.number()])}).parse(input).Cmd;
  if (command === "Test" || command === "test") return null;
  if (["eeoCourseInfoChange","eeoClassInfoChange","eeoCourseStudentChange","eeoClassStudentChange"].includes(String(command))) return applyClassInfoEvent(tx,input);
  const event = eventSchema.parse(input);
  const mapping = await tx.classInLesson.findFirst({ where: { courseId: event.CourseID, classId: event.ClassID } });
  if (!mapping) return "待关联外部课节";
  let state = await readState(tx);
  let lesson = state.lessons.find(item => item.id === mapping.lessonId);
  if (!lesson) return "本地课节不存在";
  if (lesson.status === "已取消" && event.Cmd !== "Attendance") return null;
  const manualAttendance = !!lesson.incident || !!lesson.attendanceFinal?.老师 || !!lesson.attendanceFinal?.学员;
  if (!mapping.teacherUid || !mapping.studentUid) {
    if (event.Cmd === "Attendance" && lesson.status !== "已取消" && !manualAttendance && !hasFinalPayrollAttendance(lesson)) {
      lesson.classInAttendanceReceived = true;
      lesson.classInAttendanceIssue = "课节的 ClassIn 师生账号尚未关联，无法核对最终考勤";
      if (lesson.status === "未开始") lesson.status = "待确认";
      await writeState(tx, state);
    }
    return "待关联外部课节";
  }
  if (String(event.Cmd) === "67371107") {
    if (manualAttendance || lesson.classInAttendanceReceived) return null;
    const entry = z.object({ UID: z.coerce.string(), Identity: z.number(), ActionTime: z.number() }).parse(input);
    const person = entry.Identity === 3 && entry.UID === mapping.teacherUid ? "老师" :
      entry.Identity === 1 && entry.UID === mapping.studentUid ? "学员" : null;
    if (!person) return "回调成员与课节身份不匹配";
    state = transition(state, { type: "lesson.attendance", id: lesson.id, person, result: "到堂", at: new Date(entry.ActionTime * 1000).toISOString(), operator: "ClassIn 回调" }).data;
  } else if (event.Cmd === "Attendance") {
    if (hasFinalPayrollAttendance(lesson) || (manualAttendance && lesson.status !== "已取消")) return null;
    if (lesson.status === "已取消" && lesson.classInAttendanceReceived &&
      (!lesson.classInAttendanceIssue || lesson.classInAttendanceIssue === cancellationAttendanceConflict)) return null;
    const summary = z.object({ ClassEndTime: z.number(), Data: z.array(memberSchema) }).parse(input);
    const observedAt = event.ActionTime ?? summary.ClassEndTime;
    if (lesson.classInSummaryAt !== undefined && observedAt < lesson.classInSummaryAt) return null;
    const start = Date.parse(lesson.date + "T" + lesson.time + ":00+08:00") / 1000;
    const end = start + lesson.duration * 60;
    const teacher = summaryFact("老师", mapping.teacherUid, summary.Data, start, end);
    // The final roll of a one-to-one class may contain only its attending teacher.
    const teacherOnly = !teacher.issue && !!teacher.first && summary.Data.length === 1;
    const facts = [teacher, summaryFact("学员", mapping.studentUid, summary.Data, start, end, teacherOnly)];
    const issues = facts.map(fact => fact.issue).filter(Boolean);
    for (const fact of facts) {
      const isTeacher = fact.person === "老师";
      const inKey = isTeacher ? "teacherIn" : "studentIn";
      const tagsKey = isTeacher ? "teacherAttendance" : "studentAttendance";
      if (fact.tags.includes("缺席") && lesson.attendanceUpdates?.[fact.person] && lesson[inKey]) {
        issues.push(fact.person + "已有到堂记录，与摘要缺席矛盾");
        lesson[tagsKey] = ["待核实"];
      } else {
        lesson[tagsKey] = fact.tags;
        // A partial summary must preserve any earlier realtime entry for reconciliation.
        if (!fact.issue) lesson[inKey] = fact.first;
      }
      lesson[isTeacher ? "teacherOut" : "studentOut"] = fact.last;
    }
    lesson.classInAttendanceReceived = true;
    lesson.classInSummaryAt = observedAt;
    if (facts[0].minutes === undefined) delete lesson.classInTeacherExceptionMinutes;
    else lesson.classInTeacherExceptionMinutes = facts[0].minutes;
    if (issues.length) lesson.classInAttendanceIssue = issues.join("；");
    else delete lesson.classInAttendanceIssue;
    if (lesson.status === "已取消") {
      if (!bothAttendedInClassIn(lesson)) return null;
      lesson.classInAttendanceIssue = cancellationAttendanceConflict;
    } else if (lesson.status === "未开始") lesson.status = "待确认";
    if (!lesson.classInAttendanceIssue) {
      lesson.attendance = "正常";
      for (const fact of facts) {
        if (!fact.tags.includes("缺席")) continue;
        state = transition(state, { type: "lesson.attendance", id: lesson.id, person: fact.person, result: "缺席",
          at: new Date(summary.ClassEndTime * 1000).toISOString(), operator: "ClassIn 回调" }).data;
        lesson = state.lessons.find(item => item.id === mapping.lessonId)!;
      }
      if (hasFinalPayrollAttendance(lesson)) rememberLessonPay(state, lesson, new Date().toISOString());
    }
  } else if (event.Cmd === "End") {
    if (lesson.status === "未开始") lesson.status = "待确认";
  } else if (event.Cmd === "Rating") {
    const rating = z.object({ TUID: z.coerce.string(), Comments: z.record(z.object({ S2T: z.object({ Score: z.number().int().min(1).max(5), Comment: z.string() }).optional() })) }).parse(input);
    if (rating.TUID !== mapping.teacherUid) return "评价老师与课节不匹配";
    const comment = rating.Comments[mapping.studentUid || ""]?.S2T;
    if (!comment) return "评价未包含本节学员对老师的评分";
    if (comment.Score !== 5 && comment.Score > 2) return "三星、四星评价待人工核实";
    state = transition(state, { type: "feedback.create", feedback: {
      studentId: lesson.studentId, teacherId: lesson.teacherId, lessonId: lesson.id,
      rating: comment.Score === 5 ? "好评" : "差评", category: "",
      content: comment.Comment || ("ClassIn " + comment.Score + " 星评价"),
    }, operator: "ClassIn 回调" }).data;
    const feedback = state.feedback[0];
    feedback.grade = ["", "一星", "二星", "三星", "四星", "五星"][comment.Score];
  } else if (event.Cmd === "Net") {
    const network = z.object({ UID: z.coerce.string(), ActionTime: z.number(), Data: z.record(z.unknown()) }).parse(input);
    if (network.UID !== mapping.teacherUid && network.UID !== mapping.studentUid) return "网络报告成员与课节不匹配";
    state.events.unshift({
      id: crypto.randomUUID(), studentId: lesson.studentId, teacherId: lesson.teacherId,
      date: new Date(network.ActionTime * 1000).toISOString(), type: "网络报告待核实",
      content: "ClassIn 已收到网络报告，需核实后判定责任。", operator: "ClassIn 回调",
      relatedType: "lesson", relatedId: lesson.id,
    });
  } else {
    return "事件已保存，待实现业务映射：" + event.Cmd;
  }
  await writeState(tx, state);
  return null;
}
