import FeedbackHistory from "../../components/FeedbackHistory";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../../components/DataTransferButton";
import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  MessageSquarePlus,
  Pencil,
  Plus,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import { type Feedback as FeedbackRecord } from "@crazytalk/shared";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  Tabs,
} from "@crazytalk/ui";
import FeedbackEditor, {
  customerProgresses,
  processingResults,
  feedbackCategories,
  feedbackGrades,
  feedbackStages,
  OptionalSelect,
} from "./FeedbackEditor";
import { exportCsv, money, tone, useBusinessAction } from "./common";
import "./operations.css";
import "./feedback.css";

function Value({
  label,
  children,
  wide = false,
}: {
  label: string;
  children?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`feedback-value ${wide ? "is-wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children || <span className="muted">未填写</span>}</dd>
    </div>
  );
}
function TeacherMeasures({ feedback }: { feedback: FeedbackRecord }) {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const [open, setOpen] = useState(false);
  const [measures, setMeasures] = useState<string[]>(["提醒"]);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(50);
  const [separate, setSeparate] = useState(false);
  const actions = data.actions.filter(
    (action) => action.feedbackId === feedback.id,
  );
  return (
    <Panel
      title="关联处理措施"
      action={
        can("feedback.verdict") && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} />
            添加处理措施
          </Button>
        )
      }
    >
      <p className="ops-subtitle">
        好评与已完成的反馈也可以继续记录鼓励、培训等措施；不会覆盖原表的判定结果。
      </p>
      {actions.length ? (
        <div className="feedback-history">
          {actions.map((action) => (
            <div key={action.id}>
              <div className="row between">
                <strong>
                  {action.type}
                  {action.amount > 0 && can("field.pay_amount")
                    ? ` · ${money(action.amount)}`
                    : ""}
                </strong>
                <Badge tone={tone(action.status)}>{action.status}</Badge>
              </div>
              <p>{action.reason}</p>
              <small>{action.date}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="feedback-empty-note">暂无关联处理措施。</p>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="添加处理措施"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={
                !note.trim() ||
                !measures.length ||
                (measures.includes("扣款") && amount <= 0)
              }
              onClick={() =>
                run(
                  {
                    type: "feedback.measures",
                    id: feedback.id,
                    measures,
                    amount: measures.includes("扣款") ? amount : 0,
                    note,
                    separateDeduction: separate,
                    deductionConfirmed: can("teacher_action.deduct"),
                  },
                  () => {
                    setOpen(false);
                    setNote("");
                    setSeparate(false);
                  },
                )
              }
            >
              保存处理措施
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="处理措施">
            <div className="ops-measures">
              {[
                "提醒",
                "培训",
                "警告信",
                "最后警告",
                "鼓励",
                "表扬",
                ...(can("teacher_action.deduct") || can("teacher_action.create")
                  ? ["扣款"]
                  : []),
              ].map((item) => (
                <label className="select-row" key={item}>
                  <input
                    type="checkbox"
                    checked={measures.includes(item)}
                    onChange={(event) =>
                      setMeasures((current) =>
                        event.target.checked
                          ? [...current, item]
                          : current.filter((value) => value !== item),
                      )
                    }
                  />
                  {item}
                </label>
              ))}
            </div>
          </Field>
          {measures.includes("扣款") && (
            <>
              <Field label="扣款金额（菲律宾比索）">
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
              </Field>
              <div className="notice">
                <div>
                  请先核对同一事件的考勤和反馈扣款，避免重复记录。
                  {data.actions
                    .filter(
                      (action) =>
                        action.teacherId === feedback.teacherId &&
                        action.type === "扣款" &&
                        action.status !== "已作废",
                    )
                    .map((action) => (
                      <p key={action.id}>
                        {action.date} ·{" "}
                        {can("field.pay_amount")
                          ? money(action.amount)
                          : "已有扣款"}{" "}
                        · {action.reason}
                      </p>
                    ))}
                  <label className="select-row">
                    <input
                      type="checkbox"
                      checked={separate}
                      onChange={(event) => setSeparate(event.target.checked)}
                    />
                    已确认是另一件事，需要单独扣款
                  </label>
                </div>
              </div>
            </>
          )}
          <Field label="措施说明" required>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="记录原因、具体安排和需要跟进的事项"
            />
          </Field>
        </div>
      </Modal>
    </Panel>
  );
}
export function Processing({
  feedback,
  onDirtyChange,
}: {
  feedback: FeedbackRecord;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { can } = useDemo();
  const run = useBusinessAction();
  const [progress, setProgress] = useState(feedback.customerProgress);
  const [customerResult, setCustomerResult] = useState(feedback.customerResult);
  const [customerNote, setCustomerNote] = useState(feedback.processNote);
  const [joint, setJoint] = useState(feedback.jointVerdict);
  const [result, setResult] = useState(feedback.tmResult);
  const [date, setDate] = useState(feedback.tmDate);
  const [tmNote, setTMNote] = useState(feedback.tmNote);
  const [followSection, setFollowSection] = useState<"客服处理" | "TM跟进">(
    can("feedback.process") ? "客服处理" : "TM跟进",
  );
  const [follow, setFollow] = useState("");
  const dirty =
    progress !== feedback.customerProgress ||
    customerResult !== feedback.customerResult ||
    customerNote !== feedback.processNote ||
    joint !== feedback.jointVerdict ||
    result !== feedback.tmResult ||
    date !== feedback.tmDate ||
    tmNote !== feedback.tmNote ||
    !!follow;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  return (
    <>
      <Panel
        title="客服处理"
        action={!can("feedback.process") && <Badge>仅查看</Badge>}
      >
        {can("feedback.process") ? (
          <div className="stack">
            <div className="feedback-form-grid">
              <Field label="客服处理进度">
                <OptionalSelect
                  label="客服处理进度"
                  value={progress}
                  onChange={setProgress}
                  options={customerProgresses}
                />
              </Field>
              <Field label="客服处理结果">
                <OptionalSelect
                  label="客服处理结果"
                  value={customerResult}
                  onChange={setCustomerResult}
                  options={processingResults}
                />
              </Field>
            </div>
            <Field label="客服备注">
              <textarea
                rows={3}
                value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)}
                placeholder="记录核实情况、与家长的沟通及后续安排"
              />
            </Field>
            <div className="row wrap">
              <Button
                variant="primary"
                onClick={() =>
                  run({
                    type: "feedback.customer",
                    id: feedback.id,
                    progress,
                    result: customerResult,
                    note: customerNote,
                  })
                }
              >
                保存客服处理
              </Button>
              <small>处理进度与处理结果分别记录。</small>
            </div>
          </div>
        ) : (
          <dl className="feedback-value-grid">
            <Value label="客服处理进度">{feedback.customerProgress}</Value>
            <Value label="客服处理结果">{feedback.customerResult}</Value>
            <Value label="客服备注" wide>
              {feedback.processNote}
            </Value>
          </dl>
        )}
      </Panel>
      <Panel
        title="TM 判定与跟进"
        action={!can("feedback.verdict") && <Badge>仅查看</Badge>}
      >
        {can("feedback.verdict") ? (
          <div className="stack">
            <div className="feedback-form-grid">
              <Field label="客服&TM判定结果">
                <OptionalSelect
                  label="客服&TM判定结果"
                  value={joint}
                  onChange={setJoint}
                  options={feedbackGrades}
                />
              </Field>
              <Field label="TM判定">
                <OptionalSelect
                  label="TM判定"
                  value={result}
                  onChange={setResult}
                  options={processingResults}
                />
              </Field>
              <Field label="TM处理日期">
                <DatePicker
                  mode="date"
                  value={date}
                  onValueChange={(nextValue) => setDate(nextValue)}
                />
              </Field>
            </div>
            <Field label="TM跟进记录">
              <textarea
                rows={4}
                value={tmNote}
                onChange={(event) => setTMNote(event.target.value)}
                placeholder="记录核实依据、判定说明及后续跟进"
              />
            </Field>
            <div className="row wrap">
              <Button
                variant="primary"
                onClick={() =>
                  run({
                    type: "feedback.tm",
                    id: feedback.id,
                    jointVerdict: joint,
                    result,
                    date,
                    note: tmNote,
                  })
                }
              >
                保存 TM 判定
              </Button>
              <small>
                “处理成功／处理失败”保留原表含义，不会自动结束反馈。
              </small>
            </div>
          </div>
        ) : (
          <dl className="feedback-value-grid">
            <Value label="客服&TM判定结果">{feedback.jointVerdict}</Value>
            <Value label="TM判定">{feedback.tmResult}</Value>
            <Value label="TM处理日期">{feedback.tmDate}</Value>
            <Value label="TM跟进记录" wide>
              {feedback.tmNote}
            </Value>
          </dl>
        )}
      </Panel>
      <Panel title="跟进历史">
        {(can("feedback.process") || can("feedback.verdict")) && (
          <div className="feedback-follow-form">
            <Field label="记录归属">
              <Select
                value={followSection}
                onValueChange={(value) => {
                  if (value === "客服处理" || value === "TM跟进")
                    setFollowSection(value);
                }}
              >
                {can("feedback.process") && <option>客服处理</option>}
                {can("feedback.verdict") && <option>TM跟进</option>}
              </Select>
            </Field>
            <Field label="追加跟进内容">
              <textarea
                value={follow}
                onChange={(event) => setFollow(event.target.value)}
                placeholder="补充新的沟通结果，不覆盖此前记录"
              />
            </Field>
            <Button
              disabled={!follow.trim()}
              onClick={() =>
                run(
                  {
                    type: "feedback.followUp",
                    id: feedback.id,
                    section: followSection,
                    content: follow,
                  },
                  () => setFollow(""),
                )
              }
            >
              添加跟进
            </Button>
          </div>
        )}
        <FeedbackHistory entries={feedback.followUps} />
      </Panel>
    </>
  );
}
const columnOptions = [
  { id: "source", label: "项目／渠道" },
  { id: "owner", label: "教务" },
  { id: "grade", label: "反馈阶段／等级" },
  { id: "customer", label: "客服处理" },
  { id: "tm", label: "TM 判定" },
];
export default function Feedback() {
  const { data, can } = useDemo();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const run = useBusinessAction();
  const [editor, setEditor] = useState<"new" | "edit" | null>(
    params.get("new") === "1" ? "new" : null,
  );
  const [more, setMore] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState(columnOptions.map((item) => item.id));
  const [preview, setPreview] = useState<string | null>(null);
  const tab = params.get("tab") === "actions" ? "actions" : "records";
  const view = params.get("view") || "全部";
  const query = params.get("q") || "";
  const feedback = data.feedback.find((item) => item.id === id);
  const student = (studentId: string) =>
    data.students.find((item) => item.id === studentId);
  const teacher = (teacherId: string) =>
    data.teachers.find((item) => item.id === teacherId);
  const source = (item: FeedbackRecord) => item.source;
  const teacherLabel = (item: FeedbackRecord) => item.teacherName;
  const so = (item: FeedbackRecord) => item.so;
  useEffect(() => {
    if (params.get("new") === "1") setEditor("new");
  }, [params]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  };
  const closeEditor = () => {
    setEditor(null);
    if (params.has("new")) {
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next);
    }
  };
  const filtered = data.feedback
    .filter(
      (item) =>
        (!params.get("from") || item.date >= params.get("from")!) &&
        (!params.get("to") || item.date <= params.get("to")!) &&
        (!params.get("project") || source(item) === params.get("project")) &&
        (!params.get("owner") || item.owner === params.get("owner")) &&
        (!params.get("teacher") || item.teacherId === params.get("teacher")) &&
        (!params.get("so") || so(item) === params.get("so")) &&
        (!params.get("rating") || item.rating === params.get("rating")) &&
        (!params.get("grade") || item.grade === params.get("grade")) &&
        (!params.get("stage") || item.stage === params.get("stage")) &&
        (!params.get("customer") ||
          item.customerProgress === params.get("customer")) &&
        (!params.get("tm") || item.tmResult === params.get("tm")) &&
        (!params.get("category") ||
          feedbackCategories(item).some((path) =>
            path.includes(params.get("category")!),
          )) &&
        (view === "全部" ||
          (view === "未完成" && item.status !== "已完成") ||
          (view === "等我处理"
            ? item.status === "待处理"
            : item.status === view)) &&
        (!query ||
          `${student(item.studentId)?.code} ${student(item.studentId)?.name} ${teacherLabel(item)} ${item.content} ${feedbackCategories(item).join(" ")} ${item.processNote} ${item.tmNote} ${item.followUps.map((entry) => entry.content).join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase())),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const exportRecords = () =>
    exportCsv("学生反馈", [
      [
        "反馈日期",
        "项目/渠道",
        "教务",
        "学员名称",
        "反馈阶段",
        "反馈等级",
        "一级分类",
        "二级分类",
        "三级分类",
        "评价分类",
        "学员反馈（原话）",
        "老师名字 Tutor Name",
        "SO",
        "客服处理进度",
        "客服备注",
        "客服处理结果",
        "截图",
        "客服&TM判定结果",
        "TM判定",
        "TM处理日期",
        "TM跟进记录",
      ],
      ...filtered.map((item) => {
        const paths = feedbackCategories(item).map((path) =>
          path.split(/\s*\/\s*/),
        );
        return [
          item.date,
          source(item),
          item.owner,
          `${student(item.studentId)?.code || ""} ${student(item.studentId)?.name || ""}`.trim(),
          item.stage,
          item.grade,
          ...[0, 1, 2].map((index) =>
            [...new Set(paths.map((path) => path[index]).filter(Boolean))].join(
              "；",
            ),
          ),
          item.rating,
          item.content,
          teacherLabel(item),
          so(item),
          item.customerProgress,
          item.processNote,
          item.customerResult,
          item.screenshots.map((shot) => shot.name).join("；"),
          item.jointVerdict,
          item.tmResult,
          item.tmDate,
          item.tmNote,
        ];
      }),
    ]);
  const activeFilters = [
    "from",
    "to",
    "project",
    "owner",
    "teacher",
    "so",
    "rating",
    "grade",
    "stage",
    "customer",
    "tm",
    "category",
  ].some((key) => params.has(key));
  return (
    <div className="stack">
      {feedback ? (
        <>
          <Link className="row muted" to="/feedback">
            <ArrowLeft size={14} />
            返回反馈列表
          </Link>
          <PageHeader
            title={`${student(feedback.studentId)?.code || ""} ${student(feedback.studentId)?.name || "学员"} 的反馈`}
            description={`${feedback.date} · 教务 ${feedback.owner} · ${teacherLabel(feedback)}`}
            action={
              <>
                {feedback.grade && <Badge>{feedback.grade}</Badge>}
                <Badge tone={feedback.rating === "好评" ? "success" : "danger"}>
                  {feedback.rating}
                </Badge>
                {can("feedback.create") && (
                  <Button size="sm" onClick={() => setEditor("edit")}>
                    <Pencil size={14} />
                    编辑反馈资料
                  </Button>
                )}
              </>
            }
          />
          <div className="feedback-record-layout">
            <div className="stack">
              <Panel title="基本信息">
                <dl className="feedback-value-grid">
                  <Value label="反馈日期">{feedback.date}</Value>
                  <Value label="项目／渠道">{source(feedback)}</Value>
                  <Value label="教务">{feedback.owner}</Value>
                  <Value label="学员名称">
                    <Link to={`/students/${feedback.studentId}`}>
                      {student(feedback.studentId)?.code}{" "}
                      {student(feedback.studentId)?.name}
                    </Link>
                  </Value>
                  <Value label="老师名字 Tutor Name">
                    <Link to={`/teachers/${feedback.teacherId}`}>
                      {teacherLabel(feedback)}
                    </Link>
                  </Value>
                  <Value label="SO">{so(feedback)}</Value>
                </dl>
              </Panel>
              <Panel title="反馈内容">
                <dl className="feedback-value-grid">
                  <Value label="反馈阶段">{feedback.stage}</Value>
                  <Value label="反馈等级">{feedback.grade}</Value>
                  <Value label="评价分类">{feedback.rating}</Value>
                </dl>
                <div className="feedback-classification-table table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>一级分类</th>
                        <th>二级分类</th>
                        <th>三级分类</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedbackCategories(feedback).length ? (
                        feedbackCategories(feedback).map((path) => (
                          <tr key={path}>
                            {[0, 1, 2].map((index) => (
                              <td key={index}>
                                {path.split(/\s*\/\s*/)[index] || "—"}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3}>未填写问题分类</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <dl className="feedback-value-grid">
                  <Value label="学员反馈（原话）" wide>
                    {feedback.content}
                  </Value>
                  <Value label="截图" wide>
                    {feedback.screenshots.length ? (
                      <div className="feedback-screenshots">
                        {feedback.screenshots.map((shot) => (
                          <div key={shot.id}>
                            <button
                              onClick={() => setPreview(shot.dataUrl)}
                              aria-label={`预览 ${shot.name}`}
                            >
                              <img src={shot.dataUrl} alt={shot.name} />
                            </button>
                            <small>{shot.name}</small>
                          </div>
                        ))}
                      </div>
                    ) : undefined}
                  </Value>
                </dl>
              </Panel>
              <Processing key={feedback.id} feedback={feedback} />
              <TeacherMeasures
                key={`measures-${feedback.id}`}
                feedback={feedback}
              />
            </div>
            <aside className="stack feedback-context">
              <Panel title="关联课程">
                {feedback.lessonId &&
                data.lessons.find(
                  (lesson) => lesson.id === feedback.lessonId,
                ) ? (
                  (() => {
                    const lesson = data.lessons.find(
                      (item) => item.id === feedback.lessonId,
                    )!;
                    return (
                      <div className="stack-sm">
                        <strong>
                          {lesson.date} {lesson.time}
                        </strong>
                        <p>
                          {lesson.duration} 分钟 · {lesson.material}
                        </p>
                        <Badge tone={tone(lesson.attendance)}>
                          {lesson.attendance}
                        </Badge>
                        <p>
                          老师：{lesson.teacherIn || "未收到进教室记录"} —{" "}
                          {lesson.teacherOut || "未收到离开记录"}
                        </p>
                        <p>
                          学员：{lesson.studentIn || "未收到进教室记录"} —{" "}
                          {lesson.studentOut || "未收到离开记录"}
                        </p>
                        <Link
                          to={`/lessons?tab=all&q=${encodeURIComponent(student(feedback.studentId)?.code || "")}`}
                        >
                          查看上课记录 →
                        </Link>
                      </div>
                    );
                  })()
                ) : (
                  <p className="muted">
                    未关联具体课程。可编辑反馈资料后补充，不影响记录其他反馈信息。
                  </p>
                )}
              </Panel>
              <Panel title="同一老师的其他反馈">
                <div className="stack-sm">
                  {data.feedback
                    .filter(
                      (item) =>
                        item.teacherId === feedback.teacherId &&
                        item.id !== feedback.id,
                    )
                    .slice(0, 4)
                    .map((item) => (
                      <Link
                        className="feedback-related"
                        to={`/feedback/${item.id}`}
                        key={item.id}
                      >
                        <strong>
                          {student(item.studentId)?.name} · {item.rating}
                        </strong>
                        <small>
                          {item.date} ·{" "}
                          {item.content || item.category || "未填写原话"}
                        </small>
                      </Link>
                    ))}
                  {!data.feedback.some(
                    (item) =>
                      item.teacherId === feedback.teacherId &&
                      item.id !== feedback.id,
                  ) && <p className="muted">暂无其他反馈。</p>}
                </div>
              </Panel>
            </aside>
          </div>
        </>
      ) : id ? (
        <EmptyState
          title="没有找到这条反馈"
          action={
            <Button onClick={() => navigate("/feedback")}>返回反馈列表</Button>
          }
        />
      ) : (
        <>
          <PageHeader
            title="反馈"
            description="登记学生反馈，查看客服处理与 TM 跟进结果。"
            action={
              <>
                {can("feedback.export") && (
                  <DataTransferButton
                    direction="export"
                    size="sm"
                    onClick={exportRecords}
                  />
                )}
                {can("feedback.create") && (
                  <Button variant="primary" onClick={() => setEditor("new")}>
                    <MessageSquarePlus size={16} />
                    登记反馈
                  </Button>
                )}
              </>
            }
          />
          <Tabs
            value={tab}
            onChange={(value) => update("tab", value)}
            items={[
              {
                value: "records",
                label: "反馈记录",
                count: data.feedback.length,
              },
              {
                value: "actions",
                label: "处理措施",
                count: data.actions.filter(
                  (action) =>
                    action.type === "扣款" && action.status === "待确认",
                ).length,
              },
            ]}
          />
          {params.has("from") && (
            <Panel>
              <div className="row between wrap">
                <small>
                  看板筛选：{params.get("from")} 至 {params.get("to")} ·{" "}
                  {params.get("project") || "全部项目"} ·{" "}
                  {params.get("category") || params.get("rating") || view}
                </small>
                <Button size="sm" onClick={() => setParams({ view: "全部" })}>
                  清除筛选
                </Button>
              </div>
            </Panel>
          )}
          {tab !== "actions" ? (
            <Panel>
              <div className="feedback-list-tools">
                <SearchInput
                  value={query}
                  onChange={(value) => update("q", value)}
                  placeholder="搜索学员、老师、反馈或跟进内容"
                />
                <div className="row">
                  <Button size="sm" onClick={() => setMore((value) => !value)}>
                    <SlidersHorizontal size={14} />
                    {more ? "收起筛选" : "更多筛选"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setColumnsOpen((value) => !value)}
                  >
                    显示列
                  </Button>
                </div>
              </div>
              <div className="feedback-filters">
                <Field label="起始日期">
                  <DatePicker
                    mode="date"
                    value={params.get("from") || ""}
                    onValueChange={(nextValue) => update("from", nextValue)}
                  />
                </Field>
                <Field label="结束日期">
                  <DatePicker
                    mode="date"
                    value={params.get("to") || ""}
                    onValueChange={(nextValue) => update("to", nextValue)}
                  />
                </Field>
                <Field label="项目／渠道筛选">
                  <OptionalSelect
                    label="项目／渠道筛选"
                    value={params.get("project") || ""}
                    onChange={(value) => update("project", value)}
                    options={data.feedback.map(source)}
                    placeholder="全部项目／渠道"
                  />
                </Field>
                <Field label="评价分类筛选">
                  <OptionalSelect
                    label="评价分类筛选"
                    value={params.get("rating") || ""}
                    onChange={(value) => update("rating", value)}
                    options={["好评", "差评"]}
                    placeholder="全部评价"
                  />
                </Field>
                <Field label="客服处理进度筛选">
                  <OptionalSelect
                    label="客服处理进度筛选"
                    value={params.get("customer") || ""}
                    onChange={(value) => update("customer", value)}
                    options={customerProgresses}
                    placeholder="全部进度"
                  />
                </Field>
                <Field label="TM判定筛选">
                  <OptionalSelect
                    label="TM判定筛选"
                    value={params.get("tm") || ""}
                    onChange={(value) => update("tm", value)}
                    options={processingResults}
                    placeholder="全部判定"
                  />
                </Field>
              </div>
              {more && (
                <div className="feedback-filters">
                  <Field label="教务筛选">
                    <OptionalSelect
                      label="教务筛选"
                      value={params.get("owner") || ""}
                      onChange={(value) => update("owner", value)}
                      options={data.feedback.map((item) => item.owner)}
                      placeholder="全部教务"
                    />
                  </Field>
                  <Field label="老师筛选">
                    <Select
                      value={params.get("teacher") || ""}
                      onValueChange={(value) => update("teacher", value)}
                      searchable
                    >
                      <option value="">全部老师</option>
                      {data.teachers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="SO筛选">
                    <OptionalSelect
                      label="SO筛选"
                      value={params.get("so") || ""}
                      onChange={(value) => update("so", value)}
                      options={data.feedback.map(so)}
                      placeholder="全部 SO"
                    />
                  </Field>
                  <Field label="反馈阶段筛选">
                    <OptionalSelect
                      label="反馈阶段筛选"
                      value={params.get("stage") || ""}
                      onChange={(value) => update("stage", value)}
                      options={feedbackStages}
                      placeholder="全部阶段"
                    />
                  </Field>
                  <Field label="反馈等级筛选">
                    <OptionalSelect
                      label="反馈等级筛选"
                      value={params.get("grade") || ""}
                      onChange={(value) => update("grade", value)}
                      options={feedbackGrades}
                      placeholder="全部等级"
                    />
                  </Field>
                  <Field label="问题分类筛选">
                    <OptionalSelect
                      label="问题分类筛选"
                      value={params.get("category") || ""}
                      onChange={(value) => update("category", value)}
                      options={data.feedback.flatMap(feedbackCategories)}
                      placeholder="全部分类"
                    />
                  </Field>
                </div>
              )}
              {columnsOpen && (
                <div className="feedback-column-options">
                  {columnOptions.map((option) => (
                    <label key={option.id}>
                      <input
                        type="checkbox"
                        checked={columns.includes(option.id)}
                        onChange={(event) =>
                          setColumns((current) =>
                            event.target.checked
                              ? [...current, option.id]
                              : current.filter((value) => value !== option.id),
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              )}
              <div className="feedback-list-summary">
                <Tabs
                  variant="chips"
                  value={view}
                  onChange={(value) => update("view", value)}
                  items={[
                    { value: "全部", label: "全部" },
                    { value: "未完成", label: "未完成" },
                    { value: "已完成", label: "已完成" },
                  ]}
                />
                <div className="row">
                  {activeFilters && !params.has("from") && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setParams({ view: "全部" })}
                    >
                      <X size={12} />
                      清除筛选
                    </Button>
                  )}
                  <small>共 {filtered.length} 条反馈</small>
                </div>
              </div>
              <div className="table-wrap">
                <table className="feedback-records-table">
                  <thead>
                    <tr>
                      <th>反馈日期</th>
                      <th>学员</th>
                      {columns.includes("source") && <th>项目／渠道</th>}
                      {columns.includes("owner") && <th>教务</th>}
                      <th>老师／SO</th>
                      <th>反馈摘要</th>
                      {columns.includes("grade") && <th>阶段／等级</th>}
                      {columns.includes("customer") && <th>客服处理</th>}
                      {columns.includes("tm") && <th>TM 判定</th>}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr
                        key={item.id}
                        className="ops-click-row"
                        onClick={() => navigate(`/feedback/${item.id}`)}
                      >
                        <td>
                          {item.date}
                          <small>
                            {item.repeat && (
                              <Badge tone="warning">重复反馈</Badge>
                            )}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {student(item.studentId)?.code}{" "}
                            {student(item.studentId)?.name}
                          </strong>
                        </td>
                        {columns.includes("source") && (
                          <td>{source(item) || "—"}</td>
                        )}
                        {columns.includes("owner") && (
                          <td>{item.owner || "—"}</td>
                        )}
                        <td>
                          {teacherLabel(item)}
                          <small>{so(item) || "—"}</small>
                        </td>
                        <td>
                          <Badge
                            tone={item.rating === "好评" ? "success" : "danger"}
                          >
                            {item.rating}
                          </Badge>
                          <strong className="feedback-summary-text">
                            {feedbackCategories(item)
                              .map((path) => path.split(" / ").at(-1))
                              .join("、") || "未填写问题分类"}
                          </strong>
                          <small className="feedback-summary-text">
                            {item.content || "未填写学员原话"}
                          </small>
                        </td>
                        {columns.includes("grade") && (
                          <td>
                            {item.grade || "—"}
                            <small>{item.stage || "—"}</small>
                          </td>
                        )}
                        {columns.includes("customer") && (
                          <td>
                            {item.customerProgress ? (
                              <Badge tone={tone(item.customerProgress)}>
                                {item.customerProgress}
                              </Badge>
                            ) : (
                              <span className="muted">未填写</span>
                            )}
                            <small>{item.customerResult || "未填写结果"}</small>
                          </td>
                        )}
                        {columns.includes("tm") && (
                          <td>
                            {item.tmResult || "未填写"}
                            <small>{item.tmDate || ""}</small>
                          </td>
                        )}
                        <td>
                          <Link
                            to={`/feedback/${item.id}`}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`查看 ${student(item.studentId)?.name} 的反馈`}
                          >
                            <ArrowRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length && (
                <EmptyState
                  title="没有符合条件的反馈"
                  description="可以清除筛选条件，或登记新的反馈。"
                  action={
                    <Button onClick={() => setParams({ view: "全部" })}>
                      清除筛选
                    </Button>
                  }
                />
              )}
            </Panel>
          ) : (
            <Panel
              title="老师处理措施"
              action={
                <Badge tone="warning">
                  {
                    data.actions.filter(
                      (action) =>
                        action.type === "扣款" && action.status === "待确认",
                    ).length
                  }{" "}
                  笔扣款待确认
                </Badge>
              }
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>老师</th>
                      <th>措施</th>
                      <th>说明</th>
                      <th>金额</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.actions.map((action) => (
                      <tr key={action.id}>
                        <td>{action.date}</td>
                        <td>{teacher(action.teacherId)?.name}</td>
                        <td>{action.type}</td>
                        <td>{action.reason}</td>
                        <td>
                          {action.amount && can("field.pay_amount")
                            ? money(action.amount)
                            : "—"}
                        </td>
                        <td>
                          <Badge tone={tone(action.status)}>
                            {action.status}
                          </Badge>
                        </td>
                        <td>
                          {action.type === "扣款" &&
                          action.status === "待确认" &&
                          can("teacher_action.confirm") ? (
                            <div className="row">
                              <Button
                                size="xs"
                                onClick={() =>
                                  run({
                                    type: "action.confirm",
                                    id: action.id,
                                    approve: true,
                                  })
                                }
                              >
                                确认计入薪资
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                  run({
                                    type: "action.confirm",
                                    id: action.id,
                                    approve: false,
                                  })
                                }
                              >
                                作废
                              </Button>
                            </div>
                          ) : action.feedbackId ? (
                            <Link to={`/feedback/${action.feedbackId}`}>
                              查看反馈
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.actions.length && <EmptyState title="暂无处理措施" />}
            </Panel>
          )}
        </>
      )}
      {editor && can("feedback.create") && (
        <FeedbackEditor
          key={`${editor}-${feedback?.id || "new"}`}
          record={editor === "edit" ? feedback : undefined}
          studentId={params.get("student") || ""}
          lessonId={params.get("lesson") || ""}
          onClose={closeEditor}
          onSaved={closeEditor}
        />
      )}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="截图预览"
        width={850}
      >
        {preview && (
          <img
            className="feedback-preview-image"
            src={preview}
            alt="反馈截图预览"
          />
        )}
      </Modal>
    </div>
  );
}
