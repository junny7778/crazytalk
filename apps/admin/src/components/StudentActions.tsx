import { schedulingBookingIssue } from "@crazytalk/shared";
import { TimePicker } from "@crazytalk/ui";
import { businessMode, businessRequest } from "@crazytalk/shared/react";
import { formatMaterialProgress } from "@crazytalk/shared";
import { DatePicker } from "@crazytalk/ui";
import StudentProfileEditor from "./StudentProfileEditor";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { refundMembers } from "../../../../packages/shared/src/businessEffects";
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
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const navigate = useNavigate();
  const [kind, setKind] = useState("新购");
  const isPurchase = kind === "新购" || kind === "续费";
  const memberOrders = (data.orders ?? []).filter(order => order.studentIds.includes(student.id));
  function memberName(id: string) {
    const name = data.students.find(s => s.id === id)?.name ?? id;
    return data.students.filter(s => s.name === name).length > 1 ? `${name}（${id}）` : name;
  }
  const linkedAccount = data.classInAccounts?.find(account => account.studentIds.includes(student.id));
  const sharedMembers = linkedAccount?.studentIds.filter(id => id !== student.id) ?? [];
  const isCredit = action === "credit" || action === "compensate";
  const [stars,setStars]=useState(0),[visitStage,setVisitStage]=useState("首三节"),[visitEvidence,setVisitEvidence]=useState("");
  const [units, setUnits] = useState(72);
  const orderKey = useRef("");

  const [businessDate, setBusinessDate] = useState(DEMO_TODAY);
  const [feedbackId, setFeedbackId] = useState("");
  const [referrerId, setReferrerId] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(addDays(DEMO_TODAY, 2));
  const [time, setTime] = useState("18:00");
  const [teacherId, setTeacher] = useState(student.teacherId || (businessMode() ? data.teachers[0]?.id || "" : "t1"));
  const [lessonId, setLesson] = useState("");
  const [ack, setAck] = useState(false);
  const [moveResponsibility, setMoveResponsibility] = useState<"老师" | "学员" | "平台">("平台");
  const [error, setError] = useState("");
  const [visitAttempted, setVisitAttempted] = useState(false);
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
    setVisitAttempted(false);
    setStars(0);setVisitEvidence("");setVisitStage("首三节");
    setUnits(action === "compensate" ? 1 : 72);
    orderKey.current=crypto.randomUUID();
    setNote("");
    setAck(false);
    setMoveResponsibility("平台");
    const nextFeedbackId = data.feedback.some(
      (item) => item.id === initialFeedbackId && item.studentId === student.id,
    )
      ? initialFeedbackId || ""
      : "";
    const nextKind = action === "compensate" ? "补偿" : "新购";
    setFeedbackId(nextFeedbackId);
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
        : student.teacherId || (businessMode() ? data.teachers[0]?.id || "" : "t1");
    setLesson(selected?.id || "");
    setDate(nextDate);
    setTime(nextTime);
    setTeacher(nextTeacher);
    initialValues.current = JSON.stringify({
      stars:0,visitStage:"首三节",visitEvidence:"",
      units: action === "compensate" ? 1 : 72,
      kind: nextKind,
      businessDate: DEMO_TODAY,
      feedbackId: nextFeedbackId,
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
      ? future.filter((lesson) => lesson.teacherId === teacherId)
      : action === "reschedule" && chosenLesson
        ? [chosenLesson]
        : future;
  const rescheduleConflicts =
    action === "reschedule" && chosenLesson
      ? [schedulingBookingIssue(data, student.id, [teacherId]), ...isAvailable(
          data,
          teacherId,
          date,
          time,
          chosenLesson.duration,
          student.id,
          chosenLesson.id,
          outsideRegular,
        )].filter(Boolean)
      : [];
  const hasConflicts = rescheduleConflicts.length > 0;
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
    if (action === "credit") {onClose();return;}
    const changed =
      JSON.stringify({
        stars,visitStage,visitEvidence,
        units,
        kind,
        businessDate,
        feedbackId,
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
  async function submit() {
    if (!action || submitLock.current) return;
    if (action === "visit" && (!stars || !note.trim())) {
      setVisitAttempted(true);
      return;
    }
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
          if (isPurchase) {
            if (units !== 72 && units !== 144) throw new Error("请选择购买课时");
            cmd = memberOrders.length
              ? { type: "credit.add", purchaseId: orderKey.current, studentId: student.id, units, kind, date: businessDate, note }
              : { type: "order.buy", id: orderKey.current, studentId: student.id, studentIds: [student.id], units, kind, date: businessDate, note };
            break;
          }
          cmd = {
            type: "credit.add",
            studentId: student.id,
            units,
            kind,
            note,
            date: businessDate,
            ...(feedbackId ? { feedbackId } : {}),
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
          cmd = { type: "service.add", studentId: student.id, content: note,stars,stage:visitStage,evidence:visitEvidence };
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
            responsibility: moveResponsibility,
            confirmedTeacher: ack,
            confirmationNote: note,
          };
          break;
        case "changeTeacher":
          if (!ack) throw new Error("请确认已与家长和老师沟通本次调整");
          cmd = {
            type: "lesson.changeTeacher",
            studentId: student.id,
            originalTeacherId: teacherId,
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
      const r = await act(cmd);
      if (!mounted.current) return;
      toast(action === "visit" ? `已为 ${student.name} 添加回访` : r.message);
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
  return (
    <Modal
      open={!!action}
      onClose={submitting ? onClose : requestClose}
      title={action ? titles[action] : ""}
      description={
        action === "visit" || isCredit
          ? undefined
          : `${student.name}${student.groupName ? ` · ${student.groupName}` : ""}`
      }
      footer={
        <>
          <Button onClick={submitting ? onClose : requestClose}>
            {submitting ? "关闭" : "取消"}
          </Button>
          <Button
            loading={submitting}
            disabled={
              submitting || (isCredit && memberOrders.length > 1) ||
              hasConflicts ||
              (action === "reschedule" && !chosenLesson)
            }
            variant={action === "退费" ? "danger-solid" : "primary"}
            onClick={submit}
          >
            {submitting ? (action === "changeTeacher" ? "正在取消原预约" : action === "reschedule" ? "正在改期" : "正在处理") : <>确认
            {isCredit
              ? `加 ${units} 课时`
              : action === "退费"
                ? "停用服务"
                : "保存"}</>}
          </Button>
        </>
      }
    >
      <div {...(submitting ? { inert: "" } : {})} className={isCredit ? "stack student-credit-form" : "stack"}>
        {action === "visit" && <p>学员姓名：{student.name}</p>}
        {action === "credit" && <Field label="加课时方式">
          <div className="row wrap">
            {["新购", "续费",
              ...(can("credit.compensate") ? ["补偿", "赠送"] : [])].map(t =>
                <Button key={t} size="sm" variant={kind === t ? "primary" : "secondary"}
                  onClick={() => { setKind(t); setUnits(["补偿","赠送"].includes(t) ? 1 : 72); setError(""); }}>
                  {t}
                </Button>)}
          </div>
        </Field>}
        {isCredit && memberOrders.length > 1 && <p>该学员有多份历史余额，请先核实历史余额并重新关联 ClassIn 账号。</p>}
        {isCredit && sharedMembers.length > 0 && <p className="student-credit-sharing-note">本次课时将由{sharedMembers.map(memberName).join("、")}共同使用。</p>}
        {isCredit && (
          <>
            {["结课", "停课"].includes(student.status) && (
              <p className="muted">
                本次仅登记课时，服务状态保持不变；重新上课请办理复课。
              </p>
            )}
            {isPurchase ? <Field label="购买课时"><Select value={String(units)} onValueChange={value => setUnits(Number(value))}><option value="72">72 课时</option><option value="144">144 课时</option></Select></Field>
              : <Field label="课时数" required><input aria-label="课时数" type="number" min="0" step="any" value={units} onChange={e=>setUnits(Number(e.target.value))}/></Field>}
            {memberOrders.length === 1 && <div className="inset">当前剩余 {student.balance} 课时 · {memberOrders[0].studentIds.map(memberName).join("、")}</div>}
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
          <Field label={action === "changeTeacher" ? "要更换的原老师" : "老师"} required>
            <Select
              value={teacherId}
              disabled={action === "reschedule"}
              onValueChange={(value) => setTeacher(value)}
            >
              {data.teachers
                .filter((t) => action === "changeTeacher" ? t.id === student.teacherId || future.some(l => l.teacherId === t.id) || data.slotLocks?.some(l => l.studentId === student.id && l.teacherId === t.id) : t.status !== "已离职")
                .map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name} · {t.so}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {action === "reschedule" && (
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
            <TimePicker
              label="新的上课时间"
              value={time}
              onChange={(value) => setTime(value)}
            />
          </Field>
        )}
        {(action === "reschedule" || action === "changeTeacher") &&
          targetTeacher && (
            <small>老师常规时间：{availabilitySummary(targetTeacher)}</small>
          )}
        {action === "reschedule" && <Field label="调课发起方">
          <Select value={moveResponsibility} onValueChange={value => setMoveResponsibility(value === "老师" || value === "学员" ? value : "平台")}>
            <option>平台</option><option>老师</option><option>学员</option>
          </Select>
        </Field>}
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
        {action === "changeTeacher" && <div className="student-change-preview" aria-label="换老师影响预览">
          <strong>将取消 {teacherName(data,teacherId)} 的 {affectedLessons.length} 节未开始预约</strong>
          <ul>{affectedLessons.map(lesson => <li key={lesson.id}>{lesson.date} {lesson.time} · {lesson.duration} 分钟</li>)}</ul>
          <p>同时释放该老师的固定课表占位和临时锁定。取消确认后，到排课页面重新选择老师、日期和时间。</p>
        </div>}
        {outsideRegular && (
          <div className="notice">
            这个时间需要与老师临时协调。确认后，本节将作为临时课安排，老师常规时间保持不变。
          </div>
        )}
        {action === "changeTeacher" && (
          <small>
            新预约将重新选择老师和时间，并生成新的课程记录。
          </small>
        )}
        {action==="visit" && <><div className="form-grid">
          <Field label="回访节点"><Select value={visitStage} onValueChange={setVisitStage}>{["首三节","首月","月度跟进","换师后三节","续费跟进"].map(s=><option key={s}>{s}</option>)}</Select></Field>
          <Field label="星级评价" required error={visitAttempted && !stars ? "请选择星级" : undefined}><Select value={String(stars)} onValueChange={v=>setStars(Number(v))}><option value="0">请选择星级</option>{[1,2,3,4,5].map(n=><option key={n} value={String(n)}>{n} 星</option>)}</Select></Field>
          </div>{[1,2,5].includes(stars) && <Field label="反馈截图"><label className="admin-file-picker"><span>{visitEvidence ? "更换截图" : "选择截图"}</span><input aria-label="反馈截图" type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=()=>setVisitEvidence(String(r.result));r.readAsDataURL(f);}}}/></label></Field>}
        </>}
        {
          <Field
            label={action === "visit" ? "回访内容" : "备注 / 原因"}
            error={action === "visit" && visitAttempted && !note.trim() ? "请填写回访内容" : undefined}
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
                    <li>{businessMode() ? "账号共享课时清零，所有关联学员停止排课，保留账号及历史记录" : "订单状态更新为退款，保留历史记录和账面课时余额"}</li>
                    <li>{businessMode() ? "取消该账号所有关联学员由本系统安排的未来未开始课程，并同步 ClassIn" : `取消后续 ${future.length} 节未开始课程`}</li>
                    {businessMode() && <li>关联学员：{[...refundMembers(data, student.id)].map(memberName).join("、")}</li>}
                    <li>停用处理结果可在服务跟进的对应退费记录中查看</li>
                    <li>{businessMode() ? "本次清零课时并登记服务停用，不执行资金支付退款" : "本次仅登记服务状态，不执行资金退款"}</li>
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
              {s.balance}
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
