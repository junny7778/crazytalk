import {purchasedDelivery, organizationView} from "@crazytalk/shared";
import CourseSyncLink from "../../components/CourseSyncLink";
import {lessonSyncCategory,syncCategories} from "../../lib/lessonSync";
import { lessonStatusLabel } from "../../lib/lessonStatus";
import { compareLessonRecords, isOverdueLesson } from "../../lib/lessonOrder";
import ListPagination from "../../components/ListPagination";
import {
  recordAttendance as lessonRecordAttendance,
  attendanceIssue,
  teacherNoShowHint,
  personAttendance,
  attendanceOptions,
} from "../../lib/lessonAttendance";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../../components/DataTransferButton";
import { occurred } from "../../lib/dashboard";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Clock3, CalendarDays, CircleCheck, CalendarX2 } from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import { formatDate, type Lesson } from "@crazytalk/shared";
import {
  Select,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Tabs,
} from "@crazytalk/ui";
import { exportCsv, tone, useBusinessAction } from "./common";
import "./operations.css";
export default function Lessons() {
  const { data: allData, can } = useDemo();
  const run = useBusinessAction();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const recordAttendance = (lesson: Lesson) =>
    lessonRecordAttendance(lesson, now);
  const [params, setParams] = useSearchParams();
  const organization = organizationView(allData, params);
  const deliveryMonth = params.get("deliveryMonth");
  const project = params.get("project");
  const delivery = deliveryMonth ? purchasedDelivery(allData, organization.students.filter(s => !project || s.project === project), deliveryMonth) : null;
  const data = delivery ? {...allData, lessons: delivery.lessons} : organization;
  const tab = params.get("tab") || "all";
  const view = params.get("view") || "all";
  const query = params.get("q") || "";
  const statusFilter = lessonStatusLabel(params.get("status") || "");
  const filteredStudentId =
    data.studentIdAliases?.[params.get("student") || ""] ??
    params.get("student");
  const detailId = params.get("lesson") || "";
  const setDetailId = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("lesson", id); else next.delete("lesson");
    setParams(next);
  };
  const [decision, setDecision] = useState<{
    id: string;
    kind: "扣课" | "不扣" | "缺席";
  } | null>(null);
  const [delay,setDelay]=useState("");
  const [incident,setIncident]=useState("");

  const [reason, setReason] = useState("");
  const [units, setUnits] = useState("");
  const [linkId, setLinkId] = useState("");
  const [linkStudent, setLinkStudent] = useState(data.students[0]?.id || "");
  const [correct, setCorrect] = useState(false);
  const [deduct, setDeduct] = useState(true);
  const [page, setPage] = useState(1);
  const date = params.get("date") || "";
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  };
  const student = (id: string) => data.students.find((s) => s.id === id);
  const teacher = (id: string) => data.teachers.find((t) => t.id === id);
  const scopedLessons = data.lessons.filter(
    (lesson) =>
      !params.get("student") || lesson.studentId === filteredStudentId,
  );
  const detail = data.lessons.find((l) => l.id === detailId);
  const matching = scopedLessons
    .filter(
      (l) =>
        (!date || l.date === date) &&
        (params.get("occurred") !== "1" || occurred(l)) &&
        (!params.get("from") || l.date >= (params.get("from") || "")) &&
        (!params.get("to") || l.date <= (params.get("to") || "")) &&
        (delivery || !params.get("project") ||
          student(l.studentId)?.project === params.get("project")) &&
        (!params.get("bookingStatus") || l.status === params.get("bookingStatus")) &&
        (!params.get("attendance") ||
          recordAttendance(l).includes(params.get("attendance") || "")) &&
        (view !== "attendance" ||
          (l.status !== "已取消" &&
            (Boolean(l.studentIn) || recordAttendance(l).some(tag => tag.endsWith("缺席") ) || Boolean(l.attendanceMessages)))) &&
        (view !== "unsynced" || l.sync === "未同步") &&
        (!params.get("syncCategory") || lessonSyncCategory(l) === params.get("syncCategory")) &&
        (view !== "conflict" || l.conflict) &&
        (!query ||
          `${student(l.studentId)?.name ?? ""} ${teacher(l.teacherId)?.name ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) => compareLessonRecords(a, b, now));
  const pending = matching.filter((l) => l.status === "待确认");
  const filtered = matching.filter((l) =>
    tab === "confirm"
      ? l.status === "待确认"
      : !params.get("status") || lessonStatusLabel(l.status) === statusFilter,
  );
  const recordStats = [
    { label: "课程记录数", value: filtered.length, icon: CalendarDays, tone: "total" },
    { label: "待上课数", value: filtered.filter((lesson) => lesson.status === "未开始").length, icon: Clock3, tone: "upcoming" },
    { label: "已完成数", value: filtered.filter((lesson) => lesson.status === "已完成").length, icon: CircleCheck, tone: "completed" },
    { label: "已取消数", value: filtered.filter((lesson) => lesson.status === "已取消").length, icon: CalendarX2, tone: "cancelled" },
  ];
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const deciding = data.lessons.find((l) => l.id === decision?.id);
  useEffect(() => {
    setPage(1);
  }, [params.toString()]);
  function openReview(l: Lesson) {
    if (l.attendance === "账号待关联") {
      setLinkId(l.id);
      setLinkStudent(l.studentId);
      return;
    }
    setIncident("");
    setReason("");
    setDelay("");
    setUnits(l.confirmedUnits === undefined ? "" : String(l.confirmedUnits));
    setDecision({ id: l.id, kind: "扣课" });
  }
  const timed = incident === "老师迟到" || incident === "老师早退";
  const balance = deciding && student(deciding.studentId)?.balance;
  return (
    <div className="stack">
      <PageHeader
        title="上课记录"
        description="核对每一节课，让课时有据可查。"
        action={
          can("lesson.export") ? (
            <DataTransferButton
              direction="export"
              children="导出筛选结果"
              size="sm"
              onClick={() =>
                exportCsv("上课记录", [
                  ["日期", "时间", "学员", "老师", "状态", "扣课"],
                  ...filtered.map((l) => [
                    l.date,
                    l.time,
                    student(l.studentId)?.name || "",
                    teacher(l.teacherId)?.name || "",
                    lessonStatusLabel(l.status),
                    l.deducted ? "已扣" : "未扣",
                  ]),
                ])
              }
            />
          ) : null
        }
      />
      <section aria-label="上课记录统计" className="lesson-summary">
        <div className="lesson-summary-grid">
          {recordStats.map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className={`lesson-summary-card is-${tone}`} aria-label={`${label} ${value} 节`}>
              <div>
                <span className="lesson-summary-label">{label}</span>
                <div className="lesson-summary-value"><strong>{value}</strong><span>节</span></div>
              </div>
              <span className="lesson-summary-icon"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
            </article>
          ))}
        </div>
        <small className="lesson-summary-note">当前筛选范围 · 包含全部分页；待确认及历史缺席记录计入课程记录数，未计入已完成。</small>
        <div className="row" aria-label="ClassIn 同步统计">{syncCategories.map(category=><Button key={category} size="sm" variant="ghost" onClick={()=>update("syncCategory",category)}>{category} {filtered.filter(l=>lessonSyncCategory(l)===category).length}</Button>)}</div>
        <small className="lesson-summary-note">本地记录数包含取消及待核实课程；已确认课堂数不包含取消记录。</small>
      </section>
      {(delivery || params.has("from") ||
        params.has("status") ||
        params.has("bookingStatus") ||
        params.has("attendance") ||
        params.has("student")) && (
        <Panel>
          <div className="row between">
            <small>
              {delivery ? `截至 ${deliveryMonth} 的销课记录 · 已交付 ${filtered.reduce((sum,l)=>sum+l.duration/25,0)} 课时` : params.get("student")
                ? `学生：${student(filteredStudentId || "")?.name || "未知学生"}`
                : `看板筛选：${params.get("from") || ""} 至 ${params.get("to") || ""}`}{" "}
              · {params.get("project") || "全部项目"} ·{" "}
              {statusFilter ||
                params.get("attendance") ||
                params.get("bookingStatus") ||
                (view === "attendance" ? "有效出勤记录" : "全部课程")}
            </small>
            <Button size="sm" onClick={() => setParams({ tab: "all" })}>
              清除筛选
            </Button>
          </div>
        </Panel>
      )}
      <div className="row between">
        <Tabs
          value={tab}
          onChange={(v) => {
            const next = new URLSearchParams(params);
            next.set("tab", v);
            next.delete("status");
            setParams(next);
          }}
          items={[
            { value: "all", label: "全部" },
            { value: "confirm", label: "待确认", count: pending.length },
          ]}
        />
      </div>
      <Panel>
        <div className="toolbar lesson-filters">
          <SearchInput
            value={query}
            onChange={(v) => update("q", v)}
            placeholder="搜索学员或老师姓名"
          />
          <DatePicker
            placeholder="上课日期（起始）"
            aria-label="开始日期"
            mode="date"
            value={params.get("from") || ""}
            onValueChange={(v) => update("from", v)}
          />
          <span className="muted">至</span>
          <DatePicker
            placeholder="上课日期（结束）"
            aria-label="结束日期"
            mode="date"
            value={params.get("to") || ""}
            onValueChange={(v) => update("to", v)}
          />
          <Select
            aria-label="处理状态"
            value={tab === "confirm" ? "待确认" : statusFilter}
            onValueChange={(v) => {
              const next = new URLSearchParams(params);
              next.set("status", v);
              next.set("tab", "all");
              setParams(next);
            }}
          >
            <option value="">全部状态</option>
            {["未开始", "待确认", "已结束", "已取消"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            aria-label="考勤情况"
            value={params.get("attendance") || ""}
            onValueChange={(v) => update("attendance", v)}
          >
            <option value="">全部考勤</option>
            {attendanceOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
          <Select
            aria-label="更多筛选"
            value={view}
            onValueChange={(v) => update("view", v)}
          >
            <option value="all">全部记录</option>
            <option value="unsynced">未同步</option>
            <option value="conflict">时间冲突</option>
            <option value="attendance">有效出勤</option>
          </Select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setParams({ tab: "all" })}
          >
            清除全部筛选
          </Button>
          <small style={{ marginLeft: "auto" }}>
            共 {filtered.length} 节课
          </small>
        </div>
        <div className="table-wrap lesson-records-table">
          <table>
            <thead>
              <tr>
                <th>上课时间</th>
                <th>时长</th>{delivery && <th>已交付课时</th>}
                <th>课程类型</th>
                <th>学员</th>
                <th>老师</th>
                <th>状态</th><th>异常提示</th>
                <th>考勤</th>
                <th>课时</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => {
                const noShowHint = teacherNoShowHint(l);
                return (
                <tr key={l.id} aria-label={`课程 ${l.id}`}>
                  <td>
                    <button
                      className="text-link"
                      onClick={() => setDetailId(l.id)}
                    >
                      {formatDate(l.date)} {l.time}
                    </button>
                  </td>
                  <td>{l.duration} 分钟</td>{delivery && <td>{l.duration / 25}</td>}
                  <td>{l.kind}</td>
                  <td>
                    <Link to={`/students/${l.studentId}`}>
                      {student(l.studentId)?.name}
                    </Link>
                  </td>
                  <td>
                    <Link to={`/teachers/${l.teacherId}`}>
                      {teacher(l.teacherId)?.name}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={tone(l.status)}>
                      {lessonStatusLabel(l.status)}
                    </Badge>
                  </td>
                  <td>
                    {noShowHint && <small>{noShowHint}</small>}
                    {!noShowHint && !isOverdueLesson(l, now) && !l.leaveFlag && !attendanceIssue(l) && !l.conflict && "—"}
                    {isOverdueLesson(l, now) && (
                      <small className="lesson-overdue">
                        已过计划结束时间，待核实
                      </small>
                    )}
                    {l.leaveFlag && <Badge tone="warning">老师请假</Badge>}
                    {attendanceIssue(l) && (
                      <small>数据提示：{attendanceIssue(l)}</small>
                    )}
                    {l.conflict && <small>时间冲突</small>}
                  </td>
                  <td>
                    {!recordAttendance(l).length && (
                      <span className="muted">—</span>
                    )}
                    {recordAttendance(l).map((label) => (
                      <Badge
                        key={label}
                        tone={label === "正常" ? "success" : "warning"}
                      >
                        {label}
                      </Badge>
                    ))}
                  </td>
                  <td>
                    {l.deducted
                      ? `已扣 ${l.confirmedUnits ?? 0} 课时`
                      : l.status === "待确认"
                        ? "待核实"
                        : l.status === "未开始"
                          ? "尚未结算"
                          : "不扣课时"}
                  </td>
                  <td>
                    <CourseSyncLink lesson={l} />
                    {l.status === "待确认" && can("lesson.confirm") && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => openReview(l)}
                      >
                        {l.attendance === "账号待关联" ? "关联学员" : "核实"}
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setDetailId(l.id)}
                    >
                      详情
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <EmptyState
            title={
              view === "unsynced"
                ? "没有符合条件的未同步课程"
                : "没有符合条件的课程"
            }
          />
        )}
        <ListPagination
          total={filtered.length}
          page={currentPage}
          onChange={(p) => {
            setPage(p);
          }}
        />
      </Panel>
      <Drawer
        open={!!detail && !decision && !linkId}
        onClose={() => setDetailId("")}
        title="课程详情"
        width={560}
        footer={
          detail && (
            <>
              {detail.status === "待确认" && can("lesson.confirm") && <Button variant="primary" onClick={() => openReview(detail)}>{detail.attendance === "账号待关联" ? "关联学员" : "核实"}</Button>}
              {["已完成","缺席"].includes(detail.status) && can("lesson.correct") && (
                <Button
                  onClick={() => {
                    setReason("");
                    setDeduct(detail.deducted);
                    setUnits(
                      detail.confirmedUnits === undefined
                        ? ""
                        : String(detail.confirmedUnits),
                    );
                    setCorrect(true);
                  }}
                >
                  更正结果
                </Button>
              )}
              <Link
                to={`/feedback?new=1&student=${detail.studentId}&lesson=${detail.id}`}
              >
                <Button>登记反馈</Button>
              </Link>
            </>
          )
        }
      >
        {detail && (
          <div className="stack">
            <CourseSyncLink lesson={detail} detail />
            {detail.incident && <p>已核实：{detail.incident.reason} · {detail.incident.note} · {detail.incident.operator} · {new Date(detail.incident.at).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</p>}
            {(["学员", "老师"] as const).map(person => {
              const at = detail.attendanceMessages?.[person];
              if (!at) return null;
              return <p key={person}>{person}未到堂提醒 · {new Date(at).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai"})}</p>;
            })}
            {detail.attendanceMessages && <p>学员课时 · {detail.deducted ? `已扣 ${detail.confirmedUnits ?? "—"} 课时` : allData.credits.some(c => c.lessonId === detail.id && c.type === "扣课退回") ? "已退回原扣课时" : detail.status === "已完成" ? "不扣课，已释放占用" : "待确认"}</p>}
            <dl className="detail-pairs">
              <dt>学员</dt>
              <dd>{student(detail.studentId)?.name || "—"}</dd>
              <dt>老师</dt>
              <dd>{teacher(detail.teacherId)?.name || "—"}</dd>
              <dt>上课日期</dt>
              <dd>{formatDate(detail.date)}</dd>
              <dt>计划开始时间</dt>
              <dd>{detail.time}</dd>
              <dt>计划时长</dt>
              <dd>{detail.duration} 分钟</dd>
              <dt>课程类型</dt>
              <dd>{detail.kind}</dd>

              <dt>教材</dt>
              <dd>{detail.material}</dd>
              <dt>课程状态</dt>
              <dd>
                <Badge tone={tone(detail.status)}>
                  {lessonStatusLabel(detail.status)}
                </Badge>
                {isOverdueLesson(detail, now) && (
                  <p className="lesson-overdue">已过计划结束时间，待核实</p>
                )}
              </dd>

              <dt>考勤</dt>
              <dd>{recordAttendance(detail).join("、") || "—"}</dd>
              <dt>老师考勤</dt>
              <dd>
                {isOverdueLesson(detail, now)
                  ? "待核实"
                  : personAttendance(detail, "老师").join("、") || "—"}
              </dd>
              <dt>学员考勤</dt>
              <dd>
                {isOverdueLesson(detail, now)
                  ? "待核实"
                  : personAttendance(detail, "学员").join("、") || "—"}
              </dd>
              {attendanceIssue(detail) && (
                <div className="lesson-detail-field">
                  <dt>数据提示</dt>
                  <dd>{attendanceIssue(detail)}</dd>
                </div>
              )}
              {(
                [
                  ["老师进入时间", detail.teacherIn],
                  ["老师离开时间", detail.teacherOut],
                  ["学员进入时间", detail.studentIn],
                  ["学员离开时间", detail.studentOut],
                ] as const
              ).map(([label, value]) => (
                <div className="lesson-detail-field" key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {detail.status === "未开始"
                      ? isOverdueLesson(detail, now)
                        ? "待核实"
                        : "尚未开始"
                      : detail.status === "已取消"
                        ? "不适用"
                        : value || "暂无记录"}
                  </dd>
                </div>
              ))}
              <dt>课时结果</dt>
              <dd>
                {detail.status === "未开始"
                  ? "尚未结算"
                  : detail.deducted
                    ? `已扣 ${detail.confirmedUnits ?? "待核实"} 课时`
                    : "未扣课时"}
              </dd>
              <dt>备注</dt>
              <dd>{detail.note || "暂无备注"}</dd>
            </dl>
            <div className="inset">
              <h3 className="row">
                <Clock3 size={16} />
                变更记录
              </h3>
              <p style={{ marginTop: 12 }}>{detail.note || "暂无变更记录。"}</p>
            </div>
            <Link to={`/schedule?student=${detail.studentId}`}>
              前往排课管理调整课程 <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </Drawer>
      <Drawer
        open={!!decision}
        onClose={() => setDecision(null)}
        title="核实上课记录"
        footer={
          <>
            <Button onClick={() => setDecision(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={
                !incident || !reason.trim() || (timed && (!delay || !Number.isInteger(Number(delay)) || Number(delay) < 0)) ||
                (decision?.kind !== "不扣" &&
                  (!units.trim() ||
                    !Number.isFinite(Number(units)) ||
                    Number(units) <= 0))
              }
              onClick={async () =>
                decision &&
                await run(
                  {
                    type: "lesson.resolve",
                    ids: [decision.id],
                    decision: decision.kind,
                    conclusion: incident,
                    minutes: timed ? Number(delay) : undefined,
                    reason,
                    ...(decision.kind !== "不扣"
                      ? { units: Number(units) }
                      : {}),
                  },
                  () => setDecision(null),
                )
              }
            >
              确认核实
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="lesson-review">
            {teacherNoShowHint(deciding) && <div className="inset"><strong>{new Date(deciding.attendanceMessages!.老师!).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"})} · {teacherNoShowHint(deciding)}</strong> · 待核实</div>}
            <dl className="detail-pairs">
              <dt>学员</dt><dd>{student(deciding.studentId)?.name}</dd>
              <dt>老师</dt><dd>{teacher(deciding.teacherId)?.name}</dd>
              <dt>计划上课</dt><dd>{formatDate(deciding.date)} {deciding.time}</dd>
              <dt>时长</dt><dd>{deciding.duration} 分钟</dd>
            </dl>
            <table><thead><tr><th>人员</th><th>进入时间</th><th>离开时间</th></tr></thead>
              <tbody><tr><td>老师</td><td>{deciding.teacherIn || "暂无记录"}</td><td>{deciding.teacherOut || "暂无记录"}</td></tr>
              <tr><td>学员</td><td>{deciding.studentIn || "暂无记录"}</td><td>{deciding.studentOut || "暂无记录"}</td></tr></tbody></table>
            <Field label="核实结论" required><Select value={incident} placeholder="请选择核实结论" onValueChange={value => {
              setIncident(value);
              setDecision({id: deciding.id, kind: value === "老师缺席" ? "不扣" : value === "学员缺席" ? "缺席" : "扣课"});
            }}>
              {["正常上课","老师缺席","学员缺席","老师迟到","老师早退","学员提前3小时取消","学员3小时内取消","学员网络设备问题","老师24小时内取消","老师1–5天取消","老师超过5天请假","老师网络设备问题","教材错误或重复","换老师","换时间","停课","误操作","其他"].map(s => <option key={s}>{s}</option>)}
            </Select></Field>
            {timed && <Field label="核实分钟数" required><input type="number" min="0" value={delay} onChange={e=>setDelay(e.target.value)}/></Field>}
            {incident && incident !== "老师缺席" && <Field label="课时处理"><Select value={decision?.kind === "不扣" ? "不扣" : "扣课"} onValueChange={v=>setDecision({id:deciding.id,kind:v === "不扣" ? "不扣" : incident === "学员缺席" ? "缺席" : "扣课"})}><option>扣课</option><option>不扣</option></Select></Field>}
        {incident && decision?.kind !== "不扣" && (
          <Field
            label="本节扣课数量"
            required
            hint="请按已核实业务口径填写，不按分钟数自动换算。"
          >
            <input
              type="number"
              min="0.01"
              step="any"
              value={units}
              onChange={(event) => setUnits(event.target.value)}
            />
          </Field>
        )}
        {incident && <p>{decision?.kind === "不扣" ? "本节不扣课" : "本节扣课"} · 当前余额 {balance ?? "—"} 课时{balance !== undefined && (decision?.kind === "不扣" || Number(units)>0) && `，处理后 ${balance - (decision?.kind === "不扣" ? 0 : Number(units))} 课时`}</p>}
        <Field label="核实依据" required>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：老师未到场，已与家长确认"
          />
        </Field>
          </div>
        )}
      </Drawer>
      <Modal
        open={!!linkId}
        onClose={() => setLinkId("")}
        title="关联学员账号"
        footer={
          <>
            <Button onClick={() => setLinkId("")}>取消</Button>
            <Button
              variant="primary"
              onClick={async () =>
                await run(
                  { type: "lesson.link", id: linkId, studentId: linkStudent },
                  () => setLinkId(""),
                )
              }
            >
              确认关联
            </Button>
          </>
        }
      >
        <Field label="选择对应学员">
          <Select
            value={linkStudent}
            onValueChange={(value) => setLinkStudent(value)}
          >
            {data.students.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} {s.groupName ? `· ${s.groupName}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <p className="ops-subtitle">
          关联后，这个账号的上课记录会归入对应学员。
        </p>
      </Modal>
      <Modal
        open={correct && !!detail}
        onClose={() => setCorrect(false)}
        title="更正课时结果"
        footer={
          <>
            <Button onClick={() => setCorrect(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!reason.trim() || (deduct && !(Number(units) > 0))}
              onClick={async () =>
                detail &&
                await run(
                  {
                    type: "lesson.correct",
                    id: detail.id,
                    deduct,
                    reason,
                    ...(deduct
                      ? { units: Number(units) }
                      : {}),
                  },
                  () => setCorrect(false),
                )
              }
            >
              保存更正
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>原课时结果：{detail?.deducted ? `已扣 ${detail.confirmedUnits} 课时` : "不扣课时"}</p>
          <Field label="正确结果">
            <Select
              value={deduct ? "yes" : "no"}
              onValueChange={(value) => setDeduct(value === "yes")}
            >
              <option value="yes">正常扣课时</option>
              <option value="no">不扣课时</option>
            </Select>
          </Field>
          {deduct && (
            <Field label="本节扣课数量" required>
              <input
                type="number"
                min="0.01"
                step="any"
                value={units}
                onChange={(event) => setUnits(event.target.value)}
              />
            </Field>
          )}
          <Field label="更正原因" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
