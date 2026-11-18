import { database, lockBusiness, readState, writeState } from "./store";
import { configureBusinessClock } from "../../../packages/shared/src/model";
import { transition } from "../../../packages/shared/src/domain";
import { autoSettleLessons } from "../../../packages/shared/src/autoLessonSettlement";
export async function settleCompletedLessons() {
  return database.$transaction(
    async (tx) => {
      await lockBusiness(tx);
      configureBusinessClock();
      const before = await readState(tx);
      let updated = before;
      const now = Date.now();
      for (const lesson of before.lessons) {
        if (
          lesson.status === "已取消" ||
          lesson.attendance === "账号待关联" ||
          lesson.attendance === "无数据"
        )
          continue;
        for (const person of ["学员", "老师"] as const) {
          const tags =
            person === "老师"
              ? lesson.teacherAttendance
              : lesson.studentAttendance;
          const absent = tags
            ? tags.includes("缺席")
            : lesson.attendance === person + "缺席";
          if (!absent) continue;
          const start = Date.parse(
            lesson.date + "T" + lesson.time + ":00+08:00",
          );
          if (
            now < start ||
            now >= start + lesson.duration * 60000 ||
            lesson.attendanceMessages?.[person] ||
            lesson.status === "已完成" ||
            lesson.status === "缺席"
          )
            continue;
          updated = transition(updated, {
            type: "lesson.attendance",
            id: lesson.id,
            person,
            result: "未到堂",
            at: new Date(now).toISOString(),
            operator: "系统考勤",
          }).data;
        }
      }
      const after = autoSettleLessons(updated);
      if (after !== before) await writeState(tx, after, before);
    },
    { timeout: 30000 },
  );
}
