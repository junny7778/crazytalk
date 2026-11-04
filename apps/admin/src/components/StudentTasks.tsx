import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import { DEMO_TODAY, type Student, type ServiceTask } from "@crazytalk/shared";
import {
  Badge,
  Button,
  DatePicker,
  EmptyState,
  Field,
  Modal,
  Panel,
  Select,
  useToast,
} from "@crazytalk/ui";
import "./student-tasks.css";
const sourceLabels: Record<NonNullable<ServiceTask["sourceType"]>, string> = {
  manual: "手工登记",
  teacher: "老师异动",
  feedback: "学生反馈",
  lesson: "课程处理",
  student: "服务停用",
  reminder: "跟进提醒",
};
function displayTime(value?: string) {
  if (!value) return "历史未记录";
  return value.includes("T")
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Singapore",
        hour12: false,
      })
    : value;
}
export default function StudentTasks({
  student,
  onOpenLesson,
  onOpenFeedback,
  onProcessLesson,
  onOpenService,
}: {
  student: Student;
  onOpenLesson?: (id: string) => void;
  onOpenFeedback?: (id: string) => void;
  onProcessLesson?: (id: string) => void;
  onOpenService?: () => void;
}) {
  const { data, act, can, roleId } = useDemo();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(student.owner);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("待处理");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [deadline, setDeadline] = useState("");
  const [completing, setCompleting] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [saving, setSaving] = useState(false);
  const tasks = data.tasks.filter((task) => task.studentId === student.id);
  const overdue = (task: ServiceTask) =>
    task.status !== "已完成" && !!task.dueDate && task.dueDate < DEMO_TODAY;
  const filtered = tasks
    .filter(
      (task) =>
        task.status === status &&
        (!ownerFilter || task.owner === ownerFilter) &&
        (!deadline || (deadline === "unknown" ? !task.dueDate : overdue(task))),
    )
    .sort((a, b) =>
      status === "已完成"
        ? (b.completedAt || "").localeCompare(a.completedAt || "")
        : Number(overdue(b)) - Number(overdue(a)) ||
          (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
          (a.createdAt || "").localeCompare(b.createdAt || ""),
    );
  const selected = tasks.find((task) => task.id === completing);
  const operator =
    data.accounts.find(
      (account) => account.enabled && account.roleId === roleId,
    )?.name ||
    data.roles.find((role) => role.id === roleId)?.name ||
    "当前经办人";
  function resetFilters() {
    setOwnerFilter("");
    setDeadline("");
  }
  function run(action: () => void) {
    setError("");
    try {
      action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请检查填写内容");
    }
  }
  function links(task: ServiceTask) {
    const lessons = data.lessons.filter(
      (lesson) =>
        lesson.studentId === student.id && task.lessonIds?.includes(lesson.id),
    );
    const feedback =
      task.sourceType === "feedback" &&
      data.feedback.find(
        (item) => item.id === task.sourceId && item.studentId === student.id,
      );
    const process = (id: string) => {
      const lesson = lessons.find((item) => item.id === id);
      if (
        task.status !== "已完成" &&
        (task.sourceType === "teacher" || task.title.includes("调课")) &&
        lesson?.status === "未开始" &&
        can("student.reschedule") &&
        !["停课", "结课", "退费"].includes(student.status) &&
        onProcessLesson
      )
        onProcessLesson(id);
      else onOpenLesson?.(id);
    };
    return (
      <div className="student-task-links">
        <span className="muted">
          来源：{task.sourceType ? sourceLabels[task.sourceType] : "来源未记录"}
        </span>
        {feedback && can("feedback.view") && onOpenFeedback && (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onOpenFeedback(feedback.id)}
          >
            {task.status === "已完成" ? "查看反馈" : "去处理"}
          </Button>
        )}
        {!feedback &&
          can("lesson.view") &&
          lessons.length === 1 &&
          onOpenLesson && (
            <>
              <span className="muted">
                关联课程：{lessons[0].date} {lessons[0].time}
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => process(lessons[0].id)}
              >
                {task.status === "已完成" ? "查看课程" : "去处理"}
              </Button>
            </>
          )}
        {can("lesson.view") && lessons.length > 1 && (
          <details>
            <summary>关联 {lessons.length} 节课程</summary>
            <div className="student-task-related">
              {lessons.map((lesson) => (
                <div key={lesson.id}>
                  <span>
                    {lesson.date} {lesson.time} · {lesson.status}
                  </span>
                  {onOpenLesson && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => process(lesson.id)}
                    >
                      {task.status === "已完成" ? "查看课程" : "去处理"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
        {task.sourceType === "student" && onOpenService && (
          <Button size="xs" variant="ghost" onClick={onOpenService}>
            {task.status === "已完成" ? "查看服务记录" : "去处理"}
          </Button>
        )}
      </div>
    );
  }
  return (
    <Panel
      title="待办事项"
      action={
        can("student.edit") && (
          <Button
            size="sm"
            onClick={() => {
              setError("");
              setTitle("");
              setOwner(student.owner);
              setDueDate("");
              setNote("");
              setAdding(true);
            }}
          >
            新增待办
          </Button>
        )
      }
    >
      <div className="student-task-status" role="group" aria-label="待办状态">
        {["待处理", "已完成"].map((name) => (
          <Button
            key={name}
            size="sm"
            variant="ghost"
            aria-pressed={status === name}
            onClick={() => {
              setStatus(name);
              resetFilters();
              setError("");
            }}
          >
            {name}（{tasks.filter((task) => task.status === name).length}）
          </Button>
        ))}
      </div>
      {tasks.length > 0 && (
        <div className="student-task-filters">
          <Select
            aria-label="待办负责人筛选"
            value={ownerFilter}
            onValueChange={setOwnerFilter}
          >
            <option value="">全部负责人</option>
            {[...new Set(tasks.map((task) => task.owner).filter(Boolean))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </Select>
          <Select
            aria-label="待办期限"
            value={deadline}
            onValueChange={setDeadline}
          >
            <option value="">全部期限</option>
            {status !== "已完成" && <option value="overdue">已逾期</option>}
            <option value="unknown">未安排期限</option>
          </Select>
          {(ownerFilter || deadline) && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              清除筛选
            </Button>
          )}
        </div>
      )}
      {!adding && !completing && error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      {filtered.length ? (
        <div className="student-task-list">
          {filtered.map((task) => (
            <article key={task.id}>
              <div className="row between wrap">
                <strong>{task.title}</strong>
                {overdue(task) && <Badge tone="warning">已逾期</Badge>}
              </div>
              {task.status === "已完成" ? (
                <>
                  <p className="muted">
                    {task.completedBy || "完成人未记录"} ·{" "}
                    {displayTime(task.completedAt)} 完成
                  </p>
                  <p>处理结果：{task.result || "已完成，未补充说明"}</p>
                  <details>
                    <summary>展开记录</summary>
                    <p className="muted">
                      原负责人：{task.owner || "待分配"} ·{" "}
                      {task.dueDate ? `${task.dueDate}前处理` : "期限未安排"}
                    </p>
                    {task.note && <p>{task.note}</p>}
                    {links(task)}
                  </details>
                </>
              ) : (
                <>
                  <p className="muted">
                    负责人：{task.owner || "待分配"} ·{" "}
                    {task.dueDate ? `${task.dueDate}前处理` : "期限未安排"}
                  </p>
                  {links(task)}
                  {task.note && (
                    <details>
                      <summary>补充说明</summary>
                      <p>{task.note}</p>
                    </details>
                  )}
                  {can("student.edit") && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setError("");
                        setResult("");
                        setCompleting(task.id);
                      }}
                    >
                      标记完成
                    </Button>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            ownerFilter || deadline
              ? "没有符合条件的事项"
              : status === "已完成"
                ? "暂无已完成事项"
                : "暂无待处理事项"
          }
          description={
            ownerFilter || deadline
              ? "可清除筛选后查看其他事项。"
              : status === "待处理"
                ? "需要继续跟进的事项会显示在这里。"
                : "处理完成的事项会保留在这里，方便回查。"
          }
        />
      )}
      {adding && (
        <Modal
          open
          title="新增待办"
          onClose={() => setAdding(false)}
          footer={
            <>
              <Button onClick={() => setAdding(false)}>取消</Button>
              <Button
                variant="primary"
                onClick={() =>
                  run(() => {
                    act({
                      type: "task.add",
                      studentId: student.id,
                      title,
                      owner,
                      dueDate,
                      note,
                    });
                    toast("待办已登记");
                    setAdding(false);
                    setStatus("待处理");
                    resetFilters();
                  })
                }
              >
                登记待办
              </Button>
            </>
          }
        >
          <div className="stack">
            <Field label="待办事项" required>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="待办负责人" hint="默认负责教务，可调整">
              <input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              />
            </Field>
            <Field label="处理期限" hint="选填">
              <DatePicker value={dueDate} onValueChange={setDueDate} />
            </Field>
            <Field label="待办说明" hint="选填">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="danger">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
      {selected && (
        <Modal
          open
          title="确认完成待办"
          onClose={() => setCompleting(null)}
          footer={
            <>
              <Button onClick={() => setCompleting(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  run(() => {
                    act({ type: "task.complete", id: selected.id, result });
                    setCompleting(null);
                    toast("待办已完成，可在已完成事项中查看");
                  });
                  setSaving(false);
                }}
              >
                确认完成
              </Button>
            </>
          }
        >
          <div className="stack">
            <strong>{selected.title}</strong>
            <p className="muted">经办人：{operator} · 完成时间自动记录</p>
            <Field label="处理说明" hint="选填">
              <textarea
                rows={3}
                value={result}
                onChange={(event) => setResult(event.target.value)}
              />
            </Field>
            {error && (
              <p role="alert" className="danger">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </Panel>
  );
}
