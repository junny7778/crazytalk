import { payrollBreakdown, formatStudentProgress } from "@crazytalk/shared";
import { DatePicker } from "@crazytalk/ui";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe2,
  LogOut,
  Mic2,
  Play,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import type { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  type Command,
  type Lesson,
  type Student,
  isRegularTime,
} from "@crazytalk/shared";
import {
  Select,
  WeeklyAvailabilityEditor,
  availabilityInputError,
  type AvailabilityValue,
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  SearchInput,
  Tabs,
  useToast,
} from "@crazytalk/ui";
import type { TextKey, Language } from "./locales";
import { readDraft, writeString, currency } from "./utils";
export function MenuItem({
  icon,
  label,
  onClick,
  count,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button onClick={onClick}>
      {icon}
      <span>{label}</span>
      {count && <Badge tone="warning">{count}</Badge>}
      <ChevronRight size={16} />
    </button>
  );
}
export function MonthSelect({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  t: (key: TextKey) => string;
}) {
  return (
    <label className="teacher-month-picker">
      <CalendarDays size={18} />
      <input type="month" aria-label={t("month")} value={value} onChange={e=>{if(e.target.value)onChange(e.target.value);}}/>
    </label>
  );
}
export function ScheduleView({
  lessons,
  t,
  language,
  openLesson,
  findStudent,
  dateLabel,
}: {
  lessons: Lesson[];
  t: (key: TextKey) => string;
  language: Language;
  openLesson: (lesson: Lesson) => void;
  findStudent: (id: string) => Student | undefined;
  dateLabel: (date: string) => string;
}) {
  const [mode, setMode] = useState("day");
  const [date, setDate] = useState(DEMO_TODAY);
  const days = Array.from({ length: 7 }, (_, i) => addDays(date, i));
  const visible = lessons.filter((l) =>
    mode === "day" ? l.date === date : days.includes(l.date),
  );
  return (
    <>
      <Tabs
        value={mode}
        onChange={setMode}
        items={[
          { value: "day", label: t("day") },
          { value: "week", label: t("week") },
        ]}
      />
      <div className="teacher-date-nav">
        <button
          className="teacher-icon-button"
          aria-label={t("previous")}
          onClick={() => setDate(addDays(date, mode === "day" ? -1 : -7))}
        >
          <ChevronLeft size={21} />
        </button>
        <strong>
          {dateLabel(date)}
          {mode === "week" ? ` – ${dateLabel(addDays(date, 6))}` : ""}
        </strong>
        <button
          className="teacher-icon-button"
          aria-label={t("nextPeriod")}
          onClick={() => setDate(addDays(date, mode === "day" ? 1 : 7))}
        >
          <ChevronRight size={21} />
        </button>
      </div>
      {mode === "week" && (
        <div className="teacher-week-strip">
          {days.map((day) => (
            <button
              key={day}
              className={day === DEMO_TODAY ? "current" : ""}
              onClick={() => {
                setDate(day);
                setMode("day");
              }}
            >
              <span>
                {new Intl.DateTimeFormat(
                  language === "zh" ? "zh-CN" : "en-US",
                  { weekday: "short", timeZone: "Asia/Shanghai" },
                ).format(new Date(`${day}T12:00:00+08:00`))}
              </span>
              <strong>{day.slice(8)}</strong>
              <i
                className={
                  lessons.some((l) => l.date === day) ? "has-lesson" : ""
                }
              />
            </button>
          ))}
        </div>
      )}
      <div className="teacher-card teacher-list-card">
        {visible.length ? (
          visible.map((l) => (
            <button
              key={l.id}
              className={`teacher-lesson-row ${l.status === "已取消" ? "teacher-lesson-cancelled" : ""}`}
              onClick={() => openLesson(l)}
            >
              <div className="teacher-lesson-time">
                {mode === "week" && <small>{dateLabel(l.date)}</small>}
                <strong>{l.time}</strong>
                <small>
                  {l.duration} {t("min")}
                </small>
              </div>
              <div className="teacher-lesson-info">
                <strong>{findStudent(l.studentId)?.name}</strong>
                <span>{l.material}</span>
                <small>
                  {l.status === "已取消"
                    ? t("cancelled")
                    : l.date < DEMO_TODAY
                      ? t("completed")
                      : t("upcoming")}
                </small>
              </div>
              <ChevronRight size={18} />
            </button>
          ))
        ) : (
          <EmptyState title={t("noLessons")} description={t("noLessonsHint")} />
        )}
      </div>
    </>
  );
}
export function StudentList({
  students,
  lessons,
  t,
  onSelect,
}: {
  students: Student[];
  lessons: Lesson[];
  t: (key: TextKey) => string;
  onSelect: (student: Student) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = students.filter((s) =>
    `${s.groupName} ${s.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t("searchStudents")}
      />
      <div className="teacher-card teacher-list-card">
        {filtered.map((s) => (
          <button
            className="teacher-student-row"
            key={s.id}
            onClick={() => onSelect(s)}
          >
            <Avatar name={s.name} size={44} />
            <div>
              <strong>{s.name}</strong>
              <small>{s.groupName || s.material || "—"}</small>
              <p>
                {
                  lessons.filter(
                    (l) => l.studentId === s.id && l.status === "已完成",
                  ).length
                }{" "}
                {t("lessonsTogether")}
              </p>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
        {!filtered.length && (
          <EmptyState
            title={t("noStudents")}
            description={t("noStudentsHint")}
          />
        )}
      </div>
    </>
  );
}
export function CloseLesson({
  lesson,
  student,
  existing,
  t,
  language,
  dateLabel,
  onSave,
}: {
  lesson: Lesson;
  student: Student | undefined;
  existing: ReturnType<typeof useDemo>["data"]["reports"][number] | undefined;
  t: (key: TextKey) => string;
  language: Language;
  dateLabel: (date: string) => string;
  onSave: (
    report: Omit<ReturnType<typeof useDemo>["data"]["reports"][number], "id">,
  ) => void;
}) {
  const [draft, setDraft] = useState(() => {
    const stored = readDraft(lesson.id);
    return {
      material:
        stored?.material ||
        existing?.material ||
        lesson.material ||
        student?.material ||
        "",
      unit:
        stored?.unit ||
        (existing?.to || student?.unit)?.match(/Unit (\d+)/)?.[1] ||
        "",
      page: stored?.page || existing?.to.match(/\bp\.?\s*(\d+)/i)?.[1] || "",
      rating: stored?.rating || existing?.rating || 0,
      comment: stored?.comment || existing?.comment || "",
      level: stored?.level || existing?.suggestedLevel || "",
    };
  });
  const [screenshot,setScreenshot]=useState(existing?.screenshot || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [suggest, setSuggest] = useState(!!draft.level);
  const words = draft.comment.trim()
    ? draft.comment.trim().split(/\s+/).length
    : 0;
  useEffect(() => {
    const timer = setTimeout(() => {
      writeString(`ct-teacher-draft-${lesson.id}`, JSON.stringify(draft));
      setSaved(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, lesson.id]);
  const edit = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };
  const expired = existing && existing.date < addDays(DEMO_TODAY, -1);
  function submit() {
    if(!screenshot){setError(language==="en"?"Upload the ending page screenshot":"请上传本节教材结束页截图");return;}
    onSave({
      lessonId: lesson.id,
      studentId: lesson.studentId,
      teacherId: lesson.teacherId,
      date: DEMO_TODAY,
      screenshot,material: draft.material.trim() || lesson.material || "课堂教材",
      from: student?.unit || "",
      to: !draft.page ? (language==="en"?"See screenshot":"见结束页截图") : `${draft.unit ? `Unit ${draft.unit} / ` : ""}P${draft.page}`,
      rating: draft.rating,
      comment: draft.comment,
      suggestedLevel: draft.level,
    });
  }
  return (
    <>
      <div className="teacher-close-summary">
        <Avatar name={student?.name || ""} size={44} />
        <div>
          <strong>{student?.name}</strong>
          <small>
            {dateLabel(lesson.date)} · {lesson.time} · {lesson.duration}{" "}
            {t("min")}
          </small>
        </div>
      </div>
      <div className="teacher-card teacher-form">
        <Field label={language==="en"?"Ending page screenshot":"教材结束页截图"} required><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{
          const file=e.target.files?.[0];if(!file)return;
          const reader=new FileReader();reader.onload=()=>{setScreenshot(String(reader.result));setError("");};reader.onerror=()=>setError(language==="en"?"Upload failed":"读取失败");reader.readAsDataURL(file);
        }}/></Field>{screenshot && <img src={screenshot} alt={language==="en"?"Ending page":"结束页"} width={180}/>}
        <div className="teacher-facts">
          <span>{t("material")}</span>
          <Field label={t("material")} required>
            <input
              value={draft.material}
              onChange={(event) => edit("material", event.target.value)}
            />
          </Field>
          <span>{t("startedAt")}</span>
          <p>{formatStudentProgress(student?.unit)}</p>
        </div>
        <div className="divider" />
        <div>
          <span className="teacher-field-heading">{t("endedAt")} *</span>
          <div className="teacher-progress-fields">
            <Field label={t("unit")}>
              <input
                value={draft.unit}
                onChange={(event) => edit("unit", event.target.value)}
              />
            </Field>
            <Field label={t("page")}>
              <input
                type="number"
                min={1}
                value={draft.page}
                onChange={(e) => edit("page", e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
        </div>
        <div>
          <span className="teacher-field-heading">{t("rating")}</span>
          <div className="teacher-stars" role="group" aria-label={t("rating")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-label={`${n} ${language === "en" ? "stars" : "星"}`}
                aria-pressed={draft.rating === n}
                onClick={() => edit("rating", n)}
              >
                <Star
                  size={32}
                  fill={n <= draft.rating ? "currentColor" : "none"}
                />
              </button>
            ))}
          </div>
        </div>
        <Field label={t("comment")}>
          <textarea
            value={draft.comment}
            onChange={(e) => edit("comment", e.target.value)}
            placeholder={t("commentPlaceholder")}
            rows={5}
          />
        </Field>
        <div className="teacher-word-count">
          <span className={words > 0 && words < 20 ? "warning" : "muted"}>
            {words} {t("words")}
          </span>
          {saved && (
            <small className="success">
              <Check size={12} />
              {t("savedDraft")}
            </small>
          )}
        </div>
        {words > 0 && words < 20 && (
          <p className="teacher-inline-hint">{t("wordHint")}</p>
        )}
        <label className="teacher-check-label">
          <input
            type="checkbox"
            checked={suggest}
            onChange={(e) => {
              setSuggest(e.target.checked);
              if (!e.target.checked) edit("level", "");
            }}
          />
          {t("suggest")}
        </label>
        {suggest && (
          <Field label={`${t("currentLevel")} · ${student?.level}`}>
            <Select
              value={draft.level}
              onValueChange={(value) => edit("level", value)}
            >
              <option value="">{t("noChange")}</option>
              {["Pre-A1", "A1", "A2", "B1", "B2", "C1"].map((level) => (
                <option key={level}>{level}</option>
              ))}
            </Select>
          </Field>
        )}
        {error && (
          <p className="danger" role="alert">
            {error}
          </p>
        )}
        <p className="teacher-inline-hint">
          {expired ? t("reportExpired") : t("noteHint")}
        </p>
      </div>
      <div className="teacher-fixed-action">
        <Button variant="primary" disabled={!!expired} onClick={submit}>
          {existing ? t("update") : t("submit")}
          <Check size={18} />
        </Button>
      </div>
    </>
  );
}
export function Availability({
  teacher,
  lessons,
  leaves,
  t,
  run,
  language,
}: {
  teacher: ReturnType<typeof useDemo>["data"]["teachers"][number];
  lessons: Lesson[];
  leaves: ReturnType<typeof useDemo>["data"]["leaves"];
  t: (key: TextKey) => string;
  run: (command: Command, message: string) => boolean;
  language: Language;
}) {
  const [tab, setTab] = useState("availability");
  const [availability, setAvailability] = useState<AvailabilityValue>(teacher);
  const [availabilityDirty, setAvailabilityDirty] = useState(false);
  useEffect(() => {
    setAvailability(teacher);
    setAvailabilityDirty(false);
  }, [teacher]);
  const [leaveStart, setLeaveStart] = useState(`${DEMO_TODAY}T18:00`);
  const [leaveEnd, setLeaveEnd] = useState(`${addDays(DEMO_TODAY, 1)}T22:00`);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const affected = lessons.filter(
    (lesson) =>
      lesson.status === "未开始" &&
      lesson.date >= DEMO_TODAY &&
      isRegularTime(teacher, lesson.date, lesson.time, lesson.duration) &&
      !isRegularTime(
        { ...teacher, ...availability },
        lesson.date,
        lesson.time,
        lesson.duration,
      ),
  );
  const leaveAffected = lessons.filter(
    (l) =>
      l.status === "未开始" &&
      `${l.date}T${l.time}` >= leaveStart &&
      `${l.date}T${l.time}` <= leaveEnd,
  );
  function persistAvailability() {
    if (
      run(
        {
          type: "teacher.save",
          teacher: {
            ...teacher,
            ...availability,
            availabilitySource: "entered",
          },
        },
        t("availabilitySaved"),
      )
    ) {
      setReviewOpen(false);
      setAvailabilityDirty(false);
      setError("");
    }
  }
  function save() {
    const problem = availabilityInputError(availability, language);
    if (problem) {
      setError(problem);
      return;
    }
    if (affected.length) setReviewOpen(true);
    else persistAvailability();
  }
  function request() {
    if (!reason.trim() || leaveEnd <= leaveStart) {
      setError(t("leaveRequired"));
      return;
    }
    if (
      run(
        {
          type: "leave.request",
          leave: {
            teacherId: teacher.id,
            start: leaveStart,
            end: leaveEnd,
            reason,
          },
        },
        t("leaveSent"),
      )
    ) {
      setReason("");
      setError("");
    }
  }
  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "availability", label: t("availabilityTab") },
          { value: "leave", label: t("leaveTab") },
        ]}
      />
      {tab === "availability" ? (
        <>
          <div className="teacher-card teacher-form">
            <h2>{t("usualHours")}</h2>
            <WeeklyAvailabilityEditor
              value={availability}
              language={language}
              legacy={teacher.availabilitySource === "legacy"}
              onChange={(value) => {
                setAvailability(value);
                setAvailabilityDirty(true);
                setError("");
              }}
            />
            {affected.length > 0 && (
              <div className="notice">
                {affected.length} {t("affectedLessons")} ·{" "}
                {t("changeNeedsReview")}
              </div>
            )}
            {error && (
              <p className="danger" role="alert">
                {error}
              </p>
            )}
            <Button
              variant="primary"
              disabled={
                Boolean(availabilityInputError(availability, language)) ||
                (!availabilityDirty && teacher.availabilitySource !== "legacy")
              }
              onClick={save}
            >
              {t("saveAvailability")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="teacher-card teacher-form">
            <Field label={t("leaveStart")} required>
              <DatePicker
                placeholder={t("leaveStart")}
                mode="datetime-local"
                language={language}
                min={`${DEMO_TODAY}T00:00`}
                value={leaveStart}
                onValueChange={(nextValue) => setLeaveStart(nextValue)}
              />
            </Field>
            <Field label={t("leaveEnd")} required>
              <DatePicker
                placeholder={t("leaveEnd")}
                mode="datetime-local"
                language={language}
                min={leaveStart}
                value={leaveEnd}
                onValueChange={(nextValue) => setLeaveEnd(nextValue)}
              />
            </Field>
            <Field label={t("reason")} required>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("leaveReason")}
              />
            </Field>
            <div className="teacher-inline-hint">
              {leaveAffected.length} {t("affectedLessons")} · {t("leaveReview")}
            </div>
            {error && (
              <p className="danger" role="alert">
                {error}
              </p>
            )}
            <Button variant="primary" onClick={request}>
              {t("requestLeave")}
            </Button>
          </div>
          {leaves.length ? (
            leaves.map((leave) => (
              <div key={leave.id} className="teacher-card">
                <div className="row between">
                  <strong>{leave.start.slice(5).replace("T", " ")}</strong>
                  <Badge
                    tone={
                      leave.status === "已通过"
                        ? "success"
                        : leave.status === "已驳回"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {leave.status === "已登记" ? (language==="en"?"Recorded":"已登记") : leave.status === "已通过"
                      ? t("approved")
                      : leave.status === "已驳回"
                        ? t("rejected")
                        : t("pendingApproval")}
                  </Badge>
                </div>
                <small>→ {leave.end.slice(5).replace("T", " ")}</small>
                <p className="teacher-leave-reason">{leave.reason}</p>
              </div>
            ))
          ) : (
            <EmptyState title={t("noLeave")} description={t("noLeaveHint")} />
          )}
        </>
      )}
      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={t("reviewAvailability")}
        footer={
          <>
            <Button onClick={() => setReviewOpen(false)}>{t("cancel")}</Button>
            <Button variant="primary" onClick={persistAvailability}>
              {t("saveKeepLessons")}
            </Button>
          </>
        }
      >
        <p>
          {affected.length} {t("affectedLessons")}
        </p>
        <div className="inset stack-sm">
          {affected.slice(0, 8).map((lesson) => (
            <div key={lesson.id}>
              {lesson.date} {lesson.time}
            </div>
          ))}
        </div>
        <p className="teacher-inline-hint">{t("keepLessonsHint")}</p>
      </Modal>
    </>
  );
}
export function Training({
  done,
  t,
  onDone,
}: {
  done: boolean;
  t: (key: TextKey) => string;
  onDone: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <>
      <p className="teacher-page-intro">{t("trainingIntro")}</p>
      <section className="teacher-training-cover">
        <span className="teacher-training-illustration">
          <Mic2 size={60} />
          <span className="teacher-sound-wave">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
        <Badge tone={done ? "success" : "info"}>
          {done ? t("completedTraining") : t("requiredTraining")}
        </Badge>
        <h1>{t("trainingTitle")}</h1>
        <p>{t("trainingDetail")}</p>
        <small>
          <Clock3 size={13} /> 5 {t("min")}
        </small>
      </section>
      {stage === 0 ? (
        <Button variant="primary" onClick={() => setStage(1)}>
          {done ? t("view") : t("startTraining")}
          <Play size={16} />
        </Button>
      ) : stage === 1 || stage === 2 ? (
        <div className="teacher-card teacher-form">
          <span className="teacher-eyebrow">{stage} / 2</span>
          <h2>{stage === 1 ? t("lessonOne") : t("lessonTwo")}</h2>
          <p>{stage === 1 ? t("lessonOneBody") : t("lessonTwoBody")}</p>
          <Button variant="primary" onClick={() => setStage(stage + 1)}>
            {stage === 1 ? t("continueTraining") : t("takeQuiz")}
            <ArrowRight size={16} />
          </Button>
        </div>
      ) : (
        <div className="teacher-card teacher-form">
          <h2>{t("quizQuestion")}</h2>
          {["A", "B", "C"].map((answerKey, index) => (
            <label
              key={answerKey}
              className={`teacher-quiz-option ${answer === answerKey ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="teacher-quiz"
                value={answerKey}
                checked={answer === answerKey}
                onChange={() => {
                  setAnswer(answerKey);
                  setWrong(false);
                }}
              />
              {t(index === 0 ? "quizA" : index === 1 ? "quizB" : "quizC")}
            </label>
          ))}
          {wrong && (
            <p className="danger" role="alert">
              {t("incorrect")}
            </p>
          )}
          {done && (
            <div className="teacher-training-success">
              <CheckCircle2 size={30} />
              <strong>{t("trainingCertificate")}</strong>
            </div>
          )}
          <Button
            variant="primary"
            disabled={!answer}
            onClick={() => {
              if (answer === "A") onDone();
              else setWrong(true);
            }}
          >
            {t("finishTraining")}
          </Button>
        </div>
      )}
    </>
  );
}
export function PayContent({
  pay,
  payroll,
  t,
  findStudent,
  onFeedback,
}: {
  pay: ReturnType<typeof payrollBreakdown> | undefined;
  payroll: ReturnType<typeof useDemo>["data"]["payroll"][number] | undefined;
  t: (key: TextKey) => string;
  findStudent: (id: string) => Student | undefined;
  onFeedback: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!payroll || !pay || payroll.status === "待确认")
    return (
      <div className="teacher-unconfirmed">
        <Wallet size={44} />
        <h2>{t("notConfirmed")}</h2>
        <p>{t("notConfirmedHint")}</p>
      </div>
    );
  const gross = pay.base;
  const deduct = pay.deductions;
  return (
    <>
      <div className="teacher-pay-summary">
        <div className="row between">
          <span className="teacher-eyebrow">{t("total")}</span>
          <Badge tone="success">
            {payroll.status === "已发放" ? t("paid") : t("confirmed")}
          </Badge>
        </div>
        <strong>{currency(pay.total)}</strong>
        <div className="teacher-pay-breakdown">
          <div>
            <span>{t("lessonPay")}</span>
            <span>
              {pay.units} {t("lessons")}
            </span>
            <strong>{currency(gross)}</strong>
          </div>
          <div>
            <span>{t("deductions")}</span>
            <span>{pay.deductionRows.length}</span>
            <strong>−{currency(deduct)}</strong>
          </div>
          <div>
            <span>{t("adjustments")}</span>
            <span />
            <strong>{currency(pay.adjustment)}</strong>
          </div>
        </div>
      </div>
      <div className="teacher-card">
        <button
          className="teacher-accordion"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <strong>{t("payDetails")}</strong>
          <ChevronRight
            size={17}
            style={{ transform: expanded ? "rotate(90deg)" : "" }}
          />
        </button>
        {expanded && (
          <>
            <div className="teacher-pay-lesson">
              <span>{t("openingPay")}<small>{pay.opening.units} {t("lessons")}</small></span>
              <strong>{currency(pay.opening.amount)}</strong>
            </div>
            <p className="teacher-inline-hint">{t("openingPayHint")}</p>
            {pay.rows.map((row) => (
              <div className="teacher-pay-lesson" key={row.lessonId}>
                <span>{row.date.slice(5)} · {row.time}<small>{findStudent(row.studentId)?.name} · {row.units} × {currency(row.rate)}</small></span>
                <strong>{currency(row.amount)}</strong>
              </div>
            ))}
            {!pay.rows.length && <p className="teacher-inline-hint">{t("noPayLessons")}</p>}
          </>
        )}

      </div>
      <section className="teacher-card">
        <h2>{t("deductions")}</h2>
        {pay.deductionRows.length ? (
          pay.deductionRows.map((a) => (
            <button
              key={a.id}
              className="teacher-deduction"
              onClick={onFeedback}
            >
              <span>
                <small>{a.date.slice(5)}</small>
                <p>{a.reason}</p>
              </span>
              <strong>−{currency(a.amount)}</strong>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <p className="teacher-inline-hint">{pay.deductions ? t("historicalDeduction") : t("noDeduction")}</p>
        )}
      </section>
      <p className="teacher-inline-hint">{t("payExample")}</p>
    </>
  );
}
export function Account({
  teacher,
  t,
  language,
  setLanguage,
  signOut,
}: {
  teacher: ReturnType<typeof useDemo>["data"]["teachers"][number];
  t: (key: TextKey) => string;
  language: Language;
  setLanguage: (language: Language) => void;
  signOut: () => void;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();
  return (
    <>
      <div className="teacher-student-hero">
        <Avatar name="Carol" size={64} />
        <h1>Carol</h1>
        <p>{teacher.so} · TEFL</p>
      </div>
      <section className="teacher-card">
        <h2>{t("profile")}</h2>
        <p className="teacher-profile-bio">{teacher.bio}</p>
        <div className="row gap-12">
          <Badge tone="info">{t("certificates")} · TEFL</Badge>
        </div>
        <p className="teacher-inline-hint">{t("profileHint")}</p>
      </section>
      <section className="teacher-card">
        <div className="teacher-section-heading">
          <h2>{t("language")}</h2>
          <Globe2 size={19} />
        </div>
        <div className="teacher-language">
          <button
            className={language === "en" ? "active" : ""}
            onClick={() => setLanguage("en")}
          >
            English{language === "en" && <Check size={18} />}
          </button>
          <button
            className={language === "zh" ? "active" : ""}
            onClick={() => setLanguage("zh")}
          >
            中文{language === "zh" && <Check size={18} />}
          </button>
        </div>
      </section>
      <section className="teacher-card teacher-list-card">
        <button
          className="teacher-account-action"
          onClick={() => setPasswordOpen(true)}
        >
          <ShieldCheck size={19} />
          <span>{t("password")}</span>
          <ChevronRight size={17} />
        </button>
        <button className="teacher-account-action danger" onClick={signOut}>
          <LogOut size={19} />
          <span>{t("signOut")}</span>
          <ChevronRight size={17} />
        </button>
      </section>
      <Modal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        title={t("password")}
        footer={
          <>
            <Button onClick={() => setPasswordOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!current || next.length < 8) {
                  setError(t("passwordRequired"));
                  return;
                }
                setPasswordOpen(false);
                setCurrent("");
                setNext("");
                toast(t("passwordSaved"));
              }}
            >
              {t("save")}
            </Button>
          </>
        }
      >
        <div className="teacher-form">
          <Field label={t("currentPassword")}>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </Field>
          <Field label={t("newPassword")} hint={t("passwordHint")}>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
