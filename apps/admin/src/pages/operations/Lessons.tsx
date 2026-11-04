import { lessonSyncReason } from "../../lib/lessonSync";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../../components/DataTransferButton";
import { occurred } from "../../lib/dashboard";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Clock3 } from "lucide-react";
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
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "all";
  const view = params.get("view") || "all";
  const query = params.get("q") || "";
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
  const [selected, setSelected] = useState<string[]>([]);
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
        (!params.get("attendance") ||
          l.attendance === params.get("attendance")) &&
        (view !== "attendance" ||
          (l.status !== "已取消" &&
            (Boolean(l.studentIn) || l.attendance === "学员缺席"))) &&
        (view !== "unsynced" || l.sync === "未同步") &&
        (view !== "conflict" || l.conflict) &&
        (!query ||
          `${student(l.studentId)?.name} ${student(l.studentId)?.groupName} ${teacher(l.teacherId)?.name}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
    );
  const pending = matching.filter((l) => l.status === "待确认");
  const filtered = matching.filter((l) =>
    tab === "confirm"
      ? l.status === "待确认"
      : !params.get("status") || l.status === params.get("status"),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
  const eligible = (l: Lesson) =>
    l.status === "待确认" &&
    l.attendance === "正常" &&
    Number.isFinite(l.confirmedUnits) &&
    (l.confirmedUnits ?? 0) > 0;
  const selectable = visible.filter(eligible);
  const selectedLessons = filtered.filter(
    (l) => selected.includes(l.id) && eligible(l),
  );
  const deciding = data.lessons.find((l) => l.id === decision?.id);
  useEffect(() => {
    setSelected([]);
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
                    l.status,
                    l.deducted ? "已扣" : "未扣",
                  ]),
                ])
              }
            />
          ) : null
        }
      />
      {(params.has("from") ||
        params.has("status") ||
        params.has("attendance") ||
        params.has("student")) && (
        <Panel>
          <div className="row between">
            <small>
              {params.get("student")
                ? `学生：${student(filteredStudentId || "")?.name || "未知学生"}`
                : `看板筛选：${params.get("from") || ""} 至 ${params.get("to") || ""}`}{" "}
              · {params.get("project") || "全部项目"} ·{" "}
              {params.get("status") ||
                params.get("attendance") ||
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
        <small>上课时间均为北京时间</small>
      </div>
      <Panel>
        <div className="toolbar">
          <SearchInput
            value={query}
            onChange={(v) => update("q", v)}
            placeholder="搜索学生名字、群名或老师"
          />
          <DatePicker
            aria-label="开始日期"
            mode="date"
            value={params.get("from") || ""}
            onValueChange={(v) => update("from", v)}
          />
          <span className="muted">至</span>
          <DatePicker
            aria-label="结束日期"
            mode="date"
            value={params.get("to") || ""}
            onValueChange={(v) => update("to", v)}
          />
          <Select
            aria-label="处理状态"
            value={tab === "confirm" ? "待确认" : params.get("status") || ""}
            onValueChange={(v) => {
              const next = new URLSearchParams(params);
              next.set("status", v);
              next.set("tab", "all");
              setParams(next);
            }}
          >
            <option value="">全部状态</option>
            {[...new Set(scopedLessons.map((l) => l.status))].map((v) => (
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
            {[...new Set(scopedLessons.map((l) => l.attendance))].map((v) => (
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
        {can("lesson.confirm") && (
          <div className="lesson-batch-bar">
            {selectedLessons.length ? (
              <>
                <span>
                  已选 {selectedLessons.length} 条 · 核实扣课共{" "}
                  {selectedLessons.reduce(
                    (sum, l) => sum + (l.confirmedUnits ?? 0),
                    0,
                  )}{" "}
                  课时
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    run(
                      {
                        type: "lesson.resolve",
                        ids: selectedLessons.map((l) => l.id),
                        decision: "扣课",
                        reason: "正常上完，批量确认",
                      },
                      () => setSelected([]),
                    )
                  }
                >
                  批量确认
                </Button>
              </>
            ) : (
              <small>
                仅正常出勤且已核实扣课数量的待确认记录支持批量确认；其余记录请逐条核实。
              </small>
            )}
          </div>
        )}
        <div className="table-wrap lesson-records-table">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="选择本页可批量确认的课程"
                    disabled={!can("lesson.confirm") || !selectable.length}
                    type="checkbox"
                    checked={
                      selectable.length > 0 &&
                      selectable.every((l) => selected.includes(l.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? selectable.map((l) => l.id) : [],
                      )
                    }
                  />
                </th>
                <th>上课时间</th>
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
                <tr key={l.id}>
                  <td>
                    <input
                      aria-label={`选择课程 ${l.id}`}
                      disabled={!can("lesson.confirm") || !eligible(l)}
                      type="checkbox"
                      checked={selected.includes(l.id)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, l.id]
                            : s.filter((id) => id !== l.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      className="text-link"
                      onClick={() => setDetailId(l.id)}
                    >
                      {formatDate(l.date)} {l.time}
                    </button>
                    <small>
                      {l.duration} 分钟 · {l.kind}
                    </small>
                    {l.sync === "未同步" && (
                      <div className="ops-reason">
                        <Badge tone="warning">未同步</Badge>{" "}
                        {lessonSyncReason(l)}{" "}
                        {can("sync.retry") && (
                          <Button
                            size="xs"
                            onClick={() =>
                              run({ type: "lesson.retry", id: l.id })
                            }
                          >
                            重新同步
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
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
                    <Badge tone={tone(l.status)}>{l.status}</Badge>
                    {l.leaveFlag && <Badge tone="warning">老师请假</Badge>}
                  </td>
                  <td>
                    <Badge
                      tone={l.attendance === "正常" ? "success" : "warning"}
                    >
                      {l.attendance}
                    </Badge>
                    {l.conflict && <small>时间冲突</small>}
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
        {pageCount > 1 && (
          <div className="row between lesson-pagination">
            <small>
              第 {currentPage} / {pageCount} 页 · 每页 20 条
            </small>
            <div className="row">
              <Button
                size="sm"
                disabled={currentPage === 1}
                onClick={() => {
                  setPage(currentPage - 1);
                  setSelected([]);
                }}
              >
                上一页
              </Button>
              <Button
                size="sm"
                disabled={currentPage === pageCount}
                onClick={() => {
                  setPage(currentPage + 1);
                  setSelected([]);
                }}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
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
            <div>
              <h2>{student(detail.studentId)?.name}</h2>
              <p className="muted">
                {formatDate(detail.date)} {detail.time} · {detail.duration} 分钟
                · {teacher(detail.teacherId)?.name}
              </p>
            </div>
            {detail.sync === "未同步" && (
              <div className="notice">
                <AlertTriangle size={18} />
                <div>
                  {lessonSyncReason(detail)}
                  {can("sync.retry") && (
                    <div style={{ marginTop: 12 }}>
                      <Button
                        size="sm"
                        onClick={() =>
                          run({ type: "lesson.retry", id: detail.id })
                        }
                      >
                        重新同步
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <dl className="detail-pairs">
              <dt>教材</dt>
              <dd>{detail.material}</dd>
              <dt>课程状态</dt>
              <dd>
                <Badge tone={tone(detail.status)}>{detail.status}</Badge>
              </dd>
              <dt>老师进出</dt>
              <dd>
                {detail.teacherIn || "暂无"} — {detail.teacherOut || "暂无"}
              </dd>
              <dt>学员进出</dt>
              <dd>
                {detail.studentIn || "暂无"} — {detail.studentOut || "暂无"}
              </dd>
              <dt>课时结果</dt>
              <dd>
                {detail.deducted
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
              <p style={{ marginTop: 12 }}>
                {detail.note || "按原计划上课，暂无变更。"}
              </p>
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
