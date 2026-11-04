import { formatStudentProgress } from "@crazytalk/shared";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  Globe2,
  GraduationCap,
  Heart,
  Menu,
  MessageSquare,
  Mic2,
  Pin,
  Settings,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  addDays,
  DEMO_TODAY,
  type Command,
  type Lesson,
  canSubmitLessonReport,
} from "@crazytalk/shared";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Modal,
  useToast,
} from "@crazytalk/ui";
import en from "./locales/en";
import zh from "./locales/zh";
import "./styles.css";
import type { TextKey, Language } from "./locales";
import { readString, writeString } from "./utils";
import {
  MenuItem,
  MonthSelect,
  ScheduleView,
  StudentList,
  CloseLesson,
  Availability,
  Training,
  PayContent,
  Account,
} from "./screens";

type View =
  | "today"
  | "schedule"
  | "students"
  | "student"
  | "availability"
  | "feedback"
  | "attendance"
  | "training"
  | "report"
  | "pay"
  | "account"
  | "messages"
  | "lesson"
  | "closeLesson";
export default function TeacherApp() {
  const demo = useDemo();
  const { data, act } = demo;
  const toast = useToast();
  const [view, setView] = useState<View>("today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState("");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [signedIn, setSignedIn] = useState(true);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [seen, setSeen] = useState(() =>
    readString("ct-teacher-seen", "").split(","),
  );
  const [month, setMonth] = useState("2026-10");
  const [showAllPending, setShowAllPending] = useState(false);
  const language: Language = data.language;
  const t = (key: TextKey) => (language === "zh" ? zh[key] : en[key]);
  const teacher = data.teachers.find((item) => item.id === "t1");
  const lessons = useMemo(
    () =>
      data.lessons
        .filter((item) => item.teacherId === "t1")
        .sort((a, b) =>
          `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
        ),
    [data.lessons],
  );
  const students = data.students.filter(
    (item) =>
      item.teacherId === "t1" || lessons.some((l) => l.studentId === item.id),
  );
  const reports = data.reports.filter((item) => item.teacherId === "t1");
  const feedback = data.feedback.filter(
    (item) => item.teacherId === "t1" && item.status === "已完成",
  );
  const pending = lessons.filter(
    (item) =>
      canSubmitLessonReport(item) &&
      !reports.some((r) => r.lessonId === item.id),
  );
  const todayLessons = lessons.filter(
    (item) => item.date === DEMO_TODAY && item.status !== "已取消",
  );
  const nextLesson = lessons.find(
    (item) => item.date >= DEMO_TODAY && item.status === "未开始",
  );
  const [trainingDone, setTrainingDone] = useState(
    () => readString("ct-teacher-training", "") === "done",
  );
  const notifications: {
    id: string;
    title: string;
    body: string;
    target: View;
    icon: ReactNode;
  }[] = [
    {
      id: "training",
      title: t("notificationTraining"),
      body: t("notificationTrainingBody"),
      target: "training" as const,
      icon: <GraduationCap size={20} />,
    },
    {
      id: "pay",
      title: t("notificationPay"),
      body: t("notificationPayBody"),
      target: "pay" as const,
      icon: <Wallet size={20} />,
    },
  ];
  if (feedback.length)
    notifications.unshift({
      id: "feedback",
      title: t("notificationFeedback"),
      body: t("notificationFeedbackBody"),
      target: "feedback",
      icon: <MessageSquare size={20} />,
    });
  const unread = notifications.filter((n) => !seen.includes(n.id)).length;
  function markSeen(id: string) {
    setSeen((current) => {
      const updated = [...new Set([...current, id])];
      writeString("ct-teacher-seen", updated.join(","));
      return updated;
    });
  }
  function go(next: View) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
    if (next === "feedback") markSeen("feedback");
    if (next === "training") markSeen("training");
    if (next === "pay") markSeen("pay");
  }
  function run(command: Command, message: string) {
    try {
      act(command);
      toast(message);
      return true;
    } catch (error) {
      toast(
        language === "en"
          ? t("retry")
          : error instanceof Error
            ? error.message
            : t("retry"),
        { tone: "error" },
      );
      return false;
    }
  }
  function openLesson(lesson: Lesson, close = false) {
    setSelectedLesson(lesson.id);
    go(close ? "closeLesson" : "lesson");
  }
  function dateLabel(date: string) {
    if (date === DEMO_TODAY) return t("today");
    if (date === addDays(DEMO_TODAY, -1)) return t("yesterday");
    if (date === addDays(DEMO_TODAY, 1)) return t("tomorrow");
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      timeZone: "Asia/Shanghai",
    }).format(new Date(`${date}T12:00:00+08:00`));
  }
  const findStudent = (id: string) => data.students.find((s) => s.id === id);
  const currentLesson = lessons.find((item) => item.id === selectedLesson);
  const currentStudent = students.find((item) => item.id === selectedStudent);
  const title: Partial<Record<View, TextKey>> = {
    today: "today",
    schedule: "schedule",
    students: "students",
    student: "studentProfile",
    availability: "availability",
    feedback: "feedback",
    attendance: "attendance",
    training: "training",
    report: "report",
    pay: "pay",
    account: "account",
    messages: "messages",
    lesson: "lessonDetails",
    closeLesson: "closeLesson",
  };
  useEffect(() => {
    const element = document.querySelector(".teacher-app");
    element?.setAttribute("lang", language);
  }, [language]);
  function LessonRow({
    lesson,
    action = false,
  }: {
    lesson: Lesson;
    action?: boolean;
  }) {
    const student = findStudent(lesson.studentId);
    return (
      <button
        className="teacher-lesson-row"
        onClick={() => openLesson(lesson, action)}
      >
        <div className="teacher-lesson-time">
          <strong>{lesson.time}</strong>
          <small>
            {lesson.duration} {t("min")}
          </small>
        </div>
        <div className="teacher-lesson-info">
          <strong>{student?.name}</strong>
          <span>{lesson.material}</span>
          <small>{formatStudentProgress(student?.unit)}</small>
        </div>
        {action ? (
          <span className="teacher-small-action">{t("closeLesson")}</span>
        ) : (
          <ChevronRight size={18} />
        )}
      </button>
    );
  }
  function FeatureCard({
    children,
    title,
    action,
  }: {
    children: ReactNode;
    title?: string;
    action?: ReactNode;
  }) {
    return (
      <section className="teacher-card">
        {title && (
          <div className="teacher-section-heading">
            <h2>{title}</h2>
            {action}
          </div>
        )}
        {children}
      </section>
    );
  }
  if (!teacher)
    return (
      <div className="teacher-app">
        <EmptyState title={t("noTeacher")} description={t("retry")} />
      </div>
    );
  if (!signedIn)
    return (
      <div className="teacher-app teacher-login">
        <div className="teacher-login-top">
          <span className="teacher-brand">
            Crazy Talk<span>TEACHER</span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              run(
                {
                  type: "language.set",
                  language: language === "en" ? "zh" : "en",
                },
                language === "en" ? "已切换中文" : "English selected",
              )
            }
          >
            <Globe2 size={16} />
            {language === "en" ? "中文" : "English"}
          </Button>
        </div>
        <div className="teacher-login-card">
          <div className="teacher-brand-symbol">
            <BookOpen size={32} />
          </div>
          <h1>{t("welcome")}</h1>
          <p>{t("signInHint")}</p>
          <Field label={t("account")}>
            <input value="Carol" readOnly />
          </Field>
          <Button variant="primary" onClick={() => setSignedIn(true)}>
            {t("signIn")}
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    );
  return (
    <div className="teacher-app">
      <header className="teacher-header">
        <div className="teacher-header-left">
          {view === "today" ? (
            <span className="teacher-brand">
              Crazy Talk<span>TEACHER</span>
            </span>
          ) : (
            <>
              <button
                className="teacher-icon-button"
                onClick={() => go("today")}
                aria-label={t("back")}
              >
                <ArrowLeft size={21} />
              </button>
              <span className="teacher-page-title">
                {t(title[view] || "today")}
              </span>
            </>
          )}
        </div>
        <div className="row">
          <button
            className="teacher-icon-button"
            aria-label={t("messages")}
            onClick={() => go("messages")}
          >
            <Bell size={21} />
            {unread > 0 && <i className="teacher-dot" />}
          </button>
          <button
            className="teacher-icon-button"
            aria-label={t("menu")}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={23} />
          </button>
        </div>
      </header>
      <main className="teacher-content" key={view}>
        {view === "today" && (
          <>
            <div className="teacher-greeting">
              <div>
                <span className="teacher-eyebrow">
                  {new Intl.DateTimeFormat(
                    language === "zh" ? "zh-CN" : "en-US",
                    {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                      timeZone: "Asia/Shanghai",
                    },
                  ).format(new Date(`${DEMO_TODAY}T12:00:00+08:00`))}
                </span>
                <h1>
                  {t("greeting")} <span className="teacher-greeting-dot" />
                </h1>
                <p>{t("intro")}</p>
              </div>
              <Avatar name="Carol" size={48} />
            </div>
            {pending.length > 0 && (
              <section className="teacher-pending">
                <div className="teacher-section-heading">
                  <span className="row">
                    <ClipboardList size={18} />
                    <strong>
                      {pending.length} {t("pending")}
                    </strong>
                  </span>
                  <Badge tone="warning">{t("needsReport")}</Badge>
                </div>
                {(showAllPending ? pending : pending.slice(-2)).map(
                  (lesson) => (
                    <div key={lesson.id}>
                      <small>{dateLabel(lesson.date)}</small>
                      <LessonRow lesson={lesson} action />
                    </div>
                  ),
                )}
                {pending.length > 2 && (
                  <button
                    className="teacher-text-button"
                    onClick={() => setShowAllPending(!showAllPending)}
                  >
                    {showAllPending ? t("showLess") : t("viewAll")}
                    <ChevronRight size={14} />
                  </button>
                )}
              </section>
            )}
            <div className="teacher-prompt-list">
              {notifications
                .filter((n) => !seen.includes(n.id))
                .slice(0, 3)
                .map((n) => (
                  <button
                    key={n.id}
                    className="teacher-prompt"
                    onClick={() => {
                      markSeen(n.id);
                      if (n.id === "pay") setMonth("2026-09");
                      go(n.target);
                    }}
                  >
                    <span className="teacher-prompt-icon">{n.icon}</span>
                    <span>{n.title}</span>
                    <ChevronRight size={18} />
                  </button>
                ))}
            </div>
            {nextLesson && (
              <section className="teacher-next-card">
                <div className="teacher-section-heading">
                  <span className="teacher-eyebrow">{t("next")}</span>
                  <span className="teacher-next-date">
                    {dateLabel(nextLesson.date)}
                  </span>
                </div>
                <button
                  onClick={() => openLesson(nextLesson)}
                  className="teacher-next-button"
                >
                  <div>
                    <span className="teacher-next-time">{nextLesson.time}</span>
                    <h2>{findStudent(nextLesson.studentId)?.name}</h2>
                    <p>
                      {nextLesson.material} /{" "}
                      {formatStudentProgress(
                        findStudent(nextLesson.studentId)?.unit,
                      )}
                    </p>
                  </div>
                  <span className="teacher-next-arrow">
                    <ArrowUpRightIcon />
                  </span>
                </button>
                <div className="teacher-next-footer">
                  <BookOpen size={15} />
                  <span>{t("preparation")}</span>
                  <span>
                    {nextLesson.duration} {t("min")}
                  </span>
                </div>
              </section>
            )}
            <section>
              <div className="teacher-section-heading">
                <h2>{t("todayLessons")}</h2>
                <button
                  className="teacher-text-button"
                  onClick={() => go("schedule")}
                >
                  {t("schedule")}
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="teacher-card teacher-list-card">
                {todayLessons.length ? (
                  todayLessons.map((l) => <LessonRow key={l.id} lesson={l} />)
                ) : (
                  <EmptyState
                    title={t("noLessons")}
                    description={t("noLessonsHint")}
                  />
                )}
              </div>
            </section>
            <button
              className="teacher-announcement"
              onClick={() => setAnnouncementOpen(true)}
            >
              <Pin size={17} />
              <span>
                <small>{t("readAnnouncement")}</small>
                <strong>{t("announcement")}</strong>
              </span>
              <ChevronRight size={18} />
            </button>
          </>
        )}
        {view === "schedule" && (
          <ScheduleView
            lessons={lessons}
            t={t}
            language={language}
            openLesson={openLesson}
            findStudent={findStudent}
            dateLabel={dateLabel}
          />
        )}
        {view === "students" && (
          <StudentList
            students={students}
            lessons={lessons}
            t={t}
            onSelect={(s) => {
              setSelectedStudent(s.id);
              go("student");
            }}
          />
        )}
        {view === "student" && currentStudent && (
          <>
            <div className="teacher-student-hero">
              <Avatar name={currentStudent.name} size={60} />
              <h1>{currentStudent.name}</h1>
              <p>
                {[
                  currentStudent.groupName,
                  currentStudent.ageText ||
                    (currentStudent.age === null
                      ? ""
                      : `${currentStudent.age} ${t("age")}`),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <Badge tone="info">CEFR {currentStudent.level}</Badge>
            </div>
            <FeatureCard title={t("studentProfile")}>
              <div className="teacher-facts">
                <span>{t("preferences")}</span>
                <p>{currentStudent.preferences}</p>
                <span>{t("learningGoal")}</span>
                <p>{currentStudent.goal}</p>
              </div>
            </FeatureCard>
            <FeatureCard title={t("lastTime")}>
              <div className="row gap-12">
                <span className="teacher-prompt-icon">
                  <BookOpen size={22} />
                </span>
                <div>
                  <strong>{currentStudent.material}</strong>
                  <p className="muted">
                    {formatStudentProgress(currentStudent.unit)}
                  </p>
                </div>
              </div>
            </FeatureCard>
            <FeatureCard title={t("recentReports")}>
              {reports.filter((r) => r.studentId === currentStudent.id)
                .length ? (
                reports
                  .filter((r) => r.studentId === currentStudent.id)
                  .map((r) => (
                    <div className="teacher-record" key={r.id}>
                      <div className="row between">
                        <strong>{dateLabel(r.date)}</strong>
                        <span className="brand">{"★".repeat(r.rating)}</span>
                      </div>
                      <p>
                        {r.material} / {formatStudentProgress(r.to)}
                      </p>
                      <p className="muted">{r.comment}</p>
                    </div>
                  ))
              ) : (
                <EmptyState
                  title={t("noReports")}
                  description={t("noReportsHint")}
                />
              )}
            </FeatureCard>
            <FeatureCard title={t("feedback")}>
              {feedback.filter((f) => f.studentId === currentStudent.id)
                .length ? (
                feedback
                  .filter((f) => f.studentId === currentStudent.id)
                  .map((f) => (
                    <div key={f.id} className="teacher-record">
                      <small>{dateLabel(f.date)}</small>
                      <p>{f.content}</p>
                      <Badge tone={f.rating === "好评" ? "success" : "warning"}>
                        {f.rating === "好评" ? t("positive") : t("improvement")}
                      </Badge>
                    </div>
                  ))
              ) : (
                <p className="muted">{t("noFeedback")}</p>
              )}
            </FeatureCard>
          </>
        )}
        {view === "lesson" && currentLesson && (
          <>
            <FeatureCard>
              <div className="row between">
                <span className="teacher-eyebrow">
                  {dateLabel(currentLesson.date)}
                </span>
                <Badge
                  tone={
                    currentLesson.status === "已取消"
                      ? "neutral"
                      : canSubmitLessonReport(currentLesson)
                        ? "success"
                        : "info"
                  }
                >
                  {currentLesson.status === "已取消"
                    ? t("cancelled")
                    : canSubmitLessonReport(currentLesson)
                      ? t("completed")
                      : t("upcoming")}
                </Badge>
              </div>
              <h1 className="teacher-lesson-title">
                {currentLesson.time}{" "}
                <span>
                  · {currentLesson.duration} {t("min")}
                </span>
              </h1>
              <button
                className="teacher-student-link"
                onClick={() => {
                  setSelectedStudent(currentLesson.studentId);
                  go("student");
                }}
              >
                <Avatar
                  name={findStudent(currentLesson.studentId)?.name || ""}
                />
                <span>{findStudent(currentLesson.studentId)?.name}</span>
                <ChevronRight size={18} />
              </button>
            </FeatureCard>
            <FeatureCard title={t("material")}>
              <h3>{currentLesson.material}</h3>
              <p className="muted">
                {t("lastTime")} ·{" "}
                {formatStudentProgress(
                  findStudent(currentLesson.studentId)?.unit,
                )}
              </p>
            </FeatureCard>
            <FeatureCard title={t("studentProfile")}>
              <p>{findStudent(currentLesson.studentId)?.preferences}</p>
              <p className="muted">
                {findStudent(currentLesson.studentId)?.goal}
              </p>
            </FeatureCard>
            <FeatureCard title={t("recentReports")}>
              {reports
                .filter((r) => r.studentId === currentLesson.studentId)
                .slice(-3)
                .map((r) => (
                  <div key={r.id} className="teacher-record">
                    <strong>
                      {dateLabel(r.date)} · {formatStudentProgress(r.to)}
                    </strong>
                    <p>{r.comment}</p>
                  </div>
                ))}
              {!reports.some(
                (r) => r.studentId === currentLesson.studentId,
              ) && <p className="muted">{t("noReports")}</p>}
            </FeatureCard>
            {canSubmitLessonReport(currentLesson) && (
              <div className="teacher-fixed-action">
                <Button variant="primary" onClick={() => go("closeLesson")}>
                  {reports.some((r) => r.lessonId === currentLesson.id)
                    ? t("editReport")
                    : t("closeLesson")}
                  <ArrowRight size={17} />
                </Button>
              </div>
            )}
          </>
        )}
        {view === "closeLesson" && currentLesson && (
          <CloseLesson
            lesson={currentLesson}
            student={findStudent(currentLesson.studentId)}
            existing={reports.find((r) => r.lessonId === currentLesson.id)}
            t={t}
            language={language}
            dateLabel={dateLabel}
            onSave={(report) => {
              if (run({ type: "report.save", report }, t("savedReport"))) {
                try {
                  localStorage.removeItem(
                    `ct-teacher-draft-${currentLesson.id}`,
                  );
                } catch {}
                go("today");
              }
            }}
          />
        )}
        {view === "availability" && (
          <Availability
            teacher={teacher}
            lessons={lessons}
            leaves={data.leaves.filter((l) => l.teacherId === teacher.id)}
            t={t}
            run={run}
            language={language}
          />
        )}
        {view === "feedback" && (
          <>
            <p className="teacher-page-intro">{t("recent30")}</p>
            <div className="teacher-mini-stats">
              <div>
                <Heart size={18} />
                <strong>
                  {feedback.filter((f) => f.rating === "好评").length}
                </strong>
                <span>{t("positive")}</span>
              </div>
              <div>
                <MessageSquare size={18} />
                <strong>
                  {feedback.filter((f) => f.rating === "差评").length}
                </strong>
                <span>{t("improvement")}</span>
              </div>
            </div>
            {feedback.length ? (
              feedback.map((f) => (
                <FeatureCard key={f.id}>
                  <div className="row between">
                    <strong>{findStudent(f.studentId)?.name}</strong>
                    <Badge tone={f.rating === "好评" ? "success" : "warning"}>
                      {f.rating === "好评" ? t("positive") : t("improvement")}
                    </Badge>
                  </div>
                  <small>{dateLabel(f.date)}</small>
                  <p className="teacher-feedback-quote">{f.content}</p>
                  <div className="teacher-result">
                    <strong>{t("outcome")}</strong>
                    <p>
                      {f.verdict === "老师有责"
                        ? language === "en"
                          ? "Improvement needed"
                          : "老师有责"
                        : language === "en"
                          ? "Reviewed"
                          : "已完成判定"}
                    </p>
                    {f.measures.length > 0 && (
                      <small>
                        {t("measures")} ·{" "}
                        {f.measures
                          .map((measure) =>
                            language === "en"
                              ? {
                                  提醒: "Reminder",
                                  培训: "Training",
                                  警告信: "Warning",
                                  扣款: "Deduction",
                                  最后警告: "Final warning",
                                }[measure] || measure
                              : measure,
                          )
                          .join(" · ")}
                      </small>
                    )}
                  </div>
                  {data.actions.some(
                    (a) =>
                      a.feedbackId === f.id &&
                      a.type === "扣款" &&
                      a.status === "已确认",
                  ) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMonth(f.date.slice(0, 7));
                        go("pay");
                      }}
                    >
                      {t("viewPay")}
                      <ChevronRight size={15} />
                    </Button>
                  )}
                </FeatureCard>
              ))
            ) : (
              <EmptyState
                title={t("noFeedback")}
                description={t("noFeedbackHint")}
              />
            )}
          </>
        )}
        {view === "attendance" && (
          <>
            <MonthSelect value={month} onChange={setMonth} t={t} />
            <div className="teacher-mini-stats">
              <div>
                <Clock3 size={19} />
                <strong>
                  {
                    lessons.filter(
                      (l) =>
                        l.date.startsWith(month) && l.attendance === "老师迟到",
                    ).length
                  }
                </strong>
                <span>{t("late")}</span>
              </div>
              <div>
                <CalendarDays size={19} />
                <strong>
                  {
                    lessons.filter(
                      (l) =>
                        l.date.startsWith(month) && l.attendance === "老师缺席",
                    ).length
                  }
                </strong>
                <span>{t("absent")}</span>
              </div>
            </div>
            {lessons.filter(
              (l) =>
                l.date.startsWith(month) &&
                (l.attendance === "老师迟到" || l.attendance === "老师缺席"),
            ).length ? (
              lessons
                .filter(
                  (l) =>
                    l.date.startsWith(month) &&
                    (l.attendance === "老师迟到" ||
                      l.attendance === "老师缺席"),
                )
                .map((l) => (
                  <FeatureCard key={l.id}>
                    <div className="row between">
                      <strong>
                        {dateLabel(l.date)} · {l.time}
                      </strong>
                      <Badge tone="warning">
                        {l.attendance === "老师迟到" ? t("late") : t("absent")}
                      </Badge>
                    </div>
                    <p>{findStudent(l.studentId)?.name}</p>
                    <small>
                      {l.teacherIn || "—"} → {l.teacherOut || "—"}
                    </small>
                  </FeatureCard>
                ))
            ) : (
              <div className="teacher-positive-empty">
                <ShieldCheck size={48} />
                <h2>{t("noIssues")}</h2>
                <p>{t("noIssuesHint")}</p>
              </div>
            )}
          </>
        )}
        {view === "training" && (
          <Training
            done={trainingDone}
            t={t}
            onDone={() => {
              setTrainingDone(true);
              writeString("ct-teacher-training", "done");
              toast(t("correct"));
            }}
          />
        )}
        {view === "report" && (
          <>
            <p className="teacher-page-intro">{t("reportIntro")}</p>
            <MonthSelect value={month} onChange={setMonth} t={t} />
            <div className="teacher-report-grid">
              <FeatureCard>
                <CalendarDays size={20} />
                <strong>
                  {
                    lessons.filter(
                      (l) => l.date.startsWith(month) && l.status === "已完成",
                    ).length
                  }
                </strong>
                <span>{t("taught")}</span>
              </FeatureCard>
              <FeatureCard>
                <Users size={20} />
                <strong>
                  {
                    new Set(
                      lessons
                        .filter(
                          (l) =>
                            l.date.startsWith(month) && l.status === "已完成",
                        )
                        .map((l) => l.studentId),
                    ).size
                  }
                </strong>
                <span>{t("activeStudents")}</span>
              </FeatureCard>
              <FeatureCard>
                <Star size={20} />
                <strong>
                  {reports.filter(
                    (r) => r.date.startsWith(month) && r.rating > 0,
                  ).length
                    ? (
                        reports
                          .filter(
                            (r) => r.date.startsWith(month) && r.rating > 0,
                          )
                          .reduce((s, r) => s + r.rating, 0) /
                        reports.filter(
                          (r) => r.date.startsWith(month) && r.rating > 0,
                        ).length
                      ).toFixed(1)
                    : "—"}
                </strong>
                <span>{t("averageRating")}</span>
              </FeatureCard>
              <FeatureCard>
                <ClipboardList size={20} />
                <strong>
                  {reports.filter((r) => r.date.startsWith(month)).length}
                </strong>
                <span>{t("submitted")}</span>
              </FeatureCard>
            </div>
            <div className="teacher-tip">
              <TrendingUp size={22} />
              <p>{t("reportTip")}</p>
            </div>
          </>
        )}
        {view === "pay" && (
          <>
            <MonthSelect value={month} onChange={setMonth} t={t} />
            <PayContent
              payroll={data.payroll.find(
                (p) => p.teacherId === teacher.id && p.month === month,
              )}
              rate={teacher.rate}
              deductions={data.actions.filter(
                (a) =>
                  a.teacherId === teacher.id &&
                  a.status === "已确认" &&
                  a.date.startsWith(month) &&
                  a.type === "扣款",
              )}
              lessons={lessons.filter(
                (l) => l.date.startsWith(month) && l.status === "已完成",
              )}
              t={t}
              findStudent={findStudent}
              onFeedback={() => go("feedback")}
            />
          </>
        )}
        {view === "messages" && (
          <>
            <div className="teacher-section-heading">
              <h1>{t("messages")}</h1>
              <button
                className="teacher-text-button"
                onClick={() => notifications.forEach((n) => markSeen(n.id))}
              >
                {t("markRead")}
              </button>
            </div>
            {notifications.map((n) => (
              <button
                key={n.id}
                className={`teacher-message teacher-card ${seen.includes(n.id) ? "" : "teacher-message-unread"}`}
                onClick={() => {
                  markSeen(n.id);
                  if (n.id === "pay") setMonth("2026-09");
                  go(n.target);
                }}
              >
                <span className="teacher-prompt-icon">{n.icon}</span>
                <span>
                  <strong>{n.title}</strong>
                  <p>{n.body}</p>
                  <small>
                    {seen.includes(n.id) ? t("read") : t("newMessages")}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
            <button
              className="teacher-message teacher-card"
              onClick={() => setAnnouncementOpen(true)}
            >
              <span className="teacher-prompt-icon">
                <Pin size={20} />
              </span>
              <span>
                <strong>{t("announcement")}</strong>
                <p>{t("announcementBody")}</p>
              </span>
            </button>
          </>
        )}
        {view === "account" && (
          <Account
            teacher={teacher}
            t={t}
            language={language}
            setLanguage={(value) =>
              run(
                { type: "language.set", language: value },
                value === "en" ? "English selected" : "已切换中文",
              )
            }
            signOut={() => setSignOutOpen(true)}
          />
        )}
      </main>
      <footer className="teacher-footer">
        <span>Crazy Talk</span>
        <span>{t("timeZone")}</span>
      </footer>
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Carol · BigBrains"
        width={Math.min(320, window.innerWidth * 0.82)}
        description={t("timeZone")}
      >
        <div className="teacher-menu">
          <small>{t("teaching")}</small>
          <MenuItem
            icon={<CalendarDays size={20} />}
            label={t("schedule")}
            onClick={() => go("schedule")}
          />
          <MenuItem
            icon={<Users size={20} />}
            label={t("students")}
            onClick={() => go("students")}
          />
          <MenuItem
            icon={<Clock3 size={20} />}
            label={t("availability")}
            onClick={() => go("availability")}
          />
          <small>{t("performance")}</small>
          <MenuItem
            icon={<MessageSquare size={20} />}
            label={t("feedback")}
            onClick={() => go("feedback")}
            count={
              feedback.length && !seen.includes("feedback")
                ? feedback.length
                : undefined
            }
          />
          <MenuItem
            icon={<ShieldCheck size={20} />}
            label={t("attendance")}
            onClick={() => go("attendance")}
          />
          <MenuItem
            icon={<GraduationCap size={20} />}
            label={t("training")}
            onClick={() => go("training")}
            count={!trainingDone ? 1 : undefined}
          />
          <MenuItem
            icon={<TrendingUp size={20} />}
            label={t("report")}
            onClick={() => go("report")}
          />
          <div className="divider" />
          <MenuItem
            icon={<Wallet size={20} />}
            label={t("pay")}
            onClick={() => go("pay")}
          />
          <MenuItem
            icon={<Settings size={20} />}
            label={t("account")}
            onClick={() => go("account")}
          />
        </div>
      </Drawer>
      <Modal
        open={announcementOpen}
        onClose={() => setAnnouncementOpen(false)}
        title={t("announcement")}
        footer={
          <Button variant="primary" onClick={() => setAnnouncementOpen(false)}>
            {t("done")}
          </Button>
        }
      >
        <div className="teacher-announcement-body">
          <Mic2 size={36} />
          <p>{t("announcementBody")}</p>
        </div>
      </Modal>
      <Modal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title={t("signOutConfirm")}
        footer={
          <>
            <Button onClick={() => setSignOutOpen(false)}>{t("cancel")}</Button>
            <Button
              variant="primary"
              onClick={() => {
                setSignOutOpen(false);
                setSignedIn(false);
              }}
            >
              {t("signOut")}
            </Button>
          </>
        }
      >
        <p>{t("signInHint")}</p>
      </Modal>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={22} style={{ transform: "rotate(-45deg)" }} />;
}
