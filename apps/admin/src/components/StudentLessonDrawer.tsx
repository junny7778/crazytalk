import { formatStudentProgress } from "@crazytalk/shared";
import { useEffect, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  type Lesson,
  teacherName,
  lessonSchema,
  canSubmitLessonReport,
} from "@crazytalk/shared";
import {
  Badge,
  Button,
  Drawer,
  Field,
  Modal,
  Select,
  useToast,
} from "@crazytalk/ui";

export function reportSubmittedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未记录"
    : date.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
}

export function lessonEnd(time: string, duration: number) {
  const [hour, minute] = time.split(":").map(Number);
  const end = hour * 60 + minute + duration;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}${end >= 1440 ? "（次日）" : ""}`;
}

export function lessonCharge(lesson: Lesson) {
  if (lesson.deducted)
    return lesson.confirmedUnits === undefined
      ? "已扣，数量待核实"
      : `已扣 ${lesson.confirmedUnits} 课时`;
  return lesson.status === "待确认" || lesson.status === "未开始"
    ? "待确认"
    : "未扣课时";
}

export function StudentLessonDrawer({
  lessonId,
  onClose,
  onReschedule,
}: {
  lessonId: string | null;
  onClose: () => void;
  onReschedule?: (lessonId: string) => void;
}) {
  const { data, can, act } = useDemo();
  const toast = useToast();
  const [editing, setEditing] = useState<
    "correct" | "cancel" | "report" | null
  >(null);
  const [deduct, setDeduct] = useState(true);
  const [units, setUnits] = useState("");
  const [reason, setReason] = useState("");
  const [reportMaterial, setReportMaterial] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [responsibility, setResponsibility] = useState<
    "学员" | "老师" | "平台"
  >("学员");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attendance, setAttendance] = useState<Lesson["attendance"]>("正常");
  const [result, setResult] = useState<"已完成" | "缺席">("已完成");
  const [discard, setDiscard] = useState<"close" | "back" | null>(null);
  const lesson = data.lessons.find((item) => item.id === lessonId);
  useEffect(() => {
    setEditing(null);
    setError("");
    setReason("");
    setUnits("");
    setDiscard(null);
  }, [lessonId]);
  if (!lesson) return null;
  const student = data.students.find((item) => item.id === lesson.studentId);
  const report = data.reports.find((item) => item.lessonId === lesson.id);
  const changes = data.events
    .filter(
      (event) =>
        event.relatedType === "lesson" && event.relatedId === lesson.id,
    )
    .slice()
    .reverse();
  const beforeDeducted = lesson.deducted ? lesson.confirmedUnits : 0;
  const newDeducted = deduct
    ? units.trim() === ""
      ? undefined
      : Number(units)
    : 0;
  const previewBalance =
    student?.balanceKnown &&
    beforeDeducted !== undefined &&
    newDeducted !== undefined &&
    Number.isFinite(newDeducted)
      ? Math.round((student.balance + beforeDeducted - newDeducted) * 1e8) / 1e8
      : undefined;
  const pending = lesson.status === "待确认";
  const editableFacts = lesson.status === "已完成" || lesson.status === "缺席";
  const canCorrect =
    lesson.date <= DEMO_TODAY &&
    lesson.status !== "未开始" &&
    can(pending ? "lesson.confirm" : "lesson.correct");
  const canChange =
    lesson.status === "未开始" &&
    lesson.date >= DEMO_TODAY &&
    can("student.reschedule") &&
    !["停课", "结课", "退费"].includes(student?.status || "");
  const dirty =
    editing === "cancel"
      ? !!reason.trim() || responsibility !== "学员"
      : editing === "correct" &&
        (!!reason.trim() ||
          deduct !== (lesson.deducted || pending) ||
          (editableFacts &&
            (attendance !== lesson.attendance || result !== lesson.status)) ||
          units !==
            (lesson.confirmedUnits === undefined
              ? ""
              : String(lesson.confirmedUnits)));
  function requestClose(action: "close" | "back") {
    if (
      dirty ||
      (editing === "report" &&
        (reason.trim() ||
          reportMaterial !== report?.material ||
          reportFrom !== report?.from ||
          reportTo !== report?.to))
    ) {
      setDiscard(action);
      return;
    }
    setEditing(null);
    setError("");
    if (action === "close") onClose();
  }
  function startCorrect() {
    if (!lesson) return;
    setEditing("correct");
    setError("");
    setReason("");
    setDeduct(lesson.deducted || lesson.status === "待确认");
    setUnits(
      lesson.confirmedUnits === undefined ? "" : String(lesson.confirmedUnits),
    );
    setAttendance(lesson.attendance);
    setResult(lesson.status === "缺席" ? "缺席" : "已完成");
  }
  function save() {
    if (!lesson || !editing || saving) return;
    if (editing === "report") {
      if (!report) return;
      if (!reportMaterial.trim() || !reportTo.trim() || !reason.trim()) {
        setError("请填写教材、结束页码和更正原因");
        return;
      }
      setError("");
      setSaving(true);
      try {
        act({
          type: "report.correct",
          id: report.id,
          material: reportMaterial,
          from: reportFrom,
          to: reportTo,
          reason,
        });
        toast("教材进度已更正");
        setEditing(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "保存未完成，请重试");
      } finally {
        setSaving(false);
      }
      return;
    }
    setError("");
    if (!reason.trim()) {
      setError(
        editing === "cancel" ? "请填写取消原因" : "请填写更正或确认原因",
      );
      return;
    }
    if (
      editing === "correct" &&
      deduct &&
      (!units.trim() || !Number.isFinite(Number(units)) || Number(units) <= 0)
    ) {
      setError("请填写已核实的扣课数量");
      return;
    }
    setSaving(true);
    try {
      if (editing === "cancel") {
        act({ type: "lesson.cancel", id: lesson.id, reason, responsibility });
        toast("课程已取消，课时处理保留待核实");
      } else if (pending) {
        act({
          type: "lesson.resolve",
          ids: [lesson.id],
          decision: deduct
            ? lesson.attendance === "学员缺席"
              ? "缺席"
              : "扣课"
            : "不扣",
          reason,
          ...(deduct ? { units: Number(units) } : {}),
        });
        toast("课程结果已确认");
      } else {
        act({
          type: "lesson.correct",
          id: lesson.id,
          deduct,
          reason,
          ...(editableFacts ? { attendance, result } : {}),
          ...(deduct ? { units: Number(units) } : {}),
        });
        toast("课程结果已更正");
      }
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "操作未完成，请检查填写内容",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Drawer
        open
        onClose={() => requestClose("close")}
        title="课程详情"
        description={`${student?.name || "学员"} · ${lesson.date} ${lesson.time}`}
        width={620}
        footer={
          editing ? (
            <>
              <Button disabled={saving} onClick={() => requestClose("back")}>
                返回详情
              </Button>
              <Button
                loading={saving}
                variant={editing === "cancel" ? "danger-solid" : "primary"}
                onClick={save}
              >
                {editing === "report"
                  ? "保存教材进度"
                  : editing === "cancel"
                    ? "确认取消课程"
                    : pending
                      ? "确认课程结果"
                      : "保存更正"}
              </Button>
            </>
          ) : (
            <>
              {canChange && onReschedule && (
                <Button
                  onClick={() => {
                    onClose();
                    onReschedule(lesson.id);
                  }}
                >
                  调课
                </Button>
              )}
              {canChange && (
                <Button
                  variant="danger"
                  onClick={() => {
                    setEditing("cancel");
                    setReason("");
                    setError("");
                    setResponsibility("学员");
                  }}
                >
                  取消课程
                </Button>
              )}
              {canCorrect && (
                <Button variant="primary" onClick={startCorrect}>
                  {pending ? "确认课时" : "更正结果"}
                </Button>
              )}
              <Button onClick={() => requestClose("close")}>关闭</Button>
            </>
          )
        }
      >
        <div className="stack sc-lesson-drawer">
          <div className="row">
            <Badge
              tone={
                lesson.status === "已取消"
                  ? "neutral"
                  : lesson.status === "已完成"
                    ? "success"
                    : "info"
              }
            >
              {lesson.status}
            </Badge>
            <span className="muted">{lesson.kind}</span>
          </div>
          <dl className="sc-facts">
            <div>
              <dt>上课时间</dt>
              <dd>
                {lesson.date} {lesson.time}–
                {lessonEnd(lesson.time, lesson.duration)}
              </dd>
            </div>
            <div>
              <dt>时长</dt>
              <dd>{lesson.duration} 分钟</dd>
            </div>
            <div>
              <dt>上课老师</dt>
              <dd>{teacherName(data, lesson.teacherId)}</dd>
            </div>
            <div>
              <dt>教材</dt>
              <dd>{lesson.material || "未填写"}</dd>
            </div>
            <div>
              <dt>出勤情况</dt>
              <dd>
                {lesson.status === "未开始"
                  ? "待上课"
                  : lesson.status === "已取消"
                    ? "课程已取消"
                    : lesson.attendance}
              </dd>
            </div>
            <div>
              <dt>课时结果</dt>
              <dd>{lessonCharge(lesson)}</dd>
            </div>
          </dl>
          {editing === "report" && (
            <section className="sc-editor">
              <h3>更正教材进度</h3>
              <Field label="更正教材" required>
                <input
                  value={reportMaterial}
                  onChange={(event) => setReportMaterial(event.target.value)}
                />
              </Field>
              <Field label="起始页码／章节">
                <input
                  value={reportFrom}
                  onChange={(event) => setReportFrom(event.target.value)}
                />
              </Field>
              <Field label="结束页码／章节" required>
                <input
                  value={reportTo}
                  onChange={(event) => setReportTo(event.target.value)}
                />
              </Field>
              <Field label="进度更正原因" required>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </section>
          )}
          {editing === "correct" && (
            <section className="sc-editor">
              <h3>{pending ? "确认本节课时" : "更正本节记录"}</h3>
              {editableFacts && (
                <>
                  <p className="sc-caption">
                    原记录：{lesson.status} · {lesson.attendance}
                  </p>
                  <Field label="课程结果">
                    <Select
                      value={result}
                      onValueChange={(value) => {
                        if (value === "已完成" || value === "缺席")
                          setResult(value);
                      }}
                    >
                      <option value="已完成">已完成</option>
                      <option value="缺席">缺席</option>
                    </Select>
                  </Field>
                  <Field label="出勤情况">
                    <Select
                      value={attendance}
                      onValueChange={(value) => {
                        const parsed =
                          lessonSchema.shape.attendance.safeParse(value);
                        if (parsed.success) setAttendance(parsed.data);
                      }}
                    >
                      {lessonSchema.shape.attendance.options.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              )}
              <Field label="课时处理">
                <Select
                  value={deduct ? "扣课" : "不扣"}
                  onValueChange={(value) => setDeduct(value === "扣课")}
                >
                  <option value="扣课">扣课</option>
                  <option value="不扣">不扣课时</option>
                </Select>
              </Field>
              {deduct && (
                <Field
                  label="本节扣课数量"
                  required
                  hint="按已核实的数量填写。"
                >
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={units}
                    onChange={(event) => setUnits(event.target.value)}
                  />
                </Field>
              )}
              <p className="sc-balance">
                原结果：{lessonCharge(lesson)}
                {previewBalance === undefined
                  ? "；余额尚无法核算"
                  : `；确认后余额 ${previewBalance} 课时（当前 ${student?.balance}）`}
              </p>
              <Field label={pending ? "确认说明" : "更正原因"} required>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </section>
          )}
          {editing === "cancel" && (
            <section className="sc-editor">
              <h3>取消本节课程</h3>
              <p>
                将取消 {lesson.date} {lesson.time}{" "}
                的这节课，保留历史记录。是否扣课由教务另行核实。
              </p>
              <Field label="取消原因方">
                <Select
                  value={responsibility}
                  onValueChange={(value) => {
                    if (
                      value === "学员" ||
                      value === "老师" ||
                      value === "平台"
                    )
                      setResponsibility(value);
                  }}
                >
                  <option>学员</option>
                  <option>老师</option>
                  <option>平台</option>
                </Select>
              </Field>
              <Field label="取消原因" required>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </section>
          )}
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
          {!editing && (
            <>
              <section>
                <h3>教材进度</h3>
                {report ? (
                  <div className="sc-report">
                    <strong>{report.material}</strong>
                    <p>
                      {report.from
                        ? `${formatStudentProgress(report.from)} → `
                        : ""}
                      {formatStudentProgress(report.to)}
                    </p>
                    <p className="muted">
                      {report.date} · {teacherName(data, report.teacherId)}
                    </p>
                    {report.recordedAt && (
                      <small className="muted">
                        提交于 {reportSubmittedAt(report.recordedAt)}
                      </small>
                    )}
                    {report.rating > 0 && <p>评分：{report.rating} 分</p>}
                    {report.comment && <p>{report.comment}</p>}
                    {can("lesson.correct") && canSubmitLessonReport(lesson) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing("report");
                          setReportMaterial(report.material);
                          setReportFrom(report.from);
                          setReportTo(report.to);
                          setReason("");
                          setError("");
                        }}
                      >
                        更正教材进度
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="muted">尚未提交本节教材进度</p>
                )}
              </section>
              <section>
                <h3>课程备注</h3>
                <p className="sc-preserve">{lesson.note || "暂无备注"}</p>
              </section>
              {changes.length > 0 && (
                <section>
                  <h3>变更记录</h3>
                  <div className="sc-change-list">
                    {changes.map((change) => (
                      <article key={change.id}>
                        <strong>{change.type}</strong>
                        <p>{change.content}</p>
                        <small>
                          {change.operator} ·{" "}
                          {change.recordedAt
                            ? reportSubmittedAt(change.recordedAt)
                            : change.date}
                        </small>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </Drawer>
      <Modal
        open={discard !== null}
        onClose={() => setDiscard(null)}
        title="放弃本次修改？"
        description="尚未保存的内容将不会保留。"
        footer={
          <>
            <Button onClick={() => setDiscard(null)}>继续编辑</Button>
            <Button
              variant="danger"
              onClick={() => {
                const close = discard === "close";
                setDiscard(null);
                setEditing(null);
                setError("");
                if (close) onClose();
              }}
            >
              放弃修改
            </Button>
          </>
        }
      >
        <p>可以继续编辑并保存，或放弃本次修改。</p>
      </Modal>
    </>
  );
}
