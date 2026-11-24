import { CourseViewSwitch } from "./CourseCalendarControls";
import { isAvailable } from "@crazytalk/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import {
  Button,
  DatePicker,
  EmptyState,
  Field,
  Select,
} from "@crazytalk/ui";
import LessonWeekCalendar from "./LessonWeekCalendar";
import { StudentLessonDrawer } from "./StudentLessonDrawer";
import ListPagination from "./ListPagination";
export default function TeacherSchedule({ teacherId }: { teacherId: string }) {
  const { data } = useDemo();
  const [view, setView] = useState("list"),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [lessonId, setLessonId] = useState<string | null>(null),
    [page, setPage] = useState(1);
  const lessons = data.lessons
    .filter(
      (l) =>
        l.teacherId === teacherId &&
        (!status || l.status === status) &&
        (view === "calendar" || !from || l.date >= from) &&
        (view === "calendar" || !to || l.date <= to),
    )
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(lessons.length / 25)),
  );
  const name = (id: string) =>
    data.students.find((s) => s.id === id)?.name || "未关联学员";
  const statusFilter = (
    <Field label="课程状态">
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <option value="">全部状态</option>
        {["未开始", "待确认", "已完成", "缺席", "已取消"].map((value) => (
          <option key={value}>{value}</option>
        ))}
      </Select>
    </Field>
  );
  return (
    <div className="stack">
      <div className="row between wrap">
        <span className="muted">共 {lessons.length} 节课</span>
        <CourseViewSwitch value={view} onChange={setView} />
      </div>
      {view === "list" && (
        <div className="sc-filters">
          <Field label="上课日期（起始）">
            <DatePicker
              mode="date"
              placeholder="上课日期（起始）"
              value={from}
              onValueChange={(value) => {
                setFrom(value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="上课日期（结束）">
            <DatePicker
              mode="date"
              placeholder="上课日期（结束）"
              min={from || undefined}
              value={to}
              onValueChange={(value) => {
                setTo(value);
                setPage(1);
              }}
            />
          </Field>
          {statusFilter}
          {(from || to || status) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setStatus("");
                setPage(1);
              }}
            >
              清除筛选
            </Button>
          )}
        </div>
      )}
      {view === "list" && from && to && from > to && (
        <p role="alert" className="danger">
          结束日期不能早于开始日期
        </p>
      )}
      {view === "calendar" ? (
        <LessonWeekCalendar
          filters={statusFilter}
          lessons={lessons}
          label={(l) => name(l.studentId)}
          onOpen={setLessonId}
          available={(date, time) =>
            isAvailable(
              data,
              teacherId,
              date,
              time,
              25,
              undefined,
              undefined,
              false,
              true,
            ).length === 0
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    "时间",
                    "学员",
                    "教材",
                    "时长",
                    "课程类型",
                    "课程状态",
                    "操作",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lessons
                  .slice((currentPage - 1) * 25, currentPage * 25)
                  .map((l) => {
                    const student = data.students.find((item) => item.id === l.studentId);
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.date} {l.time}
                        </td>
                        <td>
                          {student ? (
                            <Link to={`/students/${student.id}`}>{student.name}</Link>
                          ) : "未关联学员"}
                        </td>
                        <td>{l.material}</td>
                        <td>{l.duration} 分钟</td>
                        <td>{l.kind}</td>
                        <td>{l.status}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLessonId(l.id)}
                          >
                            查看详情
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {!lessons.length && <EmptyState title="暂无符合条件的课程" />}
          <ListPagination
            total={lessons.length}
            page={currentPage}
            onChange={setPage}
          />
        </>
      )}
      <StudentLessonDrawer
        lessonId={lessonId}
        showStudentInDetails
        onClose={() => setLessonId(null)}
      />
    </div>
  );
}
