export {
  attendanceOptions,
  attendanceIssue,
  personAttendance,
  attendanceLabels,
} from "@crazytalk/shared";

import { attendanceLabels, type Lesson } from "@crazytalk/shared";
import { isOverdueLesson } from "./lessonOrder";

export function recordAttendance(lesson: Lesson, now = Date.now()): string[] {
  return isOverdueLesson(lesson, now) ? ["待核实"] : attendanceLabels(lesson);
}
