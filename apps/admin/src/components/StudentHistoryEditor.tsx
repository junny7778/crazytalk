import { DatePicker } from "@crazytalk/ui";
import { useRef, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  studentHistorySchema,
  type Student,
  type StudentHistoryInput,
} from "@crazytalk/shared";
import { Button, Drawer, Field, Modal, useToast } from "@crazytalk/ui";
import { Plus, X } from "lucide-react";
import "../pages/student-profile.css";

export default function StudentHistoryEditor({
  student,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const { act, data } = useDemo();
  const toast = useToast();
  const [draft, setDraft] = useState<StudentHistoryInput>(() =>
    studentHistorySchema.parse({
      ...student,
      historyStartDate: student.historyStartDate || "",
    }),
  );
  const initial = useRef(JSON.stringify(draft));
  const lock = useRef(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [discard, setDiscard] = useState(false);
  const patch = (value: Partial<StudentHistoryInput>) => {
    setError("");
    setFieldErrors({});
    setDraft((current) => ({ ...current, ...value }));
  };
  function close() {
    if (initial.current !== JSON.stringify(draft) || reason) setDiscard(true);
    else onClose();
  }
  function save() {
    if (lock.current) return;
    setError("");
    setFieldErrors({});
    const parsed = studentHistorySchema.safeParse(draft);
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
    const current = data.students.find((item) => item.id === student.id);
    if (
      !current ||
      JSON.stringify(
        studentHistorySchema.parse({
          ...current,
          historyStartDate: current.historyStartDate || "",
        }),
      ) !== initial.current
    ) {
      setError("历史资料已更新，请重新打开后核对再保存");
      return;
    }
    if (!reason.trim()) {
      setFieldErrors({ reason: "请填写本次补录或更正原因" });
      return;
    }
    lock.current = true;
    try {
      toast(
        act({
          type: "student.history.update",
          id: student.id,
          history: parsed.data,
          reason: reason.trim(),
        }).message,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "保存未完成，请检查填写内容",
      );
    } finally {
      lock.current = false;
    }
  }
  return (
    <Drawer
      open
      title="补录／更正历史资料"
      description="补充学员启用系统前的课程与服务记录。"
      width={880}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>取消</Button>
          <Button variant="primary" onClick={save}>
            保存历史资料
          </Button>
        </>
      }
    >
      <div className="stack student-profile-editor">
        <section>
          <h3>历史统计范围</h3>
          <Field
            label="系统记录起算日期"
            hint="历史累计应截至前一天；起算日期之后的记录由系统统计。暂不确定时可留空，历史次数将单独展示。"
            error={fieldErrors.historyStartDate}
          >
            <DatePicker
              placeholder="系统记录起算日期"
              mode="date"
              value={draft.historyStartDate || ""}
              onValueChange={(nextValue) =>
                patch({ historyStartDate: nextValue })
              }
            />
          </Field>
        </section>
        <section>
          <h3>历史课程与购课信息</h3>
          <div className="student-profile-fields">
            <Field label="序号" error={fieldErrors.sourceSequence}>
              <input
                type="text"
                value={draft.sourceSequence ?? ""}
                onChange={(event) =>
                  patch({ sourceSequence: event.target.value })
                }
              />
            </Field>
            <Field label="买单日期" error={fieldErrors.purchaseDate}>
              <DatePicker
                placeholder="买单日期"
                mode="date"
                value={draft.purchaseDate ?? ""}
                onValueChange={(nextValue) =>
                  patch({ purchaseDate: nextValue })
                }
              />
            </Field>
            <Field label="历史总课时" error={fieldErrors.totalUnits}>
              <input
                type="number"
                min="0"
                step="any"
                value={draft.totalUnits ?? ""}
                onChange={(event) =>
                  patch({
                    totalUnits:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="是否续课" error={fieldErrors.renewalStatus}>
              <input
                type="text"
                value={draft.renewalStatus ?? ""}
                onChange={(event) =>
                  patch({ renewalStatus: event.target.value })
                }
              />
            </Field>
            <Field label="历史上课时间" error={fieldErrors.scheduleText}>
              <input
                type="text"
                value={draft.scheduleText ?? ""}
                onChange={(event) =>
                  patch({ scheduleText: event.target.value })
                }
              />
            </Field>
            <Field label="历史周上课频次" error={fieldErrors.frequencyText}>
              <input
                type="text"
                value={draft.frequencyText ?? ""}
                onChange={(event) =>
                  patch({ frequencyText: event.target.value })
                }
              />
            </Field>
            <Field label="历史第一节课" error={fieldErrors.firstLessonDate}>
              <DatePicker
                placeholder="历史第一节课"
                mode="date"
                value={draft.firstLessonDate ?? ""}
                onValueChange={(nextValue) =>
                  patch({ firstLessonDate: nextValue })
                }
              />
            </Field>
          </div>
        </section>
        <section>
          <h3>月度上课情况</h3>
          <div className="stack-sm">
            {draft.monthlyRecords.map((record, index) => (
              <div key={record.id} className="student-month-editor">
                <Field
                  error={fieldErrors[`monthlyRecords.${index}.month`]}
                  label={`第${index + 1}条月份`}
                >
                  <input
                    value={record.month}
                    onChange={(event) =>
                      patch({
                        monthlyRecords: draft.monthlyRecords.map((item) =>
                          item.id === record.id
                            ? { ...item, month: event.target.value }
                            : item,
                        ),
                      })
                    }
                    placeholder="例如2026-11或7月（原表）"
                  />
                </Field>
                <Field
                  error={fieldErrors[`monthlyRecords.${index}.planned`]}
                  label={`第${index + 1}条月应上课`}
                >
                  <input
                    type="number"
                    min="0"
                    value={record.planned ?? ""}
                    onChange={(event) =>
                      patch({
                        monthlyRecords: draft.monthlyRecords.map((item) =>
                          item.id === record.id
                            ? {
                                ...item,
                                planned:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Field
                  error={fieldErrors[`monthlyRecords.${index}.actual`]}
                  label={`第${index + 1}条实际上课`}
                >
                  <input
                    type="number"
                    min="0"
                    value={record.actual ?? ""}
                    onChange={(event) =>
                      patch({
                        monthlyRecords: draft.monthlyRecords.map((item) =>
                          item.id === record.id
                            ? {
                                ...item,
                                actual:
                                  event.target.value === ""
                                    ? null
                                    : Number(event.target.value),
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Field
                  error={fieldErrors[`monthlyRecords.${index}.note`]}
                  label={`第${index + 1}条说明`}
                >
                  <input
                    value={record.note}
                    onChange={(event) =>
                      patch({
                        monthlyRecords: draft.monthlyRecords.map((item) =>
                          item.id === record.id
                            ? { ...item, note: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  size="xs"
                  aria-label={`删除第${index + 1}条月度记录`}
                  onClick={() =>
                    patch({
                      monthlyRecords: draft.monthlyRecords.filter(
                        (item) => item.id !== record.id,
                      ),
                    })
                  }
                >
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() =>
              patch({
                monthlyRecords: [
                  ...draft.monthlyRecords,
                  {
                    id: crypto.randomUUID(),
                    month: "",
                    planned: null,
                    actual: null,
                    note: "",
                  },
                ],
              })
            }
          >
            <Plus size={14} />
            添加月份
          </Button>
        </section>
        <section>
          <h3>历史服务与换老师记录</h3>
          <div className="student-profile-fields">
            <Field label="投诉记录（次数）">
              <input
                value={draft.legacyComplaints}
                onChange={(event) =>
                  patch({ legacyComplaints: event.target.value })
                }
              />
            </Field>
            <Field label="赠课记录（补偿次数）">
              <input
                value={draft.legacyCompensations}
                onChange={(event) =>
                  patch({ legacyCompensations: event.target.value })
                }
              />
            </Field>
            <Field label="被缺席记录（次数）">
              <input
                value={draft.legacyMissed}
                onChange={(event) =>
                  patch({ legacyMissed: event.target.value })
                }
              />
            </Field>
            <Field label="原老师">
              <input
                value={draft.originalTeacher}
                onChange={(event) =>
                  patch({ originalTeacher: event.target.value })
                }
              />
            </Field>
            <Field label="首次换老师">
              <input
                value={draft.firstChangedTeacher}
                onChange={(event) =>
                  patch({ firstChangedTeacher: event.target.value })
                }
              />
            </Field>
            <Field label="二次换老师">
              <input
                value={draft.secondChangedTeacher}
                onChange={(event) =>
                  patch({ secondChangedTeacher: event.target.value })
                }
              />
            </Field>
          </div>
        </section>
        <Field label="补录／更正原因" required error={fieldErrors.reason}>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setFieldErrors({});
            }}
            placeholder="说明资料来源及本次修改原因"
          />
        </Field>
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
      </div>
      <Modal
        open={discard}
        title="放弃未保存的内容？"
        onClose={() => setDiscard(false)}
        footer={
          <>
            <Button onClick={() => setDiscard(false)}>继续填写</Button>
            <Button variant="danger" onClick={onClose}>
              放弃修改
            </Button>
          </>
        }
      >
        <p>尚未保存的历史资料将不会保留。</p>
      </Modal>
    </Drawer>
  );
}
