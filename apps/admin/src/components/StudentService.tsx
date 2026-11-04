import { useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import type { Student } from "@crazytalk/shared";
import { Badge, Button, EmptyState, Panel } from "@crazytalk/ui";
import {
  studentActivities,
  type StudentActivity,
} from "../lib/studentActivity";

export default function StudentService({
  student,
  onOpen,
  onVisit,
  onFeedback,
  onCompensate,
}: {
  student: Student;
  onOpen: (target: StudentActivity["target"]) => void;
  onVisit: () => void;
  onFeedback: () => void;
  onCompensate: () => void;
}) {
  const { data, can } = useDemo();
  const [limit, setLimit] = useState(15);
  const [filter, setFilter] = useState("全部");
  const canViewFeedback = can("feedback.view");
  const records = useMemo(() => {
    const activities = studentActivities(data, student.id).filter((item) => {
      if (item.type === "反馈") return canViewFeedback;
      if (["回访", "换老师", "服务状态"].includes(item.type)) return true;
      const target = item.target;
      return (
        target.kind === "credit" &&
        data.credits.some(
          (credit) => credit.id === target.id && credit.type === "补偿",
        )
      );
    });
    const absences: StudentActivity[] = data.lessons
      .filter(
        (lesson) =>
          lesson.studentId === student.id &&
          ["已完成", "缺席"].includes(lesson.status) &&
          lesson.attendance === "老师缺席",
      )
      .map((lesson) => ({
        id: `absence-${lesson.id}`,
        date: lesson.date,
        type: "老师缺席",
        title: "老师缺席",
        content: `${lesson.time} · ${data.teachers.find((teacher) => teacher.id === lesson.teacherId)?.name || "老师未记录"} · ${lesson.duration} 分钟${lesson.note ? `。${lesson.note}` : ""}`,
        person: "",
        target: { kind: "lesson", id: lesson.id },
      }));
    return [...activities, ...absences].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (b.recordedAt || "").localeCompare(a.recordedAt || ""),
    );
  }, [data, student.id, canViewFeedback]);
  function matches(item: StudentActivity, name: string) {
    if (name === "全部") return true;
    if (name === "服务状态") return item.type === "服务状态";
    if (name === "反馈") return item.type === "反馈";
    if (name === "补偿") return item.target.kind === "credit";
    return item.type === name;
  }
  const filters = [
    "全部",
    ...(canViewFeedback ? ["反馈"] : []),
    "回访",
    "补偿",
    "老师缺席",
    "换老师",
    "服务状态",
  ].filter(
    (name) => name === "全部" || records.some((item) => matches(item, name)),
  );
  const activeFilter = filters.includes(filter) ? filter : "全部";
  const filtered = records.filter((item) => matches(item, activeFilter));
  function title(item: StudentActivity) {
    if (item.type === "反馈" && ["好评", "差评"].includes(item.title))
      return "学员反馈";
    if (item.type === "回访") return "回访记录";
    if (item.type === "换老师") return "更换任课老师";
    if (item.target.kind === "credit") return "课时补偿";
    if (item.type === "在读") return "复课记录";
    return item.title;
  }
  function person(item: StudentActivity) {
    if (!item.person) return "";
    if (item.id.startsWith("feedback-"))
      return `负责教务：${item.person.replace(/^负责教务\s*/, "")}`;
    return `经办人：${item.person}`;
  }
  return (
    <Panel
      title="服务记录"
      action={
        <div className="row wrap">
          {can("student.edit") && (
            <Button size="sm" onClick={onVisit}>
              记录回访
            </Button>
          )}
          {can("feedback.create") && (
            <Button size="sm" onClick={onFeedback}>
              登记反馈
            </Button>
          )}
          {can("credit.compensate") && (
            <Button size="sm" onClick={onCompensate}>
              登记补偿
            </Button>
          )}
        </div>
      }
    >
      <div
        className="student-service-views"
        role="group"
        aria-label="服务记录筛选"
      >
        {filters.map((name) => (
          <Button
            key={name}
            size="sm"
            variant="ghost"
            aria-pressed={activeFilter === name}
            onClick={() => {
              setFilter(name);
              setLimit(15);
            }}
          >
            {name}{" "}
            {name === "全部"
              ? records.length
              : records.filter((item) => matches(item, name)).length}{" "}
            次
          </Button>
        ))}
      </div>
      {filtered.length ? (
        <div className="student-service-feed">
          {filtered.slice(0, limit).map((item) => (
            <article key={item.id}>
              <div className="student-service-date">
                <time>{item.date || "日期未记录"}</time>
                {person(item) && <span>{person(item)}</span>}
              </div>
              <div className="student-service-content">
                <div className="row wrap between">
                  <div className="row wrap">
                    <strong>{title(item)}</strong>
                    {item.type === "反馈" &&
                      ["好评", "差评"].includes(item.title) && (
                        <Badge
                          tone={item.title === "差评" ? "danger" : "success"}
                        >
                          {item.title}
                        </Badge>
                      )}
                  </div>
                  {item.status && (
                    <Badge
                      tone={item.status === "已完成" ? "success" : "neutral"}
                    >
                      {item.status}
                    </Badge>
                  )}
                </div>
                <p>{item.content}</p>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onOpen(item.target)}
                >
                  查看详情
                </Button>
              </div>
            </article>
          ))}
          {filtered.length > limit && (
            <Button size="sm" onClick={() => setLimit(limit + 15)}>
              查看更多记录
            </Button>
          )}
        </div>
      ) : (
        <EmptyState
          title={
            activeFilter === "全部" ? "暂无服务记录" : `暂无${activeFilter}记录`
          }
          description="在这里查看反馈、回访、补偿、老师缺席和换老师记录。"
        />
      )}
    </Panel>
  );
}
