import StudentCourses from "../StudentCourses";
import { SchedulingAccountNotice } from "./SchedulingAccountNotice";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  getScheduleCredits,
  getStudentScheduleProgress,
  schedulingAccountIssue,
  availabilitySummary,
  type Student,
  type Teacher,
  type Lesson,
} from "@crazytalk/shared";
import { Avatar, Badge, Button, EmptyState, Tabs } from "@crazytalk/ui";
import CourseSyncLink from "../CourseSyncLink";
import ClassInOperationFeedback from "../ClassInOperationFeedback";

type Props = {
  person:
    | { kind: "student"; value: Student }
    | { kind: "teacher"; value: Teacher };
  onStart: (mode: "auto" | "custom") => void;
  onLesson: (id: string) => void;
  onReschedule: (id: string) => void;
  onTeacherCalendar: () => void;
  onTeacherProfile: () => void;
};
export function ScheduleOverview({
  person,
  onStart,
  onLesson,
  onReschedule,
  onTeacherCalendar,
  onTeacherProfile,
}: Props) {
  const { data, can, preview } = useDemo();
  const [history, setHistory] = useState(false);
  const [week, setWeek] = useState(() =>
    addDays(
      DEMO_TODAY,
      -((new Date(`${DEMO_TODAY}T12:00:00+08:00`).getUTCDay() + 6) % 7),
    ),
  );
  const student = person.kind === "student" ? person.value : undefined;
  const teacher = person.kind === "teacher" ? person.value : undefined;
  const credits = student ? getScheduleCredits(data, student.id, 0, 1) : null;
  const progress = student?.scheduleIntent
    ? getStudentScheduleProgress(data, student.id, student.scheduleIntent)
    : null;
  const blocked =
    student && ["停课", "结课", "退费"].includes(student.status)
      ? `学员当前为${student.status}，不可新增排课`
      : teacher?.status === "已离职"
        ? "老师已离职，不可新增排课"
        : "";
  const accountIssue = student ? schedulingAccountIssue(data, student.id) : "";
  const issue = accountIssue ? "" : credits?.error;
  const lessons = data.lessons
    .filter((l) =>
      student ? l.studentId === student.id : l.teacherId === person.value.id,
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const displayed = lessons.filter((l) =>
    history
      ? l.date < DEMO_TODAY || l.status === "已取消"
      : l.date >= DEMO_TODAY && l.status !== "已取消",
  );
  const weekLessons = lessons.filter(
    (l) => l.date >= week && l.date < addDays(week, 7) && l.status !== "已取消",
  );
  const weekMinutes = weekLessons.reduce((sum, l) => sum + l.duration, 0);
  const balanceKnown =
    !!student &&
    (!!data.orders?.some((o) => o.studentIds.includes(student.id)) ||
      student.balanceKnown);
  const shared =
    !!student &&
    !!data.orders?.some(
      (o) => o.studentIds.includes(student.id) && o.studentIds.length > 1,
    );
  const label = (l: Lesson) =>
    student
      ? data.teachers.find((t) => t.id === l.teacherId)?.name
      : data.students.find((s) => s.id === l.studentId)?.name;
  return (
    <div className="stack schedule-overview" aria-label="排课概况">
      <section className="schedule-summary-card stack">
        <div className="row between wrap">
          <div className="row schedule-overview-person">
            <Avatar name={person.value.name} />
            <div>
              <h3>{person.value.name}</h3>
              <small>ID：{person.value.id}</small>
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
                  {balanceKnown ? (
                    <>
                      {credits.balance}
                      <small> 课时</small>
                    </>
                  ) : (
                    "待核实"
                  )}
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
                  {!balanceKnown || credits.error ? (
                    "待核实"
                  ) : (
                    <>
                      {credits.available}
                      <small> 课时</small>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            {progress && student?.scheduleIntent ? (
              <div className="schedule-plan-progress">
                <strong>当前计划</strong>
                <span>
                  {student.scheduleIntent.startDate} 起 · 每周{" "}
                  {student.scheduleIntent.frequency} 节 · 共{" "}
                  {student.scheduleIntent.weeks} 周
                </span>
                <p>
                  计划 {progress.requiredCount} 节 · 已安排{" "}
                  {progress.scheduledCount} 节 · 还需安排{" "}
                  {Math.max(
                    0,
                    progress.requiredCount - progress.scheduledCount,
                  )}{" "}
                  节
                </p>
                {!progress.complete &&
                  progress.scheduledCount >= progress.requiredCount && (
                    <small>固定上课时间尚未对齐，请检查已有安排。</small>
                  )}
              </div>
            ) : null}
          </>
        ) : (
          teacher && (
            <>
              <div className="row between wrap">
                <strong>
                  {week} — {addDays(week, 6)}
                </strong>
                <div className="row">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setWeek(addDays(week, -7))}
                  >
                    上一周
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setWeek(addDays(week, 7))}
                  >
                    下一周
                  </Button>
                </div>
              </div>
              <dl className="schedule-metrics">
                <div>
                  <dt>本周已排课节</dt>
                  <dd>
                    {weekLessons.length}
                    <small> 节</small>
                  </dd>
                </div>
                <div>
                  <dt>本周已排时长</dt>
                  <dd>
                    {weekMinutes}
                    <small> 分钟</small>
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
              <small>
                实际可排空档请查看课表，已排课程、请假及临时安排按现有规则校验。
              </small>
            </>
          )
        )}
        {blocked && (
          <p role="status" className="notice">
            {blocked}
          </p>
        )}
        {issue && (
          <p role="status" className="notice">
            {issue}
          </p>
        )}
        {can("schedule.create") && (
          <div className="row wrap">
            {student && (
              <Button
                variant="primary"
                disabled={preview || !!blocked || !!accountIssue}
                onClick={() => onStart("auto")}
              >
                一键排课
              </Button>
            )}
            <Button
              variant={student ? "secondary" : "primary"}
              disabled={preview || !!blocked || !!accountIssue}
              onClick={() => onStart("custom")}
            >
              {student ? "自定义排课" : "为该老师排课"}
            </Button>
          </div>
        )}
        {student && <SchedulingAccountNotice student={student} />}
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
          <div className="row between wrap">
            <h3>已安排课程</h3>
            <div className="row wrap">
              <Tabs
                value={history ? "history" : "upcoming"}
                onChange={(v) => {
                  setHistory(v === "history");
                }}
                items={[
                  { value: "upcoming", label: "未来课程" },
                  { value: "history", label: "历史与取消" },
                ]}
              />
              <Button size="sm" onClick={onTeacherCalendar}>
                查看完整课表
              </Button>
            </div>
          </div>
          {displayed.length ? (
            <div className="schedule-lessons-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日期时间</th>
                    <th>{student ? "老师" : "学员"}</th>
                    <th>时长</th>
                    <th>状态 / 同步</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((l) => (
                    <tr key={l.id}>
                      <td>
                        {l.date}
                        <br />
                        {l.time}
                      </td>
                      <td>{label(l)}</td>
                      <td>{l.duration} 分钟</td>
                      <td>
                        <Badge tone="neutral">{l.status}</Badge>
                        <CourseSyncLink lesson={l} />
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onLesson(l.id)}
                        >
                          查看详情
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={history ? "暂无历史课程" : "暂无已安排课程"}
              description={
                history
                  ? "已结束和已取消的课程会显示在这里。"
                  : "选择排课方式，预览确认后将在这里显示。"
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
