import { DEMO_TODAY, type DemoState } from "./model";

export function getStudentSummary(
  data: DemoState,
  studentId: string,
  month = DEMO_TODAY.slice(0, 7),
) {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) throw new Error("找不到这位学员");
  const lessons = data.lessons.filter((item) => item.studentId === studentId);
  const monthlyLessons = lessons.filter(
    (item) => item.date.startsWith(`${month}-`) && item.status !== "已取消",
  );
  const actualLessons = monthlyLessons.filter(
    (item) =>
      item.status === "已完成" &&
      ["正常", "老师迟到"].includes(item.attendance),
  );
  const start = student.historyStartDate || "";
  const afterStart = (date: string) => !start || date >= start;
  function count<T>(historicalValue: string, records: T[]) {
    const historical = /^\d+$/.test(historicalValue.trim())
      ? Number(historicalValue)
      : null;
    return {
      system: records.length,
      historical,
      total: start && historical !== null ? historical + records.length : null,
      records,
    };
  }
  const complaints = count(
    student.legacyComplaints,
    data.feedback.filter(
      (item) =>
        item.studentId === studentId &&
        item.rating === "差评" &&
        afterStart(item.date),
    ),
  );
  const compensations = count(
    student.legacyCompensations,
    data.credits.filter(
      (item) =>
        item.studentId === studentId &&
        item.type === "补偿" &&
        afterStart(item.date),
    ),
  );
  const teacherAbsences = count(
    student.legacyMissed,
    lessons.filter(
      (item) =>
        ["已完成", "缺席"].includes(item.status) &&
        item.attendance === "老师缺席" &&
        afterStart(item.date),
    ),
  );
  const reports = data.reports
    .filter((item) => item.studentId === studentId)
    .sort((a, b) => {
      const aLesson = lessons.find((item) => item.id === a.lessonId),
        bLesson = lessons.find((item) => item.id === b.lessonId);
      return `${bLesson?.date || b.date}${bLesson?.time || ""}`.localeCompare(
        `${aLesson?.date || a.date}${aLesson?.time || ""}`,
      );
    });
  const report = reports[0];
  const fixed = lessons
    .filter(
      (item) =>
        item.kind === "固定课" &&
        item.status === "未开始" &&
        item.date >= DEMO_TODAY,
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const teacher = data.teachers.find((item) => item.id === student.teacherId);
  const changes = [...student.teacherChanges].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const futureChange = changes.find((item) => item.date > DEMO_TODAY);
  const effectiveChange = changes
    .filter((item) => item.date <= DEMO_TODAY)
    .at(-1);
  const currentTeacherName =
    futureChange?.fromTeacher ||
    effectiveChange?.toTeacher ||
    teacher?.name ||
    student.teacherName;
  const currentTeacher = data.teachers.find(
    (item) => item.name === currentTeacherName,
  );
  const purchase = data.credits
    .filter(
      (item) =>
        item.studentId === studentId &&
        ["充值", "购课", "新购", "续费"].includes(item.type),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const actual = lessons
    .filter(
      (item) =>
        item.status === "已完成" &&
        ["正常", "老师迟到"].includes(item.attendance),
    )
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return {
    monthly: {
      month,
      planned: monthlyLessons.length,
      actual: actualLessons.length,
      lessons: monthlyLessons,
      actualLessons,
    },
    complaints,
    compensations,
    teacherAbsences,
    progress: {
      material: report?.material || student.material,
      unit: report?.to || student.unit,
      report,
    },
    teacher: {
      id: currentTeacher?.id || "",
      name: currentTeacherName,
    },
    scheduleText: [...new Set(fixed.map((item) => item.time))]
      .sort()
      .map((time) => {
        const weekdays = [
          ...new Set(
            fixed
              .filter((item) => item.time === time)
              .map(
                (item) =>
                  (new Date(`${item.date}T12:00:00Z`).getUTCDay() + 6) % 7,
              ),
          ),
        ].sort((a, b) => a - b);
        return `每周${weekdays.map((day) => ["一", "二", "三", "四", "五", "六", "日"][day]).join("、")} ${time}`;
      })
      .join("；"),
    frequencyText: student.frequencyText,
    firstLessonDate:
      student.firstLessonDate &&
      (!actual[0] || student.firstLessonDate < actual[0].date)
        ? student.firstLessonDate
        : actual[0]?.date || "",
    purchaseDate: purchase[0]?.date || student.purchaseDate,
    historicalTotalUnits: student.totalUnits,
    systemPurchaseUnits: purchase
      .filter((item) => afterStart(item.date))
      .reduce((sum, item) => sum + item.units, 0),
    totalUnits:
      student.totalUnits === null
        ? null
        : purchase.length
          ? start
            ? student.totalUnits +
              purchase
                .filter((item) => afterStart(item.date))
                .reduce((sum, item) => sum + item.units, 0)
            : null
          : student.totalUnits,
    renewalStatus: purchase.some((item) => item.type === "续费")
      ? "是"
      : student.renewalStatus,
  };
}
