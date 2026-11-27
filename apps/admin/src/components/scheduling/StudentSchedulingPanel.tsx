import { RemainingCreditsField } from "./RemainingCreditsField";
import { schedulingBookingIssue } from "@crazytalk/shared";
import { SchedulingAccountNotice } from "./SchedulingAccountNotice";
import { WeeklyAvailabilityEditor, availabilityInputError } from "@crazytalk/ui";
import ClassInOperationFeedback from "../ClassInOperationFeedback";
import { studentMaterials } from "@crazytalk/shared";
import { DatePicker } from "@crazytalk/ui";
import { ZodError } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY, getScheduleCredits, scheduleUnits,
  scheduleIntentSchema,
  isScheduleDate,
  addDays,
  teacherFit,
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
  const books = useMemo(() => studentMaterials(data, student), [data, student]);
  const saved = useMemo(() => {
    const intent = student.scheduleIntent;
    if (!intent) return null;
    const id = intent.materialIds?.find(id => books.some(book => book.id === id)) ?? books[0]?.id;
    return {...intent, materialIds: id ? [id] : []};
  }, [student.scheduleIntent, books]);
  const [draft, setDraft] = useState<Intent>(() => ({
    startDate: DEMO_TODAY, weeks: 4, duration: 25, frequency: 2, windows: [],
    materialIds: books.slice(0, 1).map(book => book.id),
    unlimited: saved ? !!saved.unlimited : true, dailyLimit: 1,
    ...saved,
    mode: "fixed",
    priority: saved?.priority || "teacher",
  }));
  const [editingIntent, setEditingIntent] = useState(true);
  useEffect(() => {
    if (editingIntent) onStageChange("setup");
  }, [editingIntent, onStageChange]);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    onBusyChange(generating);
  }, [generating, onBusyChange]);
  const [initialDraft] = useState(() => JSON.stringify(draft));
  useEffect(() => {
    onDirtyChange(JSON.stringify(draft) !== initialDraft);
  }, [draft, initialDraft, onDirtyChange]);
  const [query, setQuery] = useState("");
  const intentAvailability = {availability: draft.windows, availabilityFrom: "", availabilityNote: ""};
  const windowError = availabilityInputError(intentAvailability) || (draft.windows.some(({start, end}) => {
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    return minutes(end) - minutes(start) < draft.duration;
  }) ? `时间范围需至少容纳 ${draft.duration} 分钟课程` : "");
  const accountIssue = schedulingBookingIssue(data, student.id);
  const units = scheduleUnits(draft.duration, draft.unitsPerLesson);
  const credits = getScheduleCredits(data, student.id, 0, units ?? 1);
  const target = draft.unlimited ? (units ? credits.affordableLessons : 0) : draft.frequency * draft.weeks;
  const weeks = draft.unlimited ? Math.ceil(target / draft.frequency) : draft.weeks;
  const daysSelected = new Set(draft.windows.map(w => w.day)).size;
  const dailyLimit = draft.dailyLimit ?? 1;
  const validDraft =
    (!draft.unlimited || (!!units && target > 0 && !credits.error)) &&
    !accountIssue &&
    !!draft.materialIds?.length &&
    draft.materialIds.every(id => studentMaterials(data, student).some(c => c.id === id)) &&
    scheduleIntentSchema.safeParse({...draft, weeks}).success &&
    isScheduleDate(draft.startDate) &&
    draft.startDate >= DEMO_TODAY &&
    !windowError;
  const fixedPlans = useMemo(
    () =>
      !editingIntent && saved?.mode === "fixed"
        ? getFixedSchedulePlans(data, student.id, saved)
        : [],
    [data, student.id, saved, editingIntent],
  );
  const sortedPlans = fixedPlans
    .filter((plan) =>
      data.teachers
        .find((t) => t.id === plan.primaryTeacherId)
        ?.name.toLowerCase()
        .includes(query.toLowerCase()),
    )
;
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
      <SchedulingAccountNotice student={student}/>
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
            <strong>{saved.priority === "teacher" ? "老师优先" : "时间优先"} · {studentMaterials(data, student).filter(c => saved.materialIds?.includes(c.id)).map(c => c.name).join("、")}</strong>
            <p>
              {saved.windows
                .map((w) => `${days[w.day]} ${w.start}–${w.end}`)
                .join("、")}{" "}
              · 每节 {saved.duration} 分钟 · 每周 {saved.frequency} 节 · 共{" "}
              {saved.weeks} 周 · 每天最多 {saved.dailyLimit ?? saved.frequency} 节
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
          <section className="stack" aria-label="基础信息">
            <h4>基础信息</h4>
            <div className="form-grid intent-settings-grid">
              <RemainingCreditsField studentId={student.id} />
              <Field label="本次教材">
                <Select size="form" searchable={false} value={draft.materialIds?.[0] ?? ""} disabled={!books.length}
                  onValueChange={id => update({materialIds: [id]})}>
                  {books.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
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
                  value={draft.unlimited ? "unlimited" : String(draft.weeks)}
                  onValueChange={v => update(v === "unlimited" ? {unlimited: true} : {unlimited: false, weeks: Number(v)})}
                >
                  <option value="unlimited">不限（按剩余课时）</option>
                  {[1, 2, 4, 8, 16, 32].map((n) => (
                    <option key={n} value={n}>
                      {n} 周
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="每周节数">
                <Select
                  value={draft.frequency}
                  onValueChange={(v) => update({ frequency: Number(v), dailyLimit: Math.min(dailyLimit, Number(v)) })}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} 节
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="每天最多上几节">
                <Select value={dailyLimit} onValueChange={v => update({dailyLimit: Number(v)})}>
                  {Array.from({length: draft.frequency}, (_, i) => <option key={i} value={i+1}>{i+1} 节</option>)}
                </Select>
              </Field>
              <Field label="每节时长">
                <Select
                  value={draft.duration}
                  onValueChange={(v) =>
                    update({
                      unitsPerLesson: undefined,
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
              {draft.unlimited && !scheduleUnits(draft.duration) && <Field label="每节预计扣课数" required>
                <input type="number" min="0.01" step="any" value={draft.unitsPerLesson ?? ""}
                  onChange={e => update({unitsPerLesson: Number(e.target.value) || undefined})}/>
              </Field>}
            </div>
            {draft.unlimited && <small>{(units ?? 0) < 0.01 ? "请填写每节预计扣课数（至少 0.01 课时）以计算排课周期" : credits.error || (target ? `按剩余 ${credits.available} 课时，预计可新增 ${target} 节，约 ${weeks} 周` : `剩余 ${credits.available} 课时，不足以安排一节（需 ${units} 课时）`)}</small>}
            {!books.length && <p role="alert">请先在学员详情的编辑资料中登记学习教材，再安排课程。</p>}
          </section>
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
            <WeeklyAvailabilityEditor
              studentIntent
              value={intentAvailability}
              onChange={({availability}) => update({windows: availability})}
            />
            {daysSelected > 0 && daysSelected * dailyLimit < draft.frequency && <small>已选 {daysSelected} 个上课日，每天最多 {dailyLimit} 节，每周最多可排 {daysSelected * dailyLimit} 节，低于目标 {draft.frequency} 节。</small>}
            {windowError && <small className="intent-window-error" role="status">{windowError}</small>}
          </section>
          <section className="stack" aria-label="匹配策略">
            <h4>匹配策略</h4>
            <div className="schedule-strategy-row">
              <label className={draft.priority === "teacher" ? "selected" : ""}><input type="radio" name="schedule-priority" checked={draft.priority === "teacher"} onChange={() => update({priority: "teacher"})}/><strong>老师优先</strong><small>优先适配，尽量同一老师。</small></label>
              <label className={draft.priority === "time" ? "selected" : ""}><input type="radio" name="schedule-priority" checked={draft.priority === "time"} onChange={() => update({priority: "time"})}/><strong>时间优先</strong><small>优先排满，可组合多位老师。</small></label>
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
        <div className="schedule-flow-actions schedule-setup-actions row wrap">
          <span className="intent-total">
            每周 {draft.frequency} 节 · 共 {target} 节
          </span>
          <Button disabled={generating} onClick={onClose}>
            返回概况
          </Button>
          {saved?.mode === "fixed" && !!saved.materialIds?.length && (
            <Button
              disabled={generating}
              onClick={() => {
                setDraft({...saved, dailyLimit: saved.dailyLimit ?? 1});
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
              !validDraft
            }
            onClick={async () => {
              try {
                setGenerating(true);
                const result = await act({
                  type: "student.scheduleIntent.update",
                  studentId: student.id,
                  intent: {...draft, dailyLimit, weeks},
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
        <section className="schedule-plan-section" aria-label="推荐排课方案">
          <div className="row between"><h4>推荐排课方案</h4><input aria-label="搜索推荐老师" placeholder="搜索老师姓名" value={query} onChange={e => setQuery(e.target.value)}/></div>
          <p className="muted">{saved.priority === "teacher" ? "优先匹配合适的主老师，无法覆盖的课次由其他合适老师补齐；确认前可继续调整。" : "优先满足目标课次；组合方案明确展示各位老师承担的节数。"}</p>
          <div className="schedule-recommendation-grid">{sortedPlans.map(plan => {
            const teacher = data.teachers.find(t => t.id === plan.primaryTeacherId)!;
            const fit = teacherFit(data, student, teacher);
            const names = [...new Set(plan.slots.map(s => s.teacherId).filter(Boolean))];
            return <article className="schedule-match-card" key={teacher.id}>
              <div className="schedule-match-heading"><Avatar name={teacher.name}/><strong>{teacher.name}</strong>{teacher.needConfirm && <Badge tone="warning">排课前请联系老师</Badge>}<Badge tone={plan.complete ? "success" : "warning"}>方案可排 {plan.coveredCount}/{plan.requiredCount} 节</Badge></div>
              <dl className="schedule-plan-details">
                <div><dt>SO</dt><dd>{teacher.so}</dd></div>
                <div><dt>口音等级</dt><dd>{teacher.accent || "未填写"}</dd></div>
                <div><dt>老师等级</dt><dd>{teacher.level || "未填写"}</dd></div>
                <div><dt>可教教材</dt><dd>{studentMaterials(data, student)
                  .filter(c => saved.materialIds?.includes(c.id) && teacher.materialIds?.includes(c.id))
                  .map(c => c.name).join("、")}</dd></div>
                <div>
                  <dt>推荐原因</dt>
                  <dd>
                    {[...fit.matchedPrimary, ...fit.matchedSecondary].join("、") ||
                      (plan.primaryCount ? "教材与授课时间匹配，暂无其他偏好命中。" : "教材匹配，当前意向时间内暂无可排课次。")}
                    {fit.warnings.map(w => <div key={w}>{w}</div>)}
                  </dd>
                </div>
              </dl>
              <dl className="schedule-plan-details"><div><dt>主老师承担</dt><dd>{plan.primaryCount} 节</dd></div><div><dt>整个方案</dt><dd>可排 {plan.coveredCount}/{plan.requiredCount} 节 · {plan.teacherCount} 位老师</dd></div>{plan.teacherCount > 1 && <div><dt>老师分工</dt><dd>{names.map(id => `${data.teachers.find(t => t.id === id)?.name} ${plan.slots.filter(s => s.teacherId === id).length} 节`).join(" · ")}</dd></div>}<div><dt>待安排</dt><dd>{plan.requiredCount - plan.coveredCount} 节</dd></div><div><dt>本周已排课数</dt><dd>{data.lessons.filter(l => l.teacherId === teacher.id && l.status !== "已取消" && l.date >= workloadStart && l.date < addDays(workloadStart, 7)).length} 节（所有学员）</dd></div>
                {names.filter(id => id !== teacher.id).map(id => {
                  const backup = data.teachers.find(t => t.id === id)!;
                  const match = teacherFit(data, student, backup);
                  return <div key={id}>
                    <dt>补充老师</dt>
                    <dd>{backup.name} {backup.needConfirm && <Badge tone="warning">排课前请联系老师</Badge>} · 补充 {plan.slots.filter(s => s.teacherId === id).length} 节
                      <div>{[...match.matchedPrimary, ...match.matchedSecondary].join("、") || "教材与时间符合要求"}；补充主老师无法覆盖的课次。</div>
                    </dd>
                  </div>;
                })}
              </dl>
              <div className="schedule-match-actions"><Button variant="primary" disabled={!plan.coveredCount || !!accountIssue || preview || !can("schedule.create")} onClick={() => onFixedPlan(plan, saved)}>查看排课方案</Button><Button variant="ghost" onClick={() => onViewTeacher(teacher.id)}>查看老师资料</Button></div>
            </article>;
          })}</div>
          {!sortedPlans.length && <EmptyState title="暂无可排课方案" description="请核对老师可授教材、学员时间或修改搜索条件。"/>}
          <div className="schedule-flow-actions schedule-recommendation-actions"><Button onClick={onClose}>返回概况</Button></div>
        </section>
      )}
    </div>
  );
}
