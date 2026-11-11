import ProjectMetrics from "../components/ProjectMetrics";
import { formatStudentProgress } from "@crazytalk/shared";
import { syncManagementPath, hasSyncIssue } from "../lib/lessonSync";
import DataTransferButton from "../components/DataTransferButton";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ComposedChart,
  Area,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  addDays,
  availableMinutesOnDate,
  isRegularTime,
} from "@crazytalk/shared";
import {
  Select,
  Avatar,
  Badge,
  Button,
  Panel,
  StatCard,
  DataExplanation,
  Tabs,
  tokens,
} from "@crazytalk/ui";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
} from "lucide-react";
import { downloadTable } from "../lib/export";
import { bookingSummary, attendanceSummary, courseAnomalies, occurred, periodRange } from "../lib/dashboard";
export default function Dashboard() {
  const { data, can, scope } = useDemo();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const today = new Date();
  const dateParts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "long",
  }).formatToParts(today);
  const datePart = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((part) => part.type === type)?.value || "";
  const weekday = datePart("weekday");
  const todayISO = `${datePart("year")}-${datePart("month").padStart(2, "0")}-${datePart("day").padStart(2, "0")}`;
  const [period, setPeriod] = useState("本周");
  const [project, setProject] = useState("全部项目");
  const [trendBy, setTrendBy] = useState("合计");
  const [group, setGroup] = useState("项目");
  const [expanded, setExpanded] = useState<string[]>(["K12"]);
  const [attendanceView, setAttendanceView] = useState("summary");
  const students = data.students.filter(
    (s) => project === "全部项目" || s.project === project,
  );
  const studentIds = new Set(students.map((s) => s.id));
  const lessons = data.lessons.filter((l) => studentIds.has(l.studentId));
  const { start: since, end: periodEnd } = periodRange(period);
  const bookings = bookingSummary(lessons, since, periodEnd);
  const bookingPath = (status = "") => `/lessons?${new URLSearchParams({
    tab: "all", from: since, to: periodEnd,
    ...(project === "全部项目" ? {} : { project }),
    ...(status ? { bookingStatus: status } : {}),
  })}`;
  const bookingStates = [
    { label: "待上课", count: bookings.upcoming, status: "未开始", color: "var(--ct-info)" },
    { label: "已完成", count: bookings.completed, status: "已完成", color: "var(--ct-brand-500)" },
    { label: "待确认", count: bookings.pending, status: "待确认", color: "var(--ct-warning)" },
    { label: "已取消", count: bookings.cancelled, status: "已取消", color: "var(--ct-gray-400)" },
    ...(bookings.absent ? [{ label: "已结束（缺席）", count: bookings.absent, status: "缺席", color: "var(--ct-danger)" }] : []),
  ];
  const inPeriod = lessons.filter(
    (l) => l.date >= since && l.date <= DEMO_TODAY && occurred(l),
  );
  const due = inPeriod.filter((l) => l.status !== "已取消");
  const feedback = data.feedback.filter(
    (f) =>
      studentIds.has(f.studentId) && f.date >= since && f.date <= DEMO_TODAY,
  );
  const attendance = attendanceSummary(inPeriod);
  const scopedTeachers = data.teachers.filter(
    (t) =>
      project === "全部项目" ||
      students.some((s) => s.teacherId === t.id) ||
      lessons.some((l) => l.teacherId === t.id),
  );
  const availableTeachers = scopedTeachers.filter(
    (t) => t.status === "在职" && (!data.rules.trainingRequired || t.trained),
  );
  const lessonPath = (extra: Record<string, string> = {}) =>
    `/lessons?${new URLSearchParams({ tab: "all", occurred: "1", from: since, to: DEMO_TODAY, ...(project === "全部项目" ? {} : { project }), ...extra })}`;
  const feedbackPath = (extra: Record<string, string> = {}) =>
    `/feedback?${new URLSearchParams({ view: "全部", from: since, to: DEMO_TODAY, ...(project === "全部项目" ? {} : { project }), ...extra })}`;
  const pending = lessons.filter((l) => l.status === "待确认").length;
  const feedbackPending = data.feedback.filter(
    (f) => studentIds.has(f.studentId) && f.status !== "已完成",
  ).length;
  const low = students.filter(
    (s) =>
      s.balanceKnown && s.balance > 0 && s.balance <= data.rules.lowBalance,
  ).length;
  const unsynced = data.lessons.filter(hasSyncIssue).length;
  const closed = inPeriod.filter((l) => l.status === "已完成").length;
  const bad = feedback.filter((f) => f.rating === "差评").length;
  const trend = Array.from(
    {
      length:
        Math.round((Date.parse(DEMO_TODAY) - Date.parse(since)) / 86400000) + 1,
    },
    (_, i) => {
      const start = addDays(since, i);
      const end = start;
      const items = lessons.filter(
        (l) => l.date >= start && l.date <= end && occurred(l),
      );
      const summary = attendanceSummary(items);
      return {
        label: `${start.slice(5).replace("-", "/")}`,
        start,
        end,
        planned: items.filter((l) => l.status !== "已取消").length,
        completed: items.filter((l) => l.status === "已完成").length,
        attendance: summary.rate,
        ...Object.fromEntries(
          ["K12", "14", "乐说"].map((name) => [
            name,
            items.filter(
              (l) =>
                l.status === "已完成" &&
                data.students.find((s) => s.id === l.studentId)?.project ===
                  name,
            ).length,
          ]),
        ),
      };
    },
  );
  const categories = [
    ...new Set(
      feedback
        .filter((f) => f.rating === "差评")
        .map((f) => f.category.split(" / ")[1] || f.category),
    ),
  ]
    .map((name) => ({
      name,
      count: feedback.filter(
        (f) =>
          f.rating === "差评" &&
          (f.category.split(" / ")[1] || f.category) === name,
      ).length,
    }))
    .sort((a, b) => b.count - a.count);
  const { anomalies, pending: anomalyPending } = courseAnomalies(inPeriod);
  const teacherUtil = scopedTeachers
    .filter((t) => t.status === "在职")
    .map((t) => {
      const booked = lessons
        .filter(
          (l) =>
            l.teacherId === t.id &&
            l.date >= since &&
            l.date <= periodEnd &&
            l.status !== "已取消",
        )
        .reduce((a, l) => a + Math.ceil(l.duration / 30), 0);
      const dates = Array.from(
        {
          length:
            Math.round((Date.parse(periodEnd) - Date.parse(since)) / 86400000) +
            1,
        },
        (_, i) => addDays(since, i),
      );
      const open = dates.reduce(
        (total, date) => total + availableMinutesOnDate(t, date) / 30,
        0,
      );
      const evening = dates.reduce(
        (total, date) => total + availableMinutesOnDate(t, date, 18 * 60) / 30,
        0,
      );
      const eveningBooked = lessons
        .filter(
          (l) =>
            l.teacherId === t.id &&
            l.date >= since &&
            l.date <= periodEnd &&
            l.status !== "已取消",
        )
        .reduce((sum, l) => {
          const [hour, minute] = l.time.split(":").map(Number);
          const start = hour * 60 + minute;
          return (
            sum +
            Math.ceil(
              Math.max(0, start + l.duration - Math.max(start, 18 * 60)) / 30,
            )
          );
        }, 0);
      return {
        ...t,
        eveningBooked,
        booked,
        open,
        evening,
        ratio: open ? Math.round((booked / open) * 100) : 0,
      };
    });
  const opened = teacherUtil.reduce((a, t) => a + t.open, 0),
    booked = teacherUtil.reduce((a, t) => a + t.booked, 0);
  const rate = opened ? Math.round((booked / opened) * 100) : 0;
  const eveningOpen = teacherUtil.reduce((sum, t) => sum + t.evening, 0);
  const eveningBooked = teacherUtil.reduce(
    (sum, t) => sum + t.eveningBooked,
    0,
  );
  const reminders = [
    {
      id: "confirmation",
      label: "课后待确认",
      description: `有 ${pending} 节课需要核对师生出勤，并确认是否扣除学员课时。`,
      emptyDescription: "暂无待确认课程，当前课程的出勤与课时已核对完成。",
      action: "去确认课程",
      count: pending,
      unit: "节",
      urgent: false,
      path: "/lessons?tab=confirm",
      permission: "lesson.confirm",
    },
    {
      id: "feedback",
      label: "待处理反馈",
      description: `有 ${feedbackPending} 条家长反馈尚未处理完成，需要跟进问题或完成判定。`,
      emptyDescription: "暂无待处理反馈，当前家长反馈均已处理完成。",
      action: "去处理反馈",
      count: feedbackPending,
      unit: "条",
      urgent: false,
      path: "/feedback",
      permission: "feedback.process",
    },
    {
      id: "sync",
      label: "同步异常",
      description: `有 ${unsynced} 节课程存在同步问题，可前往同步管理查看。`,
      emptyDescription: "暂无同步异常。",
      action: "去同步管理",
      count: unsynced,
      unit: "节",
      urgent: true,
      path: syncManagementPath,
      permission: "classin.view",
    },
    {
      id: "balance",
      label: "课时即将用完",
      description: `有 ${low} 位学员剩余课时不超过 ${data.rules.lowBalance} 课时，需联系家长确认续费或后续安排。`,
      emptyDescription: "暂无课时不足的学员，后续可继续留意学员课时余额。",
      action: "去跟进学员",
      count: low,
      unit: "位",
      urgent: false,
      path: `/students?view=low${project === "全部项目" ? "" : `&project=${encodeURIComponent(project)}`}`,
      permission: "student.view",
    },
  ].filter((reminder) => can(reminder.permission));
  if(tab==="projectMetrics")return <div className="stack"><Button onClick={()=>setParams({tab:"overview"})}>返回运营总览</Button><ProjectMetrics/></div>;
  return (
    <div className="stack dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-welcome">
          <Avatar name="Rita" size={64} />
          <div className="dashboard-greeting">
            <h1>{weekday.replace("星期", "周")}好，Rita</h1>
            <p>今天也一起照顾好学员的学习旅程吧</p>
          </div>
        </div>
        <time
          className="dashboard-date"
          dateTime={todayISO}
          aria-label={`${datePart("year")}年${datePart("month")}月${datePart("day")}日 ${weekday}`}
        >
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            今天，{datePart("year")}年{datePart("month")}月{datePart("day")}日
          </span>
        </time>
      </header>
      <div className="dashboard-view-toolbar">
        <Tabs
          value={tab}
          onChange={(v) => setParams({ tab: v })}
          items={[
            { value: "overview", label: "运营总览" },
            {value:"projectMetrics",label:"项目月度指标"},
            ...(can("dashboard.utilization")
              ? [{ value: "utilization", label: "老师利用率" }]
              : []),
          ]}
        />
        <div className="dashboard-filters">
          <small>范围：{scope}</small>
          <Select
            className="compact-select"
            aria-label="看板时间范围"
            value={period}
            onValueChange={setPeriod}
          >
            <option>今天</option>
            <option>本周</option>
            <option>本月</option>
          </Select>
          <Select
            className="compact-select"
            aria-label="看板项目"
            value={project}
            onValueChange={setProject}
          >
            <option>全部项目</option>
            <option>K12</option>
            <option>14</option>
            <option>乐说</option>
          </Select>
        </div>
      </div>
      {tab === "overview" ? (
        <>
          <section className="grid-4" aria-label="基础数据">
            <StatCard
              variant="dashboard-featured"
              label="学员"
              value={
                <>
                  {students.filter((s) => s.status === "在读").length}
                  <em> / {students.length} 位</em>
                </>
              }
              note="在读学员 / 总学员 · 截至当前"
              onClick={() =>
                navigate(
                  `/students?${new URLSearchParams(project === "全部项目" ? {} : { project })}`,
                )
              }
            />
            <StatCard
              variant="dashboard"
              label="老师"
              value={
                <>
                  {availableTeachers.length}
                  <em> / {scopedTeachers.length} 位</em>
                </>
              }
              note="可排课老师 / 老师总数 · 截至当前"
              onClick={() =>
                navigate(
                  `/teachers?status=在职${data.rules.trainingRequired ? "&training=completed" : ""}${project === "全部项目" ? "" : `&project=${encodeURIComponent(project)}`}`,
                )
              }
            />
            <StatCard
              variant="dashboard"
              label={`${period}完成课程`}
              value={
                <>
                  {closed}
                  <em> 节</em>
                </>
              }
              note={`应完成 ${due.length} 节 · 完成率 ${due.length ? Math.round((closed / due.length) * 100) : 0}%`}
              onClick={() => navigate(lessonPath({ status: "已完成" }))}
            />
            <StatCard
              variant="dashboard"
              label={`${period}老师订课率`}
              value={
                <>
                  {opened ? rate : "—"}
                  <em>{opened ? "%" : ""}</em>
                </>
              }
              note={`晚间 ${eveningOpen ? Math.round((eveningBooked / eveningOpen) * 100) + "%" : "—"} · 空置 ${Math.max(0, opened - booked)} 个时段`}
              onClick={() => setParams({ tab: "utilization" })}
            />
          </section>
          <section
            aria-labelledby="dashboard-pending-title"
            id="dashboard-pending"
          >
            <Panel className="dashboard-pending-panel">
              <div className="dashboard-section-heading">
                <div>
                  <h2 id="dashboard-pending-title">待处理事项</h2>
                  <DataExplanation title="待处理事项">
                    <p>
                      汇总当前尚未完成的课程确认、反馈处理、同步异常及低余额跟进事项，不受统计周期限制。点击对应操作可进入处理页面。
                    </p>
                  </DataExplanation>
                </div>
                {reminders.length > 0 && (
                  <Badge>
                    {reminders.filter((item) => item.count > 0).length} 类待处理
                  </Badge>
                )}
              </div>
              <div className="dashboard-reminder-cards">
                {reminders.map((item) => (
                  <article
                    key={item.id}
                    aria-labelledby={`reminder-title-${item.id}`}
                    className={`dashboard-reminder-card ${item.count === 0 ? "is-clear" : ""}`}
                  >
                    <div className="dashboard-reminder-art">
                      <img
                        src={`/illustrations/reminder-${item.id}.webp`}
                        alt=""
                        width={768}
                        height={512}
                        loading="lazy"
                        decoding="async"
                      />
                      {item.urgent && item.count > 0 && (
                        <span className="dashboard-reminder-alert">
                          需要关注
                        </span>
                      )}
                    </div>
                    <div className="dashboard-reminder-body">
                      <div className="dashboard-reminder-card-heading">
                        <h3 id={`reminder-title-${item.id}`}>{item.label}</h3>
                        <span
                          className={`dashboard-reminder-total ${item.urgent && item.count > 0 ? "is-alert" : ""}`}
                        >
                          {item.count}
                          <small>{formatStudentProgress(item.unit)}</small>
                        </span>
                      </div>
                      <p>
                        {item.count ? item.description : item.emptyDescription}
                      </p>
                      <Button
                        size="sm"
                        disabled={item.count === 0}
                        aria-label={`${item.action}：${item.label}`}
                        onClick={() => navigate(item.path)}
                      >
                        {item.count ? item.action : "暂无待处理"}
                        {item.count > 0 && <ArrowRight size={14} />}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>
          </section>
          <section aria-label="约课统计">
            <Panel title="约课统计" action={<small>{period} · {since} 至 {periodEnd}</small>}>
              <div className="dashboard-booking-layout">
                <div className="dashboard-booking-overview">
                  <div className="dashboard-booking-ring">
                    <svg viewBox="0 0 200 200" aria-hidden="true">
                      <circle cx="100" cy="100" r="84" fill="none" stroke="var(--ct-gray-100)" strokeWidth="14" />
                      {bookingStates.map((item, index) => {
                        const share = bookings.total ? item.count / bookings.total * 100 : 0;
                        const offset = bookings.total ? bookingStates.slice(0, index).reduce((sum, state) => sum + state.count, 0) / bookings.total * 100 : 0;
                        const circumference = 2 * Math.PI * 84;
                        const strokeWidth = Math.min(14, share / 100 * circumference * 0.7);
                        const gap = share < 100 ? Math.min(share * 0.9, strokeWidth / circumference * 100 + 1) : 0;
                        return share > 0 && <circle key={item.status} cx="100" cy="100" r="84" fill="none" stroke={item.color} strokeWidth={strokeWidth} strokeLinecap="round" pathLength="100" strokeDasharray={`${share - gap} 100`} strokeDashoffset={-(offset + gap / 2)} transform="rotate(-90 100 100)" />;
                      })}
                    </svg>
                    <button onClick={() => navigate(bookingPath())} aria-label={`总约课数 ${bookings.total} 节`}>
                      <span>总约课数</span>
                      <strong>{bookings.total}</strong>
                      <small>节课 <ArrowUpRight size={12} /></small>
                    </button>
                  </div>
                  <span className="dashboard-booking-caption">{bookings.total ? "所选周期内的全部预约" : "本期暂无约课"}</span>
                </div>
                <div className="dashboard-booking-breakdown">
                  <div className="dashboard-booking-table-heading"><span>约课状态</span><span>课次数 / 占比</span></div>
                  {bookingStates.map((item) => (
                    <button className="dashboard-booking-state" key={item.status} onClick={() => navigate(bookingPath(item.status))} aria-label={`${item.label} ${item.count} 节`}>
                      <span className="dashboard-booking-state-name"><i style={{ background: item.color }} />{item.label}</span>
                      <span className="dashboard-booking-state-track" aria-hidden="true"><span style={{ width: `${bookings.total ? item.count / bookings.total * 100 : 0}%`, background: item.color }} /></span>
                      <strong>{item.count}<small> 节</small></strong>
                      <span className="dashboard-booking-share">{bookings.total ? `${Math.round(item.count / bookings.total * 100)}%` : "—"}</span>
                    </button>
                  ))}
                </div>
                <div className="dashboard-booking-cancellation">
                  <div className="dashboard-booking-rate-heading"><span>取消率</span><span className="dashboard-booking-rate-tag">预约流失</span></div>
                  <strong className="dashboard-booking-rate-number">{bookings.cancellationRate === null ? "—" : bookings.cancellationRate}<small>{bookings.cancellationRate === null ? "" : "%"}</small></strong>
                  <p>{bookings.total} 节预约中<br />有 <b>{bookings.cancelled} 节</b>已取消</p>
                  <div className="dashboard-booking-rate-track" aria-hidden="true"><span style={{ width: `${bookings.cancellationRate ?? 0}%` }} /></div>
                  <button onClick={() => navigate(bookingPath("已取消"))}>查看取消记录 <ArrowUpRight size={14} /></button>
                </div>
              </div>
              <div className="dashboard-booking-note">
                <small>按上课日期统计，包含所选周期的未来课程 · 点击数量查看明细</small>
                <DataExplanation title="约课统计">
                  <p>总约课数为所选项目、完整周期内的课程记录数，包含已取消课程，不按预约创建时间统计。</p>
                  <p>取消率 = 已取消数 ÷ 总约课数；无约课时显示“—”。待上课对应未开始状态，逾期未更新的记录仍计入；待确认单列，确认完成后计入已完成。历史缺席状态单列为已结束（缺席）。</p>
                </DataExplanation>
              </div>
            </Panel>
          </section>
          <section className="stack dashboard-details" aria-label="详细数据">
            <div className="dashboard-main-grid">
              <Panel
                title="上课趋势"
                action={
                  <Tabs
                    variant="chips"
                    value={trendBy}
                    onChange={setTrendBy}
                    items={[
                      { value: "合计", label: "合计" },
                      { value: "按项目", label: "按项目" },
                    ]}
                  />
                }
              >
                <div className="dashboard-chart">
                  <ResponsiveContainer>
                    <ComposedChart
                      data={trend}
                      margin={{ top: 12, left: 12, right: 16, bottom: 8 }}
                    >
                      <defs>
                        {[tokens.brand[500], ...tokens.chart.slice(0, 3)].map(
                          (color, i) => (
                            <linearGradient
                              key={color + i}
                              id={`dashboard-trend-fill-${i}`}
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={color}
                                stopOpacity={0.18}
                              />
                              <stop
                                offset="100%"
                                stopColor={color}
                                stopOpacity={0.01}
                              />
                            </linearGradient>
                          ),
                        )}
                        <filter
                          id="dashboard-trend-shadow"
                          x="-20%"
                          y="-30%"
                          width="140%"
                          height="170%"
                        >
                          <feDropShadow
                            dx="0"
                            dy="3"
                            stdDeviation="3"
                            floodColor={tokens.brand[500]}
                            floodOpacity={0.14}
                          />
                        </filter>
                      </defs>
                      <CartesianGrid
                        vertical={false}
                        stroke={tokens.gray[200]}
                        strokeDasharray="4 4"
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                        tickMargin={12}
                        height={40}
                        padding={{ left: 8, right: 8 }}
                        minTickGap={20}
                      />
                      <YAxis
                        allowDecimals={false}
                        width={48}
                        tickMargin={10}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: `1px solid ${tokens.gray[200]}`,
                          boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
                        }}
                      />
                      {trendBy === "合计" ? (
                        <>
                          <Line
                            isAnimationActive={false}
                            type="monotone"
                            dataKey="planned"
                            name="应完成课次"
                            stroke={tokens.gray[400]}
                            strokeDasharray="5 5"
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                          <Area
                            isAnimationActive={false}
                            type="monotone"
                            dataKey="completed"
                            name="实际完成课次"
                            stroke={tokens.brand[500]}
                            strokeWidth={2.5}
                            fill="url(#dashboard-trend-fill-0)"
                            filter="url(#dashboard-trend-shadow)"
                            dot={false}
                            activeDot={{
                              r: 4,
                              strokeWidth: 2,
                              fill: "var(--ct-white)",
                            }}
                          />
                        </>
                      ) : (
                        ["K12", "14", "乐说"].map((name, i) => (
                          <Area
                            isAnimationActive={false}
                            key={name}
                            type="monotone"
                            dataKey={name}
                            name={name}
                            stroke={tokens.chart[i]}
                            strokeWidth={2}
                            fill={`url(#dashboard-trend-fill-${i + 1})`}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        ))
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-legend">
                  {(trendBy === "合计"
                    ? ["应完成课次", "实际完成课次"]
                    : ["K12", "14", "乐说"]
                  ).map((name, i) => (
                    <span key={name}>
                      <i
                        style={{
                          background:
                            trendBy === "合计"
                              ? i === 0
                                ? tokens.gray[400]
                                : tokens.brand[500]
                              : tokens.chart[i],
                        }}
                      />
                      {name}
                    </span>
                  ))}
                </div>
                <div className="dashboard-card-footer">
                  <button
                    className="text-link dashboard-detail-link"
                    onClick={() => navigate(lessonPath())}
                  >
                    查看本期上课记录 <ArrowUpRight size={14} />
                  </button>
                  <DataExplanation title="上课趋势">
                    <p>
                      对比{period}
                      每天应完成与已确认完成的课程节数，已取消及未来课程不计入。
                    </p>
                    <p>
                      合计视图中，灰色虚线为应完成课次，彩色实线为实际完成课次；按项目视图展示各项目实际完成的课次。
                    </p>
                  </DataExplanation>
                </div>
              </Panel>
              <Panel
                title="学员出勤"
                action={
                  <Tabs
                    variant="chips"
                    value={attendanceView}
                    onChange={setAttendanceView}
                    items={[
                      { value: "summary", label: "概况" },
                      { value: "trend", label: "趋势" },
                    ]}
                  />
                }
              >
                <button
                  className="dashboard-attendance-rate"
                  onClick={() => navigate(lessonPath({ view: "attendance" }))}
                >
                  <span>学员出勤率</span>
                  <strong>
                    {attendance.rate === null ? "—" : attendance.rate}
                    <em>{attendance.rate === null ? "" : "%"}</em>
                  </strong>
                  <small>
                    实到 {attendance.present} / 应到 {attendance.expected} 课次
                  </small>
                </button>
                {attendanceView === "summary" ? (
                  <div className="dashboard-attendance-summary">
                    <QuickNumber
                      label="缺勤学员"
                      value={attendance.absentStudents}
                      note={`共缺勤 ${attendance.absent} 课次`}
                      onClick={() =>
                        navigate(lessonPath({ attendance: "学员缺席" }))
                      }
                    />
                    <QuickNumber
                      label="连续缺勤学员"
                      value={attendance.consecutive.length}
                      note="本期最近连续 2 节应到课缺勤"
                      onClick={() =>
                        navigate(
                          `/students?${new URLSearchParams({ view: "consecutive", from: since, to: DEMO_TODAY, ...(project === "全部项目" ? {} : { project }) })}`,
                        )
                      }
                    />
                  </div>
                ) : (
                  <div className="dashboard-attendance-chart">
                    <ResponsiveContainer>
                      <ComposedChart
                        data={trend}
                        margin={{ top: 10, left: 10, right: 12, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient
                            id="dashboard-attendance-fill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={tokens.brand[500]}
                              stopOpacity={0.18}
                            />
                            <stop
                              offset="100%"
                              stopColor={tokens.brand[500]}
                              stopOpacity={0.01}
                            />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickMargin={10}
                          height={36}
                          padding={{ left: 8, right: 8 }}
                          minTickGap={20}
                        />
                        <YAxis
                          domain={[0, 100]}
                          width={48}
                          tickMargin={8}
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v) => `${v}%`}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Area
                          isAnimationActive={false}
                          type="monotone"
                          dataKey="attendance"
                          name="出勤率"
                          stroke={tokens.brand[500]}
                          strokeWidth={2}
                          fill="url(#dashboard-attendance-fill)"
                          dot={false}
                          activeDot={{ r: 3 }}
                          connectNulls={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="dashboard-data-note">
                  <DataExplanation title="学员出勤">
                    <p>
                      统计{period}学员实到与应到课次。出勤率 = 实到课次 ÷
                      应到课次；趋势展示每天的出勤率。
                    </p>
                    <p>
                      缺勤学员按人数去重；连续缺勤指本期最近连续两节应到课程均缺勤。
                    </p>
                    <p>
                      已取消、未来课程不计入；{attendance.unknown}{" "}
                      节考勤待核实，暂不计入出勤率。
                    </p>
                  </DataExplanation>
                </div>
              </Panel>
            </div>
            <div className="dashboard-analysis-grid">
              <Panel
                title="课程异常"
                action={<small>{period} · 按课次统计</small>}
              >
                <div className="dashboard-capsule-chart" role="group" aria-label="课程异常柱状图">
                  {anomalies.map((item, index) => (
                    <button
                      className="dashboard-capsule-column"
                      key={item.name}
                      aria-label={`${item.name} ${item.count} 节`}
                      onClick={() => navigate(lessonPath(item.filter))}
                    >
                      <span className="dashboard-capsule-stage" aria-hidden="true">
                        <strong className="dashboard-capsule-value">{item.count}<small> 节</small></strong>
                        {item.count > 0 ? (
                          <span
                            className={`dashboard-capsule-bar ${index % 2 === 0 ? "is-solid" : "is-striped"}`}
                            style={{ height: `${item.count / Math.max(1, ...anomalies.map((a) => a.count)) * 180}px` }}
                          />
                        ) : <span className="dashboard-capsule-zero" />}
                      </span>
                      <span className="dashboard-capsule-label">{item.name}</span>
                    </button>
                  ))}
                </div>
                <div className="dashboard-data-note dashboard-anomaly-footer">
                {anomalyPending > 0 && (
                  <button
                    className="dashboard-anomaly-pending"
                    aria-label={`待核实 ${anomalyPending} 节`}
                    onClick={() => navigate(lessonPath({ attendance: "待核实" }))}
                  >
                    有 {anomalyPending} 节课程考勤待核实 <ArrowRight size={13} aria-hidden="true" />
                  </button>
                )}
                  <DataExplanation title="课程异常">
                    <p>
                      统计{period}
                      已发生课程中的取消，以及学员和老师的缺席、迟到、早退课次，点击各项查看课程明细。
                    </p>
                    <p>
                      按老师、学员各自的考勤标签统计，同一课程同类异常只计一次，不同异常可能重叠，不直接相加。取消记录尚未区分申请方。
                    </p>
                  </DataExplanation>
                </div>
              </Panel>
              {can("feedback.view") && (
                <Panel
                  title="服务质量"
                  action={
                    <button
                      className="text-link"
                      onClick={() => navigate(feedbackPath())}
                    >
                      查看反馈 <ArrowUpRight size={14} />
                    </button>
                  }
                >
                  <div className="dashboard-quality-summary">
                    <button onClick={() => navigate(feedbackPath())}>
                      <strong>{feedback.length}</strong>
                      <span>反馈总数</span>
                    </button>
                    <button
                      onClick={() => navigate(feedbackPath({ rating: "差评" }))}
                    >
                      <strong>{bad}</strong>
                      <span>差评反馈</span>
                    </button>
                    <button
                      onClick={() => navigate(feedbackPath({ view: "已完成" }))}
                    >
                      <strong>
                        {feedback.filter((f) => f.status === "已完成").length}
                      </strong>
                      <span>已处理完成</span>
                    </button>
                    <button
                      onClick={() => navigate(feedbackPath({ view: "未完成" }))}
                    >
                      <strong>
                        {feedback.filter((f) => f.status !== "已完成").length}
                      </strong>
                      <span>尚未完成</span>
                    </button>
                  </div>
                  <div className="stack dashboard-bars">
                    {categories.length ? (
                      categories.slice(0, 4).map((item) => (
                        <button
                          className="bar-item"
                          key={item.name}
                          onClick={() =>
                            navigate(
                              feedbackPath({
                                rating: "差评",
                                category: item.name,
                              }),
                            )
                          }
                        >
                          <div className="row between">
                            <span>{item.name}</span>
                            <strong>
                              {item.count} 条 <ArrowUpRight size={13} />
                            </strong>
                          </div>
                          <div className="bar-track">
                            <div
                              style={{
                                width: `${(item.count / Math.max(1, bad)) * 100}%`,
                              }}
                            />
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="dashboard-empty">本期暂无差评反馈</p>
                    )}
                  </div>
                  <div className="dashboard-data-note">
                    <DataExplanation title="服务质量">
                      <p>
                        统计{period}登记的家长反馈数量、差评数量及当前处理状态。
                      </p>
                      <p>
                        下方展示差评反馈最多的 4
                        类问题，条形长度表示该类问题占本期差评的比例。
                      </p>
                      <p>
                        家长反馈与责任判定分别记录，差评不直接代表老师有责。
                      </p>
                    </DataExplanation>
                  </div>
                </Panel>
              )}
            </div>
            {project !== "全部项目" && (
              <p className="dashboard-chart-footnote">项目老师按任教学员及课次关联筛选，开放容量未作项目分摊。</p>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="grid-4">
            <StatCard
              variant="dashboard-featured"
              onClick={() => navigate("/schedule")}
              label={`${period}开放时段`}
              value={opened}
              note="30 分钟一个时段"
            />
            <StatCard
              variant="dashboard"
              onClick={() => navigate("/schedule")}
              label="已订时段"
              value={booked}
              note={`空置 ${opened - booked} 个时段`}
            />
            <StatCard
              variant="dashboard"
              onClick={() => navigate("/schedule")}
              label="订课率"
              value={
                <>
                  {rate}
                  <em>%</em>
                </>
              }
              note="已订 ÷ 开放"
            />
            <StatCard
              variant="dashboard"
              onClick={() => navigate("/teachers")}
              label="参与排班的老师"
              value={teacherUtil.length}
              note="查看老师与排班安排"
            />
          </div>
          <Panel
            title="老师时间利用情况"
            action={
              <div className="row">
                <Select
                  className="compact-select"
                  value={group}
                  onValueChange={(value) => setGroup(value)}
                >
                  <option>项目</option>
                  <option>SO</option>
                </Select>
                <DataTransferButton
                  direction="export"
                  size="sm"
                  onClick={() =>
                    void downloadTable(
                      "老师利用率",
                      ["老师", "SO", "开放", "已订", "订课率"],
                      teacherUtil.map((t) => [
                        t.name,
                        t.so,
                        t.open,
                        t.booked,
                        `${t.ratio}%`,
                      ]),
                    )
                  }
                />
              </div>
            }
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>按{group}分组</th>
                    <th>总开课</th>
                    <th>已订</th>
                    <th>空置</th>
                    <th>订课率</th>
                    <th>浪费率</th>
                  </tr>
                </thead>
                <tbody>
                  {(group === "SO"
                    ? ["BigBrains", "CleverOaks", "Mellany", "WeTalk"]
                    : ["K12", "14", "乐说"]
                  ).map((g) => {
                    const members =
                      group === "SO"
                        ? teacherUtil.filter((t) => t.so === g)
                        : teacherUtil.filter((t) =>
                            lessons.some(
                              (l) =>
                                l.teacherId === t.id &&
                                data.students.find((s) => s.id === l.studentId)
                                  ?.project === g,
                            ),
                          );
                    return (
                      <GroupRows
                        key={g}
                        name={g}
                        members={members}
                        expanded={expanded.includes(g)}
                        onToggle={() =>
                          setExpanded((s) =>
                            s.includes(g)
                              ? s.filter((x) => x !== g)
                              : [...s, g],
                          )
                        }
                        onTeacher={(id) => navigate(`/teachers/${id}`)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="dashboard-data-note">
              <DataExplanation title="老师时间利用情况">
                <p>
                  按{group}汇总{period}
                  老师的开放、已订和空置时段，展开分组查看每位老师的订课率。
                </p>
                <p>
                  每 30 分钟为一个排班时段。订课率 = 已订时段 ÷
                  开放时段；空置时段 = 开放时段 − 已订时段。
                </p>
              </DataExplanation>
            </div>
          </Panel>
          <Panel
            title="本周时段分布"
            action={<small>已订 / 开放 · 点时段进入排班</small>}
          >
            <div className="heatmap">
              <div />
              <>
                {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                  <div className="heatmap-day" key={d}>
                    周{d}
                  </div>
                ))}
              </>
              {Array.from({ length: 12 }, (_, i) => (
                <HeatRow
                  key={i}
                  hour={i + 10}
                  data={data}
                  onClick={(day, time) =>
                    navigate(
                      `/schedule?view=day&date=${addDays("2026-10-26", day)}&time=${time}`,
                    )
                  }
                />
              ))}
            </div>
            <div
              className="row"
              style={{ justifyContent: "flex-end", marginTop: 20 }}
            >
              <small>空闲</small>
              {[50, 100, 200, 500, 700, 800].map((n) => (
                <span
                  key={n}
                  style={{
                    width: 20,
                    height: 12,
                    background: `var(--ct-brand-${n})`,
                    borderRadius: 2,
                  }}
                />
              ))}
              <small>紧张</small>
            </div>
            <div className="dashboard-data-note">
              <DataExplanation title="本周时段分布">
                <p>
                  展示本周每天各时间段的订课率，即已订容量占开放容量的比例。颜色越深表示订课率越高；无开放容量的时段显示横线。
                </p>
                <p>点击时段可进入当天对应时间的排班。</p>
              </DataExplanation>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
function QuickNumber({
  label,
  value,
  note,
  onClick,
}: {
  label: string;
  value: number;
  note: string;
  onClick: () => void;
}) {
  return (
    <button className="quick-number" onClick={onClick}>
      <div>
        <span>{label}</span>
        <small>{note}</small>
      </div>
      <strong>
        {value}
        <ArrowUpRight size={14} />
      </strong>
    </button>
  );
}
type Util = {
  id: string;
  name: string;
  open: number;
  booked: number;
  ratio: number;
};
function GroupRows({
  name,
  members,
  expanded,
  onToggle,
  onTeacher,
}: {
  name: string;
  members: Util[];
  expanded: boolean;
  onToggle: () => void;
  onTeacher: (id: string) => void;
}) {
  const total = members.reduce((s, m) => s + m.open, 0),
    booked = members.reduce((s, m) => s + m.booked, 0);
  return (
    <>
      <tr className="group-row" onClick={onToggle}>
        <td>
          <button className="text-link">
            {expanded ? "▾" : "▸"} {name}
          </button>
        </td>
        <td>{total}</td>
        <td>{booked}</td>
        <td>{total - booked}</td>
        <td>{total ? Math.round((booked / total) * 100) : 0}%</td>
        <td>{total ? 100 - Math.round((booked / total) * 100) : 0}%</td>
      </tr>
      {expanded &&
        members.map((t) => (
          <tr key={t.id}>
            <td>
              <button
                className="text-link"
                style={{ paddingLeft: 20 }}
                onClick={() => onTeacher(t.id)}
              >
                {t.name}
              </button>
            </td>
            <td>{t.open}</td>
            <td>{t.booked}</td>
            <td>{t.open - t.booked}</td>
            <td>
              <div className="row">
                <div className="inline-meter">
                  <i style={{ width: `${t.ratio}%` }} />
                </div>
                {t.ratio}%
              </div>
            </td>
            <td>{100 - t.ratio}%</td>
          </tr>
        ))}
    </>
  );
}
function HeatRow({
  hour,
  data,
  onClick,
}: {
  hour: number;
  data: ReturnType<typeof useDemo>["data"];
  onClick: (day: number, time: string) => void;
}) {
  return (
    <>
      <small>{hour}:00</small>
      {Array.from({ length: 7 }, (_, d) => {
        const date = addDays("2026-10-26", d);
        const open = data.teachers.filter(
          (t) =>
            t.status !== "已离职" &&
            isRegularTime(t, date, `${String(hour).padStart(2, "0")}:00`, 25),
        ).length;
        const booked = data.lessons.filter(
          (l) =>
            l.date === date &&
            Number(l.time.split(":")[0]) === hour &&
            l.status !== "已取消",
        ).length;
        const value = open
          ? Math.min(100, Math.round((booked / open) * 100))
          : 0;
        return (
          <button
            key={d}
            aria-label={`周${d + 1} ${hour}:00 订课率 ${value}%`}
            className="heat-cell"
            style={{
              background: open
                ? `var(--ct-brand-${value > 75 ? 800 : value > 50 ? 500 : value > 25 ? 200 : 50})`
                : "var(--ct-gray-100)",
              color: value > 50 ? "var(--ct-white)" : "var(--ct-gray-700)",
            }}
            onClick={() => onClick(d, `${hour}:00`)}
          >
            {open ? `${value}%` : "—"}
          </button>
        );
      })}
    </>
  );
}
