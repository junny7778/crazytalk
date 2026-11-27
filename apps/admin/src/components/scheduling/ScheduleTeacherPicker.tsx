import { useState } from "react";
import { teacherFit, type Teacher, type Student } from "@crazytalk/shared";
import { useDemo } from "@crazytalk/shared/react";
import { Avatar, Button, Modal } from "@crazytalk/ui";
import { Check } from "lucide-react";
import { lessonEnd } from "../StudentLessonDrawer";
import { TeacherSchedulingAccountNotice } from "./SchedulingAccountNotice";

const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function ScheduleTeacherPicker({
  student, date, time, duration, material, editingTeachers, pastTeachers, plannedTeachers,
  unboundTeachers = [], initialTeacher = "", title = "选择授课老师", confirmLabel, children, error, onClose, onRemove, onChoose,
}: {
  student?: Student;
  date: string;
  time: string;
  duration: number;
  material: string;
  editingTeachers: Teacher[];
  pastTeachers: string[];
  plannedTeachers: string[];
  unboundTeachers?: Teacher[];
  initialTeacher?: string;
  title?: string;
  confirmLabel?: string;
  children?: React.ReactNode;
  error?: string;
  onClose: () => void;
  onRemove?: () => void;
  onChoose: (id: string) => void;
}) {
  const {data, preview, can} = useDemo();
  const [selectedTeacher, setSelectedTeacher] = useState(initialTeacher);
  const [teacherQuery, setTeacherQuery] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      width={600}
      footer={
        <div className="flex-picker-footer">
          <span>
            {editingTeachers.find((t) => t.id === selectedTeacher)?.name ||
              "请选择老师"}
          </span>
          {onRemove && (
            <Button
              variant="ghost"
              onClick={onRemove}
            >
              移除本节
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={
              !editingTeachers.some((t) => t.id === selectedTeacher) ||
              preview ||
              !can("schedule.create")
            }
            onClick={() => onChoose(selectedTeacher)}
          >
            {confirmLabel ?? (onRemove ? "保存修改" : "加入课表")}
          </Button>
        </div>
      }
    >
      <div className="flex-picker">
        <dl className="flex-picker-summary">
          <dt>学员姓名</dt><dd>{student?.name}</dd>
          <dt>上课日期</dt><dd>{date} {days[new Date(date + "T12:00:00Z").getUTCDay()]}</dd>
          <dt>上课时间</dt>
          <dd>{time ? `${time}–${lessonEnd(time, duration)}` : "请选择时间"}</dd>
          <dt>每节时长</dt><dd>{duration} 分钟</dd>
          <dt>本节教材</dt><dd>{material}</dd>
        </dl>
        <div className="flex-picker-toolbar">
          <input
            aria-label="搜索可选老师"
            placeholder="搜索老师姓名"
            value={teacherQuery}
            onChange={(e) => setTeacherQuery(e.target.value)}
          />
          <span className="flex-picker-match-count">可选老师 {editingTeachers.length} 位（教材与时间均匹配）</span>
        </div>
        {unboundTeachers.filter(t => t.name.toLowerCase().includes(teacherQuery.toLowerCase())).map(t=><div key={t.id} className="stack"><button type="button" className="flex-teacher-choice" disabled>{t.name} · 未绑定 ClassIn</button><TeacherSchedulingAccountNotice teacher={t}/></div>)}
        {children}
        {error && <p role="alert">{error}</p>}
        <div className="flex-teacher-options">
          {editingTeachers
            .filter((t) =>
              t.name
                .toLowerCase()
                .includes(teacherQuery.trim().toLowerCase()),
            )
            .map((t) => (
              <button
                type="button"
                key={t.id}
                aria-pressed={selectedTeacher === t.id}
                className="flex-teacher-choice"
                disabled={preview || !can("schedule.create")}
                onClick={() => setSelectedTeacher(t.id)}
              >
                <div className="flex-teacher-heading">
                  <Avatar name={t.name} />
                  <strong>{t.name}</strong>
                  {student && <small>{[...teacherFit(data,student,t).matchedPrimary, ...teacherFit(data,student,t).matchedSecondary].join(" · ") || "教材与时间匹配"}</small>}
                  {student && [...teacherFit(data,student,t).blocked,...teacherFit(data,student,t).warnings].map(note=><small key={note}>{note}（教务可手动选择）</small>)}
                  {pastTeachers.includes(t.id) ? (
                    <small className="flex-teacher-tag">曾授课</small>
                  ) : plannedTeachers.includes(t.id) ? (
                    <small className="flex-teacher-tag">本次已选</small>
                  ) : null}
                  <span
                    className="flex-teacher-selection"
                    aria-hidden="true"
                  >
                    {selectedTeacher === t.id && (
                      <Check size={14} strokeWidth={3} />
                    )}
                  </span>
                </div>
                <div className="flex-teacher-facts">
                  <span>
                    <small>SO</small>
                    {t.so || "未填写"}
                  </span>
                  <span>
                    <small>口音等级</small>
                    {t.accent || "未填写"}
                  </span>
                  <span>
                    <small>导师等级</small>
                    {t.level || "未填写"}
                  </span>
                </div>
                <div className="flex-teacher-category">
                  可教类别：{t.categories.join(" / ") || "未填写"}
                </div>
              </button>
            ))}
          {!editingTeachers.length ? (
            <p className="muted">
              没有老师能覆盖本次全部课次，请调整上课时间或重复安排。
            </p>
          ) : (
            !editingTeachers.some((t) =>
              t.name
                .toLowerCase()
                .includes(teacherQuery.trim().toLowerCase()),
            ) && <p className="muted">没有找到该老师，请修改搜索关键词。</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
