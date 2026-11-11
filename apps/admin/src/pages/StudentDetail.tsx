import {SurveyLink} from "../components/StudentSurvey";
import StudentClassIn from "../components/StudentClassIn";
import { formatStudentProgress } from "@crazytalk/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Copy, Pencil, ChevronDown } from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import { DEMO_TODAY, getStudentSummary } from "@crazytalk/shared";
import StudentHistoryEditor from "../components/StudentHistoryEditor";
import {
  Badge,
  Drawer,
  Button,
  EmptyState,
  Panel,
  StatCard,
  Tabs,
  useToast,
} from "@crazytalk/ui";
import {
  StudentActionModal,
  type StudentAction,
} from "../components/StudentActions";
import StudentTasks from "../components/StudentTasks";
import StudentCourses from "../components/StudentCourses";
import { StudentLessonDrawer } from "../components/StudentLessonDrawer";
import StudentService from "../components/StudentService";
import StudentCredits from "../components/StudentCredits";
import StudentRecordDrawer from "../components/StudentRecordDrawer";
import StudentFeedbackDrawer from "../components/StudentFeedbackDrawer";
import FeedbackEditor from "./operations/FeedbackEditor";
import { studentFieldGroups, studentFieldValue } from "../lib/studentFields";
import type {
  StudentActivity,
  StudentRecordTarget,
} from "../lib/studentActivity";
import "./student-detail.css";
function CardNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="student-stat-note-label">{label}：</span>
      <span className="student-stat-note-content">{children}</span>
    </>
  );
}
function Value({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="student-detail-value">
      <dt>{label}</dt>
      <dd>
        {value === "" || value === null || value === undefined ? (
          <span className="muted">未填写</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
function Details({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="student-detail-fields">
      {entries.map(([label, value]) => (
        <Value key={label} label={label} value={value} />
      ))}
    </dl>
  );
}
const tabs = [
  { value: "profile", label: "概述信息" },
  { value: "courses", label: "课程与教材进度" },
  { value: "service", label: "服务跟进" },
  { value: "credits", label: "课时与续费" },
];
export default function StudentDetail() {
  const { id } = useParams();
  const { data, can } = useDemo();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [action, setAction] = useState<StudentAction | null>(null);
  const [initialLessonId, setInitialLessonId] = useState<string>();
  const [initialFeedbackId, setInitialFeedbackId] = useState<string>();
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [record, setRecord] = useState<StudentRecordTarget | null>(null);
  const [editor, setEditor] = useState<
    { kind: "new" } | { kind: "edit"; id: string } | null
  >(null);
  const [showPhone, setShowPhone] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !moreRef.current?.contains(event.target) &&
        moreRef.current
      )
        moreRef.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape" && moreRef.current?.open) {
        moreRef.current.open = false;
        moreRef.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (params.get("action") === "credit") {
      setAction("credit");
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete("action");
          return next;
        },
        { replace: true },
      );
    }
  }, [params, setParams]);
  const student = data.students.find(
    (item) => item.id === (data.studentIdAliases?.[id || ""] ?? id),
  );
  if (!student)
    return (
      <EmptyState
        title="没有找到这位学员"
        action={
          <Button onClick={() => navigate("/students")}>返回学员列表</Button>
        }
      />
    );
  const rawTab = params.get("tab") || "profile";
  const tab = ["schedule", "lessons", "progress"].includes(rawTab)
    ? "courses"
    : ["feedback", "teachers"].includes(rawTab)
      ? "service"
      : rawTab === "timeline"
        ? "profile"
        : tabs.some((item) => item.value === rawTab)
          ? rawTab
          : "profile";
  const setTab = (next: string) =>
    setParams((current) => {
      const result = new URLSearchParams(current);
      result.set("tab", next);
      return result;
    });
  const sharedBalance=(data.orders || []).filter(o=>o.studentIds.includes(student.id)).reduce((n,o)=>n+o.balance,0);
  const nextLesson = data.lessons
    .filter(
      (item) =>
        item.studentId === student.id &&
        item.status === "未开始" &&
        item.date >= DEMO_TODAY,
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const events = data.events.filter((item) => item.studentId === student.id);
  const summary = getStudentSummary(data, student.id);
  const currentTeacher = summary.teacher.name || "暂未安排老师";
  const canManageService =
    can("student.reschedule") &&
    ["待排课", "在读", "停课"].includes(student.status);
  const stopped = ["停课", "结课", "退费"].includes(student.status);
  const statusRecord = events
    .filter((event) => event.type === student.status)
    .sort((a, b) =>
      (b.recordedAt || b.date).localeCompare(a.recordedAt || a.date),
    )[0];
  const fieldLabels: Record<string, string> = {
    firstLessonDate: "首次上课日期",
  };
  const displayedValue = (
    key: Parameters<typeof studentFieldValue>[1],
  ): ReactNode => {
    switch (key) {
      case "teacherName":
        return currentTeacher;
      case "material":
        return summary.progress.material;
      case "scheduleText":
        return summary.scheduleText || (nextLesson ? "临时安排" : "暂未排课");
      case "frequencyText":
        return summary.frequencyText || "未填写";
      case "firstLessonDate":
        return summary.firstLessonDate;
      case "purchaseDate":
        return summary.purchaseDate;
      case "totalUnits":
        return summary.totalUnits;
      case "renewalStatus":
        return summary.renewalStatus;
      default:
        return studentFieldValue(student, key);
    }
  };
  function openAction(
    next: StudentAction,
    selectedLesson?: string,
    selectedFeedback?: string,
  ) {
    if (moreRef.current) moreRef.current.open = false;
    setInitialLessonId(selectedLesson);
    setInitialFeedbackId(selectedFeedback);
    setAction(next);
  }
  function openFeedback(selectedId?: string) {
    setRecord(null);
    setLessonId(null);
    if (selectedId) setFeedbackId(selectedId);
    else {
      setFeedbackId(null);
      setEditor({ kind: "new" });
    }
  }
  function openLesson(selectedId: string) {
    setRecord(null);
    setFeedbackId(null);
    setLessonId(selectedId);
  }
  function openRecord(target: StudentActivity["target"]) {
    if (target.kind === "feedback") openFeedback(target.id);
    else if (target.kind === "lesson") openLesson(target.id);
    else setRecord(target);
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label}已复制`);
    } catch {
      toast("复制未成功，请选中内容复制", { tone: "error" });
    }
  }
  return (
    <div className="stack student-detail">
      <Button
        className="student-back"
        size="sm"
        variant="ghost"
        onClick={() => navigate("/students")}
      >
        <ArrowLeft size={15} />
        返回学员列表
      </Button>
      <header className="page-heading student-detail-heading">
        <div>
          <div className="student-name-status">
            <h1>{student.name}</h1>
            <Badge
              tone={student.orderStatus === "正常" ? "success" : "neutral"}
            >
              {student.orderStatus || "订单状态未填写"}
            </Badge>
          </div>
          <p>
            渠道：{student.channel || "未填写"} · 负责教务：
            {student.owner || "未填写"}
          </p>
        </div>
        <div className="student-header-actions">
          {(canManageService || can("student.edit") || can("student.view")) && (
            <details className="student-more" ref={moreRef}>
              <summary>
                更多操作 <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="student-more-menu">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (moreRef.current) moreRef.current.open = false;
                    setOperationsOpen(true);
                  }}
                >
                  查看操作记录
                </Button>
                {can("student.edit") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (moreRef.current) moreRef.current.open = false;
                      setHistoryOpen(true);
                    }}
                  >
                    补录／更正历史资料
                  </Button>
                )}
                {canManageService && (
                  <>
                    {!stopped && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openAction("停课")}
                      >
                        办理停课
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAction("结课")}
                    >
                      办理结课
                    </Button>
                    {can("student.refund") && (
                      <div className="student-more-danger">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="student-refund-action"
                          onClick={() => openAction("退费")}
                        >
                          退款后停用服务
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>
          )}
          {can("student.edit") && (
            <Button onClick={() => openAction("edit")}>
              <Pencil size={16} />
              编辑资料
            </Button>
          )}
        </div>
      </header>
      {stopped && (
        <div className="student-service-status" role="status">
          <strong>当前{student.orderStatus || student.status}</strong>
          <p>
            {statusRecord
              ? `${statusRecord.date} · ${statusRecord.content}`
              : "暂无办理说明"}
          </p>
          <div className="row wrap between">
            <small>
              历史课程、反馈和课时记录仍可查看。重新上课请先办理复课。
            </small>
            {can("student.reschedule") && (
              <Button variant="primary" onClick={() => openAction("在读")}>
                办理复课
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="student-detail-stats">
        <StatCard
          label="剩余课时"
          title="查看课时明细"
          value={
            sharedBalance ? `共享 ${sharedBalance} · 个人 ${student.balanceKnown ? student.balance : "待核"}` : student.balanceKnown ? `${student.balance} 课时` : "余额待核实"
          }
          note={
            student.orderStatus === "退款" ? (
              "账面余额保留，服务已停用"
            ) : student.balanceKnown ? (
              <CardNote label="余额状态">已核实</CardNote>
            ) : (
              <CardNote label="余额状态">待核实，核实后可查看变动依据</CardNote>
            )
          }
          onClick={() => setTab("credits")}
        />
        <StatCard
          label="当前老师"
          title="查看课程安排"
          value={currentTeacher}
          note={
            summary.scheduleText ? (
              <CardNote label="固定上课">{summary.scheduleText}</CardNote>
            ) : (
              "暂无固定上课安排"
            )
          }
          onClick={() => setTab("courses")}
        />
        <StatCard
          label="下节课"
          title={nextLesson ? "查看本节课程" : "查看课程安排"}
          value={
            nextLesson
              ? `${Number(nextLesson.date.slice(5, 7))}月${Number(nextLesson.date.slice(8, 10))}日 ${nextLesson.time}`
              : "暂无待上课程"
          }
          note={
            nextLesson ? (
              <CardNote label="本节时长">{nextLesson.duration} 分钟</CardNote>
            ) : (
              "可前往课程页安排课程"
            )
          }
          onClick={() =>
            nextLesson ? openLesson(nextLesson.id) : setTab("courses")
          }
        />
        <StatCard
          label="教材进度"
          title="查看学习进度"
          value={
            formatStudentProgress(summary.progress.unit) || "尚未记录学习进度"
          }
          note={
            <CardNote label="当前教材">
              {summary.progress.material || "尚未填写"}
            </CardNote>
          }
          onClick={() => setTab("courses")}
        />
      </div>
      <div className="student-detail-tabs">
        <Tabs variant="underline" items={tabs} value={tab} onChange={setTab} />
      </div>
      {tab === "profile" && (
        <>
          <SurveyLink student={student}/>
          <StudentClassIn key={student.id} student={student}/>
          {studentFieldGroups
            .filter(
              (group) =>
                !["换老师记录", "月度上课情况", "课中相关"].includes(
                  group.title,
                ),
            )
            .sort((a, b) => {
              const order = [
                "学生基本信息",
                "学习特点与偏好",
                "订单与续课",
                "教学安排",
              ];
              return order.indexOf(a.title) - order.indexOf(b.title);
            })
            .map((group) => (
              <Panel key={group.title} title={group.title}>
                <Details
                  entries={group.fields
                    .filter(
                      (field) =>
                        field.key !== "sourceSequence" &&
                        (field.key !== "legacyComplaints" ||
                          can("feedback.view")),
                    )
                    .map((field): [string, ReactNode] => {
                      const value = displayedValue(field.key);
                      if (field.key === "phone" && student.phone)
                        return [
                          field.label,
                          <span className="student-copy-value">
                            <span>
                              {can("field.student_phone") && showPhone
                                ? student.phone
                                : `****${student.phone.slice(-4)}`}
                            </span>
                            {can("field.student_phone") && (
                              <>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => setShowPhone(!showPhone)}
                                >
                                  {showPhone ? "隐藏" : "显示"}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  aria-label="复制手机号"
                                  onClick={() =>
                                    void copy(student.phone, "手机号")
                                  }
                                >
                                  <Copy size={13} />
                                </Button>
                              </>
                            )}
                          </span>,
                        ];
                      if (field.key === "groupName" && student.groupName)
                        return [
                          field.label,
                          <span className="student-copy-value">
                            <span>{student.groupName}</span>
                            <Button
                              size="xs"
                              variant="ghost"
                              aria-label="复制学生群名"
                              onClick={() =>
                                void copy(student.groupName, "学生群名")
                              }
                            >
                              <Copy size={13} />
                            </Button>
                          </span>,
                        ];
                      return [fieldLabels[field.key] || field.label, value];
                    })}
                />
              </Panel>
            ))}
        </>
      )}
      {tab === "courses" && (
        <>
          <StudentCourses
            student={student}
            onReschedule={(selectedId) => openAction("reschedule", selectedId)}
            onOpenLesson={openLesson}
            onSchedule={() =>
              navigate(`/schedule?student=${encodeURIComponent(student.id)}`)
            }
            onChangeTeacher={() => openAction("changeTeacher")}
          />
          {student.monthlyRecords.length > 0 && (
            <details className="student-history">
              <summary>历史月度记录</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>月份</th>
                      <th>月应上课</th>
                      <th>实际上课</th>
                      <th>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.monthlyRecords.map((item) => (
                      <tr key={item.id}>
                        <td>{item.month || "未填写"}</td>
                        <td>{item.planned ?? "未填写"}</td>
                        <td>{item.actual ?? "未填写"}</td>
                        <td>{item.note || "未填写"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
      {tab === "service" && (
        <>
          <StudentService
            student={student}
            onOpen={openRecord}
            onVisit={() => openAction("visit")}
            onFeedback={() => openFeedback()}
            onCompensate={() =>
              student.balanceKnown
                ? openAction("compensate")
                : setTab("credits")
            }
          />
        </>
      )}
      {tab === "credits" && (
        <StudentCredits
          student={student}
          onAction={openAction}
          onOpen={setRecord}
        />
      )}
      {tab === "tasks" && (
        <>
          <StudentTasks
            student={student}
            onOpenLesson={openLesson}
            onOpenFeedback={openFeedback}
            onProcessLesson={(lessonId) => openAction("reschedule", lessonId)}
            onOpenService={() => {
              setTab("service");
              const latest = events.find((event) => event.type === "退费");
              if (latest) openRecord({ kind: "event", id: latest.id });
            }}
          />
        </>
      )}
      {operationsOpen && (
        <Drawer
          open
          title="操作记录"
          description={student.name}
          onClose={() => setOperationsOpen(false)}
          width={640}
        >
          <div className="student-detail-timeline">
            {events.length ? (
              [...events]
                .sort((a, b) =>
                  (b.recordedAt || b.date).localeCompare(
                    a.recordedAt || a.date,
                  ),
                )
                .map((item) => (
                  <article key={item.id}>
                    <div className="row between">
                      <strong>{item.type}</strong>
                      <small>
                        {item.date} · {item.operator || "经办人未记录"}
                      </small>
                    </div>
                    <p>{item.content}</p>
                  </article>
                ))
            ) : (
              <p className="muted">暂无操作记录</p>
            )}
          </div>
        </Drawer>
      )}
      {historyOpen && (
        <StudentHistoryEditor
          student={student}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {action && (
        <StudentActionModal
          student={student}
          action={action}
          initialLessonId={initialLessonId}
          initialFeedbackId={initialFeedbackId}
          onFeedback={openFeedback}
          onClose={() => setAction(null)}
        />
      )}
      {lessonId && (
        <StudentLessonDrawer
          lessonId={lessonId}
          onClose={() => setLessonId(null)}
          onReschedule={(selectedId) => openAction("reschedule", selectedId)}
        />
      )}
      {feedbackId && (
        <StudentFeedbackDrawer
          key={feedbackId}
          id={feedbackId}
          onClose={() => setFeedbackId(null)}
          onOpenFull={(selectedId) =>
            navigate(`/feedback/${encodeURIComponent(selectedId)}`)
          }
        />
      )}
      {editor && (
        <FeedbackEditor
          key={editor.kind === "edit" ? editor.id : "new"}
          record={
            editor.kind === "edit"
              ? data.feedback.find((item) => item.id === editor.id)
              : undefined
          }
          studentId={student.id}
          lockStudent
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
      <StudentRecordDrawer
        student={student}
        target={record}
        onClose={() => setRecord(null)}
        onOpenFeedback={openFeedback}
        onOpenLesson={openLesson}
        onOpen={setRecord}
      />
    </div>
  );
}
