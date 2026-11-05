import CourseSyncLink from "../../components/CourseSyncLink";
import { lessonStatusLabel } from "../../lib/lessonStatus";
import { compareLessonRecords, isOverdueLesson } from "../../lib/lessonOrder";
import ListPagination from "../../components/ListPagination";
import {
  recordAttendance as lessonRecordAttendance,
  attendanceIssue,
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
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const recordAttendance = (lesson: Lesson) =>
    lessonRecordAttendance(lesson, now);
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "all";
  const view = params.get("view") || "all";
  const query = params.get("q") || "";
  const statusFilter = lessonStatusLabel(params.get("status") || "");
  const filteredStudentId =
    data.studentIdAliases?.[params.get("student") || ""] ??
    params.get("student");
  const [detailId, setDetailId] = useState("");
  const [decision, setDecision] = useState<{
    id: string;
    kind: "扣课" | "不扣" | "缺席";
  } | null>(null);
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
        (!params.get("project") ||
          student(l.studentId)?.project === params.get("project")) &&
        (!params.get("bookingStatus") || l.status === params.get("bookingStatus")) &&
        (!params.get("attendance") ||
          recordAttendance(l).includes(params.get("attendance") || "")) &&
        (view !== "attendance" ||
          (l.status !== "已取消" &&
            (Boolean(l.studentIn) || l.attendance === "学员缺席"))) &&
        (view !== "unsynced" || l.sync === "未同步") &&
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
    { label: "总约课数", value: filtered.length, icon: CalendarDays, tone: "total" },
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
  function resolve(l: Lesson, kind: "扣课" | "不扣" | "缺席") {
    setReason(
      kind === "不扣"
        ? ""
        : kind === "缺席"
          ? "学员缺席，教务确认扣课数量"
          : "教务确认已上课",
    );
    setUnits(l.confirmedUnits === undefined ? "" : String(l.confirmedUnits));
    setDecision({ id: l.id, kind });
  }
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
        <small className="lesson-summary-note">当前筛选范围 · 包含全部分页；待确认及历史缺席记录计入总约课数，未计入已完成。</small>
      </section>
      {(params.has("from") ||
        params.has("status") ||
        params.has("bookingStatus") ||
        params.has("attendance") ||
        params.has("student")) && (
        <Panel>
          <div className="row between">
            <small>
              {params.get("student")
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
                <th>时长</th>
                <th>课程类型</th>
                <th>学员</th>
                <th>老师</th>
                <th>状态</th>
                <th>考勤</th>
                <th>课时</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr key={l.id} aria-label={`课程 ${l.id}`}>
                  <td>
                    <button
                      className="text-link"
                      onClick={() => setDetailId(l.id)}
                    >
                      {formatDate(l.date)} {l.time}
                    </button>
                  </td>
                  <td>{l.duration} 分钟</td>
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
                        onClick={() => {
                          if (l.attendance === "账号待关联") {
                            setLinkId(l.id);
                            setLinkStudent(l.studentId);
                          } else
                            resolve(
                              l,
                              l.attendance === "老师缺席"
                                ? "不扣"
                                : l.attendance === "学员缺席"
                                  ? "缺席"
                                  : "扣课",
                            );
                        }}
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
              ))}
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
            action={
              <Button
                onClick={() => {
                  setParams({ tab: "all" });
                }}
              >
                清除筛选
              </Button>
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
        open={!!detail}
        onClose={() => setDetailId("")}
        title="课程详情"
        width={560}
        footer={
          detail && (
            <>
              {can("lesson.correct") && (
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
                <Button variant="primary">登记反馈</Button>
              </Link>
            </>
          )
        }
      >
        {detail && (
          <div className="stack">
            <CourseSyncLink lesson={detail} detail />
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
        title={decision?.kind === "不扣" ? "确认不扣课时" : "确认扣课数量"}
        footer={
          <>
            <Button onClick={() => setDecision(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={
                !reason.trim() ||
                (decision?.kind !== "不扣" &&
                  (!units.trim() ||
                    !Number.isFinite(Number(units)) ||
                    Number(units) <= 0))
              }
              onClick={() =>
                decision &&
                run(
                  {
                    type: "lesson.resolve",
                    ids: [decision.id],
                    decision: decision.kind,
                    reason,
                    ...(decision.kind !== "不扣"
                      ? { units: Number(units) }
                      : {}),
                  },
                  () => setDecision(null),
                )
              }
            >
              {decision?.kind === "不扣" ? "确认不扣" : "确认扣课"}
            </Button>
          </>
        }
      >
        {deciding && (
          <div className="stack">
            <p>
              {student(deciding.studentId)?.name} ·{" "}
              {teacher(deciding.teacherId)?.name}
            </p>
            <p>
              {formatDate(deciding.date)} {deciding.time} · {deciding.duration}{" "}
              分钟 · {deciding.attendance}
            </p>
            <p>
              老师进入：{deciding.teacherIn || "暂无数据"} · 学员进入：
              {deciding.studentIn || "暂无数据"}
            </p>
            <p>
              当前剩余 {student(deciding.studentId)?.balance ?? "—"}{" "}
              课时。确认后可在 10 秒内撤销。
            </p>
            <Field label="处理结果">
              <Select
                value={decision?.kind || "扣课"}
                onValueChange={(value) => {
                  if (value === "扣课" || value === "不扣" || value === "缺席")
                    resolve(deciding, value);
                }}
              >
                <option value="扣课">正常扣课</option>
                <option value="缺席">学员缺席，确认扣课</option>
                <option value="不扣">不扣课时</option>
              </Select>
            </Field>
          </div>
        )}
        {decision?.kind !== "不扣" && (
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
        <Field label="请说明原因" required>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：老师未到场，已与家长确认"
          />
        </Field>
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
              onClick={() =>
                run(
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
              disabled={!reason.trim()}
              onClick={() =>
                detail &&
                run(
                  {
                    type: "lesson.correct",
                    id: detail.id,
                    deduct,
                    reason,
                    ...(deduct && !detail.deducted
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
          <Field label="正确结果">
            <Select
              value={deduct ? "yes" : "no"}
              onValueChange={(value) => setDeduct(value === "yes")}
            >
              <option value="yes">正常扣课时</option>
              <option value="no">不扣课时</option>
            </Select>
          </Field>
          {deduct && !detail?.deducted && (
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
