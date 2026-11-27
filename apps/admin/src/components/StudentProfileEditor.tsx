import MaterialPicker from "./MaterialPicker";
import { studentMaterialIds } from "@crazytalk/shared";
import {studentOrganization} from "@crazytalk/shared";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemo } from "@crazytalk/shared/react";
import {
  emptyStudentProfile,
  matchingSurveyOptions,
  maxSurveyInterests,
  studentSurveyDetails,
  studentSurveyInterests,
  studentProfileSchema,
  type Student,
  type StudentProfileInput,
  type StudentEditableInput,
} from "@crazytalk/shared";
import { Button, Drawer, Field, Select, Modal, useToast } from "@crazytalk/ui";
import "../pages/student-profile.css";
function Choice<Option extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: Option | "") => void;
  options: readonly Option[];
  disabled?: boolean;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(options.find((option) => option === next) ?? "")}
      disabled={disabled}
    >
      <option value="">未填写</option>
      {value && !options.some((option) => option === value) && <option disabled>{value}</option>}
      {options.map((option) => <option key={option}>{option}</option>)}
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
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState<StudentProfileInput>(() =>
    student ? studentProfileSchema.parse({
      ...student,
      ...studentSurveyDetails(student),
      ...(!can("field.student_phone") && { phone: "", email: "" }),
    }) : emptyStudentProfile(),
  );
  const organization = studentOrganization(data.accounts, draft.owner, draft.roster, draft.ownerAccountId);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRoot = useRef<HTMLDivElement>(null);
  const initialProfile = useRef(draft);
  const initialStored = useRef(student ?? draft);
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
  async function save(next: "none" | "credit" | "schedule") {
    if (saveLock.current) return;
    setError("");
    setFieldErrors({});
    if (!draft.chineseName.trim()) {
      setFieldErrors({ chineseName: "请填写学生中文名" });
      return;
    }
    const parsed = studentProfileSchema.safeParse({...draft, name: draft.chineseName.trim(), chineseName: draft.chineseName.trim(), englishName: draft.englishName?.trim() || ""});
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
        "englishName",
        "chineseName",
        "groupName",
        "phone",
        "email",
        "age",
        "ageText",
        "ageGroup",
        "membershipDuration",
        "listeningHours",
        "preferredLessonTime",
        "learningNotes",
        "gender",
        "project",
        "channel",
        "owner",
        "ownerAccountId",
        "personality","level","interests",
        "foreignTeacherExperience",
        "materialIds",
        "preferences",
        ...(!hasReports ? (["material", "unit"] as const) : []),
      ];
      const changed = keys.filter(
        (key) => JSON.stringify(profile[key]) !== JSON.stringify(initialProfile.current[key]),
      );
      const edits: Partial<StudentEditableInput> = Object.fromEntries(
        changed.map((key) => [key, profile[key]]),
      );
      const expected: Partial<StudentEditableInput> = Object.fromEntries(
        changed.map((key) => [key, initialStored.current[key]]),
      );
      const result = await act(
        student
          ? {
              type: "student.details.update",
              id: student.id,
              patch: edits,
              expected,
            }
          : { type: "student.create", student: profile },
      );
      if (!mounted.current) return;
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
      onClose={saving ? onClose : requestClose}
      title={student ? "编辑学员资料" : "新建学员"}
      description={
        student
          ? "维护学员资料与课程信息。"
          : "建立学员档案，集中管理学习资料、课程安排与服务跟进。"
      }
      width={880}
      footer={
        <>
          <Button onClick={saving ? onClose : requestClose}>
            {saving ? "关闭" : "取消"}
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
            loading={saving}
            disabled={saving}
            onClick={() => save("none")}
          >
            {saving ? (student && draft.ownerAccountId !== student.ownerAccountId ? "正在交接" : "正在保存") : "保存学员资料"}
          </Button>
        </>
      }
    >
      <div {...(saving ? { inert: "" } : {})} ref={formRoot} className="stack student-profile-editor">
        <section>
          <h3>基本资料</h3>
          <div className="student-profile-fields">
            <Field error={fieldErrors.chineseName} label="学生中文名" required>
              <input required value={draft.chineseName} onChange={event => patch({ chineseName: event.target.value })} />
            </Field>
            <Field label="学生英文名">
              <input value={draft.englishName || ""} onChange={event => patch({ englishName: event.target.value })} />
            </Field>
            <Field error={fieldErrors.phone} label="手机号码">
              <input
                inputMode="tel"
                value={
                  student && !can("field.student_phone")
                    ? student.phone ? `****${student.phone.slice(-4)}` : ""
                    : draft.phone
                }
                disabled={!!student && !can("field.student_phone")}
                onChange={(event) => patch({ phone: event.target.value })}
              />
            </Field>
            <Field error={fieldErrors.email} label="邮箱">
              <input
                inputMode="email"
                autoComplete="email"
                value={draft.email ?? ""}
                disabled={!!student && !can("field.student_phone")}
                onChange={(event) => patch({ email: event.target.value })}
              />
            </Field>
            <Field error={fieldErrors.age} label="年龄">
              <input
                value={draft.age ?? (matchingSurveyOptions.ageGroup.some((option) => option === draft.ageText) ? "" : draft.ageText)}
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
                options={matchingSurveyOptions.gender}
                value={draft.gender}
                onChange={(gender) => patch({ gender })}
              />
            </Field>
            <Field label="年龄段">
              <Choice
                label="年龄段"
                options={matchingSurveyOptions.ageGroup}
                value={draft.ageGroup ?? ""}
                onChange={(value) => patch({ ageGroup: value })}
              />
            </Field>
          </div>
        </section>
        <section>
          <h3>学习特点与偏好</h3>
          <div className="student-profile-fields">
            <Field label="口语基础">
              <Choice
                label="口语基础"
                options={matchingSurveyOptions.level}
                value={matchingSurveyOptions.level.find((option) => option.slice(0, 2) === draft.level) ?? draft.level}
                onChange={(level) => patch({ level: level.slice(0, 2) })}
              />
            </Field>
            <Field label="小孩性格">
              <Choice
                label="小孩性格"
                options={matchingSurveyOptions.personality}
                value={draft.personality}
                onChange={(personality) => patch({ personality })}
              />
            </Field>
            <Field label="兴趣爱好" hint={`最多选择 ${maxSurveyInterests} 项`}>
              <Select
                aria-label="兴趣爱好"
                multiple
                maxSelected={maxSurveyInterests}
                placeholder="请选择兴趣爱好"
                value={studentSurveyInterests(draft.interests)}
                onValueChange={(interests) => patch({ interests: interests.join("、") })}
              >
                {matchingSurveyOptions.interests.map((interest) => <option key={interest}>{interest}</option>)}
              </Select>
              {draft.interests && studentSurveyInterests(draft.interests).join("、") !== draft.interests && (
                <div className="row wrap">
                  <small className="muted">当前兴趣记录：{draft.interests}</small>
                  <Button size="xs" variant="ghost" onClick={() => patch({ interests: "" })}>清除兴趣记录</Button>
                </div>
              )}
            </Field>
            <Field label="加入体系时长">
              <Choice
                label="加入体系时长"
                options={matchingSurveyOptions.membership}
                value={draft.membershipDuration ?? ""}
                onChange={(value) => patch({ membershipDuration: value })}
              />
            </Field>
            <Field label="听力输入总时长">
              <Choice
                label="听力输入总时长"
                options={matchingSurveyOptions.listening}
                value={draft.listeningHours ?? ""}
                onChange={(value) => patch({ listeningHours: value })}
              />
            </Field>
            <Field label="外教上课经验">
              <Choice
                label="外教上课经验"
                options={matchingSurveyOptions.experience}
                value={draft.foreignTeacherExperience === "无" ? "没有" : draft.foreignTeacherExperience}
                onChange={(experience) => patch({ foreignTeacherExperience: experience === "没有" ? "无" : experience })}
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
          <h3>上课偏好与备注</h3>
          <div className="student-profile-fields">
            <Field label="预选上课时段">
              <Choice
                label="预选上课时段"
                options={matchingSurveyOptions.times}
                value={draft.preferredLessonTime ?? ""}
                onChange={(value) => patch({ preferredLessonTime: value })}
              />
            </Field>
            <Field label="其他备注">
              <textarea rows={3} value={draft.learningNotes ?? ""} onChange={(event) => patch({ learningNotes: event.target.value })} />
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
                onChange={(channel) => patch({ channel, project: data.catalog.some(p => p.type === "项目" && p.name === draft.project && p.enabled && data.catalog.some(c => c.name === channel && p.channelIds?.includes(c.id))) ? draft.project : "" })}
                options={data.catalog
                  .filter((item) => item.type === "渠道" && item.enabled)
                  .map((item) => item.name)}
              />
            </Field>
            <Field label="项目"><Choice label="项目" value={draft.project} onChange={project => patch({project})}
              options={data.catalog.filter(p => p.enabled && p.type === "项目" && data.catalog.some(c => p.channelIds?.includes(c.id) && c.name === draft.channel)).map(p => p.name)}/></Field>
            <Field label="负责教务">
              <Select aria-label="负责教务" value={draft.ownerAccountId || ""} onValueChange={ownerAccountId => patch({ownerAccountId, owner: data.accounts.find(a => a.id === ownerAccountId)?.name || ""})}>
                <option value="">{draft.owner && !draft.ownerAccountId ? `${draft.owner}（待关联账号）` : "未分配"}</option>
                {data.accounts.filter(a => a.roleId === "ops" && (a.enabled || a.id === draft.ownerAccountId)).map(a => <option key={a.id} value={a.id} disabled={!a.enabled}>{a.name} · {a.team || "未分队"} / {a.group || "未分组"}</option>)}
              </Select>
            </Field>
            <Field label="所属队伍"><input disabled className="student-organization-value" value={organization.team}/></Field>
            <Field label="所属组别"><input disabled className="student-organization-value" value={organization.group}/></Field>
          </div>
        </section>
        <section>
          <h3>学习教材（单选）</h3>
          <MaterialPicker
            label="学习教材"
            multiple={false}
            catalog={data.catalog}
            value={studentMaterialIds(data, draft).slice(0, 1)}
            onChange={(materialIds) => {
              const chosen = materialIds[0]
                ? data.catalog.find((c) => c.id === materialIds[0] && c.type === "教材")
                : undefined;
              patch({
                materialIds: materialIds.slice(0, 1),
                ...(chosen && (!student || !hasReports) ? { material: chosen.name } : {}),
              });
            }}
          />
          {student && hasReports && (
            <small className="muted">已有课后进度，更换教材仅影响后续新排课程，不影响历史课程记录。</small>
          )}
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
