import { RemainingCreditsField } from "./RemainingCreditsField";
import { schedulingBookingIssue, teacherSchedulingAccountIssue } from "@crazytalk/shared";
import { SchedulingAccountNotice, TeacherSchedulingAccountNotice } from "./SchedulingAccountNotice";
import { useCallback, useMemo, useState } from "react";
import { useDemo } from "@crazytalk/shared/react";
import {
  DEMO_TODAY,
  isAvailable,
  getScheduleCredits,
  scheduleUnits,
  matchesScheduleWindow,
  studentMaterials,
  type ScheduleIntent,
} from "@crazytalk/shared";
import { Avatar, Button, Field, Modal, SearchInput, Select, useToast } from "@crazytalk/ui";
import { FlexStudentCalendar } from "./FlexStudentCalendar";

type Time = { date: string; time: string };
export function CustomSchedulingPanel({
  studentId: initialStudent,
  teacherId,
  initialTime,
  initialTimes = [],
  startDate = DEMO_TODAY,
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
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onStageChange: (stage: "setup" | "preview") => void;
  onClose: () => void;
  onComplete: (studentId: string, count: number, teachers: string) => void;
}) {
  const { data, can, preview, act } = useDemo();
  const [studentId, setStudent] = useState(initialStudent);
  const student = data.students.find((s) => s.id === studentId);
  const teacher = data.teachers.find((t) => t.id === teacherId);
  const toast = useToast();
  const [savingMaterials, setSavingMaterials] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(30);
  const [time, setTime] = useState(initialTime);
  const [pickedTimes, setPickedTimes] = useState(initialTimes);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [duration, setDuration] = useState(25);
  const [adjusting, setAdjusting] = useState(false);
  const [manualUnits, setManualUnits] = useState("");
  const teacherReview = !!teacher && !!student && !adjusting;
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const books = student ? studentMaterials(data, student) : [];
  const [materialId, setMaterialId] = useState(() => books[0]?.id ?? "");
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
    const apply = () => {
      setTime(undefined);
      setPickedTimes([]);
      action();
    };
    const commit = () => {
      apply();
      setRevision(v => v + 1);
      setDirtyState(false);
    };
    if (dirty) setPending(() => commit);
    else commit();
  }
  function selectStudent(id: string) {
    setPickerOpen(false);
    setAdjusting(false);
    setStudent(id);
    const next = data.students.find((s) => s.id === id)!;
    const common = studentMaterials(data, next)
        .filter((c) => !teacher || teacher.materialIds?.includes(c.id));
    if (id !== studentId || !common.some(c => materialId === c.id))
      setMaterialId(common[0]?.id ?? "");
  }
  const intent = useMemo<ScheduleIntent>(
    () => ({
      mode: "flex",
      startDate: time?.date || startDate,
      weeks: repeatWeeks,
      duration,
      frequency: student?.scheduleIntent?.frequency || 1,
      windows: student?.scheduleIntent?.windows || [],
      materialIds: materialId ? [materialId] : [],
    }),
    [
      time,
      startDate,
      repeatWeeks,
      duration,
      student?.scheduleIntent,
      materialId,
    ],
  );
  const choosingStudent = !!teacher && pickerOpen;
  const units = scheduleUnits(duration, Number(manualUnits) || undefined);
  const candidates = useMemo(() => {
    if (!choosingStudent || !teacher) return [];
    return data.students
      .filter(s => !["停课", "结课", "退费"].includes(s.status) &&
        `${s.name} ${s.id}`.toLowerCase().includes(query.toLowerCase()))
      .flatMap(s => {
        if (schedulingBookingIssue(data, s.id, [teacher.id])) return [];
        const common = studentMaterials(data, s).filter(c => teacher.materialIds?.includes(c.id));
        if (!common.length) return [];
        const credits = getScheduleCredits(data, s.id, pickedTimes.length, units ?? NaN);
        if (credits.available <= 0 || credits.error) return [];
        if (pickedTimes.some(slot => isAvailable(data, teacher.id, slot.date, slot.time, duration, s.id, undefined, false, true).length)) return [];

        const intent = s.scheduleIntent;
        const matches = intent?.windows.length
          ? pickedTimes.filter(slot => matchesScheduleWindow(slot, duration, intent)).length : 0;
        return [{ student: s, common, available: credits.available, matches, hasIntent: !!intent?.windows.length }];
      })
      .sort((a, b) => b.matches - a.matches || Number(b.hasIntent) - Number(a.hasIntent));
  }, [choosingStudent, teacher, pickedTimes, data, query, duration, units]);
  return (
    <div className="stack">
      {teacher && <TeacherSchedulingAccountNotice key={teacher.id} teacher={teacher}/>}
      {student && (
        <SchedulingAccountNotice key={student.id} student={student} />
      )}
      {student && !teacher && data.teachers.filter(t=>t.status!=="已离职" && teacherSchedulingAccountIssue(t) && t.materialIds?.includes(materialId)).map(t=><div key={t.id} className="stack"><button className="flex-teacher-choice" disabled>{t.name} · 未绑定 ClassIn</button><TeacherSchedulingAccountNotice teacher={t}/></div>)}
      {!teacherReview && <fieldset
        disabled={busy || preview || !can("schedule.create")}
        className="schedule-custom-settings"
      >
        {!teacher && <h4>基础信息</h4>}
        <div className={teacher ? "row wrap schedule-teacher-fields" : "form-grid intent-settings-grid"}>
          {student && !teacher && <RemainingCreditsField studentId={student.id} />}
          {student && !teacher && (
            <Field label="本次教材">
              <Select size="form" searchable={false} value={materialId} disabled={!books.length}
                onValueChange={id => change(() => setMaterialId(id))}>
                {books.map(book => <option key={book.id} value={book.id}>{book.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="每节时长">
            <Select
              value={duration}
              onValueChange={(value) =>
                change(() => { setDuration(Number(value)); setManualUnits(""); })
              }
            >
              {[25, 50, 55, 120].map((n) => (
                <option key={n} value={n}>
                  {n} 分钟
                </option>
              ))}
            </Select>
          </Field>
          {teacher && scheduleUnits(duration) === undefined && <Field label="每节预计扣课数" required><input type="number" min="0.01" step="any" value={manualUnits} onChange={e => setManualUnits(e.target.value)} /></Field>}
          {!teacher && <Field label="重复安排">
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
          </Field>}
          {teacher && <Field label="可授教材">
            <Select multiple checkboxOptions size="form" searchable value={teacher.materialIds || []}
              placeholder="请选择可授教材"
              disabled={busy || savingMaterials || preview || !can("teacher.edit")}
              onValueChange={ids => {
                const removesSelected = !!student && !!materialId && !ids.includes(materialId);
                const save = async () => {
                  setSavingMaterials(true);
                  try {
                    await act({type: "teacher.save", teacher: {...teacher, materialIds: ids}});
                    if (removesSelected) {
                      setMaterialId("");
                      setTime(undefined);
                      setPickedTimes([]);
                      setRevision(v => v + 1);
                      setDirtyState(false);
                    }
                  } catch (error) {
                    toast(error instanceof Error ? error.message : "可授教材保存失败", {tone: "error"});
                  } finally {
                    setSavingMaterials(false);
                  }
                };
                if (dirty && removesSelected) setPending(() => save);
                else void save();
              }}>
              {data.catalog.filter(c => c.type === "教材" && (c.enabled || teacher.materialIds?.includes(c.id))).map(c =>
                <option key={c.id} value={c.id}>{c.name}{c.enabled ? "" : "（已停用）"}</option>
              )}
            </Select>
          </Field>}
        </div>
        {student && !materialId && (
          <p role="alert">
            请选择本次教材；未登记教材时请通过学员的编辑资料补充。
          </p>
        )}
      </fieldset>}
      {teacherReview && student && teacher && <>
        <div className="row wrap schedule-review-fields">
          <Field label="教材">
            <Select size="form" searchable={false} value={materialId} onValueChange={setMaterialId}
              disabled={busy || preview || !can("schedule.create")}>
              {studentMaterials(data, student).filter(c => teacher.materialIds?.includes(c.id)).map(c =>
                <option key={c.id} value={c.id}>{c.name}</option>
              )}
            </Select>
          </Field>
          <Field label="学员">
            <div className="row">
              <input disabled value={student.name}/>
              <Button size="sm" variant="ghost" disabled={busy || preview} onClick={() => {
                setPickerOpen(true);
                setQuery("");
                setVisibleCount(30);
              }}>更换学员</Button>
            </div>
          </Field>
        </div>
      </>}
      <div className={teacher ? "schedule-custom-layout" : ""}>
        <div>
          {(!student || !!materialId) && (
            <FlexStudentCalendar
              key={`${studentId}-${adjusting}-${revision}`}
              studentId={adjusting ? "" : studentId}
              teacherUnits={teacher ? units : undefined}
              onAdjustTeacherTimes={teacherReview ? () => setAdjusting(true) : undefined}
              teacherId={teacherId}
              initialTime={time}
              initialTimes={pickedTimes}
              onConfirmTimes={(slots) => {
                setTime(slots[0]);
                setPickedTimes(slots);
                setPickerOpen(true);
                setQuery("");
                setVisibleCount(30);
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
        {teacher && time && choosingStudent && (
          <Modal open width={720} title="选择学员" description={`已选 ${pickedTimes.length} 个时段${units ? ` · 共需 ${units * pickedTimes.length} 课时` : ""}`} onClose={() => setPickerOpen(false)}>
            <div className="schedule-student-options stack">
            <SearchInput
              label="搜索待排学员"
              placeholder="搜索学员姓名或 ID"
              value={query}
              onChange={value => { setQuery(value); setVisibleCount(30); }}
            />
            <div className="schedule-student-cards" role="radiogroup" aria-label="可排课学员">
              {candidates.slice(0, visibleCount).map(({ student: s, common, available, matches, hasIntent }) => (
                <label key={s.id} className="schedule-student-card">
                  <Avatar name={s.name} size={40}/>
                  <span className="schedule-student-info">
                    <span className="schedule-student-line">
                      <strong>{s.name}</strong>
                      <small>ID {s.id}</small>
                      <span className="schedule-student-match" data-match={matches === pickedTimes.length ? "full" : matches ? "partial" : "none"}>
                        {matches ? (pickedTimes.length === 1 ? "符合意向时间" : `${matches}/${pickedTimes.length} 时段符合意向`) : hasIntent ? "与意向时间不符" : "未登记意向"}
                      </span>
                    </span>
                    <span className="schedule-student-details">
                      <span><small>待排课时</small> {available} 课时</span>
                      <span><small>共同教材</small> {common.map(c => c.name).join("、")}</span>
                    </span>
                  </span>
                  <input type="radio" name="schedule-student" value={s.id}
                    disabled={busy || preview || !can("schedule.create")}
                    onChange={() => selectStudent(s.id)} />
                </label>
              ))}
            </div>
            {candidates.length > visibleCount && (
              <Button onClick={() => setVisibleCount((n) => n + 30)}>
                显示更多学员
              </Button>
            )}
            {!candidates.length && (
              <p className="muted">{query ? "没有找到匹配的待排学员" : "当前时段暂无可排课的学员"}</p>
            )}
            </div>
          </Modal>
        )}
      </div>
      {(!student || !materialId) && (
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
                pending();
                setPending(null);
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
