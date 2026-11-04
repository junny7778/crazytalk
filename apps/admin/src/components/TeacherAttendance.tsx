import { useState } from "react";
import { Link } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import { DEMO_TODAY, addDays, type Lesson } from "@crazytalk/shared";
import { Badge, Button, Tabs } from "@crazytalk/ui";

export function attendanceTags(lesson: Lesson): string[] {
  if (lesson.status === "已取消") return [];
  if (lesson.status === "未开始" || lesson.date > DEMO_TODAY) return ["待上课"];
  if (lesson.teacherAttendance)
    return lesson.teacherAttendance.length
      ? lesson.teacherAttendance
      : ["待核实"];
  if (lesson.attendance === "老师缺席") return ["缺席"];
  if (lesson.attendance === "老师迟到") return ["迟到"];
  if (
    lesson.attendance === "正常" &&
    lesson.sync === "已同步" &&
    lesson.teacherIn &&
    lesson.teacherOut
  )
    return ["正常"];
  return ["待核实"];
}
function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="row wrap">
      {tags.map((tag) => (
        <Badge
          key={tag}
          tone={
            tag === "正常"
              ? "success"
              : tag === "缺席"
                ? "danger"
                : ["迟到", "早退", "有异常"].includes(tag)
                  ? "warning"
                  : "neutral"
          }
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
function endTime(lesson: Lesson) {
  const [h, m] = lesson.time.split(":").map(Number);
  const minutes = h * 60 + m + lesson.duration;
  return `${minutes >= 1440 ? "次日 " : ""}${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export default function TeacherAttendance({
  teacherId,
}: {
  teacherId: string;
}) {
  const { data } = useDemo();
  const [month, setMonth] = useState(DEMO_TODAY.slice(0, 7));
  const [selected, setSelected] = useState(DEMO_TODAY);
  const [view, setView] = useState("calendar");
  const rows = data.lessons
    .filter(
      (l) =>
        l.teacherId === teacherId &&
        l.date.startsWith(month) &&
        l.status !== "已取消",
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const [year, number] = month.split("-").map(Number);
  const start = addDays(
    month + "-01",
    -((new Date(year, number - 1, 1).getDay() + 6) % 7),
  );
  const count =
    Math.ceil(
      (((new Date(year, number - 1, 1).getDay() + 6) % 7) +
        new Date(year, number, 0).getDate()) /
        7,
    ) * 7;
  const chooseMonth = (next: string) => {
    setMonth(next);
    const first = data.lessons
      .filter(
        (l) =>
          l.teacherId === teacherId &&
          l.date.startsWith(next) &&
          l.status !== "已取消",
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    setSelected(
      next === DEMO_TODAY.slice(0, 7)
        ? DEMO_TODAY
        : first?.date || next + "-01",
    );
  };
  const move = (offset: number) => {
    const d = new Date(year, number - 1 + offset, 1);
    chooseMonth(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const displayed =
    view === "list" ? rows : rows.filter((l) => l.date === selected);
  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="row">
          <Button
            variant="ghost"
            onClick={() => move(-1)}
            aria-label="考勤上个月"
          >
            〈
          </Button>
          <strong>
            {year}年{number}月
          </strong>
          <Button
            variant="ghost"
            onClick={() => move(1)}
            aria-label="考勤下个月"
          >
            〉
          </Button>
          <Button
            variant="ghost"
            onClick={() => chooseMonth(DEMO_TODAY.slice(0, 7))}
          >
            本月
          </Button>
        </div>
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: "calendar", label: "日历" },
            { value: "list", label: "列表" },
          ]}
        />
      </div>
      <div className="row wrap">
        {["正常", "迟到", "早退", "缺席", "待核实"].map((tag) => (
          <div className="inset" key={tag}>
            {tag}{" "}
            <strong>
              {rows.filter((l) => attendanceTags(l).includes(tag)).length}
            </strong>{" "}
            次
          </div>
        ))}
      </div>
      <small className="muted">
        按课次统计；同一节课的迟到、早退分别计数。未开始和已取消课程不计入考勤统计。
      </small>
      <div className={view === "calendar" ? "teacher-attendance-layout" : ""}>
        {view === "calendar" && (
          <div className="teacher-attendance-calendar">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(
              (d) => (
                <strong key={d}>{d}</strong>
              ),
            )}
            {Array.from({ length: count }, (_, i) => addDays(start, i)).map(
              (day) => {
                const lessons = rows.filter((l) => l.date === day);
                const tags = lessons.flatMap(attendanceTags);
                const state = tags.some((t) =>
                  ["迟到", "早退", "缺席"].includes(t),
                )
                  ? "有异常"
                  : tags.includes("待核实")
                    ? "待核实"
                    : tags.includes("正常")
                      ? "正常"
                      : tags.includes("待上课")
                        ? "待上课"
                        : "";
                return (
                  <button
                    type="button"
                    key={day}
                    disabled={!day.startsWith(month)}
                    aria-label={`查看${day}考勤`}
                    aria-pressed={day === selected}
                    onClick={() => setSelected(day)}
                  >
                    <span>{Number(day.slice(8))}</span>
                    {state && <Tags tags={[state]} />}
                    {lessons.length > 0 && <small>{lessons.length} 节课</small>}
                  </button>
                );
              },
            )}
          </div>
        )}
        <div className="stack">
          <strong>
            {view === "calendar" ? `${selected} 上课详情` : "当月考勤记录"}
          </strong>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {[
                    ...(view === "list" ? ["日期"] : []),
                    "学员",
                    "计划上课",
                    "计划下课",
                    "实际进入",
                    "实际离开",
                    "考勤结果",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((l) => (
                  <tr key={l.id}>
                    {view === "list" && <td>{l.date}</td>}
                    <td>
                      <Link to={`/students/${l.studentId}`}>
                        {data.students.find((s) => s.id === l.studentId)
                          ?.name || "未知学员"}
                      </Link>
                    </td>
                    <td>{l.time}</td>
                    <td>{endTime(l)}</td>
                    <td>{attendanceTags(l).includes("待上课") ? "—" : l.teacherIn || "未获取"}</td>
                    <td>{attendanceTags(l).includes("待上课") ? "—" : l.teacherOut || "未获取"}</td>
                    <td>
                      <Tags tags={attendanceTags(l)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!displayed.length && <p className="muted">暂无课程记录</p>}
        </div>
      </div>
    </div>
  );
}
