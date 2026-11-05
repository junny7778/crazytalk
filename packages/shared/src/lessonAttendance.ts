import type { Lesson } from "./model";
export const attendanceOptions = [
  "正常",
  "老师迟到",
  "老师早退",
  "老师缺席",
  "学员迟到",
  "学员早退",
  "学员缺席",
  "待核实",
];
export function attendanceIssue(lesson: Lesson): string | undefined {
  if (lesson.status === "已取消") return;
  if (lesson.attendance === "无数据") return "未收到考勤数据";
  if (lesson.attendance === "账号待关联") return "上课账号尚未关联学员";
}
export function personAttendance(
  lesson: Lesson,
  person: "老师" | "学员",
): string[] {
  if (lesson.status === "未开始" || lesson.status === "已取消") return [];
  if (attendanceIssue(lesson)) return ["待核实"];
  const tags =
    person === "老师" ? lesson.teacherAttendance : lesson.studentAttendance;
  if (tags) return tags;
  if (lesson.attendance.startsWith(person)) return [lesson.attendance.slice(2)];
  if (person === "学员" && lesson.status === "缺席") return ["缺席"];
  const hasTimes =
    person === "老师"
      ? lesson.teacherIn && lesson.teacherOut
      : lesson.studentIn && lesson.studentOut;
  return hasTimes ? ["正常"] : ["待核实"];
}
export function attendanceLabels(lesson: Lesson): string[] {
  const teacher = personAttendance(lesson, "老师");
  const student = personAttendance(lesson, "学员");
  if (!teacher.length && !student.length) return [];
  const labels = [
    ...teacher
      .filter((tag) => tag !== "正常")
      .map((tag) => (tag === "待核实" ? tag : `老师${tag}`)),
    ...student
      .filter((tag) => tag !== "正常")
      .map((tag) => (tag === "待核实" ? tag : `学员${tag}`)),
  ];
  return labels.length ? [...new Set(labels)] : ["正常"];
}
