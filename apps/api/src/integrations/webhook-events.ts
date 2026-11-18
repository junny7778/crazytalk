import { z } from "zod";
import { Transaction, readState, writeState } from "../store";
import { transition } from "../../../../packages/shared/src/domain";

const eventSchema = z.object({
  Cmd: z.union([z.string(), z.number()]), ClassID: z.coerce.string(),
  CourseID: z.coerce.string(), ActionTime: z.coerce.number().optional(),
}).passthrough();
const memberSchema = z.object({
  Uid: z.coerce.string(), AttendanceTime: z.number(), FirstInTime: z.number(), LastOutTime: z.number(), Identity: z.number(),
});
const clock = (seconds: number) => new Date(seconds * 1000 + 8 * 3600000).toISOString().slice(11, 16);

export async function applyClassInEvent(tx: Transaction, input: unknown) {
  const event = eventSchema.parse(input);
  const mapping = await tx.classInLesson.findFirst({ where: { courseId: event.CourseID, classId: event.ClassID } });
  if (!mapping) return "待关联外部课节";
  let state = await readState(tx);
  let lesson = state.lessons.find(item => item.id === mapping.lessonId);
  if (!lesson) return "本地课节不存在";
  if (lesson.status === "已取消") return null;
  if (!mapping.teacherUid || !mapping.studentUid) return "待关联外部课节";
  if (String(event.Cmd) === "67371107") {
    const entry = z.object({ UID: z.coerce.string(), Identity: z.number(), ActionTime: z.number() }).parse(input);
    const person = entry.Identity === 3 && entry.UID === mapping.teacherUid ? "老师" :
      entry.Identity === 1 && entry.UID === mapping.studentUid ? "学员" : null;
    if (!person) return "回调成员与课节身份不匹配";
    state = transition(state, { type: "lesson.attendance", id: lesson.id, person, result: "到堂", at: new Date(entry.ActionTime * 1000).toISOString(), operator: "ClassIn 回调" }).data;
  } else if (event.Cmd === "Attendance") {
    const summary = z.object({ ClassEndTime: z.number(), Data: z.array(memberSchema) }).parse(input);
    for (const [person, uid] of [["老师", mapping.teacherUid], ["学员", mapping.studentUid]] as const) {
      const member = summary.Data.find(item => item.Uid === uid);
      if (!member) return "考勤摘要缺少课节成员";
      state = transition(state, { type: "lesson.attendance", id: lesson.id, person,
        result: member.AttendanceTime > 0 ? "到堂" : "缺席",
        at: new Date(summary.ClassEndTime * 1000).toISOString(), operator: "ClassIn 回调" }).data;
      lesson = state.lessons.find(item => item.id === mapping.lessonId)!;
      if (member.AttendanceTime > 0) {
        const tags: ("正常" | "待核实")[] = [];
        const start = Date.parse(lesson.date + "T" + lesson.time + ":00+08:00") / 1000;
        if (member.FirstInTime > start || member.LastOutTime < start + lesson.duration * 60) tags.push("待核实");
        if (!tags.length) tags.push("正常");
        if (person === "老师") { lesson.teacherIn = clock(member.FirstInTime); lesson.teacherOut = clock(member.LastOutTime); lesson.teacherAttendance = tags; }
        else { lesson.studentIn = clock(member.FirstInTime); lesson.studentOut = clock(member.LastOutTime); lesson.studentAttendance = tags; }
      }
    }
    lesson = state.lessons.find(item => item.id === mapping.lessonId)!;
    if (lesson.attendance === "无数据" || lesson.attendance === "账号待关联") lesson.attendance = "正常";
    if (lesson.status === "未开始") lesson.status = "待确认";
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
