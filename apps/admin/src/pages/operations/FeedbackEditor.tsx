import { DatePicker } from "@crazytalk/ui";
import { useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  feedbackCategoryOptions,
  DEMO_TODAY,
  type Feedback,
  type FeedbackDetailsInput,
} from "@crazytalk/shared";
import { Button, Drawer, Field, Select, Modal } from "@crazytalk/ui";
import { Plus, X, ImagePlus } from "lucide-react";
import { useBusinessAction } from "./common";

export const feedbackStages = [
  "≤3节课",
  "课中问题",
  "首月",
  "第二月",
  "第三月",
  "其他",
];
export const feedbackGrades = ["一星", "二星", "三星", "四星", "五星"];
export const customerProgresses = [
  "未处理",
  "处理中",
  "已处理",
  "待TM判定",
  "待回访",
  "已完成",
];
export const processingResults = [
  "处理成功",
  "处理失败",
  "待补充信息",
  "无需处理",
];
export function feedbackCategories(record: Feedback) {
  return record.categories.length
    ? record.categories
    : record.category
      ? [record.category]
      : [];
}
export function OptionalSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "未填写",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <Select
      aria-label={label || placeholder}
      value={value}
      onValueChange={onChange}
    >
      <option value="">{placeholder}</option>
      {[
        ...new Set([
          ...options.filter((option) => !!option.trim()),
          ...(value ? [value] : []),
        ]),
      ].map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}
function initialRecord(
  record: Feedback | undefined,
  studentId: string,
  lessonId: string,
  data: ReturnType<typeof useDemo>["data"],
): FeedbackDetailsInput {
  const student = data.students.find(
    (item) =>
      item.id ===
      (data.studentIdAliases?.[record?.studentId || studentId] ??
        record?.studentId ??
        studentId),
  );
  const lesson = data.lessons.find(
    (item) =>
      item.id === (record?.lessonId || lessonId) &&
      item.studentId === student?.id,
  );
  const teacher = data.teachers.find(
    (item) =>
      item.id ===
      (record?.teacherId || lesson?.teacherId || student?.teacherId),
  );
  return {
    studentId: record ? record.studentId : student?.id || "",
    teacherId: record ? record.teacherId : teacher?.id || "",
    lessonId: record ? record.lessonId : lesson?.id || "",
    date: record ? record.date : DEMO_TODAY,
    owner: record ? record.owner : student?.owner || "",
    source: record ? record.source : student?.project || student?.channel || "",
    teacherName: record ? record.teacherName : teacher?.name || "",
    so: record ? record.so : teacher?.so || "",
    stage: record?.stage || "",
    grade: record?.grade || "",
    categories: record ? feedbackCategories(record) : [],
    rating: record?.rating || "差评",
    content: record?.content || "",
    screenshots: record?.screenshots || [],
  };
}
async function compressedScreenshot(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 8 * 1024 * 1024) throw new Error("单张图片不能超过 8 MB");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法读取图片，请重新选择");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } finally {
    bitmap.close();
  }
}
export default function FeedbackEditor({
  record,
  studentId = "",
  lessonId = "",
  onClose,
  onSaved,
  lockStudent = false,
}: {
  record?: Feedback;
  studentId?: string;
  lessonId?: string;
  onClose: () => void;
  onSaved: () => void;
  lockStudent?: boolean;
}) {
  const { data } = useDemo();
  const run = useBusinessAction();
  const [initial] = useState(() =>
    initialRecord(record, studentId, lessonId, data),
  );
  const [draft, setDraft] = useState(initial);
  const [discard, setDiscard] = useState(false);
  const [classification, setClassification] = useState(["", "", ""]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const patch = (value: Partial<FeedbackDetailsInput>) =>
    setDraft((current) => ({ ...current, ...value }));
  const paths = feedbackCategoryOptions(data.catalog);
  const options = (level: number) => [
    ...new Set(
      paths
        .filter((path) =>
          path
            .slice(0, level)
            .every((value, index) => value === classification[index]),
        )
        .map((path) => path[level])
        .filter((value): value is string => !!value),
    ),
  ];
  function requestClose() {
    if (
      uploading ||
      JSON.stringify(draft) !== JSON.stringify(initial) ||
      classification.some(Boolean)
    ) {
      setDiscard(true);
    } else onClose();
  }
  function save() {
    setError("");
    if (
      !draft.studentId ||
      !draft.teacherId ||
      !draft.date ||
      (!record && !draft.owner.trim())
    ) {
      setError("请填写反馈日期、学员、老师和教务");
      return;
    }
    if (!draft.content.trim() && !draft.categories.length) {
      setError("请填写反馈内容或至少添加一个问题分类");
      return;
    }
    run(
      record
        ? { type: "feedback.edit", id: record.id, feedback: draft }
        : { type: "feedback.create", feedback: draft },
      onSaved,
    );
  }
  return (
    <>
      <Drawer
        open
        onClose={requestClose}
        title={record ? "编辑反馈资料" : "登记反馈"}
        description="按《学生反馈》登记原始信息，客服处理与 TM 跟进可稍后补充。"
        width={760}
        footer={
          <>
            <Button onClick={requestClose}>取消</Button>
            <Button variant="primary" disabled={uploading} onClick={save}>
              保存反馈
            </Button>
          </>
        }
      >
        <div className="stack feedback-editor">
          <section className="feedback-form-section">
            <h3>基本信息</h3>
            <div className="feedback-form-grid">
              <Field label="反馈日期" required>
                <DatePicker
                  mode="date"
                  value={draft.date}
                  onValueChange={(nextValue) => patch({ date: nextValue })}
                />
              </Field>
              <Field label="项目／渠道">
                <input
                  value={draft.source}
                  onChange={(event) => patch({ source: event.target.value })}
                  placeholder="例如 K12、黄子妈妈"
                />
              </Field>
              <Field label="教务" required>
                <OptionalSelect
                  label="教务"
                  value={draft.owner}
                  onChange={(owner) => patch({ owner })}
                  options={[
                    ...data.students.map((item) => item.owner),
                    "Rita",
                    "Roma",
                  ]}
                  placeholder="选择教务"
                />
              </Field>
              <Field label="学员" required>
                <Select
                  disabled={lockStudent}
                  value={draft.studentId}
                  onValueChange={(id) => {
                    const student = data.students.find(
                      (item) => item.id === id,
                    );
                    const teacher = data.teachers.find(
                      (item) => item.id === student?.teacherId,
                    );
                    patch({
                      studentId: id,
                      owner: student?.owner || "",
                      source: student?.project || "",
                      lessonId: "",
                      teacherId: teacher?.id || "",
                      teacherName: teacher?.name || "",
                      so: teacher?.so || "",
                    });
                  }}
                  searchable
                >
                  <option value="">选择学员</option>
                  {data.students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                      {student.groupName ? ` · ${student.groupName}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="老师" required>
                <Select
                  value={draft.teacherId}
                  onValueChange={(id) => {
                    const teacher = data.teachers.find(
                      (item) => item.id === id,
                    );
                    patch({
                      teacherId: id,
                      teacherName: teacher?.name || "",
                      so: teacher?.so || "",
                      lessonId: "",
                    });
                  }}
                  searchable
                >
                  <option value="">选择老师</option>
                  {data.teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name} · {teacher.so}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="SO">
                <input
                  value={draft.so}
                  onChange={(event) => patch({ so: event.target.value })}
                />
              </Field>
              <Field label="关联课程" hint="没有具体课程时可留空。">
                <Select
                  value={draft.lessonId}
                  onValueChange={(id) => {
                    const lesson = data.lessons.find((item) => item.id === id);
                    const teacher = data.teachers.find(
                      (item) => item.id === lesson?.teacherId,
                    );
                    patch({
                      lessonId: id,
                      ...(teacher
                        ? {
                            teacherId: teacher.id,
                            teacherName: teacher.name,
                            so: teacher.so,
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="">不关联具体课程</option>
                  {data.lessons
                    .filter((item) => item.studentId === draft.studentId)
                    .sort((a, b) =>
                      (b.date + b.time).localeCompare(a.date + a.time),
                    )
                    .map((lesson) => (
                      <option key={lesson.id} value={lesson.id}>
                        {lesson.date} {lesson.time} ·{" "}
                        {
                          data.teachers.find(
                            (item) => item.id === lesson.teacherId,
                          )?.name
                        }
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </section>
          <section className="feedback-form-section">
            <h3>反馈内容</h3>
            <div className="feedback-form-grid">
              <Field label="反馈阶段">
                <OptionalSelect
                  label="反馈阶段"
                  value={draft.stage}
                  onChange={(stage) => patch({ stage })}
                  options={feedbackStages}
                />
              </Field>
              <Field label="反馈等级">
                <OptionalSelect
                  label="反馈等级"
                  value={draft.grade}
                  onChange={(grade) => patch({ grade })}
                  options={feedbackGrades}
                />
              </Field>
              <Field label="评价分类">
                <Select
                  value={draft.rating}
                  onValueChange={(value) => {
                    if (value === "好评" || value === "差评")
                      patch({ rating: value });
                  }}
                >
                  <option>差评</option>
                  <option>好评</option>
                </Select>
              </Field>
            </div>
            <div className="feedback-classification">
              <div className="feedback-class-grid">
                {["一级分类", "二级分类", "三级分类"].map((label, index) => (
                  <Field key={label} label={label}>
                    <OptionalSelect
                      label={label}
                      value={classification[index]}
                      onChange={(value) =>
                        setClassification((current) =>
                          current.map((part, i) =>
                            i === index ? value : i > index ? "" : part,
                          ),
                        )
                      }
                      options={options(index)}
                      placeholder="请选择"
                    />
                  </Field>
                ))}
              </div>
              <Button
                size="sm"
                disabled={!classification[0]}
                onClick={() => {
                  const path = classification.filter(Boolean).join(" / ");
                  patch({
                    categories: [...new Set([...draft.categories, path])],
                  });
                  setClassification(["", "", ""]);
                }}
              >
                <Plus size={14} />
                添加分类
              </Button>
            </div>
            <div className="feedback-category-tags">
              {draft.categories.map((path) => (
                <span key={path}>
                  {path}
                  <button
                    aria-label={`移除分类 ${path}`}
                    onClick={() =>
                      patch({
                        categories: draft.categories.filter(
                          (item) => item !== path,
                        ),
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <Field
              label="学员反馈（原话）"
              hint="没有原话时可留空，请保留原始分类；不要将核实结论写成学员原话。"
            >
              <textarea
                rows={4}
                value={draft.content}
                onChange={(event) => patch({ content: event.target.value })}
                placeholder="记录学员或家长的原始反馈"
              />
            </Field>
            <Field
              label="截图"
              hint="最多 3 张，支持 JPG、PNG、WebP，单张不超过 8 MB。"
            >
              <div className="feedback-screenshots">
                {draft.screenshots.map((shot) => (
                  <div key={shot.id}>
                    <button
                      onClick={() => setPreview(shot.dataUrl)}
                      aria-label={`预览 ${shot.name}`}
                    >
                      <img src={shot.dataUrl} alt={shot.name} />
                    </button>
                    <button
                      className="feedback-shot-remove"
                      aria-label={`删除截图 ${shot.name}`}
                      onClick={() =>
                        patch({
                          screenshots: draft.screenshots.filter(
                            (item) => item.id !== shot.id,
                          ),
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <label className="feedback-upload">
                  <ImagePlus size={20} />
                  {uploading ? "正在读取…" : "添加截图"}
                  <input
                    aria-label="反馈截图"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    disabled={uploading || draft.screenshots.length >= 3}
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || []);
                      event.target.value = "";
                      setError("");
                      if (files.length + draft.screenshots.length > 3) {
                        setError("最多添加 3 张截图");
                        return;
                      }
                      setUploading(true);
                      try {
                        const added = await Promise.all(
                          files.map(async (file) => ({
                            id: crypto.randomUUID(),
                            name: file.name,
                            dataUrl: await compressedScreenshot(file),
                          })),
                        );
                        const screenshots = [...draft.screenshots, ...added];
                        if (
                          screenshots.reduce(
                            (sum, item) => sum + item.dataUrl.length,
                            0,
                          ) > 1_000_000
                        )
                          throw new Error(
                            "图片内容较大，请减少截图数量或使用较小的图片",
                          );
                        patch({ screenshots });
                      } catch (error) {
                        setError(
                          error instanceof Error
                            ? error.message
                            : "读取图片失败，请重新选择",
                        );
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              </div>
            </Field>
          </section>
          {!record && (
            <p className="muted">
              保存后可继续填写客服处理进度、客服备注、客服处理结果，以及 TM
              判定和跟进记录。
            </p>
          )}
          {error && (
            <p role="alert" className="danger">
              {error}
            </p>
          )}
        </div>
      </Drawer>
      <Modal
        open={discard}
        onClose={() => setDiscard(false)}
        title="放弃未保存的内容？"
        footer={
          <>
            <Button onClick={() => setDiscard(false)}>继续编辑</Button>
            <Button variant="danger" onClick={onClose}>
              放弃修改
            </Button>
          </>
        }
      >
        <p>当前反馈尚未保存，关闭后将丢失本次填写的内容。</p>
      </Modal>
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
    </>
  );
}
