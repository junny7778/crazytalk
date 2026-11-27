import {
  availabilitySummary,
  getScheduleCredits,
  schedulingBookingIssue,
  teacherSchedulingAccountIssue,
  type Student,
  type Teacher,
} from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Avatar, Button } from "@crazytalk/ui";
import { Link } from "react-router-dom";
import ClassInOperationFeedback from "../ClassInOperationFeedback";
import StudentCourses from "../StudentCourses";
import TeacherSchedule from "../TeacherSchedule";
import { SchedulingAccountNotice, TeacherSchedulingAccountNotice } from "./SchedulingAccountNotice";

type Props = {
  person:
    | { kind: "student"; value: Student }
    | { kind: "teacher"; value: Teacher };
  onStart: (mode: "auto" | "custom" | "temp") => void;
  onLesson: (id: string) => void;
  onReschedule: (id: string) => void;
  onTeacherProfile: () => void;
};
export function ScheduleOverview({
  person,
  onStart,
  onLesson,
  onReschedule,
  onTeacherProfile,
}: Props) {
  const { data, can, preview } = useDemo();
  const student = person.kind === "student" ? person.value : undefined;
  const teacher = person.kind === "teacher" ? person.value : undefined;
  const credits = student ? getScheduleCredits(data, student.id, 0, 1) : null;
  const blocked =
    student && ["停课", "结课", "退费"].includes(student.status)
      ? `学员当前为${student.status}，不可新增排课`
      : teacher?.status === "已离职"
        ? "老师已离职，不可新增排课"
        : "";
  const accountIssue = student ? schedulingBookingIssue(data,student.id) : teacher ? teacherSchedulingAccountIssue(teacher) : "";
  const noCredits = !!credits && credits.available < 1;
  const hint = blocked || (noCredits ? "可用课时不足，无法新增排课。" : credits?.error);
  const lessons = data.lessons
    .filter((l) =>
      student ? l.studentId === student.id : l.teacherId === person.value.id,
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const scheduledLessons = lessons.filter((l) => l.status !== "已取消");
  const unfinishedCount = scheduledLessons.filter(
    lesson => lesson.status === "未开始" || lesson.status === "待确认",
  ).length;
  const shared =
    !!student &&
    !!data.orders?.some(
      (o) => o.studentIds.includes(student.id) && o.studentIds.length > 1,
    );
  return (
    <div className="stack schedule-overview" aria-label="排课概况">
      <section className="schedule-summary-card stack">
        <div className="row between wrap">
          <div className="row schedule-overview-person">
            <Avatar name={person.value.name} />
            <div>
              <h3>{person.value.name}</h3>
              <small>
                ID：
                {person.kind === "teacher"
                  ? person.value.teacherNumber
                  : person.value.id}
              </small>
            </div>
          </div>
          {student ? (
            <Link to={`/students/${student.id}`}>查看学员档案</Link>
          ) : (
            <Button variant="ghost" size="sm" onClick={onTeacherProfile}>
              查看老师资料
            </Button>
          )}
        </div>
        {credits ? (
          <>
            {shared && <small>共享课时 · 以下余额和占用包含共用学员</small>}
            <dl className="schedule-metrics">
              <div>
                <dt>剩余课时</dt>
                <dd>
                  {credits.balance}<small> 课时</small>
                </dd>
              </div>
              <div>
                <dt>已排占用</dt>
                <dd>
                  {credits.unknownCount ? (
                    "待核实"
                  ) : (
                    <>
                      {credits.reserved}
                      <small> 课时</small>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt>可继续排</dt>
                <dd>
                  {credits.unknownCount ? (
                    "待核实"
                  ) : (
                    <>
                      {Math.max(0, credits.available)}
                      <small> 课时</small>
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          teacher && (
            <>
              <dl className="schedule-metrics">
                <div>
                  <dt>全部已排课节</dt>
                  <dd>
                    {scheduledLessons.length}
                    <small> 节</small>
                  </dd>
                </div>
                <div>
                  <dt>未完成课节</dt>
                  <dd>
                    {unfinishedCount}
                    <small> 节</small>
                  </dd>
                </div>
                <div>
                  <dt>可授课时间</dt>
                  <dd className="schedule-availability-summary">
                    {teacher.availability.length
                      ? availabilitySummary(teacher)
                      : "待维护"}
                  </dd>
                </div>
              </dl>
            </>
          )
        )}
        {can("schedule.create") && (
          <div className="row wrap">
            {student && (
              <Button
                variant="primary"
                disabled={preview || !!blocked || !!accountIssue || noCredits}
                onClick={() => onStart("auto")}
              >
                一键排课
              </Button>
            )}
            <Button
              variant={student ? "secondary" : "primary"}
              disabled={preview || !!blocked || !!accountIssue || noCredits}
              onClick={() => onStart("custom")}
            >
              {student ? "自定义排课" : "为该老师排课"}
            </Button>
            {student && (
              <Button
                variant="secondary"
                disabled={preview || !!blocked || !!accountIssue || noCredits}
                onClick={() => onStart("temp")}
              >
                临时排课
              </Button>
            )}
          </div>
        )}
        {hint && (
          <p role="status" className="schedule-booking-hint" data-status={student?.status}>
            {hint}
          </p>
        )}
        {student && !blocked && !noCredits && <SchedulingAccountNotice student={student} />}
        {teacher && <TeacherSchedulingAccountNotice key={teacher.id} teacher={teacher}/>}
        {student &&
          data.tasks
            .filter(
              (t) =>
                t.studentId === student.id &&
                t.rebooking &&
                t.status === "待处理",
            )
            .map((t) => (
              <p key={t.id} className="notice">
                {t.title}
              </p>
            ))}
        {student && <ClassInOperationFeedback studentId={student.id} />}
      </section>
      {student ? (
        <StudentCourses
          key={student.id}
          student={student}
          timetableOnly
          onReschedule={onReschedule}
        />
      ) : (
        <section
          className="schedule-summary-card stack"
          aria-label="已安排课程"
        >
          <h3>已安排课程</h3>
          <TeacherSchedule key={person.value.id} teacherId={person.value.id} />
        </section>
      )}
    </div>
  );
}
