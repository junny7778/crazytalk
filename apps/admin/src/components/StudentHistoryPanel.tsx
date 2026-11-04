import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Student } from "@crazytalk/shared";
import { Button } from "@crazytalk/ui";
import { RecordFields } from "./StudentRecordDrawer";

export default function StudentHistoryPanel({
  student,
  onEdit,
  onViewMonthly,
}: {
  student: Student;
  onEdit?: () => void;
  onViewMonthly: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <div className="student-history-disclosure">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(!expanded)}
      >
        历史资料
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
        />
      </Button>
      <div id={contentId} hidden={!expanded}>
        <div className="stack student-history-content">
          {onEdit && (
            <div>
              <Button size="sm" variant="ghost" onClick={onEdit}>
                补录／更正历史资料
              </Button>
            </div>
          )}
          <RecordFields
            values={[
              ["统计起算日期", student.historyStartDate || "尚未确认"],
              ["原表序号", student.sourceSequence],
              ["历史买单日期", student.purchaseDate],
              ["历史总课时", student.totalUnits],
              ["历史续课情况", student.renewalStatus],
              ["历史上课时间", student.scheduleText],
              ["历史上课频次", student.frequencyText],
              ["历史第一节课", student.firstLessonDate],
              ["历史投诉次数", student.legacyComplaints],
              ["历史补偿次数", student.legacyCompensations],
              ["历史被缺席次数", student.legacyMissed],
              ["原老师", student.originalTeacher],
              ["首次换老师", student.firstChangedTeacher],
              ["二次换老师", student.secondChangedTeacher],
            ]}
          />
          {student.monthlyRecords.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onViewMonthly}>
              查看历史月度记录（课程与教材进度）
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
