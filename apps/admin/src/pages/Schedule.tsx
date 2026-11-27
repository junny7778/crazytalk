import { schedulingBookingIssue } from "@crazytalk/shared";
import { TimePicker } from "@crazytalk/ui";
import {
addDays,
availabilitySummary,
type Command,
DEMO_TODAY,
type FixedPlan,
formatDate,
getScheduleCredits,
getStudentScheduleProgress,
isAvailable,
isRegularTime,
type Lesson,
type ScheduleIntent,
type Student,
type Teacher
} from "@crazytalk/shared";
import { businessMode,useDemo } from "@crazytalk/shared/react";
import {
Avatar,
Badge,
Button,DatePicker,Drawer,
EmptyState,
Field,
Modal,
PageHeader,
SearchInput,Select,Tabs,
useToast
} from "@crazytalk/ui";
import {
Clock3,
Plus
} from "lucide-react";
import { useEffect,useMemo,useState } from "react";
import { Link,useBlocker,useSearchParams } from "react-router-dom";
import CourseSyncLink from "../components/CourseSyncLink";
import DataTransferButton from "../components/DataTransferButton";
import { CustomSchedulingPanel } from "../components/scheduling/CustomSchedulingPanel";
import { FixedPlanCalendar } from "../components/scheduling/FixedPlanCalendar";
import { ScheduleOverview } from "../components/scheduling/ScheduleOverview";
import { StudentSchedulingPanel } from "../components/scheduling/StudentSchedulingPanel";
import "../components/weekly-calendar.css";
import "./Schedule.css";
type Slot = { date: string; time: string };
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const minute = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const dayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
const monday = (date: string) => addDays(date, -((dayOf(date) + 6) % 7));
const active = (lesson: Lesson) => lesson.status !== "已取消";
export default function Schedule() {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const routeStudentId =
    data.studentIdAliases?.[params.get("student") || ""] ??
    params.get("student");
  const view = params.get("view") === "day" ? "day" : "week";
  const base = params.get("date") || DEMO_TODAY;
  const weekStart = monday(base);
  const [selectedTeacher, setTeacher] = useState(
    params.get("teacher") ||
      (businessMode() ? data.teachers[0]?.id || "" : "t1"),
  );
  const [panel, setPanel] = useState(
    params.get("teacher") && !params.get("student") ? "teachers" : "pending",
  );
  const [flow, setFlow] = useState<"overview" | "auto" | "custom" | "temp">("overview");
  const [workflowStage, setWorkflowStage] = useState<"setup" | "preview">(
    "setup",
  );
  const [workflowDirty, setWorkflowDirty] = useState(false);
  useEffect(() => {
    // Remove unfinished schedules saved by earlier versions.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ct-custom-calendar:")) localStorage.removeItem(key);
    }
  }, []);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  function leaveWorkflow(action: () => void) {
    if (workflowBusy) return;
    if (workflowDirty || fixedPlan) setLeaveAction(() => action);
    else action();
  }
  function resetWorkflow() {
    setFlow("overview");
    setWorkflowStage("setup");
    setFixedPlan(null);
    setFixedPreview(false);
    setModal(null);
    setSelected([]);
    setWorkflowDirty(false);
    setWorkflowBusy(false);
    setError("");
  }
  const [query, setQuery] = useState("");
  const [so, setSo] = useState("");
  const [studentId, setStudent] = useState(routeStudentId || "");
  const [fixedPreview, setFixedPreview] = useState(false);
  const [fixedPlan, setFixedPlan] = useState<{
    plan: FixedPlan;
    intent: ScheduleIntent;
  } | null>(null);
  const [profileTeacherId, setProfileTeacherId] = useState("");
  const [scheduleResult, setScheduleResult] = useState<{
    studentId: string;
    studentName: string;
    teacherName: string;
    count: number;
  } | null>(null);
  const [selected, setSelected] = useState<Slot[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [modal, setModal] = useState<"schedule" | "reschedule" | null>(null);
  const [rescheduleConfirmed, setRescheduleConfirmed] = useState(false);
  const [moveResponsibility, setMoveResponsibility] = useState<"老师" | "学员" | "平台">("平台");
  const [error, setError] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState(DEMO_TODAY);
  const [rescheduleTime, setRescheduleTime] = useState("19:00");
  const [rescheduleTeacher, setRescheduleTeacher] = useState(
    businessMode() ? data.teachers[0]?.id || "" : "t1",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (routeStudentId) {
      resetWorkflow();
      setStudent(routeStudentId);
      setPanel("pending");
    }
  }, [routeStudentId]);
  const hasDraft = workflowDirty || !!fixedPlan;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (hasDraft || workflowBusy) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        new URLSearchParams(currentLocation.search).get("student") !==
          new URLSearchParams(nextLocation.search).get("student")),
  );
  useEffect(() => {
    if (!hasDraft && !workflowBusy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDraft, workflowBusy]);
  const student = data.students.find((s) => s.id === studentId);
  const teacher =
    data.teachers.find((t) => t.id === selectedTeacher) || data.teachers[0];
  const lesson = data.lessons.find((l) => l.id === lessonId);
  function navigateView(
    next: string,
    date = base,
    teacherId = selectedTeacher,
  ) {
    const p = new URLSearchParams(params);
    p.set("view", next);
    p.set("date", date);
    p.set("teacher", teacherId);
    setParams(p);
  }
  const studentRanks = useMemo(() => {
    const futureStudents = new Set(
      data.lessons
        .filter((l) => l.date >= DEMO_TODAY && (l.status === "未开始" || l.status === "待确认"))
        .map((l) => l.studentId),
    );
    const ranks = new Map<string, number>();
    for (const student of data.students) {
      if (["停课", "结课", "退费"].includes(student.status)) {
        ranks.set(student.id, 4);
      } else if (!futureStudents.has(student.id)) {
        ranks.set(student.id, getScheduleCredits(data, student.id, 0, 1).available < 1 ? 3 : 0);
      } else {
        const plan = student.scheduleIntent;
        let rank = 2;
        if (plan && addDays(plan.startDate, plan.weeks * 7) > DEMO_TODAY) {
          const { scheduledCount, requiredCount } = getStudentScheduleProgress(data, student.id, plan);
          if (scheduledCount > 0 && scheduledCount < requiredCount) rank = 1;
        }
        ranks.set(student.id, rank);
      }
    }
    return ranks;
  }, [data]);
  const studentRank = (s: Student) => studentRanks.get(s.id)!;
  function rosterStatusBadge(student: Student) {
    switch (studentRank(student)) {
      case 0: return <Badge>待排课</Badge>;
      case 1: return <span className="badge roster-partial-badge">部分排课</span>;
      case 2: return <Badge tone="info">已排课</Badge>;
      case 3: return <Badge tone="warning">课时不足</Badge>;
      default:
        if (student.status === "结课") return <span className="badge roster-completed-badge">结课</span>;
        return <Badge tone={student.status === "退费" ? "danger" : "warning"}>{student.status}</Badge>;
    }
  }
  const allStudents = useMemo(
    () =>
      [...data.students].sort(
        (a, b) =>
          studentRank(a) - studentRank(b) ||
          a.name.localeCompare(b.name, "zh-CN") ||
          a.id.localeCompare(b.id),
      ),
    [data.students, studentRanks],
  );
  const pending = allStudents.filter(
    (s) =>
      `${s.name} ${s.id}`.toLowerCase().includes(studentQuery.toLowerCase()) &&
      (studentFilter === "all" || studentFilter === String(studentRank(s))),
  );
  const visibleTeachers = data.teachers
    .filter(
      (t) =>
        t.status === "在职" &&
        (!so || t.so === so) &&
        t.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(a.status === "已离职") - Number(b.status === "已离职") ||
        Number(!a.availability.length) - Number(!b.availability.length) ||
        usage(a) - usage(b) ||
        a.name.localeCompare(b.name),
    );
  const filtered = visibleTeachers;
  useEffect(() => {
    if (!studentId && allStudents.length) setStudent(allStudents[0].id);
  }, [studentId, allStudents]);
  function changePanel(next: string) {
    if (next === panel) return;
    leaveWorkflow(() => {
      resetWorkflow();
      setPanel(next);
      setScheduleResult(null);
    });
  }
  function usage(t: Teacher, date?: string) {
    const dates = date
      ? [date]
      : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const open = dates.reduce(
      (sum, d) =>
        sum +
        (t.availabilityFrom && d < t.availabilityFrom
          ? 0
          : t.availability
              .filter((r) => r.day === dayOf(d))
              .reduce((n, r) => n + minute(r.end) - minute(r.start), 0)),
      0,
    );
    const booked = data.lessons
      .filter(
        (l) => l.teacherId === t.id && dates.includes(l.date) && active(l),
      )
      .reduce((sum, l) => sum + l.duration, 0);
    return open ? Math.min(100, Math.round((booked / open) * 100)) : 0;
  }
  function selectTeacher(id: string) {
    if (id === selectedTeacher) return;
    leaveWorkflow(() => {
      resetWorkflow();
      setTeacher(id);
      navigateView("week", base, id);
    });
  }
  function changeStudent(id: string) {
    setStudent(id);
    if (modal !== "schedule") {
      setSelected([]);
    }
  }
  function beginSchedule() {
    setError("");
    setModal("schedule");
  }
  const moveTeacher = data.teachers.find((t) => t.id === rescheduleTeacher);
  const moveOutside = Boolean(
    lesson &&
      moveTeacher &&
      !isRegularTime(
        moveTeacher,
        rescheduleDate,
        rescheduleTime,
        lesson.duration,
      ),
  );
  const movePrecheck = lesson
    ? schedulingBookingIssue(data, lesson.studentId, [rescheduleTeacher]) || isAvailable(
        data,
        rescheduleTeacher,
        rescheduleDate,
        rescheduleTime,
        lesson.duration,
        lesson.studentId,
        lesson.id,
        true,
      )[0]
    : "";
  useEffect(() => {
    setRescheduleConfirmed(false);
  }, [rescheduleTeacher, rescheduleDate, rescheduleTime]);
  const [actionBusy, setActionBusy] = useState(false);
  async function run(command: Command, onSuccess?: () => void) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const result = await act(command);
      toast(result.message, { undo: result.undo });
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "暂时没能保存，请重试");
      toast(e instanceof Error ? e.message : "暂时没能保存，请重试", {
        tone: "error",
      });
    } finally {
      setActionBusy(false);
    }
  }
  async function exportSchedule() {
    setBusy(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("老师周课表");
      sheet.addRow([
        "老师",
        "日期",
        "时间",
        "学生群名",
        "学生名字",
        "时长",
        "教材",
      ]);
      data.lessons
        .filter(
          (l) =>
            l.date >= weekStart &&
            l.date <= addDays(weekStart, 6) &&
            active(l) &&
            filtered.some((t) => t.id === l.teacherId),
        )
        .forEach((l) => {
          const s = data.students.find((s) => s.id === l.studentId);
          sheet.addRow([
            data.teachers.find((t) => t.id === l.teacherId)?.name,
            l.date,
            l.time,
            s?.groupName,
            s?.name,
            l.duration,
            l.material,
          ]);
        });
      sheet.columns.forEach((c) => (c.width = 20));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveBlob(blob, `老师周课表-${weekStart}.xlsx`);
      toast("课表已导出");
    } catch {
      toast("导出失败，请重试", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  const profileTeacher = data.teachers.find((t) => t.id === profileTeacherId);
  return (
    <div className="schedule-page">
      <PageHeader
        title="排课管理"
        description="找到合适的老师，把每一节课安排妥当。"
        action={
          <>
            {can("schedule.export") && (
              <DataTransferButton
                direction="export"
                size="sm"
                onClick={exportSchedule}
                loading={busy}
              />
            )}
          </>
        }
      />
      <Tabs
        value={panel}
        onChange={changePanel}
        items={[
          { value: "pending", label: "按学员排课" },
          { value: "teachers", label: "按老师排课" },
        ]}
      />
      <div className="schedule-workspace">
        <aside
          className={`schedule-roster ${panel === "pending" ? "schedule-student-roster" : ""}`}
        >
          <h3>{panel === "teachers" ? "老师列表" : "学员列表"}</h3>
          <SearchInput
            value={panel === "teachers" ? query : studentQuery}
            onChange={panel === "teachers" ? setQuery : setStudentQuery}
            placeholder={panel === "teachers" ? "搜索姓名" : "搜索姓名或 ID"}
          />
          {panel === "pending" ? (
            <>
              <Select
                aria-label="排课状态"
                value={studentFilter}
                onValueChange={setStudentFilter}
              >
                <option value="all">全部学员</option>
                <option value="0">待排课</option>
                <option value="1">部分排课</option>
                <option value="2">已排课</option>
                <option value="3">课时不足</option>
              </Select>
              <div className="roster-list" aria-label="学员列表">
                {pending.map((s) => (
                  <button
                    key={s.id}
                    className={`roster-person ${studentId === s.id ? "selected" : ""}`}
                    aria-pressed={studentId === s.id}
                    onClick={() =>
                      leaveWorkflow(() => {
                        resetWorkflow();
                        changeStudent(s.id);
                        setScheduleResult(null);
                      })
                    }
                  >
                    <Avatar name={s.name} />
                    <span>
                      <span className="roster-student-heading">
                        <strong title={s.name}>{s.name}</strong>
                        {rosterStatusBadge(s)}
                      </span>
                      <small>ID：{s.id}</small>
                    </span>
                  </button>
                ))}
              </div>
              {!pending.length && (
                <EmptyState
                  title="没有符合条件的学员"
                  description="试试搜索其他姓名或清除筛选。"
                />
              )}
              {(studentQuery || studentFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStudentQuery("");
                    setStudentFilter("all");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </>
          ) : (
            <>
              <Select aria-label="按 SO 筛选" value={so} onValueChange={setSo}>
                <option value="">全部 SO</option>
                {[...new Set(data.teachers.map((t) => t.so))].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <div className="roster-list" aria-label="老师列表">
                {filtered.map((t) => (
                  <button
                    key={t.id}
                    className={`roster-person ${selectedTeacher === t.id ? "selected" : ""}`}
                    aria-pressed={selectedTeacher === t.id}
                    onClick={() => selectTeacher(t.id)}
                  >
                    <Avatar name={t.name} />
                    <span>
                      <strong>{t.name}</strong>
                      <small>SO：{t.so}</small>
                    </span>
                  </button>
                ))}
              </div>
              {!filtered.length && (
                <EmptyState
                  title="没有符合条件的老师"
                  description="试试搜索其他姓名或清除筛选。"
                />
              )}
              {(query || so) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setSo("");
                  }}
                >
                  清除筛选
                </Button>
              )}
            </>
          )}
        </aside>
        <div
          data-student-flow={flow !== "overview" && panel !== "teachers" || undefined}
          className={`schedule-main stack ${flow !== "overview" ? "schedule-workspace-card" : ""}`}
        >
          {scheduleResult && (
            <div role="status" className="schedule-result row between wrap">
              <span>
                已为 {scheduleResult.studentName} 安排 {scheduleResult.count}{" "}
                节课程。课程已保存，可在下方查看同步状态。
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setScheduleResult(null)}
              >
                关闭提示
              </Button>
            </div>
          )}
          {flow !== "overview" && (
            <div className="schedule-flow-heading row between wrap">
              <div className="schedule-person-heading">
                <Avatar
                  name={
                    (panel === "pending" ? student?.name : teacher?.name) || ""
                  }
                />
                <div>
                  <h3>
                    {panel === "pending" ? student?.name : teacher?.name} ·{" "}
                    安排课程
                  </h3>
                  <small>
                    ID:{" "}
                    {panel === "pending" ? student?.id : teacher?.teacherNumber}
                  </small>
                </div>
              </div>
              {
                <ol className="schedule-steps" aria-label="排课步骤">
                  <li
                    aria-current={
                      !fixedPreview && workflowStage === "setup"
                        ? "step"
                        : undefined
                    }
                  >
                    ① 设置排课
                  </li>
                  <li aria-hidden="true">→</li>
                  <li
                    aria-current={
                      fixedPreview || workflowStage === "preview"
                        ? "step"
                        : undefined
                    }
                  >
                    ② 预览确认
                  </li>
                </ol>
              }
            </div>
          )}
          {flow === "overview" && (panel === "pending" ? student : teacher) && (
            <ScheduleOverview
              key={`${panel}-${panel === "pending" ? studentId : selectedTeacher}`}
              person={
                panel === "pending" && student
                  ? { kind: "student", value: student }
                  : { kind: "teacher", value: teacher }
              }
              onStart={(mode) => {
                setScheduleResult(null);
                setFlow(mode);
                if (mode === "custom" || mode === "temp") {
                  setSelected([]);
                  setModal("schedule");
                }
              }}
              onReschedule={(id) => {
                const selectedLesson = data.lessons.find((l) => l.id === id)!;
                setLessonId(id);
                setRescheduleDate(selectedLesson.date);
                setRescheduleTime(selectedLesson.time);
                setRescheduleTeacher(selectedLesson.teacherId);
                setReason("");
                setRescheduleConfirmed(false);
                setMoveResponsibility("平台");
                setError("");
                setModal("reschedule");
              }}
              onLesson={setLessonId}
              onTeacherProfile={() => setProfileTeacherId(selectedTeacher)}
            />
          )}
          {flow === "auto" && student && (
            <div hidden={fixedPreview}>
              <StudentSchedulingPanel
                key={student.id}
                student={student}
                onDirtyChange={setWorkflowDirty}
                onBusyChange={setWorkflowBusy}
                onClose={() => leaveWorkflow(resetWorkflow)}
                onStageChange={setWorkflowStage}
                onFixedPlan={(plan, intent) => {
                  setFixedPlan({ plan, intent });
                  setFixedPreview(true);
                  setTeacher(plan.primaryTeacherId);
                }}
                onViewTeacher={setProfileTeacherId}
                onIntentSaved={() => {
                  setFixedPlan(null);
                  setFixedPreview(false);
                  setSelected([]);
                  setWorkflowDirty(false);
                }}
                onScheduleComplete={(count, teacherName) => {
                  resetWorkflow();
                  setScheduleResult({
                    studentId,
                    studentName: student.name,
                    teacherName,
                    count,
                  });
                }}
              />
            </div>
          )}
          {fixedPlan && student && (
            <div className="schedule-summary-card" hidden={!fixedPreview}>
              <FixedPlanCalendar
                active={fixedPreview}
                key={`${studentId}-${fixedPlan.plan.primaryTeacherId}-${JSON.stringify(fixedPlan.intent)}`}
                studentId={studentId}
                plan={fixedPlan.plan}
                intent={fixedPlan.intent}
                onBusyChange={setWorkflowBusy}
                onClose={() => setFixedPreview(false)}
                onComplete={(count, teacherName) => {
                  resetWorkflow();
                  setScheduleResult({
                    studentId,
                    studentName: student.name,
                    teacherName,
                    count,
                  });
                }}
              />
            </div>
          )}
          {modal === "schedule" && (
            <div className="schedule-summary-card">
              <CustomSchedulingPanel
                key={`${panel}-${panel === "pending" ? studentId : selectedTeacher}-${flow}`}
                studentId={panel === "pending" ? studentId : ""}
                teacherId={panel === "teachers" ? selectedTeacher : ""}
                defaultKind={flow === "temp" ? "临时课" : "固定课"}
                initialTime={selected[0]}
                initialTimes={selected}
                startDate={base}
                onDirtyChange={setWorkflowDirty}
                onBusyChange={setWorkflowBusy}
                onStageChange={setWorkflowStage}
                onClose={() => leaveWorkflow(resetWorkflow)}
                onComplete={(id, count, teachers) => {
                  resetWorkflow();
                  if (panel === "pending") setStudent(id);
                  setScheduleResult({
                    studentId: id,
                    studentName:
                      data.students.find((s) => s.id === id)?.name || "学员",
                    teacherName: teachers,
                    count,
                  });
                }}
              />
            </div>
          )}
          {flow === "overview" &&
            !(panel === "pending" ? student : teacher) && (
              <EmptyState
                title="暂无可查看的人员"
                description="请先维护学员或老师资料。"
              />
            )}
        </div>
      </div>
      {panel === "teachers" &&
        selected.length > 0 &&
        modal !== "schedule" &&
        can("schedule.create") && (
          <div className="batch-bar schedule-batch">
            <div>
              <strong>
                {selected.length
                  ? `已选 ${selected.length} 个时段`
                  : student
                    ? `为 ${student.name} 排课`
                    : "选择学员开始排课"}
              </strong>
              <small>
                {selected.length
                  ? " · 每个选中时间代表一节课，按住 Shift 可多选"
                  : " · 确认后更新学员课表和老师日程"}
              </small>
            </div>
            <div className="row">
              <Button
                size="sm"
                onClick={() => {
                  setSelected([]);
                }}
              >
                取消选择
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => beginSchedule()}
                disabled={preview}
              >
                <Plus size={15} />
                使用已选时间排课
              </Button>
            </div>
          </div>
        )}
      <Modal
        open={!!leaveAction || blocker.state === "blocked"}
        title="放弃本次修改？"
        onClose={() => {
          setLeaveAction(null);
          if (blocker.state === "blocked") blocker.reset();
        }}
        footer={
          <>
            <Button
              onClick={() => {
                setLeaveAction(null);
                if (blocker.state === "blocked") blocker.reset();
              }}
            >
              继续编辑
            </Button>
            <Button
              variant="primary"
              disabled={workflowBusy}
              onClick={() => {
                leaveAction?.();
                if (blocker.state === "blocked") blocker.proceed();
                setLeaveAction(null);
              }}
            >
              放弃本次修改
            </Button>
          </>
        }
      >
        <p>本次尚未确认的排课将不会提交，已保存的课程不受影响。</p>
      </Modal>
      <Drawer
        open={Boolean(profileTeacher)}
        onClose={() => setProfileTeacherId("")}
        title="老师资料"
        width={560}
      >
        {profileTeacher && (
          <div className="stack">
            <div className="row gap-12">
              {profileTeacher.photo ? (
                <img
                  className="schedule-profile-avatar"
                  src={profileTeacher.photo}
                  alt={profileTeacher.name}
                />
              ) : (
                <Avatar name={profileTeacher.name} />
              )}
              <h3>{profileTeacher.name}</h3>
            </div>
            <dl className="schedule-teacher-profile-fields">
              <dt>SO</dt>
              <dd>{profileTeacher.so}</dd>
              <dt>口音等级</dt>
              <dd>{profileTeacher.accent || "未填写"}</dd>
              <dt>老师等级</dt>
              <dd>{profileTeacher.level || "未填写"}</dd>
              <dt>授课类型</dt>
              <dd>{profileTeacher.categories.join(" / ") || "未填写"}</dd>
              <dt>教师寄语与教学特色</dt>
              <dd>{profileTeacher.teachingPhilosophy || "未填写"}</dd>
              <dt>常规可用时间</dt>
              <dd>{availabilitySummary(profileTeacher)}</dd>
              <dt>排课要求</dt>
              <dd>
                {profileTeacher.needConfirm
                  ? "排课前需老师确认"
                  : "无额外确认要求"}
              </dd>
            </dl>
          </div>
        )}
      </Drawer>
      <Drawer
        open={Boolean(lesson) && modal !== "reschedule"}
        onClose={() => setLessonId(null)}
        title="课程详情"
        width={560}
        footer={
          lesson && (
            <>
              <Button
                onClick={() => {
                  setRescheduleDate(lesson.date);
                  setRescheduleTime(lesson.time);
                  setRescheduleTeacher(lesson.teacherId);
                  setReason("");
                  setRescheduleConfirmed(false);
                  setMoveResponsibility("平台");
                  setError("");
                  setModal("reschedule");
                }}
                disabled={
                  !can("student.reschedule") ||
                  preview ||
                  lesson.status !== "未开始" ||
                  lesson.date < DEMO_TODAY
                }
              >
                调整时间
              </Button>
              <Link to={`/students/${lesson.studentId}`}>
                <Button variant="primary">查看学员</Button>
              </Link>
            </>
          )
        }
      >
        {lesson && (
          <div className="stack">
            <div className="row gap-12">
              <Avatar
                name={
                  data.students.find((s) => s.id === lesson.studentId)?.name ||
                  ""
                }
              />
              <div>
                <h2>
                  {data.students.find((s) => s.id === lesson.studentId)?.name}
                </h2>
                <small>
                  {data.teachers.find((t) => t.id === lesson.teacherId)?.name}
                </small>
              </div>
              <Badge tone={lesson.status === "已完成" ? "success" : "neutral"}>
                {lesson.status}
              </Badge>
            </div>
            <dl className="detail-pairs">
              <dt>上课时间</dt>
              <dd>
                {formatDate(lesson.date)} {weekdays[dayOf(lesson.date)]}{" "}
                {lesson.time}–{clock(minute(lesson.time) + lesson.duration)}
              </dd>
              <dt>时长</dt>
              <dd>{lesson.duration} 分钟</dd>
              <dt>教材</dt>
              <dd>{lesson.material}</dd>
              <dt>课程安排</dt>
              <dd>{lesson.kind}</dd>
              {lesson.confirmation && (
                <>
                  <dt>老师时间确认</dt>
                  <dd>
                    {lesson.confirmation.operator} 已确认
                    {lesson.confirmation.note
                      ? ` · ${lesson.confirmation.note}`
                      : ""}
                  </dd>
                </>
              )}
              <dt>核实课时</dt>
              <dd>
                {lesson.confirmedUnits === undefined
                  ? "待核实"
                  : `${lesson.confirmedUnits} 课时`}
              </dd>
              <dt>课时处理</dt>
              <dd>{lesson.deducted ? "已扣课时" : "尚未扣课时"}</dd>
            </dl>
            <CourseSyncLink lesson={lesson} detail />
            <div className="inset">
              <h3>上课情况</h3>
              <p style={{ marginTop: 12 }}>
                老师：{lesson.teacherIn || "暂无记录"} 进入 ·{" "}
                {lesson.teacherOut || "暂无记录"} 离开
              </p>
              <p style={{ marginTop: 8 }}>
                学员：{lesson.studentIn || "暂无记录"} 进入 ·{" "}
                {lesson.studentOut || "暂无记录"} 离开
              </p>
            </div>
            {lesson.note && <p>{lesson.note}</p>}
          </div>
        )}
      </Drawer>
      <Modal
        open={modal === "reschedule"}
        onClose={() => setModal(null)}
        title="调整这节课"
        footer={
          <>
            <Button onClick={() => setModal(null)}>取消</Button>
            <Button
              variant="primary"
              loading={actionBusy}
              disabled={
                preview ||
                actionBusy ||
                !rescheduleDate ||
                !rescheduleTime ||
                !rescheduleTeacher ||
                Boolean(movePrecheck) ||
                (moveOutside && !rescheduleConfirmed)
              }
              onClick={async () => {
                if (lesson)
                  await run(
                    {
                      type: "lesson.reschedule",
                      id: lesson.id,
                      date: rescheduleDate,
                      time: rescheduleTime,
                      teacherId: rescheduleTeacher,
                      reason,
                      confirmedTeacher: rescheduleConfirmed,
                      responsibility: moveResponsibility,
                      confirmationNote: reason,
                    },
                    () => {
                      setTeacher(rescheduleTeacher);
                      navigateView("week", rescheduleDate, rescheduleTeacher);
                      setModal(null);
                      setLessonId(null);
                    },
                  );
              }}
            >
              {actionBusy ? "正在改期" : "确认调整"}
            </Button>
          </>
        }
      >
        <div className="stack">
          {lesson && (
            <div className="notice">
              原安排：{lesson.date} {lesson.time}
              <br />
              新安排：{rescheduleDate} {rescheduleTime} · 老师不变
            </div>
          )}
          <div className="form-grid">
            <Field label="上课日期" required>
              <DatePicker
                placeholder="上课日期"
                mode="date"
                value={rescheduleDate}
                min={DEMO_TODAY}
                onValueChange={(nextValue) => setRescheduleDate(nextValue)}
              />
            </Field>
            <Field label="上课时间" required>
              <TimePicker
                halfHourOnly
                label="上课时间"
                value={rescheduleTime}
                onChange={(value) => setRescheduleTime(value)}
              />
            </Field>
          </div>
          <Field label="老师">
            <Select
              value={rescheduleTeacher}
              disabled
              onValueChange={(value) => setRescheduleTeacher(value)}
            >
              {data.teachers
                .filter((t) => t.status !== "已离职")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
          <small>
            如需换老师，请到学员档案办理换师，取消原预约后重新排课。
          </small>
          <Field label="调课发起方">
            <Select value={moveResponsibility} onValueChange={value => setMoveResponsibility(value === "老师" || value === "学员" ? value : "平台")}>
              <option>平台</option><option>老师</option><option>学员</option>
            </Select>
          </Field>
          <Field label="调整原因">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：家长临时有事"
            />
          </Field>
          {moveTeacher && (
            <small>常规时间：{availabilitySummary(moveTeacher)}</small>
          )}
          {moveOutside && (
            <div className="notice">
              调整后的时间不在老师的常规安排内，本节将作为临时课安排。
            </div>
          )}
          {moveOutside && (
            <label className="select-row">
              <input
                type="checkbox"
                checked={rescheduleConfirmed}
                onChange={(e) => setRescheduleConfirmed(e.target.checked)}
              />
              已与老师确认本次调整
            </label>
          )}
          {movePrecheck && (
            <p className="danger" role="alert">
              {movePrecheck}
            </p>
          )}
          <div className="notice notice-info">
            <Clock3 size={17} />
            确认后更新学员课表和老师日程。
          </div>
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
