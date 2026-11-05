import ListPagination, { useListPage } from "../../components/ListPagination";
import TeacherAttendance from "../../components/TeacherAttendance";
import TeacherFeedback from "../../components/TeacherFeedback";
import { formatMaterialProgress } from "@crazytalk/shared";
import TeacherSchedule from "../../components/TeacherSchedule";
import { DatePicker } from "@crazytalk/ui";
import DataTransferButton from "../../components/DataTransferButton";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Upload,
  Check,
  SlidersHorizontal,
  ArrowLeft,
  ArrowRight,
  Plus,
  AlertTriangle,
} from "lucide-react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  addDays,
  isRegularTime,
  availabilitySummary,
  type Teacher,
} from "@crazytalk/shared";
import {
  Select,
  WeeklyAvailabilityEditor,
  availabilityInputError,
  type AvailabilityValue,
  Avatar,
  defaultAvatarSource,
  Badge,
  Button,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchInput,
  StatCard,
  Tabs,
} from "@crazytalk/ui";
import { exportCsv, tone, useBusinessAction } from "./common";
import "./operations.css";
const defaultPhotos = [1, 2, 3, 4].map(
  (number) => `/avatars/avatar-${number}.webp`,
);
const trainingStatuses = ["未登记", "未完成", "已完成", "不适用"] as const;
const trainingFields = [
  { key: "newTutorTraining", label: "New Tutor Training" },
  { key: "rcTraining", label: "RC" },
  { key: "titTraining", label: "TIT" },
] as const;
function TeacherPhoto({
  teacher,
  size = 36,
}: {
  teacher: Teacher;
  size?: number;
}) {
  return teacher.photo ? (
    <img
      src={teacher.photo}
      alt={`${teacher.name}的照片`}
      style={{
        width: size,
        height: size,
        objectFit: "cover",
        borderRadius: "50%",
      }}
    />
  ) : (
    <Avatar name={teacher.name} size={size} />
  );
}
export default function Teachers() {
  const { data, can } = useDemo();
  const run = useBusinessAction();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const legacyView = params.get("view") || "";
  const status =
    params.get("status") ??
    (legacyView === "可排课"
      ? "在职"
      : ["在职", "培训中", "请假中", "已离职"].includes(legacyView)
        ? legacyView
        : "");
  const training =
    params.get("training") ??
    (legacyView === "可排课" && data.rules.trainingRequired ? "completed" : "");
  const requestedTab = params.get("tab");
  const tab =
    [
      "availability",
      "schedule",
      "students",
      "attendance",
      "feedback",
      "training",
    ].find((value) => value === requestedTab) || "availability";
  const q = params.get("q") || "";
  const teacher = data.teachers.find((t) => t.id === id);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [trainingOnly, setTrainingOnly] = useState(false);
  const [edit, setEdit] = useState<Teacher | null>(null);
  const certificateOptions = ["TEFL", "TESOL", "CELTA"];
  const certificates = [...new Set((edit?.certificates || "").split(/[、,，;；\n]/).map((value) => value.trim()).filter(Boolean))];
  const otherCertificates = certificates.filter((value) => !certificateOptions.includes(value.toUpperCase()));
  function toggleCertificate(option: string, checked: boolean) {
    if (!edit) return;
    const remaining = certificates.filter((value) => option === "其他"
      ? certificateOptions.includes(value.toUpperCase())
      : value.toUpperCase() !== option);
    setEdit({ ...edit, certificates: (checked ? [...remaining, option] : remaining).join("、") });
  }

  const [leave, setLeave] = useState(false);
  const [offboard, setOffboard] = useState(false);
  const [start, setStart] = useState(addDays(DEMO_TODAY, 1));
  const [end, setEnd] = useState(addDays(DEMO_TODAY, 7));
  const [reason, setReason] = useState("");
  const [cancel, setCancel] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({});
  const columns = [
    {
      key: "name",
      label: "老师",
      defaultVisible: true,
      render: (t: Teacher) => (
        <div className="row gap-12">
          <TeacherPhoto teacher={t} />
          <strong>{t.name}</strong>
        </div>
      ),
    },
    {
      key: "so",
      label: "SO",
      defaultVisible: true,
      render: (t: Teacher) => t.so || "—",
    },
    {
      key: "accent",
      label: "口音等级",
      defaultVisible: true,
      render: (t: Teacher) => t.accent || "—",
    },
    {
      key: "level",
      label: "导师等级",
      defaultVisible: true,
      render: (t: Teacher) => t.level || "—",
    },
    {
      key: "categories",
      label: "可教类别",
      defaultVisible: true,
      render: (t: Teacher) => t.categories.join("、") || "—",
    },
    {
      key: "availability",
      label: "可授课时间",
      defaultVisible: true,
      render: (t: Teacher) => (
        <>
          <span style={{ whiteSpace: "pre-line" }}>
            {availabilitySummary(t)}
          </span>
          <small>{t.needConfirm ? "排课前需确认" : "常规开放"}</small>
        </>
      ),
    },
    {
      key: "status",
      label: "在职状态",
      defaultVisible: true,
      render: (t: Teacher) => <Badge tone={tone(t.status)}>{t.status}</Badge>,
    },
    {
      key: "trained",
      label: "培训状态",
      defaultVisible: true,
      render: (t: Teacher) => (
        <Badge tone={t.trained ? "success" : "warning"}>
          {t.trained ? "已完成" : "未完成"}
        </Badge>
      ),
    },
    {
      key: "startDate",
      label: "开课日期",
      defaultVisible: false,
      render: (t: Teacher) => t.startDate || "—",
    },
    {
      key: "phone",
      label: "联系手机",
      defaultVisible: false,
      render: (t: Teacher) =>
        t.phone ? `${t.phone.slice(0, 3)}****${t.phone.slice(-4)}` : "—",
    },
    {
      key: "tags",
      label: "老师标签",
      defaultVisible: false,
      render: (t: Teacher) => t.tags.join("、") || "—",
    },
    {
      key: "bio",
      label: "老师介绍",
      defaultVisible: false,
      render: (t: Teacher) => t.bio || "—",
    },
    {
      key: "availabilityNote",
      label: "时间说明",
      defaultVisible: false,
      render: (t: Teacher) => t.availabilityNote || "—",
    },
    {
      key: "feedback",
      label: "近7天差评",
      defaultVisible: false,
      render: (t: Teacher) =>
        `${data.feedback.filter((f) => f.teacherId === t.id && f.rating === "差评" && f.date >= addDays(DEMO_TODAY, -6) && f.date <= DEMO_TODAY).length} 条`,
    },
  ];
  const visibleColumns = columns.filter(
    (column) => columnVisibility[column.key] ?? column.defaultVisible,
  );
  const [so, setSo] = useState("全部 SO");
  const [availabilityDraft, setAvailabilityDraft] =
    useState<AvailabilityValue | null>(null);
  const [pendingTeacher, setPendingTeacher] = useState<Teacher | null>(null);
  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    p.set(key, value);
    setParams(p);
  };
  const teacherFeedback = data.feedback.filter((f) => f.teacherId === id);
  const teacherStudents = data.students.filter((s) => s.teacherId === id);
  const upcoming = data.lessons.filter(
    (l) => l.teacherId === id && l.date >= DEMO_TODAY && l.status === "未开始",
  );
  const affected = upcoming.filter((l) => l.date >= start && l.date <= end);
  const filtered = data.teachers.filter(
    (t) =>
      (!params.get("project") ||
        data.students.some(
          (s) => s.teacherId === t.id && s.project === params.get("project"),
        ) ||
        data.lessons.some(
          (l) =>
            l.teacherId === t.id &&
            data.students.find((s) => s.id === l.studentId)?.project ===
              params.get("project"),
        )) &&
      (!status || t.status === status) &&
      (!training || (training === "completed" ? t.trained : !t.trained)) &&
      (so === "全部 SO" || t.so === so) &&
      `${t.name} ${t.so}`.toLowerCase().includes(q.toLowerCase()),
  );
  const listPage = useListPage(filtered);
  useEffect(() => {
    setAvailabilityDraft(null);
    setPendingTeacher(null);
  }, [id]);
  const newTeacher = (): Teacher => ({
    id: `t${Date.now()}`,
    name: "",
    photo: defaultPhotos[0],
    so: "BigBrains",
    accent: "B+",
    level: "B",
    categories: ["少儿"],
    status: "培训中",
    trained: false,
    needConfirm: false,
    phone: "",
    bio: "",
    rate: 180,
    availability: [],
    availabilityFrom: "",
    availabilityNote: "",
    availabilitySource: "entered",
    tags: [],
  });
  const availabilityValue: AvailabilityValue = availabilityDraft ||
    teacher || { availability: [], availabilityFrom: "", availabilityNote: "" };
  function affectedLessons(candidate: Teacher) {
    const current = data.teachers.find((item) => item.id === candidate.id);
    if (
      !current ||
      (JSON.stringify(current.availability) ===
        JSON.stringify(candidate.availability) &&
        current.availabilityFrom === candidate.availabilityFrom)
    )
      return [];
    return data.lessons.filter(
      (lesson) =>
        lesson.teacherId === candidate.id &&
        lesson.date >= DEMO_TODAY &&
        lesson.status === "未开始" &&
        isRegularTime(current, lesson.date, lesson.time, lesson.duration) &&
        !isRegularTime(candidate, lesson.date, lesson.time, lesson.duration),
    );
  }
  const availabilityCandidate: Teacher | null = teacher
    ? { ...teacher, ...availabilityValue, availabilitySource: "entered" }
    : null;
  const affectedByAvailability = availabilityCandidate
    ? affectedLessons(availabilityCandidate)
    : [];
  const pendingAffected = pendingTeacher ? affectedLessons(pendingTeacher) : [];
  function persistTeacher(candidate: Teacher) {
    run({ type: "teacher.save", teacher: candidate }, () => {
      setAvailabilityDraft(null);
      setPendingTeacher(null);
      setEdit(null);
      setTrainingOnly(false);
    });
  }
  function saveTeacher(candidate: Teacher) {
    if (affectedLessons(candidate).length) setPendingTeacher(candidate);
    else persistTeacher(candidate);
  }
  function saveAvailability() {
    if (availabilityCandidate) saveTeacher(availabilityCandidate);
  }
  return (
    <div className="stack">
      {teacher ? (
        <>
          <Link to="/teachers" className="row">
            <ArrowLeft size={16} />
            返回老师列表
          </Link>
          <Panel>
            <div className="row between teacher-profile-heading">
              <div className="row gap-16 teacher-profile-identity">
                <TeacherPhoto teacher={teacher} size={64} />
                <div>
                  <h1>
                    {teacher.name}{" "}
                    <Badge tone={tone(teacher.status)}>{teacher.status}</Badge>
                  </h1>
                  <p className="teacher-profile-intro">
                    {teacher.bio || "暂无介绍"}
                  </p>
                </div>
              </div>
              <div className="row">
                {can("teacher.leave") && teacher.status !== "已离职" && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setReason("");
                      setLeave(true);
                    }}
                  >
                    请假
                  </Button>
                )}
                {can("teacher.offboard") && teacher.status !== "已离职" && (
                  <Button
                    variant="ghost"
                    className="teacher-offboard-action"
                    onClick={() => {
                      setConfirmName("");
                      setReason("");
                      setOffboard(true);
                    }}
                  >
                    离职
                  </Button>
                )}
                {can("teacher.edit") && (
                  <Button
                    variant="primary"
                    onClick={() => setEdit({ ...teacher })}
                  >
                    编辑资料
                  </Button>
                )}
              </div>
            </div>
            <dl className="teacher-profile-grid" aria-label="老师基本资料">
              <div>
                <dt>SO</dt>
                <dd>{teacher.so}</dd>
              </div>
              <div>
                <dt>口音等级</dt>
                <dd>{teacher.accent || "未填写"}</dd>
              </div>
              <div>
                <dt>导师等级</dt>
                <dd>{teacher.level || "未填写"}</dd>
              </div>
              <div>
                <dt>在职状态</dt>
                <dd>{teacher.status}</dd>
              </div>
              <div>
                <dt>开课日期</dt>
                <dd>{teacher.startDate || "未填写"}</dd>
              </div>
              <div>
                <dt>联系方式</dt>
                <dd>
                  {teacher.phone
                    ? `${teacher.phone.slice(0, 3)}****${teacher.phone.slice(-4)}`
                    : "未填写"}
                </dd>
              </div>
              <div>
                <dt>能教的类别</dt>
                <dd>{teacher.categories.join("、")}</dd>
              </div>
              <div>
                <dt>证书</dt>
                <dd>{teacher.certificates || "未填写"}</dd>
              </div>
              <div>
                <dt>老师标签</dt>
                <dd>{teacher.tags.join("、") || "未填写"}</dd>
              </div>
              <div>
                <dt>备注</dt>
                <dd style={{ whiteSpace: "pre-wrap" }}>
                  {teacher.notes || "未填写"}
                </dd>
              </div>
              <div>
                <dt>排课限制</dt>
                <dd>
                  {teacher.needConfirm ? "排课前需先与老师确认" : "无额外限制"}
                </dd>
              </div>
            </dl>
          </Panel>
          <div className="grid-4">
            <StatCard
              label="名下学员"
              value={teacherStudents.length}
              note="正在跟进的学员"
            />
            <StatCard
              label="接下来的课程"
              value={upcoming.length}
              note="已排课程"
            />
            <StatCard
              label="近期差评"
              value={teacherFeedback.filter((f) => f.rating === "差评").length}
              note="结合具体原因判断"
            />
            <StatCard
              label="培训状态"
              value={teacher.trained ? "已完成" : "未完成"}
              note="视频培训完成情况"
            />
          </div>
          <Panel>
            <Tabs
              variant="underline"
              value={tab}
              onChange={(v) => update("tab", v)}
              items={[
                { value: "availability", label: "可上课时间" },
                { value: "schedule", label: "课表" },
                { value: "students", label: "学员" },
                { value: "attendance", label: "考勤" },
                { value: "feedback", label: "反馈" },
                { value: "training", label: "培训记录" },
              ]}
            />
            <div style={{ marginTop: 24 }}>
              {tab === "availability" ? (
                <div className="stack">
                  <WeeklyAvailabilityEditor
                    heading="每周常规可用时间"
                    key={teacher.id}
                    value={availabilityValue}
                    disabled={!can("availability.edit")}
                    legacy={teacher.availabilitySource === "legacy"}
                    onChange={setAvailabilityDraft}
                  />
                  {availabilityDraft && affectedByAvailability.length > 0 && (
                    <div className="notice">
                      <AlertTriangle size={18} />
                      调整后有 {affectedByAvailability.length}{" "}
                      节已排课程超出常规时间。课程会保留，请与教务协调。
                    </div>
                  )}
                  <div className="row wrap">
                    {can("availability.edit") && (
                      <Button
                        variant="primary"
                        disabled={
                          Boolean(availabilityInputError(availabilityValue)) ||
                          (!availabilityDraft &&
                            teacher.availabilitySource !== "legacy")
                        }
                        onClick={saveAvailability}
                      >
                        保存可用时间
                      </Button>
                    )}
                  </div>
                </div>
              ) : tab === "schedule" ? (
                <TeacherSchedule key={teacher.id} teacherId={teacher.id} />
              ) : tab === "students" ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>学员</th>
                        <th>项目</th>
                        <th>负责教务</th>
                        <th>教材进度</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherStudents.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <Link to={`/students/${s.id}`}>{s.name}</Link>
                          </td>
                          <td>{s.project || "—"}</td>
                          <td>{s.owner || "—"}</td>
                          <td>{formatMaterialProgress(s.material, s.unit)}</td>
                          <td>
                            <Badge tone="success">{s.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!teacherStudents.length && (
                    <EmptyState title="还没有名下学员" />
                  )}
                </div>
              ) : tab === "attendance" ? (
                <TeacherAttendance key={teacher.id} teacherId={teacher.id} />
              ) : tab === "feedback" ? (
                <TeacherFeedback key={teacher.id} teacherId={teacher.id} />
              ) : tab === "training" ? (
                <div className="stack">
                  <dl className="detail-pairs teacher-training-pairs">
                    <dt>培训状态（视频培训）</dt>
                    <dd>{teacher.trained ? "已完成" : "未完成"}</dd>
                    <dt>quiz 成绩</dt>
                    <dd>
                      {teacher.quizScore == null
                        ? "未登记"
                        : `${teacher.quizScore} 分`}
                    </dd>
                    {trainingFields.map((field) => (
                      <div key={field.key} style={{ display: "contents" }}>
                        <dt>{field.label}</dt>
                        <dd>{teacher[field.key] || "未登记"}</dd>
                      </div>
                    ))}
                    <dt>老师培训</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>
                      {teacher.teacherTraining || "未登记"}
                    </dd>
                  </dl>
                  <div className="row">
                    {(can("training.edit") || can("teacher.edit")) && (
                      <Button
                        onClick={() => {
                          setTrainingOnly(true);
                          setEdit({ ...teacher });
                        }}
                      >
                        编辑培训记录
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </Panel>
          {tab === "availability" && (
            <Panel>
              <div className="stack">
                <h3>请假记录</h3>
                {data.leaves.filter((l) => l.teacherId === teacher.id)
                  .length ? (
                  data.leaves
                    .filter((l) => l.teacherId === teacher.id)
                    .map((l) => (
                      <div key={l.id} className="inset row between">
                        <span>
                          {l.start} 至 {l.end} · {l.reason}
                        </span>
                        <Badge tone={tone(l.status)}>{l.status}</Badge>
                      </div>
                    ))
                ) : (
                  <p className="muted">暂无请假记录</p>
                )}
              </div>
            </Panel>
          )}
        </>
      ) : (
        <>
          <PageHeader
            title="老师中心"
            description="了解老师的时间与教学情况，为学员找到合适的人选。"
            action={
              <>
                {can("teacher.export") && (
                  <DataTransferButton
                    direction="export"
                    size="sm"
                    onClick={() =>
                      exportCsv("老师档案", [
                        ["老师", "SO", "状态", "能教的类别", "可上课时间"],
                        ...filtered.map((t) => [
                          t.name,
                          t.so,
                          t.status,
                          t.categories.join("、"),
                          availabilitySummary(t),
                        ]),
                      ])
                    }
                  />
                )}
                {can("teacher.create") && (
                  <Button
                    variant="primary"
                    onClick={() => setEdit(newTeacher())}
                  >
                    <Plus size={16} />
                    新建老师
                  </Button>
                )}
              </>
            }
          />
          <Panel>
            <div className="toolbar">
              <SearchInput
                value={q}
                onChange={(v) => update("q", v)}
                placeholder="搜索老师姓名"
              />
              <Select
                className="ops-filter-select"
                aria-label="筛选 SO"
                value={so}
                onValueChange={(value) => setSo(value)}
              >
                <option>全部 SO</option>
                {Array.from(new Set(data.teachers.map((t) => t.so))).map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </Select>
              <Select
                aria-label="任职状态"
                value={status}
                onValueChange={(value) => {
                  const next = new URLSearchParams(params);
                  next.delete("view");
                  next.set("status", value);
                  next.set("training", training);
                  setParams(next);
                }}
              >
                <option value="">全部任职状态</option>
                {["在职", "培训中", "请假中", "已离职"].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="培训状态"
                value={training}
                onValueChange={(value) => {
                  const next = new URLSearchParams(params);
                  next.delete("view");
                  next.set("status", status);
                  next.set("training", value);
                  setParams(next);
                }}
              >
                <option value="">全部培训状态</option>
                <option value="completed">已完成培训</option>
                <option value="incomplete">未完成培训</option>
              </Select>
              {params.get("project") && (
                <small>项目：{params.get("project")}</small>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSo("全部 SO");
                  setParams({});
                }}
              >
                清除全部筛选
              </Button>
              <small style={{ marginLeft: "auto" }}>
                共 {filtered.length} 位老师
              </small>
              <Button
                size="sm"
                aria-expanded={columnsOpen}
                onClick={() => setColumnsOpen(!columnsOpen)}
              >
                <SlidersHorizontal size={14} />
                显示列
              </Button>
            </div>
            {columnsOpen && (
              <div className="inset row wrap" style={{ marginBottom: 16 }}>
                {columns.map((column) => (
                  <label className="select-row" key={column.key}>
                    <input
                      type="checkbox"
                      checked={
                        columnVisibility[column.key] ?? column.defaultVisible
                      }
                      disabled={column.key === "name"}
                      onChange={(event) =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [column.key]: event.target.checked,
                        }))
                      }
                    />
                    {column.label}
                  </label>
                ))}
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setColumnVisibility({})}
                >
                  恢复默认
                </Button>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {listPage.rows.map((t) => (
                    <tr
                      key={t.id}
                      className="ops-click-row"
                      onClick={() => navigate(`/teachers/${t.id}`)}
                    >
                      {visibleColumns.map((column) => (
                        <td key={column.key}>{column.render(t)}</td>
                      ))}
                      <td>
                        <ArrowRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              total={filtered.length}
              page={listPage.page}
              onChange={listPage.setPage}
            />
            {!filtered.length && (
              <EmptyState
                title="没有符合条件的老师"
                action={
                  <Button
                    onClick={() => {
                      setSo("全部 SO");
                      setParams({});
                    }}
                  >
                    清除筛选
                  </Button>
                }
              />
            )}
          </Panel>
        </>
      )}
      <Modal
        drawer={!trainingOnly}
        open={!!edit}
        onClose={() => {
          setEdit(null);
          setTrainingOnly(false);
        }}
        title={
          trainingOnly
            ? "编辑培训记录"
            : data.teachers.some((t) => t.id === edit?.id)
              ? "编辑老师"
              : "新建老师"
        }
        width={560}
        footer={
          <>
            <Button
              onClick={() => {
                setEdit(null);
                setTrainingOnly(false);
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              disabled={
                photoLoading ||
                Boolean(
                  edit?.quizScore != null &&
                    (!Number.isFinite(edit.quizScore) ||
                      edit.quizScore < 0 ||
                      edit.quizScore > 100),
                ) ||
                (!trainingOnly &&
                  (!edit?.name.trim() ||
                    !edit?.so ||
                    !edit.categories.length ||
                    Boolean(edit && availabilityInputError(edit))))
              }
              onClick={() =>
                edit &&
                saveTeacher(
                  trainingOnly
                    ? {
                        ...(data.teachers.find((t) => t.id === edit.id) ||
                          edit),
                        trained: edit.trained,
                        quizScore: edit.quizScore,
                        newTutorTraining: edit.newTutorTraining,
                        rcTraining: edit.rcTraining,
                        titTraining: edit.titTraining,
                        teacherTraining: edit.teacherTraining,
                      }
                    : {
                        ...edit,
                        photo: edit.photo || defaultAvatarSource(edit.name),
                        tags: edit.tags
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                        availabilitySource: can("availability.edit")
                          ? "entered"
                          : edit.availabilitySource,
                      },
                )
              }
            >
              {trainingOnly ? "保存培训记录" : "保存老师"}
            </Button>
          </>
        }
      >
        {edit && (
          <div className="stack">
            {!trainingOnly && (
              <>
                <fieldset
                  disabled={!can("teacher.edit")}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                  className="stack"
                >
                  <h3>基本资料</h3>
                  <Field label="英文名" required>
                    <input
                      value={edit.name}
                      onChange={(e) =>
                        setEdit({ ...edit, name: e.target.value })
                      }
                      placeholder="输入老师姓名"
                    />
                  </Field>
                  <Field label="SO" required>
                    <Select
                      value={edit.so}
                      onValueChange={(value) => setEdit({ ...edit, so: value })}
                    >
                      {data.catalog
                        .filter((c) => c.type === "SO" && c.enabled)
                        .map((c) => (
                          <option key={c.id}>{c.name}</option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="照片">
                    <div className="teacher-photo-picker">
                      <div className="teacher-photo-upload">
                        <TeacherPhoto teacher={edit} size={72} />
                        <div className="teacher-photo-upload-content">
                          <strong>
                            {edit.photo && !defaultPhotos.includes(edit.photo)
                              ? "自定义照片"
                              : "默认头像"}
                          </strong>
                          <small>支持 PNG、JPG、WebP，大小不超过 1 MB</small>
                          <Button
                            size="sm"
                            disabled={photoLoading}
                            onClick={() => photoInputRef.current?.click()}
                          >
                            <Upload size={16} />
                            {photoLoading
                              ? "正在读取…"
                              : edit.photo &&
                                  !defaultPhotos.includes(edit.photo)
                                ? "更换照片"
                                : "上传照片"}
                          </Button>
                        </div>
                      </div>
                      <div className="teacher-photo-default-label">
                        或选择默认头像
                      </div>
                      <div
                        className="teacher-avatar-options"
                        role="group"
                        aria-label="默认头像"
                      >
                        {defaultPhotos.map((photo, index) => (
                          <button
                            type="button"
                            key={photo}
                            className="teacher-avatar-option"
                            aria-label={`默认头像 ${index + 1}`}
                            aria-pressed={
                              (edit.photo || defaultAvatarSource(edit.name)) ===
                              photo
                            }
                            disabled={photoLoading}
                            onClick={() => {
                              setPhotoError("");
                              setEdit({ ...edit, photo });
                            }}
                          >
                            <img src={photo} alt="" />
                            <span>头像 {index + 1}</span>
                            {(edit.photo || defaultAvatarSource(edit.name)) ===
                              photo && (
                              <span className="teacher-avatar-check">
                                <Check size={12} />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      <input
                        ref={photoInputRef}
                        type="file"
                        hidden
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="上传老师照片"
                        disabled={photoLoading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (!file) return;
                          setPhotoError("");
                          if (
                            !["image/png", "image/jpeg", "image/webp"].includes(
                              file.type,
                            ) ||
                            file.size > 1024 * 1024
                          ) {
                            setPhotoError(
                              "请选择 1 MB 以内的 PNG、JPG 或 WebP 图片",
                            );
                            return;
                          }
                          const teacherId = edit.id;
                          const reader = new FileReader();
                          setPhotoLoading(true);
                          reader.onload = () => {
                            const photo = reader.result;
                            if (typeof photo === "string")
                              setEdit((current) =>
                                current?.id === teacherId
                                  ? { ...current, photo }
                                  : current,
                              );
                            setPhotoLoading(false);
                          };
                          reader.onerror = () => {
                            setPhotoLoading(false);
                            setPhotoError("照片读取失败，请重新选择");
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      {photoError && (
                        <p className="teacher-photo-error" role="alert">
                          {photoError}
                        </p>
                      )}
                      {edit.photo && !defaultPhotos.includes(edit.photo) && (
                        <Button
                          size="xs"
                          disabled={photoLoading}
                          onClick={() => {
                            setPhotoError("");
                            setEdit({ ...edit, photo: defaultPhotos[0] });
                          }}
                        >
                          使用默认头像
                        </Button>
                      )}
                    </div>
                  </Field>
                  <Field label="开课日期">
                    <DatePicker
                      placeholder="开课日期"
                      mode="date"
                      value={edit.startDate || ""}
                      onValueChange={(startDate) =>
                        setEdit({ ...edit, startDate })
                      }
                    />
                  </Field>
                  <Field label="在职状态">
                    <Select
                      value={edit.status}
                      disabled={
                        edit.status === "请假中" || edit.status === "已离职"
                      }
                      onValueChange={(value) => {
                        const status = (["在职", "培训中"] as const).find(
                          (item) => item === value,
                        );
                        if (status) setEdit({ ...edit, status });
                      }}
                    >
                      {["在职", "培训中", "请假中", "已离职"].map((status) => (
                        <option
                          key={status}
                          disabled={status === "请假中" || status === "已离职"}
                        >
                          {status}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="联系手机">
                    <input
                      value={edit.phone}
                      onChange={(e) =>
                        setEdit({ ...edit, phone: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="能教的类别" required>
                    <div className="row wrap">
                      {["少儿", "成人", "商务", "雅思", "零基础", "托福"].map(
                        (c) => (
                          <label key={c} className="select-row">
                            <input
                              type="checkbox"
                              checked={edit.categories.includes(c)}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  categories: e.target.checked
                                    ? [...edit.categories, c]
                                    : edit.categories.filter((x) => x !== c),
                                })
                              }
                            />
                            {c}
                          </label>
                        ),
                      )}
                    </div>
                  </Field>
                  <div className="form-grid">
                    <Field label="口音等级">
                      <Select
                        value={edit.accent}
                        onValueChange={(value) =>
                          setEdit({ ...edit, accent: value })
                        }
                      >
                        {["A", "B+", "B", "C"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="导师等级">
                      <Select
                        value={edit.level}
                        onValueChange={(value) =>
                          setEdit({ ...edit, level: value })
                        }
                      >
                        {["A", "B+", "B", "C"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="老师介绍">
                    <textarea
                      value={edit.bio}
                      onChange={(e) =>
                        setEdit({ ...edit, bio: e.target.value })
                      }
                    />
                  </Field>
                  <div role="group" aria-label="证书" className="stack">
                    <span>证书</span>
                    <div className="row wrap">
                      {[...certificateOptions, "其他"].map((option) => (
                        <label className="select-row" key={option}>
                          <input
                            type="checkbox"
                            checked={option === "其他" ? otherCertificates.length > 0 : certificates.some((value) => value.toUpperCase() === option)}
                            onChange={(event) => toggleCertificate(option, event.target.checked)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                    {otherCertificates.some((value) => value !== "其他") && (
                      <small className="muted">其他证书：{otherCertificates.filter((value) => value !== "其他").join("、")}</small>
                    )}
                  </div>
                  <Field label="老师标签">
                    <input
                      value={edit.tags.join("、")}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          tags: e.target.value.split(/[、,，]/),
                        })
                      }
                      placeholder="多个标签用顿号分隔"
                    />
                  </Field>
                  <Field label="备注">
                    <textarea
                      value={edit.notes || ""}
                      onChange={(e) =>
                        setEdit({ ...edit, notes: e.target.value })
                      }
                    />
                  </Field>
                </fieldset>
                <div className="stack-sm">
                  <h3>每周常规可用时间</h3>
                  <WeeklyAvailabilityEditor
                    key={edit.id}
                    value={edit}
                    disabled={!can("availability.edit")}
                    legacy={edit.availabilitySource === "legacy"}
                    onChange={(value) =>
                      setEdit({
                        ...edit,
                        ...value,
                        availabilitySource: "entered",
                      })
                    }
                  />
                  {affectedLessons(edit).length > 0 && (
                    <p className="notice">
                      有 {affectedLessons(edit).length}{" "}
                      节已排课程超出调整后的时间。保存后课程会保留，请与教务协调。
                    </p>
                  )}
                </div>
                <label className="select-row">
                  <input
                    type="checkbox"
                    disabled={!can("teacher.edit")}
                    checked={edit.needConfirm}
                    onChange={(e) =>
                      setEdit({ ...edit, needConfirm: e.target.checked })
                    }
                  />
                  排课前需要先和老师确认
                </label>
              </>
            )}
            <fieldset
              disabled={!can("training.edit") && !can("teacher.edit")}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              className="stack"
            >
              <h3>培训记录</h3>
              <label className="select-row">
                <input
                  type="checkbox"
                  checked={edit.trained}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      trained: e.target.checked,
                    })
                  }
                />
                视频培训已完成
              </label>
              <Field label="quiz 成绩">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={edit.quizScore ?? ""}
                  placeholder="未登记"
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      quizScore:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              {edit.quizScore != null &&
                (edit.quizScore < 0 || edit.quizScore > 100) && (
                  <p role="alert">quiz 成绩需在 0–100 分之间</p>
                )}
              {trainingFields.map((field) => (
                <Field key={field.key} label={field.label}>
                  <Select
                    value={edit[field.key] || "未登记"}
                    onValueChange={(value) => {
                      const status = trainingStatuses.find(
                        (item) => item === value,
                      );
                      if (status) setEdit({ ...edit, [field.key]: status });
                    }}
                  >
                    {trainingStatuses.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </Select>
                </Field>
              ))}
              <Field label="老师培训">
                <textarea
                  value={edit.teacherTraining || ""}
                  onChange={(e) =>
                    setEdit({ ...edit, teacherTraining: e.target.value })
                  }
                  placeholder="填写培训记录或说明"
                />
              </Field>
            </fieldset>
          </div>
        )}
      </Modal>
      <Modal
        open={!!pendingTeacher}
        onClose={() => setPendingTeacher(null)}
        title="确认调整可上课时间"
        footer={
          <>
            <Button onClick={() => setPendingTeacher(null)}>返回修改</Button>
            <Button
              variant="primary"
              onClick={() => pendingTeacher && persistTeacher(pendingTeacher)}
            >
              确认保存，保留现有课程
            </Button>
          </>
        }
      >
        <div className="stack">
          <p>
            有 <strong>{pendingAffected.length}</strong>{" "}
            节课不在新的开放时间内。保存后仍保留这些课，请与教务协调。
          </p>
          <div className="inset stack-sm">
            {pendingAffected.slice(0, 8).map((l) => (
              <div className="row between" key={l.id}>
                <span>
                  {l.date} {l.time}
                </span>
                <span>
                  {data.students.find((s) => s.id === l.studentId)?.name}
                </span>
              </div>
            ))}
            {pendingAffected.length > 8 && (
              <small>还有 {pendingAffected.length - 8} 节课</small>
            )}
          </div>
          <p className="muted">
            请告知负责教务调整课程，避免老师在无法授课的时间上课。
          </p>
        </div>
      </Modal>
      <Modal
        open={leave && !!teacher}
        onClose={() => setLeave(false)}
        title={`${teacher?.name} 请假`}
        footer={
          <>
            <Button onClick={() => setLeave(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!reason.trim() || end < start}
              onClick={() =>
                teacher &&
                run(
                  {
                    type: "teacher.leave",
                    teacherId: teacher.id,
                    start,
                    end,
                    reason,
                    cancelLessons: cancel,
                  },
                  () => setLeave(false),
                )
              }
            >
              确认请假
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="form-grid">
            <Field label="开始日期" required>
              <DatePicker
                placeholder="开始日期"
                mode="date"
                min={DEMO_TODAY}
                value={start}
                onValueChange={(nextValue) => setStart(nextValue)}
              />
            </Field>
            <Field label="结束日期" required>
              <DatePicker
                placeholder="结束日期"
                mode="date"
                min={start}
                value={end}
                onValueChange={(nextValue) => setEnd(nextValue)}
              />
            </Field>
          </div>
          <Field label="原因" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="notice">
            <AlertTriangle size={18} />
            <span>
              这段时间有 {affected.length} 节课受影响，涉及{" "}
              {new Set(affected.map((l) => l.studentId)).size} 位学员。
            </span>
          </div>
          <label className="select-row">
            <input
              type="radio"
              checked={!cancel}
              onChange={() => setCancel(false)}
            />
            先保留课程，由负责人逐个调整
          </label>
          <label className="select-row">
            <input
              type="radio"
              checked={cancel}
              onChange={() => setCancel(true)}
            />
            全部取消，不扣学员课时
          </label>
        </div>
      </Modal>
      <Modal
        open={offboard && !!teacher}
        onClose={() => setOffboard(false)}
        title={`办理 ${teacher?.name} 离职`}
        width={440}
        footer={
          <>
            <Button onClick={() => setOffboard(false)}>取消</Button>
            <Button
              variant="danger-solid"
              disabled={confirmName !== teacher?.name || !reason.trim()}
              onClick={() =>
                teacher &&
                run(
                  {
                    type: "teacher.offboard",
                    teacherId: teacher.id,
                    confirmName,
                    reason,
                  },
                  () => setOffboard(false),
                )
              }
            >
              确认离职
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="notice">
            <AlertTriangle size={18} />
            <span>
              确认后老师不能再排课，以后的 {upcoming.length}{" "}
              节课将取消。请提前通知相关学员。
            </span>
          </div>
          <Field label="离职原因" required>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Field label={`输入老师姓名 ${teacher?.name} 确认`} required>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
