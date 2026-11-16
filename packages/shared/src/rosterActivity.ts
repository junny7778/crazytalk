import {
  addDays,
  DEMO_TODAY,
  feedbackSchema,
  type DemoState,
  type Lesson,
  type Student,
} from "./model";
import { isRegularTime } from "./availability";
import { studentOrganization } from "./organization";
import { minutes } from "./domain";

function clock(minute: number) {
  return [Math.floor(minute / 60), minute % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function withRosterActivity(state: DemoState): DemoState {
  const batch = "roster-activity-202610-v1";
  if (state.importedBatches?.includes(batch)) return state;
  const groups = new Map<string, Student[]>();
  for (const student of state.students) {
    if (!student.roster || student.status !== "在读") continue;
    const { team, group } = studentOrganization(
      state.accounts,
      student.owner,
      student.roster,
    );
    const key = JSON.stringify([team, group]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(student);
  }

  const lessons = [...state.lessons],
    feedback = [...state.feedback];
  const teachers = state.teachers.filter(
    (t) => t.status === "在职" && t.availability.length,
  );
  for (const members of groups.values()) {
    for (let i = 0; i < 14; i++) {
      const student = members[i % members.length];
      const date = addDays(DEMO_TODAY, (i % 7) - 5);
      const duration = i % 4 === 0 ? 50 : 25;
      const options = [...teachers].sort(
        (a, b) =>
          Number(b.id === student.teacherId) -
          Number(a.id === student.teacherId),
      );
      let lesson: Lesson | undefined;
      for (const teacher of options) {
        const occupied = lessons.filter(
          (l) =>
            l.date === date &&
            l.status !== "已取消" &&
            (l.teacherId === teacher.id || l.studentId === student.id),
        );
        for (let start = 9 * 60; start + duration <= 22 * 60; start += 30) {
          const time = clock(start);
          if (
            !isRegularTime(teacher, date, time, duration) ||
            occupied.some(
              (l) =>
                start < minutes(l.time) + l.duration &&
                start + duration > minutes(l.time),
            )
          )
            continue;
          const status =
            date > DEMO_TODAY
              ? "未开始"
              : i === 2
                ? "已取消"
                : i === 3
                  ? "待确认"
                  : "已完成";
          const attendance =
            i === 3 ? "学员缺席" : i === 4 ? "老师迟到" : "正常";
          const held = status === "已完成" || status === "待确认";
          lesson = {
            id: `roster-lesson-${student.id}-${i}`,
            studentId: student.id,
            teacherId: teacher.id,
            date,
            time,
            duration,
            kind: "固定课",
            status,
            attendance,
            teacherIn: held
              ? clock(start + (attendance === "老师迟到" ? 8 : 0))
              : "",
            teacherOut: held ? clock(start + duration) : "",
            studentIn: held && attendance !== "学员缺席" ? time : "",
            studentOut:
              held && attendance !== "学员缺席" ? clock(start + duration) : "",
            deducted: status === "已完成",
            confirmedUnits: duration / 25,
            sync: "已同步",
            syncReason: "",
            material: student.material,
            note: "",
            leaveFlag: false,
            conflict: false,
          };
          break;
        }
        if (lesson) break;
      }
      if (!lesson) continue;
      lessons.push(lesson);
      if (i !== 4 && i !== 5) continue;
      const teacher = teachers.find((t) => t.id === lesson.teacherId)!;
      const praise = i === 5;
      feedback.push(
        feedbackSchema.parse({
          id: `roster-feedback-${lesson.id}`,
          studentId: student.id,
          teacherId: teacher.id,
          lessonId: lesson.id,
          date,
          owner: student.owner,
          teacherName: teacher.name,
          so: teacher.so,
          source: student.project,
          stage: "课中问题",
          rating: praise ? "好评" : "差评",
          category: praise ? "教学表扬" : "老师相关 / 职业素养 / 迟到",
          content: praise
            ? "老师会留时间让孩子自己回答，这节课孩子主动开口了。"
            : "老师晚进教室八分钟，请帮忙核实原因。",
          status: praise ? "已完成" : "待处理",
          processNote: praise ? "已向老师转达家长反馈。" : "",
          verdict: "",
          measures: [],
          repeat: false,
        }),
      );
    }
  }
  if (lessons.length === state.lessons.length) return state;
  return {
    ...state,
    revision: state.revision + 1,
    lessons,
    feedback,
    importedBatches: [...(state.importedBatches ?? []), batch],
  };
}
