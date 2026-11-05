import { formatMaterialProgress } from "@crazytalk/shared";
import { DatePicker } from "@crazytalk/ui";
import StudentProfileEditor from "./StudentProfileEditor";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import {
  type Student,
  type Command,
  DEMO_TODAY,
  getStudentSummary,
  addDays,
  teacherName,
  isRegularTime,
  availabilitySummary,
  isAvailable,
} from "@crazytalk/shared";
import {
  Select,
  Button,
  Modal,
  Drawer,
  Field,
  Badge,
  useToast,
} from "@crazytalk/ui";
import {
  ArrowUpRight,
  CalendarDays,
  BookOpen,
  Phone,
  Copy,
} from "lucide-react";
import "./student-actions.css";
export type StudentAction =
  | "credit"
  | "reschedule"
  | "changeTeacher"
  | "visit"
  | "停课"
  | "在读"
  | "结课"
  | "退费"
  | "edit"
  | "referral"
  | "compensate";
export function StudentActionModal({
  student,
  action,
  onClose,
  initialLessonId,
  initialFeedbackId,
}: {
  student: Student;
  action: StudentAction | null;
  onClose: () => void;
  initialLessonId?: string;
  initialFeedbackId?: string;
  onFeedback?: (feedbackId?: string) => void;
}) {
  const { data, act, can } = useDemo();
  const toast = useToast();
  const navigate = useNavigate();
  const isCredit = action === "credit" || action === "compensate";
  const [units, setUnits] = useState(24);
  const [kind, setKind] = useState("续费");
  const [businessDate, setBusinessDate] = useState(DEMO_TODAY);
  const [amount, setAmount] = useState("");
  const [feedbackId, setFeedbackId] = useState("");
  const [referralId, setReferralId] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(addDays(DEMO_TODAY, 2));
  const [time, setTime] = useState("18:00");
  const [teacherId, setTeacher] = useState(student.teacherId || "t1");
  const [lessonId, setLesson] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialValues = useRef("");
  const targetTeacher = data.teachers.find((t) => t.id === teacherId);
  const chosenLesson = data.lessons.find((l) => l.id === lessonId);
  const outsideRegular = Boolean(
    action === "reschedule" &&
      targetTeacher &&
      chosenLesson &&
      !isRegularTime(targetTeacher, date, time, chosenLesson.duration),
  );
  const future = data.lessons
    .filter(
      (l) =>
        l.studentId === student.id &&
        l.date >= DEMO_TODAY &&
        l.status === "未开始",
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  useEffect(() => {
    setError("");
    setUnits(24);
    setNote("");
    setAck(false);
    setAmount("");
    const nextFeedbackId = data.feedback.some(
      (item) => item.id === initialFeedbackId && item.studentId === student.id,
    )
      ? initialFeedbackId || ""
      : "";
    const nextKind = action === "compensate" ? "补偿" : "续费";
    setFeedbackId(nextFeedbackId);
    setReferralId("");
    setKind(nextKind);
    setReferrerId("");
    setBusinessDate(DEMO_TODAY);
    const selected =
      future.find((lesson) => lesson.id === initialLessonId) ?? future[0];
    const nextDate =
      action === "reschedule" && selected
        ? selected.date
        : addDays(DEMO_TODAY, 2);
    const nextTime =
      action === "reschedule" && selected ? selected.time : "18:00";
    const nextTeacher =
      action === "reschedule" && selected
        ? selected.teacherId
        : student.teacherId || "t1";
    setLesson(selected?.id || "");
    setDate(nextDate);
    setTime(nextTime);
    setTeacher(nextTeacher);
    initialValues.current = JSON.stringify({
      units: 24,
      kind: nextKind,
      businessDate: DEMO_TODAY,
      amount: "",
      feedbackId: nextFeedbackId,
      referralId: "",
      referrerId: "",
      note: "",
      date: nextDate,
      time: nextTime,
      teacherId: nextTeacher,
      lessonId: selected?.id || "",
      ack: false,
    });
    setConfirmDiscard(false);
  }, [action, student.id, initialLessonId, initialFeedbackId]);
  useEffect(() => {
    setAck(false);
  }, [teacherId, date, time, lessonId]);
  const affectedLessons =
    action === "changeTeacher"
      ? future.filter((lesson) => lesson.date >= date)
      : action === "reschedule" && chosenLesson
        ? [chosenLesson]
        : future;
  const rescheduleConflicts =
    action === "reschedule" && chosenLesson
      ? isAvailable(
          data,
          teacherId,
          date,
          time,
          chosenLesson.duration,
          student.id,
          chosenLesson.id,
          outsideRegular,
        )
      : [];
  const teacherChecks =
    action === "changeTeacher"
      ? affectedLessons.map((lesson) => ({
          lesson,
          conflicts: isAvailable(
            data,
            teacherId,
            lesson.date,
            lesson.time,
            lesson.duration,
            student.id,
            lesson.id,
            lesson.kind === "临时课",
          ),
        }))
      : [];
  const hasConflicts =
    rescheduleConflicts.length > 0 ||
    teacherChecks.some((check) => check.conflicts.length > 0);
  function selectLesson(nextId: string) {
    const lesson = future.find((item) => item.id === nextId);
    setLesson(nextId);
    if (lesson) {
      setDate(lesson.date);
      setTime(lesson.time);
      setTeacher(lesson.teacherId);
    }
  }
  function requestClose() {
    if (action === "credit") {
      onClose();
      return;
    }
    const changed =
      JSON.stringify({
        units,
        kind,
        businessDate,
        amount,
        feedbackId,
        referralId,
        referrerId,
        note,
        date,
        time,
        teacherId,
        lessonId,
        ack,
      }) !== initialValues.current;
    if (changed) setConfirmDiscard(true);
    else onClose();
  }
  const titles: Record<StudentAction, string> = {
    credit: `给 ${student.name} 加课时`,
    compensate: "登记补偿课时",
    reschedule: `给 ${student.name} 调课`,
    changeTeacher: `给 ${student.name} 换老师`,
    visit: "记录回访",
    停课: "办理停课",
    在读: "办理复课",
    结课: "办理结课",
    退费: "退款后停用服务",
    edit: "编辑学员资料",
    referral: "登记转介绍关系",
  };
  function submit() {
    if (!action || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      if (
        initialFeedbackId &&
        !data.feedback.some(
          (item) =>
            item.id === initialFeedbackId && item.studentId === student.id,
        )
      )
        throw new Error("这条反馈不属于当前学员，请重新打开补偿操作");
      if (hasConflicts) throw new Error("所选安排有冲突，请调整后再确认");
      let cmd: Command;
      switch (action) {
        case "credit":
        case "compensate":
          cmd = {
            type: "credit.add",
            studentId: student.id,
            units,
            kind,
            note,
            date: businessDate,
            ...(amount !== "" ? { amount: Number(amount) } : {}),
            ...(feedbackId ? { feedbackId } : {}),
            ...(referralId ? { referralId } : {}),
          };
          break;
        case "referral":
          if (!referrerId) throw new Error("请选择介绍人");
          cmd = {
            type: "referral.add",
            studentId: student.id,
            referrerStudentId: referrerId,
            date: businessDate,
            note,
          };
          break;
        case "edit":
          return;
        case "visit":
          cmd = { type: "service.add", studentId: student.id, content: note };
          break;
        case "reschedule":
          if (!ack) throw new Error("请确认已与家长和老师沟通本次调整");
          cmd = {
            type: "lesson.reschedule",
            id: lessonId,
            date,
            time,
            teacherId,
            reason: note,
            confirmedTeacher: ack,
            confirmationNote: note,
          };
          break;
        case "changeTeacher":
          if (!ack) throw new Error("请确认已与家长和老师沟通本次调整");
          cmd = {
            type: "lesson.changeTeacher",
            studentId: student.id,
            teacherId,
            from: date,
            reason: note,
            confirmedTeacher: ack,
            confirmationNote: note,
          };
          break;
        default:
          if (!ack) throw new Error("请先确认已与家长沟通本次变更");
          cmd = {
            type: "student.lifecycle",
            studentId: student.id,
            status: action,
            reason: note,
          };
      }
      const r = act(cmd);
      toast(r.message);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查填写内容");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  if (action === "edit")
    return <StudentProfileEditor student={student} onClose={onClose} />;
  if (isCredit && !student.balanceKnown)
    return (
      <Modal
        open
        onClose={onClose}
        title="先核实剩余课时"
        description="总课时不等于剩余课时，请核对旧台账后登记。"
        footer={
          <>
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                navigate(`/students/${student.id}?tab=credits`);
              }}
            >
              前往核实余额
            </Button>
          </>
        }
      >
        <p>
          尚未核实 {student.name}{" "}
          的剩余课时，暂不执行加课或补偿。核实后可继续操作。
        </p>
      </Modal>
    );
  return (
    <Modal
      open={!!action}
      onClose={requestClose}
      title={action ? titles[action] : ""}
      description={
        action === "visit"
          ? undefined
          : `${student.name}${student.groupName ? ` · ${student.groupName}` : ""}`
      }
      footer={
        <>
          <Button onClick={requestClose} disabled={submitting}>
            取消
          </Button>
          <Button
            disabled={
              submitting ||
              hasConflicts ||
              (action === "reschedule" && !chosenLesson)
            }
            variant={action === "退费" ? "danger-solid" : "primary"}
            onClick={submit}
          >
            确认
            {isCredit
              ? `加 ${units} 课时`
              : action === "退费"
                ? "停用服务（模拟）"
                : "保存"}
          </Button>
        </>
      }
    >
      <div className="stack">
        {isCredit && (
          <>
            {["结课", "停课"].includes(student.status) && (
              <p className="muted">
                本次仅登记课时，服务状态保持不变；重新上课请办理复课。
              </p>
            )}
            <Field label="类型">
              <div className="row wrap">
                {[
                  "续费",
                  "新购",
                  "充值",
                  ...(can("credit.compensate") ? ["补偿", "赠送"] : []),
                ].map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={kind === t ? "primary" : "secondary"}
                    onClick={() => setKind(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </Field>
            <Field
              label="课时数"
              required
              hint={
                student.balanceKnown
                  ? `登记后剩余 ${student.balance + units} 课时。按已核实的课时口径登记，不自动折算分钟。`
                  : "请先在学员档案核实并录入剩余课时"
              }
            >
              <input
                aria-label="课时数"
                type="number"
                value={units}
                min="0"
                step="any"
                onChange={(e) => setUnits(Number(e.target.value))}
              />
              <div className="row">
                {[12, 24, 48].map((n) => (
                  <Button size="xs" key={n} onClick={() => setUnits(n)}>
                    {n} 课时
                  </Button>
                ))}
              </div>
            </Field>
            <Field label="充值金额" hint="选填，仅登记业务记录，不执行收款。">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            {kind === "补偿" && (
              <Field
                label="关联反馈"
                hint="可关联本学员的投诉或反馈，便于核对补偿原因。"
              >
                <Select
                  aria-label="关联反馈"
                  value={feedbackId}
                  onValueChange={setFeedbackId}
                >
                  <option value="">不关联反馈</option>
                  {data.feedback
                    .filter((feedback) => feedback.studentId === student.id)
                    .map((feedback) => (
                      <option value={feedback.id} key={feedback.id}>
                        {feedback.date} · {feedback.content}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
            <Field
              label="关联转介绍"
              hint="选填，仅关联已有关系，不自动计算或发放奖励。"
            >
              <Select
                aria-label="关联转介绍"
                value={referralId}
                onValueChange={setReferralId}
              >
                <option value="">不关联转介绍</option>
                {data.referrals
                  .filter(
                    (item) =>
                      item.studentId === student.id ||
                      item.referrerStudentId === student.id,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {data.students.find(
                        (entry) => entry.id === item.referrerStudentId,
                      )?.name || "介绍人"}{" "}
                      介绍{" "}
                      {data.students.find(
                        (entry) => entry.id === item.studentId,
                      )?.name || "学员"}{" "}
                      · {item.date}
                    </option>
                  ))}
              </Select>
            </Field>
            {student.balance < 0 && (
              <div className="notice">
                会先抵扣欠的 {Math.abs(student.balance)} 课时。
              </div>
            )}
          </>
        )}
        {(isCredit || action === "referral") && (
          <Field label="业务日期" required>
            <DatePicker
              placeholder="业务日期"
              mode="date"
              value={businessDate}
              onValueChange={(nextValue) => setBusinessDate(nextValue)}
            />
          </Field>
        )}
        {action === "referral" && (
          <>
            <p className="muted">
              被介绍学员：{student.name}。关系登记不会自动赠课或充值。
            </p>
            <Field label="介绍人" required>
              <Select
                aria-label="介绍人"
                value={referrerId}
                onValueChange={setReferrerId}
                searchable
              >
                <option value="">请选择介绍人</option>
                {data.students
                  .filter((item) => item.id !== student.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.groupName ? ` · ${item.groupName}` : ""}
                    </option>
                  ))}
              </Select>
            </Field>
          </>
        )}
        {action === "reschedule" && future.length === 0 && (
          <p className="muted">暂无待上课程，可先到排课管理安排上课。</p>
        )}
        {action === "reschedule" && (
          <Field label="哪节课">
            <Select
              aria-label="选择课程"
              value={lessonId}
              onValueChange={selectLesson}
            >
              <option value="">请选择课程</option>
              {future.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.date} {l.time} · {teacherName(data, l.teacherId)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {["reschedule", "changeTeacher"].includes(action || "") && (
          <Field label="老师" required>
            <Select
              value={teacherId}
              onValueChange={(value) => setTeacher(value)}
            >
              {data.teachers
                .filter((t) => t.status !== "已离职")
                .map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name} · {t.so}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {["reschedule", "changeTeacher"].includes(action || "") && (
          <Field label="从哪天开始" required>
            <DatePicker
              placeholder="从哪天开始"
              mode="date"
              min={DEMO_TODAY}
              value={date}
              onValueChange={(nextValue) => setDate(nextValue)}
            />
          </Field>
        )}
        {action === "reschedule" && (
          <Field label="新的上课时间">
            <input
              type="time"
              step="60"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
        )}
        {(action === "reschedule" || action === "changeTeacher") &&
          targetTeacher && (
            <small>老师常规时间：{availabilitySummary(targetTeacher)}</small>
          )}
        {action === "reschedule" && chosenLesson && (
          <div className="student-change-preview" aria-label="调课安排预览">
            <div>
              <small>原安排</small>
              <strong>
                {chosenLesson.date} {chosenLesson.time}
              </strong>
              <span>
                {teacherName(data, chosenLesson.teacherId)} ·{" "}
                {chosenLesson.duration} 分钟
              </span>
            </div>
            <div>
              <small>新安排</small>
              <strong>
                {date || "请选择日期"} {time}
              </strong>
              <span>
                {teacherName(data, teacherId)} · {chosenLesson.duration} 分钟
              </span>
            </div>
            <p
              className={
                rescheduleConflicts.length
                  ? "danger"
                  : "student-availability-ok"
              }
            >
              {rescheduleConflicts.length
                ? rescheduleConflicts.join("；")
                : "老师和学员均无时间冲突"}
            </p>
            <small>本次仅调整这一节课</small>
          </div>
        )}
        {action === "reschedule" && targetTeacher && chosenLesson && (
          <details className="student-time-options">
            <summary>查看常规空档参考</summary>
            <div className="row wrap">
              {Array.from(
                { length: 48 },
                (_, index) =>
                  `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
              )
                .filter(
                  (slot) =>
                    isAvailable(
                      data,
                      teacherId,
                      date,
                      slot,
                      chosenLesson.duration,
                      student.id,
                      chosenLesson.id,
                    ).length === 0,
                )
                .map((slot) => (
                  <Button
                    key={slot}
                    size="xs"
                    variant={time === slot ? "primary" : "secondary"}
                    onClick={() => setTime(slot)}
                  >
                    {slot}
                  </Button>
                ))}
            </div>
          </details>
        )}
        {action === "changeTeacher" && (
          <div className="student-change-preview" aria-label="换老师影响预览">
            <strong>将调整 {affectedLessons.length} 节课</strong>
            <small>
              {date} 起，由 {teacherName(data, teacherId)} 授课；此前课程不变
            </small>
            {teacherChecks.length ? (
              <ul>
                {teacherChecks.map(({ lesson, conflicts }) => (
                  <li key={lesson.id}>
                    <span>
                      {lesson.date} {lesson.time} · {lesson.duration} 分钟
                    </span>
                    <small>
                      {teacherName(data, lesson.teacherId)} →{" "}
                      {teacherName(data, teacherId)}
                    </small>
                    <span
                      className={
                        conflicts.length ? "danger" : "student-availability-ok"
                      }
                    >
                      {conflicts.length ? conflicts.join("；") : "时间可安排"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                此日期后没有待上课程，任课老师资料将更新。
              </p>
            )}
          </div>
        )}
        {outsideRegular && (
          <div className="notice">
            这个时间需要与老师临时协调。确认后，本节将作为临时课安排，老师常规时间保持不变。
          </div>
        )}
        {action === "changeTeacher" && (
          <small>
            固定课需符合新老师的常规时间；临时课超出常规时间时，需与老师确认。
          </small>
        )}
        {
          <Field
            label={action === "visit" ? "回访内容" : "备注 / 原因"}
            required={
              (!isCredit && action !== "referral") ||
              (isCredit && ["补偿", "赠送"].includes(kind))
            }
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                action === "visit"
                  ? "这次沟通了什么？下一步需要跟进什么？"
                  : "填写本次操作的说明"
              }
            />
          </Field>
        }
        {[
          "停课",
          "结课",
          "退费",
          "在读",
          "reschedule",
          "changeTeacher",
        ].includes(action || "") && (
          <>
            <div className="inset">
              <strong>确认后系统会：</strong>
              <ul>
                {action === "退费" ? (
                  <>
                    <li>订单状态更新为退款，保留历史记录和账面课时余额</li>
                    <li>取消后续 {future.length} 节未开始课程</li>
                    <li>停用处理结果可在服务跟进的对应退费记录中查看</li>
                    <li>本次仅登记服务状态，不执行资金退款</li>
                  </>
                ) : action === "停课" || action === "结课" ? (
                  <>
                    <li>订单状态改为{action}</li>
                    <li>取消未来 {future.length} 节课，保留剩余课时</li>
                  </>
                ) : action === "在读" ? (
                  <li>
                    订单状态恢复为正常，可重新安排课程；不自动恢复已取消课程
                  </li>
                ) : (
                  <>
                    <li>更新学员和老师的上课安排</li>
                    <li>保留本次调整原因和记录</li>
                  </>
                )}
              </ul>
              {affectedLessons.length > 0 &&
                action !== "changeTeacher" &&
                action !== "reschedule" && (
                  <details>
                    <summary>查看后续课程 {affectedLessons.length} 节</summary>
                    <ul>
                      {affectedLessons.map((lesson) => (
                        <li key={lesson.id}>
                          {lesson.date} {lesson.time} ·{" "}
                          {teacherName(data, lesson.teacherId)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
            </div>
            <label className="select-row">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              我已与家长和老师确认本次变更
            </label>
          </>
        )}
        {confirmDiscard && (
          <Modal
            open
            onClose={() => setConfirmDiscard(false)}
            title="放弃未保存的内容？"
            footer={
              <>
                <Button onClick={() => setConfirmDiscard(false)}>
                  继续填写
                </Button>
                <Button variant="danger" onClick={onClose}>
                  放弃修改
                </Button>
              </>
            }
          >
            <p>尚未保存的填写内容将不会保留。</p>
          </Modal>
        )}
        {error && (
          <div className="notice" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
export function StudentQuickView({
  id,
  onClose,
  onFeedback,
  onOpenLesson,
}: {
  id: string | null;
  onClose: () => void;
  onFeedback?: (feedbackId?: string) => void;
  onOpenLesson?: (lessonId: string) => void;
}) {
  const { data, can } = useDemo();
  const navigate = useNavigate();
  const toast = useToast();
  const [action, setAction] = useState<StudentAction | null>(null);
  const s = data.students.find(
    (s) => s.id === (data.studentIdAliases?.[id || ""] ?? id),
  );
  if (!s) return null;
  const summary = getStudentSummary(data, s.id);
  const next = data.lessons
    .filter(
      (l) =>
        l.studentId === s.id && l.date >= DEMO_TODAY && l.status === "未开始",
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const recentFeedback = (can("feedback.view") ? data.feedback : [])
    .filter((item) => item.studentId === s.id)
    .sort((first, second) => second.date.localeCompare(first.date))[0];
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label}已复制`);
    } catch {
      toast("复制未成功，请选择文字复制");
    }
  }
  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        width={420}
        title={s.name}
        description={[
          s.groupName,
          s.channel,
          s.owner ? `负责教务 ${s.owner}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
        footer={
          <div className="row wrap">
            {can("student.reschedule") &&
              !["停课", "结课", "退费"].includes(s.status) && (
                <Button size="sm" onClick={() => setAction("reschedule")}>
                  调课
                </Button>
              )}
            {can("student.reschedule") &&
              !["停课", "结课", "退费"].includes(s.status) && (
                <Button size="sm" onClick={() => setAction("changeTeacher")}>
                  换老师
                </Button>
              )}
            {can("feedback.create") && (
              <Button
                size="sm"
                onClick={() => {
                  if (onFeedback) {
                    onFeedback();
                    return;
                  }
                  onClose();
                  navigate(`/feedback?new=1&student=${s.id}`);
                }}
              >
                登记反馈
              </Button>
            )}
            {can("student.edit") && (
              <Button size="sm" onClick={() => setAction("visit")}>
                回访
              </Button>
            )}
            {can("credit.add") && s.status !== "退费" && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setAction("credit")}
              >
                加课时
              </Button>
            )}
          </div>
        }
      >
        <div className="stack">
          <div className="row between">
            <Badge tone={s.status === "在读" ? "success" : "warning"}>
              {s.orderStatus || "订单状态未填写"}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onClose();
                navigate(`/students/${s.id}`);
              }}
            >
              打开完整档案 <ArrowUpRight size={14} />
            </Button>
          </div>
          <div className="inset">
            <small>剩余课时</small>
            <div className="stat-value">
              {s.balanceKnown ? s.balance : "未录入"}
              <span style={{ fontSize: 14, fontWeight: 400 }}> 课时</span>
            </div>
          </div>
          <div className="inset">
            <div className="row">
              <CalendarDays size={16} />
              <strong>下节课</strong>
            </div>
            <p style={{ marginTop: 12 }}>
              {next ? `${next.date} ${next.time}` : "还没有安排下一节课"}
            </p>
            <small>
              {next
                ? `${teacherName(data, next.teacherId)} · ${next.duration} 分钟 · ${next.material}`
                : "可以到排课管理找一位合适的老师"}
            </small>
            {next && onOpenLesson && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onOpenLesson(next.id)}
              >
                查看这节课
              </Button>
            )}
          </div>
          <div className="inset">
            <div className="row">
              <BookOpen size={16} />
              <strong>学习进度</strong>
            </div>
            <p style={{ marginTop: 12 }}>
              {formatMaterialProgress(
                summary.progress.material || "未填写教材",
                summary.progress.unit || "暂无进度",
              )}
            </p>
            <small>
              上课老师：
              {s.teacherId
                ? summary.teacher.name || "暂未安排老师"
                : s.teacherName || "未填写"}
            </small>
            <small>上课时间：{summary.scheduleText || "暂无固定安排"}</small>
          </div>
          <div>
            <small>最近反馈</small>
            {recentFeedback ? (
              <>
                <div className="row between" style={{ marginTop: 8 }}>
                  <span>
                    {recentFeedback.date} · {recentFeedback.rating}
                  </span>
                  <Badge
                    tone={
                      recentFeedback.status === "已完成" ? "success" : "warning"
                    }
                  >
                    {recentFeedback.status}
                  </Badge>
                </div>
                <p>{recentFeedback.content || "未填写内容"}</p>
                {recentFeedback.categories.length > 0 && (
                  <small>{recentFeedback.categories.join("、")}</small>
                )}
                {can("feedback.view") && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      onFeedback
                        ? onFeedback(recentFeedback.id)
                        : navigate(`/feedback/${recentFeedback.id}`)
                    }
                  >
                    查看反馈
                  </Button>
                )}
              </>
            ) : (
              <p>
                {can("feedback.view") ? "暂无反馈" : "当前角色无权查看反馈"}
              </p>
            )}
          </div>
          <div className="row muted">
            <Phone size={14} />
            {s.phone
              ? can("field.student_phone")
                ? s.phone
                : `****${s.phone.slice(-4)}`
              : "手机号码未填写"}
            {s.phone && can("field.student_phone") && (
              <Button
                size="xs"
                variant="ghost"
                aria-label="复制手机号"
                onClick={() => void copy(s.phone, "手机号")}
              >
                <Copy size={13} />
              </Button>
            )}
          </div>
          {s.groupName && (
            <div className="row muted">
              <span>{s.groupName}</span>
              <Button
                size="xs"
                variant="ghost"
                aria-label="复制学生群名"
                onClick={() => void copy(s.groupName, "学生群名")}
              >
                <Copy size={13} />
              </Button>
            </div>
          )}
        </div>
      </Drawer>
      <StudentActionModal
        student={s}
        action={action}
        onClose={() => setAction(null)}
      />
    </>
  );
}
export function NewStudentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return open ? <StudentProfileEditor onClose={onClose} /> : null;
}
