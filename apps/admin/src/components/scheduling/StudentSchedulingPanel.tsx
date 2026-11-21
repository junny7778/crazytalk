import ClassInOperationFeedback from "../ClassInOperationFeedback";
import { FlexStudentCalendar } from "./FlexStudentCalendar";
import { DatePicker } from "@crazytalk/ui";
import { ZodError } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  scheduleIntentSchema,
  isScheduleDate,
  addDays,
  teacherFit,
  compareTeacherFit,
  getFixedSchedulePlans,
  type FixedPlan,
  getStudentScheduleProgress,
  type Student,
} from "@crazytalk/shared";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Select,
  useToast,
} from "@crazytalk/ui";

type Intent = NonNullable<Student["scheduleIntent"]>;
const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export function StudentSchedulingPanel({
  student,
  onDirtyChange,
  onBusyChange,
  onClose,
  onStageChange,
  onViewTeacher,
  onIntentSaved,
  onFixedPlan,
  onScheduleComplete,
}: {
  onClose: () => void;
  onStageChange: (stage: "setup" | "preview") => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onScheduleComplete: (count: number, teacherNames: string) => void;
  onFixedPlan: (plan: FixedPlan, intent: Intent) => void;
  onViewTeacher: (teacherId: string) => void;
  onIntentSaved: () => void;
  student: Student;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const [draft, setDraft] = useState<Intent>(
    student.scheduleIntent
      ? student.scheduleIntent
      : {
          mode: "fixed",
          startDate: DEMO_TODAY,
          weeks: 4,
          duration: 25,
          frequency: 2,
          windows: [],
        },
  );
  const [editingIntent, setEditingIntent] = useState(!student.scheduleIntent);
  useEffect(() => {
    if (editingIntent) onStageChange("setup");
  }, [editingIntent, onStageChange]);
  const [error, setError] = useState("");
  const [chosenTeacher, setChosenTeacher] = useState("");
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    onBusyChange(generating);
  }, [generating, onBusyChange]);
  const [initialDraft] = useState(() => JSON.stringify(draft));
  useEffect(() => {
    onDirtyChange(JSON.stringify(draft) !== initialDraft);
  }, [draft, initialDraft, onDirtyChange]);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("时间优先");
  const [holdMinutes, setHoldMinutes] = useState(30);
  const saved = student.scheduleIntent;
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const windowErrors = draft.windows.map((window) => {
    if (!window.start || !window.end) return "请填写开始和结束时间";
    const minutes = (time: string) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (window.end <= window.start) return "结束时间需晚于开始时间";
    if (minutes(window.end) - minutes(window.start) < draft.duration)
      return `时间范围需至少容纳 ${draft.duration} 分钟课程`;
    return "";
  });
  const validDraft =
    scheduleIntentSchema.safeParse(draft).success &&
    isScheduleDate(draft.startDate) &&
    draft.startDate >= DEMO_TODAY &&
    windowErrors.every((error) => !error);
  function toggleDay(day: number) {
    const selected = draft.windows.some((window) => window.day === day);
    update({
      windows: selected
        ? draft.windows.filter((window) => window.day !== day)
        : [...draft.windows, { day, start: "19:00", end: "21:00" }].sort(
            (a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7),
          ),
    });
  }
  const fixedPlans = useMemo(
    () =>
      saved?.mode === "fixed"
        ? getFixedSchedulePlans(data, student.id, saved)
        : [],
    [data, student.id, saved],
  );
  const sortedPlans = fixedPlans
    .filter((plan) =>
      data.teachers
        .find((t) => t.id === plan.primaryTeacherId)
        ?.name.toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => {
      const at = data.teachers.find((t) => t.id === a.primaryTeacherId)!,
        bt = data.teachers.find((t) => t.id === b.primaryTeacherId)!;
      const complete =
        Number(b.complete && b.teacherCount === 1) -
        Number(a.complete && a.teacherCount === 1);
      const available = Number(b.primaryCount > 0) - Number(a.primaryCount > 0);
      const fit = compareTeacherFit(data, student, at, bt),
        coverage = b.primaryCount - a.primaryCount;
      return (
        available ||
        complete ||
        (priority === "老师优先" ? fit || coverage : coverage || fit)
      );
    });
  const selectedPlan =
    sortedPlans.find((plan) => plan.primaryTeacherId === chosenTeacher) ??
    sortedPlans[0];
  const selectedTeacher = data.teachers.find(
    (teacher) => teacher.id === selectedPlan?.primaryTeacherId,
  );
  const selectedBlocked = selectedTeacher
    ? teacherFit(data, student, selectedTeacher).blocked.length > 0
    : false;
  const workloadStart = addDays(
    DEMO_TODAY,
    -((new Date(`${DEMO_TODAY}T12:00:00+08:00`).getUTCDay() + 6) % 7),
  );
  const progress = saved
    ? getStudentScheduleProgress(data, student.id, saved)
    : null;
  function update(patch: Partial<Intent>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
  }
  return (
    <div className="student-scheduling stack">
      <ClassInOperationFeedback studentId={student.id} />
      <div className="row between">
        {progress && saved?.mode !== "flex" && (
          <Badge tone="info">
            已安排 {progress.scheduledCount}/{progress.requiredCount} 节
          </Badge>
        )}
      </div>
      {saved && !editingIntent ? (
        <section className="schedule-intent-summary" aria-label="学员排课意向">
          <div>
            <strong>{saved.mode === "fixed" ? "固定排课" : "灵活排课"}</strong>
            <p>
              {saved.windows
                .map((w) => `${days[w.day]} ${w.start}–${w.end}`)
                .join("、")}{" "}
              · 每节 {saved.duration} 分钟 · 每周 {saved.frequency} 节 · 共{" "}
              {saved.weeks} 周
            </p>
            <small>{saved.startDate} 起</small>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setEditingIntent(true)}
          >
            修改排课信息
          </Button>
        </section>
      ) : (
        <section
          className="schedule-intent-card stack"
          aria-label="学员排课意向"
        >
          <h4>排课设置</h4>
          <div className="form-grid intent-settings-grid">
            <Field label="排课方式">
              <Select
                value={draft.mode}
                onValueChange={(value) =>
                  update({ mode: value === "fixed" ? "fixed" : "flex" })
                }
              >
                <option value="fixed">固定排课</option>
                <option value="flex">灵活排课</option>
              </Select>
            </Field>
            <Field label="开始日期">
              <DatePicker
                placeholder="开始日期"
                mode="date"
                min={DEMO_TODAY}
                value={draft.startDate}
                onValueChange={(nextValue) => update({ startDate: nextValue })}
              />
            </Field>
            <Field label="排课周期">
              <Select
                value={draft.weeks}
                onValueChange={(v) => update({ weeks: Number(v) })}
              >
                {[1, 2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} 周
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="每节时长">
              <Select
                value={draft.duration}
                onValueChange={(v) =>
                  update({
                    duration:
                      v === "50"
                        ? 50
                        : v === "55"
                          ? 55
                          : v === "120"
                            ? 120
                            : 25,
                  })
                }
              >
                {[25, 50, 55, 120].map((n) => (
                  <option key={n} value={n}>
                    {n} 分钟
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="每周节数">
              <Select
                value={draft.frequency}
                onValueChange={(v) => update({ frequency: Number(v) })}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} 节
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <section
            className="intent-time-section"
            aria-label={
              draft.mode === "fixed" ? "意向时间（必填）" : "意向时间（选填）"
            }
          >
            <div className="intent-time-heading">
              <div>
                <h4>
                  意向时间{" "}
                  {draft.mode === "fixed" && (
                    <span className="intent-required" aria-hidden="true">
                      *
                    </span>
                  )}
                </h4>
              </div>
            </div>
            <div
              className="intent-weekdays"
              role="group"
              aria-label="每周上课日"
            >
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={draft.windows.some(
                    (window) => window.day === day,
                  )}
                  onClick={() => toggleDay(day)}
                >
                  {days[day]}
                </button>
              ))}
            </div>
            <div className="intent-days">
              {[1, 2, 3, 4, 5, 6, 0]
                .filter((day) => draft.windows.some((w) => w.day === day))
                .map((day) => (
                  <div className="intent-day-row" key={day}>
                    <strong>{days[day]}</strong>
                    <div className="intent-day-content">
                      <div className="intent-ranges">
                        {draft.windows.map(
                          (window, index) =>
                            window.day === day && (
                              <div
                                className="intent-range"
                                key={index}
                                role="group"
                                aria-label={`意向时间${index + 1}`}
                              >
                                <div className="intent-range-inputs">
                                  <input
                                    type="time"
                                    aria-label={`意向${index + 1}开始时间`}
                                    value={window.start}
                                    onChange={(e) =>
                                      update({
                                        windows: draft.windows.map((w, i) =>
                                          i === index
                                            ? { ...w, start: e.target.value }
                                            : w,
                                        ),
                                      })
                                    }
                                  />
                                  <span>—</span>
                                  <input
                                    type="time"
                                    aria-label={`意向${index + 1}结束时间`}
                                    value={window.end}
                                    onChange={(e) =>
                                      update({
                                        windows: draft.windows.map((w, i) =>
                                          i === index
                                            ? { ...w, end: e.target.value }
                                            : w,
                                        ),
                                      })
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="intent-remove"
                                    aria-label={`删除${days[day]}时间段${index + 1}`}
                                    onClick={() =>
                                      update({
                                        windows: draft.windows.filter(
                                          (_, i) => i !== index,
                                        ),
                                      })
                                    }
                                  >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                                    </svg>
                                  </button>
                                </div>
                                {windowErrors[index] && (
                                  <small
                                    className="intent-window-error"
                                    role="status"
                                  >
                                    {windowErrors[index]}
                                  </small>
                                )}
                              </div>
                            ),
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={draft.windows.some(window => !window.start || !window.end)}
                        onClick={() =>
                          update({
                            windows: [
                              ...draft.windows,
                              { day, start: "", end: "" },
                            ],
                          })
                        }
                      >
                        ＋ 添加{days[day]}时间段
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
        </section>
      )}
      {editingIntent && (
        <div className="schedule-flow-actions row wrap">
          <span className="intent-total">
            每周 {draft.frequency} 节 · 共 {draft.frequency * draft.weeks} 节
          </span>
          <Button disabled={generating} onClick={onClose}>
            返回概况
          </Button>
          {saved && (
            <Button
              disabled={generating}
              onClick={() => {
                setDraft(saved);
                setError("");
                setEditingIntent(false);
              }}
            >
              取消修改
            </Button>
          )}
          <Button
            variant="primary"
            disabled={
              generating ||
              !can("schedule.create") ||
              preview ||
              !dirty ||
              !validDraft
            }
            onClick={async () => {
              try {
                setGenerating(true);
                const result = await act({
                  type: "student.scheduleIntent.update",
                  studentId: student.id,
                  intent: draft,
                });
                setError("");
                toast(result.message);
                onIntentSaved();
                setEditingIntent(false);
              } catch (e) {
                setError(
                  e instanceof ZodError
                    ? "请检查排课意向，补全有效的日期和时间。"
                    : e instanceof Error
                      ? e.message
                      : "保存失败",
                );
              } finally {
                setGenerating(false);
              }
            }}
          >
            {generating ? "正在生成" : "生成排课方案"}
          </Button>
        </div>
      )}
      {saved?.mode === "fixed" && !editingIntent && (
        <section className="schedule-plan-section" aria-label="固定排课方案">
          <div className="row between">
            <h4>推荐排课方案</h4>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowAlternatives(!showAlternatives)}
            >
              {showAlternatives ? "收起其他方案" : "更换方案"}
            </Button>
          </div>
          <details>
            <summary>匹配偏好与时段保留</summary>
            <div className="schedule-plan-toolbar plan-match-filters">
              <Field label="匹配策略">
                <Select value={priority} onValueChange={setPriority}>
                  <option>时间优先</option>
                  <option>老师优先</option>
                </Select>
              </Field>
              <Field label="锁课保留分钟">
                <input
                  type="number"
                  min={1}
                  value={holdMinutes}
                  onChange={(e) => setHoldMinutes(Number(e.target.value))}
                />
              </Field>
              {data.slotLocks?.some(
                (l) =>
                  l.studentId === student.id &&
                  Date.parse(l.expiresAt) > Date.now(),
              ) && (
                <Button
                  disabled={preview || !can("schedule.create")}
                  onClick={async () => {
                    try {
                      await act({
                        type: "slot.release",
                        studentId: student.id,
                      });
                    } catch (cause) {
                      toast(String(cause), { tone: "error" });
                    }
                  }}
                >
                  释放当前锁课
                </Button>
              )}
              <Field label="推荐老师">
                <input
                  aria-label="搜索推荐老师"
                  placeholder="搜索老师姓名"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
            </div>
          </details>
          <div className="schedule-match-list">
            {(showAlternatives
              ? sortedPlans
              : selectedPlan
                ? [selectedPlan]
                : []
            ).map((plan) => {
              const teacher = data.teachers.find(
                (t) => t.id === plan.primaryTeacherId,
              );
              if (!teacher) return null;
              const fit = teacherFit(data, student, teacher);
              const distribution = [
                ...new Set(
                  plan.slots
                    .map((s) => s.teacherId)
                    .filter((id) => Boolean(id) && id !== teacher.id),
                ),
              ]
                .map(
                  (id) =>
                    `${data.teachers.find((t) => t.id === id)?.name} ${plan.slots.filter((s) => s.teacherId === id).length} 节`,
                )
                .join(" · ");
              return (
                <article className="schedule-match-card" key={teacher.id}>
                  <div className="schedule-match-heading">
                    <Avatar name={teacher.name} />
                    <strong>{teacher.name}</strong>
                    <Badge
                      tone={
                        plan.primaryCount > 0 && plan.complete
                          ? "success"
                          : "warning"
                      }
                    >
                      {plan.primaryCount === 0
                        ? "时间不合适"
                        : plan.complete
                          ? "全部排满"
                          : `缺 ${plan.requiredCount - plan.coveredCount} 节`}
                    </Badge>
                  </div>
                  <details>
                    <summary>查看匹配理由和老师信息</summary>
                    <p>
                      一级匹配：{fit.matchedPrimary.join("、") || "暂无命中"}
                    </p>
                    <p>
                      二级匹配：
                      {fit.matchedSecondary.join("、") || "暂无命中"}
                    </p>
                    <p>未命中：{fit.missing.join("、") || "无"}</p>
                    {[...fit.blocked, ...fit.warnings].map((note) => (
                      <p className="muted" key={note}>
                        {note}
                      </p>
                    ))}
                    <p>
                      本人覆盖 {plan.primaryCount}/{plan.requiredCount}{" "}
                      节；方案覆盖 {plan.coveredCount}/{plan.requiredCount} 节
                    </p>
                    {plan.teacherCount > 1 && (
                      <p>多老师组合方案，需教务确认各老师负责课次。</p>
                    )}
                    <dl className="schedule-match-meta">
                      <div>
                        <dt>SO</dt>
                        <dd>{teacher.so}</dd>
                      </div>
                      <div>
                        <dt>口音等级</dt>
                        <dd>{teacher.accent || "未填写"}</dd>
                      </div>
                      <div>
                        <dt>老师等级</dt>
                        <dd>{teacher.level || "未填写"}</dd>
                      </div>
                    </dl>
                    <dl className="schedule-plan-details">
                      <div>
                        <dt>老师已排课数</dt>
                        <dd>
                          已排{" "}
                          {
                            data.lessons.filter(
                              (l) =>
                                l.teacherId === teacher.id &&
                                l.status !== "已取消" &&
                                l.date >= workloadStart &&
                                l.date < addDays(workloadStart, 7),
                            ).length
                          }{" "}
                          节（所有学员）
                        </dd>
                      </div>
                      <div>
                        <dt>可授课数</dt>
                        <dd>
                          {plan.primaryCount === plan.requiredCount
                            ? `承担全部 ${plan.requiredCount} 节`
                            : `承担 ${plan.primaryCount} / ${plan.requiredCount} 节`}
                        </dd>
                      </div>
                      {distribution && (
                        <div>
                          <dt>其他授课老师</dt>
                          <dd>{distribution}</dd>
                        </div>
                      )}
                      {!plan.complete && (
                        <div>
                          <dt>待安排</dt>
                          <dd>
                            {plan.requiredCount - plan.coveredCount}{" "}
                            节暂无合适老师
                          </dd>
                        </div>
                      )}
                    </dl>
                  </details>
                  <div className="schedule-match-actions">
                    <Button
                      size="sm"
                      disabled={
                        dirty ||
                        preview ||
                        !can("schedule.create") ||
                        !(holdMinutes > 0) ||
                        !plan.primaryCount ||
                        !!fit.blocked.length
                      }
                      onClick={async () => {
                        try {
                          await act({
                            type: "slot.lock",
                            studentId: student.id,
                            duration: saved.duration,
                            slots: plan.slots.filter(
                              (s) => s.teacherId && !s.lessonId,
                            ),
                            expiresAt: new Date(
                              Date.now() + holdMinutes * 60000,
                            ).toISOString(),
                          });
                          toast("档期已保留");
                        } catch (e) {
                          toast(String(e), { tone: "error" });
                        }
                      }}
                    >
                      锁定方案时段
                    </Button>
                    {showAlternatives && (
                      <Button
                        size="sm"
                        aria-pressed={
                          selectedPlan?.primaryTeacherId === teacher.id
                        }
                        onClick={() => {
                          setChosenTeacher(teacher.id);
                          setShowAlternatives(false);
                        }}
                      >
                        {selectedPlan?.primaryTeacherId === teacher.id
                          ? "当前方案"
                          : "选择此方案"}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="schedule-match-text-action"
                      onClick={() => onViewTeacher(teacher.id)}
                    >
                      查看老师资料
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          {!fixedPlans.length && (
            <EmptyState
              title="暂无可排课方案"
              description="请检查意向时间和已有课程的固定时间，或扩大可接受时间范围。"
            />
          )}
        </section>
      )}
      {saved?.mode === "fixed" && !editingIntent && (
        <div className="schedule-flow-actions row wrap">
          <Button onClick={onClose}>返回概况</Button>
          <Button
            variant="primary"
            disabled={
              dirty ||
              preview ||
              !can("schedule.create") ||
              !selectedPlan?.primaryCount ||
              selectedBlocked
            }
            onClick={() => onFixedPlan(selectedPlan, saved)}
          >
            预览排课
          </Button>
        </div>
      )}
      {saved?.mode === "flex" && !editingIntent && (
        <FlexStudentCalendar
          key={`${student.id}-${JSON.stringify(saved)}`}
          studentId={student.id}
          intent={saved}
          onDirtyChange={onDirtyChange}
          onBusyChange={onBusyChange}
          onClose={onClose}
          onStageChange={onStageChange}
          onComplete={onScheduleComplete}
        />
      )}
    </div>
  );
}
