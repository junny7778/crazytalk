import { SchedulingAccountNotice } from "./SchedulingAccountNotice";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  isAvailable,
  studentMaterials,
  type ScheduleIntent,
} from "@crazytalk/shared";
import { Avatar, Badge, Button, Field, Modal, Select } from "@crazytalk/ui";
import MaterialPicker from "../MaterialPicker";
import {
  FlexStudentCalendar,
  customDraftKey,
  readCustomDraft,
} from "./FlexStudentCalendar";

type Time = { date: string; time: string };
export function CustomSchedulingPanel({
  studentId: initialStudent,
  teacherId,
  initialTime,
  initialTimes = [],
  startDate = DEMO_TODAY,
  onDraftKeyChange,
  onDirtyChange,
  onBusyChange,
  onStageChange,
  onClose,
  onComplete,
}: {
  studentId: string;
  teacherId?: string;
  initialTime?: Time;
  initialTimes?: Time[];
  startDate?: string;
  onDraftKeyChange?: (key: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onStageChange: (stage: "setup" | "preview") => void;
  onClose: () => void;
  onComplete: (studentId: string, count: number, teachers: string) => void;
}) {
  const { data, can, preview, accountId } = useDemo();
  const [studentId, setStudent] = useState(initialStudent);
  const student = data.students.find((s) => s.id === studentId);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const [saved] = useState(() =>
    initialStudent
      ? readCustomDraft(customDraftKey(accountId, initialStudent, teacherId))
      : undefined,
  );
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const [time, setTime] = useState(initialTime);
  const [pickedTimes, setPickedTimes] = useState(initialTimes);
  useEffect(() => {
    onDraftKeyChange?.(customDraftKey(accountId, studentId, teacherId));
  }, [accountId, studentId, teacherId, onDraftKeyChange]);
  const [duration, setDuration] = useState(saved?.intent.duration || 25);
  const [repeatWeeks, setRepeatWeeks] = useState(saved?.repeatWeeks || 1);
  const [materialIds, setMaterialIds] = useState(
    () =>
      saved?.intent.materialIds ||
      (student
        ? studentMaterials(data, student)
            .slice(0, 1)
            .map((c) => c.id)
        : []),
  );
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const setBusyState = useCallback(
    (value: boolean) => {
      setBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  const setDirtyState = useCallback(
    (value: boolean) => {
      setDirty(value);
      onDirtyChange(value);
    },
    [onDirtyChange],
  );
  function change(action: () => void) {
    if (busy) return;
    if (dirty) setPending(() => action);
    else {
      action();
      setRevision((v) => v + 1);
    }
  }
  function selectStudent(id: string) {
    change(() => {
      setStudent(id);
      const previous = readCustomDraft(
        customDraftKey(accountId, id, teacherId),
      );
      if (previous) {
        setDuration(previous.intent.duration);
        setRepeatWeeks(previous.repeatWeeks);
        setMaterialIds(previous.intent.materialIds || []);
        return;
      }
      const next = data.students.find((s) => s.id === id)!;
      setMaterialIds(
        studentMaterials(data, next)
          .filter((c) => !teacher || teacher.materialIds?.includes(c.id))
          .slice(0, 1)
          .map((c) => c.id),
      );
    });
  }
  const intent = useMemo<ScheduleIntent>(
    () => ({
      mode: "flex",
      startDate: time?.date || startDate,
      weeks: repeatWeeks,
      duration,
      frequency: student?.scheduleIntent?.frequency || 1,
      windows: student?.scheduleIntent?.windows || [],
      materialIds,
    }),
    [
      time,
      startDate,
      repeatWeeks,
      duration,
      student?.scheduleIntent,
      materialIds,
    ],
  );
  const candidates = data.students.filter(
    (s) =>
      !["停课", "结课", "退费"].includes(s.status) &&
      `${s.name} ${s.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="stack">
      {student && (
        <SchedulingAccountNotice key={student.id} student={student} />
      )}
      <fieldset
        disabled={busy || preview || !can("schedule.create")}
        className="schedule-custom-settings"
      >
        <div className="form-grid">
          <Field label="每节时长">
            <Select
              value={duration}
              onValueChange={(value) =>
                change(() => setDuration(Number(value)))
              }
            >
              {[25, 50, 55, 120].map((n) => (
                <option key={n} value={n}>
                  {n} 分钟
                </option>
              ))}
            </Select>
          </Field>
          <Field label="重复安排">
            <Select
              value={repeatWeeks}
              onValueChange={(value) =>
                change(() => setRepeatWeeks(Number(value)))
              }
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "仅选中日期" : `每周重复，共 ${n} 周`}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {student && (
          <Field label="本次教材">
            <MaterialPicker
              label="本次教材"
              catalog={studentMaterials(data, student).filter(
                (c) => !teacher || teacher.materialIds?.includes(c.id),
              )}
              value={materialIds}
              onChange={(ids) => change(() => setMaterialIds(ids))}
            />
          </Field>
        )}
        {student && !materialIds.length && (
          <p role="alert">
            请选择本次教材；未登记教材时请通过学员的编辑资料补充。
          </p>
        )}
      </fieldset>
      {teacher && (
        <div className="row">
          <strong>{teacher.name}</strong>
          <span className="muted">
            可授教材：
            {data.catalog
              .filter((c) => teacher.materialIds?.includes(c.id))
              .map((c) => c.name)
              .join("、") || "未登记，请通过老师的编辑资料补充"}
          </span>
        </div>
      )}
      <div className={teacher ? "schedule-custom-layout" : ""}>
        <div>
          {(!student || materialIds.length > 0) && (
            <FlexStudentCalendar
              key={`${studentId}-${revision}`}
              studentId={studentId}
              teacherId={teacherId}
              initialTime={time}
              initialTimes={pickedTimes}
              onPickTime={(slot) => {
                setTime(slot);
                setPickedTimes([slot]);
              }}
              intent={intent}
              repeatWeeks={repeatWeeks}
              onDirtyChange={setDirtyState}
              onBusyChange={setBusyState}
              onStageChange={onStageChange}
              onClose={onClose}
              onComplete={(count, names) => onComplete(studentId, count, names)}
            />
          )}
        </div>
        {teacher && (
          <aside className="schedule-student-options stack">
            <h4>选择学员</h4>
            {time && (
              <p>
                {time.date} {time.time} · 已选时段
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    change(() => {
                      setTime(undefined);
                      setPickedTimes([]);
                    })
                  }
                >
                  取消时间筛选
                </Button>
              </p>
            )}
            <input
              aria-label="搜索待排学员"
              placeholder="搜索学员姓名或 ID"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleCount(30);
              }}
            />
            {candidates.slice(0, visibleCount).map((s) => {
              const common = studentMaterials(data, s).filter((c) =>
                teacher.materialIds?.includes(c.id),
              );
              const reason = !common.length
                ? "没有共同教材"
                : time
                  ? isAvailable(
                      data,
                      teacher.id,
                      time.date,
                      time.time,
                      duration,
                      s.id,
                      undefined,
                      false,
                      true,
                    )[0]
                  : "";
              return (
                <button
                  type="button"
                  key={s.id}
                  className="flex-teacher-choice"
                  disabled={
                    !!reason || busy || preview || !can("schedule.create")
                  }
                  aria-pressed={s.id === studentId}
                  onClick={() => selectStudent(s.id)}
                >
                  <span className="row">
                    <Avatar name={s.name} />
                    <strong>{s.name}</strong>
                  </span>
                  <small>ID：{s.id}</small>
                  <span className="row wrap">
                    {common.map((c) => (
                      <Badge key={c.id}>{c.name}</Badge>
                    ))}
                  </span>
                  <small>{reason || "教材匹配，可选择"}</small>
                  <small>{s.scheduleText || "未登记固定上课时间"}</small>
                </button>
              );
            })}
            {candidates.length > visibleCount && (
              <Button onClick={() => setVisibleCount((n) => n + 30)}>
                显示更多学员
              </Button>
            )}
            {!candidates.length && (
              <p className="muted">没有找到学员，请修改搜索条件。</p>
            )}
          </aside>
        )}
      </div>
      {(!student || !materialIds.length) && (
        <Button onClick={onClose}>返回概况</Button>
      )}
      {pending && (
        <Modal open title="放弃当前排课草稿？" onClose={() => setPending(null)}>
          <p>修改学员、教材、时长或重复周期会清空当前未提交课次。</p>
          <div className="row">
            <Button onClick={() => setPending(null)}>继续编辑</Button>
            <Button
              variant="primary"
              onClick={() => {
                localStorage.removeItem(
                  customDraftKey(accountId, studentId, teacherId),
                );
                pending();
                setPending(null);
                setRevision((v) => v + 1);
                setDirtyState(false);
              }}
            >
              放弃草稿并修改
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
