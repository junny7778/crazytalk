import { FlexStudentCalendar } from "./FlexStudentCalendar";
import { DatePicker } from "@crazytalk/ui";
import { ZodError } from "zod";
import { useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  scheduleIntentSchema,
  isScheduleDate,
  addDays,
  matchedTags, getFixedSchedulePlans,
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
  Tabs,
  useToast,
} from "@crazytalk/ui";

type Intent = NonNullable<Student["scheduleIntent"]>;
const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export function StudentSchedulingPanel({
  student,
  onViewTeacher,
  onIntentSaved,
  onFixedPlan,
  onScheduleComplete,
}: {
  onScheduleComplete: (count: number, teacherNames: string) => void;
  onFixedPlan: (plan: FixedPlan, intent: Intent) => void;
  onViewTeacher: (teacherId: string) => void;
  onIntentSaved: () => void;
  student: Student;
}) {
  const { data, act, can, preview } = useDemo();
  const toast = useToast();
  const [draft, setDraft] = useState<Intent>(
    student.scheduleIntent || {
      mode: "fixed",
      startDate: DEMO_TODAY,
      weeks: 4,
      duration: 25,
      frequency: 2,
      windows: [],
    },
  );
  const [editingIntent, setEditingIntent] = useState(!student.scheduleIntent);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [priority,setPriority]=useState("时间优先");
  const [holdMinutes,setHoldMinutes]=useState(30);
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
      <div className="row between">
        <div>
          <h3>为 {student.name} 安排课程</h3>
          <small>
            {student.material} · {student.preferences || "未填写老师偏好"}
          </small>
        </div>
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
          {!saved && (
            <p className="muted">
              {draft.mode === "flex"
                ? "保存排课信息后，即可在学员课表中选择时间和老师。"
                : "尚未填写意向时间，请先补充并保存，再匹配老师。"}
            </p>
          )}
          <Tabs
            value={draft.mode}
            onChange={(value) =>
              update({ mode: value === "fixed" ? "fixed" : "flex" })
            }
            items={[
              { value: "fixed", label: "固定排课" },
              { value: "flex", label: "灵活排课" },
            ]}
          />
          <div className="form-grid">
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
            <Field label="意向每节时长">
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
                <p className="muted">
                  先选择每周上课日，再设置各日的可上课时间。
                </p>
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
            {!draft.windows.length ? (
              <div className="intent-time-empty">
                <strong>
                  {draft.mode === "flex"
                    ? "意向时间可选填"
                    : "请选择每周上课日"}
                </strong>
                <span>
                  {draft.mode === "flex"
                    ? "仅作为课表标记，不限制其他时间排课。"
                    : "支持多选，选择后将显示对应的时间段设置。"}
                </span>
              </div>
            ) : (
              <div className="intent-time-fields">
                <p className="intent-fields-label">每个上课日对应时间</p>
                <div className="intent-window-grid">
                  {draft.windows.map((window, index) => (
                    <div
                      className="intent-window"
                      key={index}
                      role="group"
                      aria-label={`意向时间${index + 1}`}
                    >
                      <div className="intent-window-heading">
                        <strong>{days[window.day]}</strong>
                      </div>
                      <div className="intent-window-times">
                        <input
                          aria-label={`意向${index + 1}开始时间`}
                          type="time"
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
                        <span>至</span>
                        <input
                          aria-label={`意向${index + 1}结束时间`}
                          type="time"
                          value={window.end}
                          onChange={(e) =>
                            update({
                              windows: draft.windows.map((w, i) =>
                                i === index ? { ...w, end: e.target.value } : w,
                              ),
                            })
                          }
                        />
                      </div>
                      {windowErrors[index] && (
                        <small className="intent-window-error" role="status">
                          {windowErrors[index]}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          <div className="row wrap">
            {saved && (
              <Button
                size="sm"
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
              size="sm"
              disabled={
                !can("schedule.create") || preview || !dirty || !validDraft
              }
              onClick={() => {
                try {
                  const result = act({
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
                }
              }}
            >
              {draft.mode === "flex" ? "保存排课信息" : "保存意向并匹配老师"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          {dirty && saved && (
            <p className="muted">
              {draft.mode === "flex"
                ? "排课信息已修改，保存后更新课表中的意向标记。"
                : "意向已修改，保存后更新推荐；当前推荐和日历按已保存意向计算。"}
            </p>
          )}
        </section>
      )}
      {saved?.mode === "fixed" && (
        <section className="schedule-plan-section" aria-label="固定排课方案">
          <div className="schedule-plan-toolbar">
            <h4>推荐排课方案</h4>
            <Field label="匹配策略"><Select value={priority} onValueChange={setPriority}><option>时间优先</option><option>老师优先</option></Select></Field>
            <Field label="锁课保留分钟"><input type="number" min={1} value={holdMinutes} onChange={e=>setHoldMinutes(Number(e.target.value))}/></Field>
            {data.slotLocks?.some(l=>l.studentId===student.id && Date.parse(l.expiresAt)>Date.now()) && <Button disabled={preview||!can("schedule.create")} onClick={()=>act({type:"slot.release",studentId:student.id})}>释放当前锁课</Button>}
            <input
              aria-label="搜索推荐老师"
              placeholder="搜索老师姓名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="schedule-match-list">
            {fixedPlans
              .filter((plan) =>
                data.teachers
                  .find((t) => t.id === plan.primaryTeacherId)
                  ?.name.toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .sort((a,b)=>{
                const score=(id:string)=>{const t=data.teachers.find(t=>t.id===id);return t?matchedTags(student,t).length:0;};
                const fit=score(b.primaryTeacherId)-score(a.primaryTeacherId),coverage=b.coveredCount-a.coveredCount;
                return priority==="老师优先" ? fit || coverage : coverage || fit;
              })
              .map((plan) => {
                const teacher = data.teachers.find(
                  (t) => t.id === plan.primaryTeacherId,
                );
                if (!teacher) return null;
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
                      <Badge tone={plan.complete ? "success" : "warning"}>
                        {plan.complete
                          ? "全部排满"
                          : `缺 ${plan.requiredCount - plan.coveredCount} 节`}
                      </Badge>
                    </div>
                    <p>匹配标签：{matchedTags(student,teacher).join("、") || "暂无命中"}</p>
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
                    <div className="schedule-match-actions">
                      <Button size="sm" disabled={dirty||preview||!can("schedule.create")||!(holdMinutes>0)} onClick={()=>{try{
                        act({type:"slot.lock",studentId:student.id,duration:saved.duration,slots:plan.slots.filter(s=>s.teacherId && !s.lessonId),expiresAt:new Date(Date.now()+holdMinutes*60000).toISOString()});toast("档期已保留");
                      }catch(e){toast(String(e),{tone:"error"});}}}>锁定方案时段</Button>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={dirty || preview || !can("schedule.create")}
                        onClick={() => onFixedPlan(plan, saved)}
                      >
                        查看排课方案
                      </Button>
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
      {saved?.mode === "flex" && !editingIntent && (
        <FlexStudentCalendar
          key={`${student.id}-${JSON.stringify(saved)}`}
          studentId={student.id}
          intent={saved}
          onComplete={onScheduleComplete}
        />
      )}
    </div>
  );
}
