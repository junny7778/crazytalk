import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { getStudentSummary, type Student } from "@crazytalk/shared";
import { Button, Drawer, EmptyState } from "@crazytalk/ui";
import "./student-statistics.css";

type Statistic = "complaints" | "compensations" | "teacherAbsences";
const labels: Record<Statistic, string> = {
  complaints: "投诉次数",
  compensations: "补偿次数",
  teacherAbsences: "被缺席次数",
};
export default function StudentStatistics({
  student,
  onOpenLesson,
  onOpenFeedback,
  onOpenCredit,
}: {
  student: Student;
  onOpenLesson: (id: string) => void;
  onOpenFeedback: (id: string) => void;
  onOpenCredit: (id: string) => void;
}) {
  const { data, can } = useDemo();
  const summary = getStudentSummary(data, student.id);
  const [opened, setOpened] = useState<Statistic | null>(null);
  function openSource(action: () => void) {
    setOpened(null);
    action();
  }
  return (
    <>
      <div
        className="student-statistics-grid"
        role="group"
        aria-label="服务记录统计"
      >
        {(["complaints", "compensations", "teacherAbsences"] as const)
          .filter((kind) => kind !== "complaints" || can("feedback.view"))
          .map((kind) => {
            const count = summary[kind];
            return (
              <button
                key={kind}
                className="student-statistic"
                aria-label={`${labels[kind]} ${count.total ?? count.system} 次，查看明细`}
                onClick={() => setOpened(kind)}
              >
                <span>
                  {
                    {
                      complaints: "投诉",
                      compensations: "补偿",
                      teacherAbsences: "老师缺席",
                    }[kind]
                  }
                </span>
                <strong>{count.total ?? count.system} 次</strong>
                <span aria-hidden="true">›</span>
              </button>
            );
          })}
      </div>
      <Drawer
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened ? labels[opened] : "服务记录"}
        width={660}
      >
        {opened && (
          <div className="stack">
            <div className="inset">
              已有明细 {summary[opened].system} 次 · 历史累计{" "}
              {summary[opened].historical === null
                ? "未核实"
                : `${summary[opened].historical} 次`}
              {student.historyStartDate
                ? ` · 后续统计自 ${student.historyStartDate}`
                : ""}
            </div>
            {summary[opened].total === null && (
              <p className="muted">
                当前显示已登记记录的次数。
                {summary[opened].historical === null
                  ? "历史累计次数尚未确认。"
                  : "历史累计次数已保留。"}
                {!student.historyStartDate &&
                  "尚未确认历史与后续记录的统计起始日期。"}
                确认后再计算累计次数，避免重复统计。
              </p>
            )}
            {opened === "complaints" &&
              summary.complaints.records.map((record) => (
                <article className="student-statistic-source" key={record.id}>
                  <div>
                    <strong>{record.date} · 差评</strong>
                    <p>{record.content || "未填写反馈原话"}</p>
                    <small>{record.status}</small>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openSource(() => onOpenFeedback(record.id))}
                  >
                    查看反馈
                  </Button>
                </article>
              ))}
            {opened === "compensations" &&
              summary.compensations.records.map((record) => (
                <article className="student-statistic-source" key={record.id}>
                  <div>
                    <strong>
                      {record.date} · 补偿 {record.units} 课时
                    </strong>
                    <p>{record.note || "未填写说明"}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openSource(() => onOpenCredit(record.id))}
                  >
                    查看补偿
                  </Button>
                </article>
              ))}
            {opened === "teacherAbsences" &&
              summary.teacherAbsences.records.map((record) => (
                <article className="student-statistic-source" key={record.id}>
                  <div>
                    <strong>
                      {record.date} {record.time} · 老师缺席
                    </strong>
                    <p>
                      {
                        data.teachers.find(
                          (teacher) => teacher.id === record.teacherId,
                        )?.name
                      }{" "}
                      · {record.duration} 分钟
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openSource(() => onOpenLesson(record.id))}
                  >
                    查看课程
                  </Button>
                </article>
              ))}
            {summary[opened].records.length === 0 && (
              <EmptyState title="暂无对应明细" />
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
