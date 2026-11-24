import { schedulingBookingIssue } from "@crazytalk/shared";
import { SchedulingAccountNotice } from "./SchedulingAccountNotice";
import { TimePicker } from "@crazytalk/ui";
import ClassInOperationFeedback from "../ClassInOperationFeedback";
import MaterialPicker from "../MaterialPicker";
import { studentMaterials } from "@crazytalk/shared";
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
  const [draft, setDraft] = useState<Intent>(
    student.scheduleIntent
      ? {...student.scheduleIntent, mode: "fixed", materialIds: student.scheduleIntent.materialIds || studentMaterials(data, student).slice(0, 1).map(c => c.id), priority: student.scheduleIntent.priority || "teacher"}
      : {
          mode: "fixed",
          startDate: DEMO_TODAY,
          weeks: 4,
          duration: 25,
          frequency: 2,
          windows: [],
          materialIds: studentMaterials(data, student).slice(0, 1).map(c => c.id),
          priority: "teacher",
        },
  );
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
  const saved = student.scheduleIntent;
  const windowErrors = draft.windows.map((window) => {
    if (!window.start || !window.end) return "请填写开始和结束时间";
    const minutes = (time: string) =>
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    if (window.end <= window.start) return "结束时间需晚于开始时间";
    if (minutes(window.end) - minutes(window.start) < draft.duration)
      return `时间范围需至少容纳 ${draft.duration} 分钟课程`;
    return "";
  });
  const accountIssue = schedulingBookingIssue(data, student.id);
  const validDraft =
    !accountIssue &&
    !!draft.materialIds?.length &&
    draft.materialIds.every(id => studentMaterials(data, student).some(c => c.id === id)) &&
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
          <Field label="本次教材"><MaterialPicker label="本次教材" catalog={studentMaterials(data, student)} value={draft.materialIds || []} onChange={materialIds => update({materialIds})}/></Field>
          {(draft.materialIds?.length || 0) > 1 && <small className="muted">选择了多本教材，请在方案日历中确认每一节使用的教材。</small>}
          {!studentMaterials(data, student).length && <p role="alert">请先在学员详情的编辑资料中登记学习教材，再安排课程。</p>}
          <Field label="匹配策略"><div className="schedule-strategy-row">
            <label className={draft.priority === "teacher" ? "selected" : ""}><input type="radio" name="schedule-priority" checked={draft.priority === "teacher"} onChange={() => update({priority: "teacher"})}/><strong>老师优先</strong><small>优先适配，尽量同一老师。</small></label>
            <label className={draft.priority === "time" ? "selected" : ""}><input type="radio" name="schedule-priority" checked={draft.priority === "time"} onChange={() => update({priority: "time"})}/><strong>时间优先</strong><small>优先排满，可组合多位老师。</small></label>
          </div></Field>
          <div className="form-grid intent-settings-grid">
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
                                  <TimePicker
                                    label={`意向${index + 1}开始时间`}
                                    value={window.start}
                                    onChange={(value) =>
                                      update({
                                        windows: draft.windows.map((w, i) =>
                                          i === index
                                            ? { ...w, start: value }
                                            : w,
                                        ),
                                      })
                                    }
                                  />
                                  <span>—</span>
                                  <TimePicker
                                    label={`意向${index + 1}结束时间`}
                                    value={window.end}
                                    onChange={(value) =>
                                      update({
                                        windows: draft.windows.map((w, i) =>
                                          i === index
                                            ? { ...w, end: value }
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
        <div className="schedule-flow-actions schedule-setup-actions row wrap">
          <span className="intent-total">
            每周 {draft.frequency} 节 · 共 {draft.frequency * draft.weeks} 节
          </span>
          <Button disabled={generating} onClick={onClose}>
            返回概况
          </Button>
          {saved?.mode === "fixed" && !!saved.materialIds?.length && (
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
        <section className="schedule-plan-section" aria-label="推荐排课方案">
          <div className="row between"><h4>推荐排课方案</h4><input aria-label="搜索推荐老师" placeholder="搜索老师姓名" value={query} onChange={e => setQuery(e.target.value)}/></div>
          <p className="muted">{saved.priority === "teacher" ? "优先匹配合适的主老师，无法覆盖的课次由其他合适老师补齐；确认前可继续调整。" : "优先满足目标课次；组合方案明确展示各位老师承担的节数。"}</p>
          <div className="schedule-recommendation-grid">{sortedPlans.map(plan => {
            const teacher = data.teachers.find(t => t.id === plan.primaryTeacherId)!;
            const fit = teacherFit(data, student, teacher);
            const names = [...new Set(plan.slots.map(s => s.teacherId).filter(Boolean))];
            return <article className="schedule-match-card" key={teacher.id}>
              <div className="schedule-match-heading"><Avatar name={teacher.name}/><strong>{teacher.name}</strong><Badge tone={plan.complete ? "success" : "warning"}>方案可排 {plan.coveredCount}/{plan.requiredCount} 节</Badge></div>
              <dl className="schedule-match-meta"><div><dt>SO</dt><dd>{teacher.so}</dd></div><div><dt>口音等级</dt><dd>{teacher.accent || "未填写"}</dd></div><div><dt>老师等级</dt><dd>{teacher.level || "未填写"}</dd></div></dl>
              <div className="row wrap">{studentMaterials(data, student).filter(c => saved.materialIds?.includes(c.id) && teacher.materialIds?.includes(c.id)).map(c => <Badge key={c.id} tone="success">可教 {c.name}</Badge>)}</div>
              <div className="schedule-match-reasons"><strong>推荐原因</strong><div className="row wrap">{[...fit.matchedPrimary, ...fit.matchedSecondary].map(reason => <Badge key={reason}>{reason}</Badge>)}</div>{!fit.matchedPrimary.length && !fit.matchedSecondary.length && <small>{plan.primaryCount ? "教材与授课时间匹配，暂无其他偏好命中。" : "教材匹配，当前意向时间内暂无可排课次。"}</small>}{fit.warnings.map(w => <small key={w}>{w}</small>)}</div>
              <dl className="schedule-plan-details"><div><dt>主老师承担</dt><dd>{plan.primaryCount} 节</dd></div><div><dt>整个方案</dt><dd>可排 {plan.coveredCount}/{plan.requiredCount} 节 · {plan.teacherCount} 位老师</dd></div>{plan.teacherCount > 1 && <div><dt>老师分工</dt><dd>{names.map(id => `${data.teachers.find(t => t.id === id)?.name} ${plan.slots.filter(s => s.teacherId === id).length} 节`).join(" · ")}</dd></div>}<div><dt>待安排</dt><dd>{plan.requiredCount - plan.coveredCount} 节</dd></div><div><dt>本周已排课数</dt><dd>{data.lessons.filter(l => l.teacherId === teacher.id && l.status !== "已取消" && l.date >= workloadStart && l.date < addDays(workloadStart, 7)).length} 节（所有学员）</dd></div></dl>
              {names.filter(id=>id!==teacher.id).map(id=>{const backup=data.teachers.find(t=>t.id===id)!;const match=teacherFit(data,student,backup);return <div key={id} className="schedule-match-reasons"><strong>{backup.name} · 补充 {plan.slots.filter(s=>s.teacherId===id).length} 节</strong><small>{[...match.matchedPrimary,...match.matchedSecondary].join("、") || "教材与时间符合要求"}；补充主老师无法覆盖的课次。</small></div>;})}
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
