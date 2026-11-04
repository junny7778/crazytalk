import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import {
  emptyStudentProfile,
  studentProfileSchema,
  type Student,
  type StudentProfileInput,
  type StudentEditableInput,
} from "@crazytalk/shared";
import { Button, Drawer, Field, Select, Modal, useToast } from "@crazytalk/ui";
import "../pages/student-profile.css";
function Choice({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
    >
      <option value="">未填写</option>
      {[...new Set([...options, ...(value ? [value] : [])])]
        .filter(Boolean)
        .map((value) => (
          <option key={value}>{value}</option>
        ))}
    </Select>
  );
}
export default function StudentProfileEditor({
  student,
  onClose,
}: {
  student?: Student;
  onClose: () => void;
}) {
  const { data, act, can } = useDemo();
  const navigate = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState<StudentProfileInput>(() =>
    student ? studentProfileSchema.parse(student) : emptyStudentProfile(),
  );
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRoot = useRef<HTMLDivElement>(null);
  const initialProfile = useRef(draft);
  const initialDraft = useRef(JSON.stringify(draft));
  const hasReports =
    !!student && data.reports.some((report) => report.studentId === student.id);
  const saveLock = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (Object.keys(fieldErrors).length)
      formRoot.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
  }, [fieldErrors]);
  function requestClose() {
    if (JSON.stringify(draft) !== initialDraft.current) setConfirmDiscard(true);
    else onClose();
  }
  const [saving, setSaving] = useState(false);
  const patch = (value: Partial<StudentProfileInput>) => {
    setFieldErrors({});
    setError("");
    setDraft((current) => ({ ...current, ...value }));
  };
  function save(next: "none" | "credit" | "schedule") {
    if (saveLock.current) return;
    setError("");
    setFieldErrors({});
    const parsed = studentProfileSchema.safeParse(draft);
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      return;
    }
    const profile = parsed.data;
    if (
      !student &&
      profile.teacherId &&
      !data.teachers.some(
        (teacher) =>
          teacher.id === profile.teacherId && teacher.status === "在职",
      )
    ) {
      setFieldErrors({ teacherId: "这位老师当前不在职，请重新选择上课老师" });
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      const keys: (keyof StudentEditableInput)[] = [
        "name",
        "groupName",
        "phone",
        "age",
        "ageText",
        "gender",
        "channel",
        "owner",
        "personality",
        "foreignTeacherExperience",
        "preferences",
        ...(!hasReports ? (["material", "unit"] as const) : []),
      ];
      const changed = keys.filter(
        (key) => profile[key] !== initialProfile.current[key],
      );
      const edits: Partial<StudentEditableInput> = Object.fromEntries(
        changed.map((key) => [key, profile[key]]),
      );
      const expected: Partial<StudentEditableInput> = Object.fromEntries(
        changed.map((key) => [key, initialProfile.current[key]]),
      );
      const result = act(
        student
          ? {
              type: "student.details.update",
              id: student.id,
              patch: edits,
              expected,
            }
          : { type: "student.create", student: profile },
      );
      toast(result.message);
      onClose();
      const saved = student ?? result.data.students[0];
      if (saved && (!student || next !== "none"))
        navigate(
          next === "schedule"
            ? `/schedule?student=${encodeURIComponent(saved.id)}`
            : `/students/${saved.id}${next === "credit" ? "?tab=credits&action=credit" : ""}`,
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : "请检查填写内容");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }
  return (
    <Drawer
      open
      onClose={requestClose}
      title={student ? "编辑学员资料" : "新建学员"}
      description={
        student
          ? "维护学员资料与课程信息。"
          : "建立学员档案，集中管理学习资料、课程安排与服务跟进。"
      }
      width={880}
      footer={
        <>
          <Button onClick={requestClose} disabled={saving}>
            取消
          </Button>
          {!student && (
            <>
              <Button disabled={saving} onClick={() => save("credit")}>
                保存并加课时
              </Button>
              <Button disabled={saving} onClick={() => save("schedule")}>
                保存并去排课
              </Button>
            </>
          )}
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => save("none")}
          >
            保存学员资料
          </Button>
        </>
      }
    >
      <div ref={formRoot} className="stack student-profile-editor">
        <section>
          <h3>基本资料</h3>
          <div className="student-profile-fields">
            <Field error={fieldErrors.name} label="学生名字" required>
              <input
                value={draft.name}
                onChange={(event) => patch({ name: event.target.value })}
                placeholder="例如 Lucy"
              />
            </Field>
            <Field label="学生群名">
              <input
                value={draft.groupName}
                onChange={(event) => patch({ groupName: event.target.value })}
              />
            </Field>
            <Field error={fieldErrors.phone} label="手机号码">
              <input
                inputMode="tel"
                value={
                  student && !can("field.student_phone") && draft.phone
                    ? `****${draft.phone.slice(-4)}`
                    : draft.phone
                }
                disabled={!!student && !can("field.student_phone")}
                onChange={(event) => patch({ phone: event.target.value })}
              />
            </Field>
            <Field error={fieldErrors.age} label="年龄">
              <input
                value={draft.ageText || (draft.age ?? "")}
                onChange={(event) => {
                  const value = event.target.value;
                  patch({
                    age:
                      value !== "" && /^\d+(?:\.\d+)?$/.test(value)
                        ? Number(value)
                        : null,
                    ageText:
                      value !== "" && !/^\d+(?:\.\d+)?$/.test(value)
                        ? value
                        : "",
                  });
                }}
              />
            </Field>
            <Field label="性别">
              <Choice
                label="性别"
                value={draft.gender}
                onChange={(gender) => patch({ gender })}
                options={["男", "女"]}
              />
            </Field>
          </div>
        </section>
        <section>
          <h3>学习特点与偏好</h3>
          <div className="student-profile-fields">
            <Field label="小孩性格">
              <input
                value={draft.personality}
                onChange={(event) => patch({ personality: event.target.value })}
              />
            </Field>
            <Field label="外教上课经验">
              <Choice
                label="外教上课经验"
                value={draft.foreignTeacherExperience}
                onChange={(foreignTeacherExperience) =>
                  patch({ foreignTeacherExperience })
                }
                options={["有", "无"]}
              />
            </Field>
            <Field label="喜欢的老师类型">
              <textarea
                value={draft.preferences}
                onChange={(event) => patch({ preferences: event.target.value })}
              />
            </Field>
          </div>
        </section>
        <section>
          <h3>服务归属</h3>
          <div className="student-profile-fields">
            <Field label="渠道">
              <Choice
                label="渠道"
                value={draft.channel}
                onChange={(channel) => patch({ channel })}
                options={data.catalog
                  .filter((item) => item.type === "渠道")
                  .map((item) => item.name)}
              />
            </Field>
            <Field label="负责教务">
              <Choice
                label="负责教务"
                value={draft.owner}
                onChange={(owner) => patch({ owner })}
                options={[
                  ...data.students.map((item) => item.owner),
                  "Rita",
                  "Roma",
                ]}
              />
            </Field>
          </div>
        </section>
        {(!student || !hasReports) && (
          <section>
            <h3>初始教学信息</h3>
            <div className="student-profile-fields">
              {!student && (
                <Field label="上课老师" error={fieldErrors.teacherId}>
                  <Select
                    value={draft.teacherId}
                    searchable
                    onValueChange={(teacherId) => {
                      const teacher = data.teachers.find(
                        (item) =>
                          item.id === teacherId && item.status === "在职",
                      );
                      patch({
                        teacherId: teacher?.id || "",
                        teacherName: teacher?.name || "",
                      });
                    }}
                  >
                    <option value="">暂未安排</option>
                    {data.teachers
                      .filter((teacher) => teacher.status === "在职")
                      .map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name} · {teacher.so}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              <Field label="教材">
                <input
                  value={draft.material}
                  onChange={(event) => patch({ material: event.target.value })}
                />
              </Field>
              <Field label="起始单元／页码">
                <input
                  value={draft.unit}
                  onChange={(event) => patch({ unit: event.target.value })}
                />
              </Field>
            </div>
          </section>
        )}
        {student && hasReports && (
          <p className="muted">
            教材进度已由课后记录维护，可在课程与教材进度中查看或更正。
          </p>
        )}
        {confirmDiscard && (
          <Modal
            open
            onClose={() => setConfirmDiscard(false)}
            title="放弃未保存的内容？"
            footer={
              <>
                <Button onClick={() => setConfirmDiscard(false)}>
                  继续填写
                </Button>
                <Button variant="danger" onClick={onClose}>
                  放弃修改
                </Button>
              </>
            }
          >
            <p>尚未保存的填写内容将不会保留。</p>
          </Modal>
        )}
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}
