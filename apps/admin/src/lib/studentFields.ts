import type { Student } from "@crazytalk/shared";
const originalStudentMonth = "7月（原表，年份未注明）";

export type StudentField = {
  key: keyof Student | "originalPlanned" | "originalActual";
  label: string;
};

// These groups preserve the 27 business columns of 学生课程信息表.
export const studentFieldGroups: { title: string; fields: StudentField[] }[] = [
  {
    title: "学生基本信息",
    fields: [
      { key: "sourceSequence", label: "序号" },
      { key: "name", label: "学生名字" },
      { key: "englishName", label: "学生英文名" },
      { key: "phone", label: "手机号码" },
      { key: "age", label: "年龄" },
      { key: "gender", label: "性别" },
    ],
  },
  {
    title: "订单与续课",
    fields: [
      { key: "channel", label: "渠道" },
      { key: "orderStatus", label: "订单状态" },
      { key: "purchaseDate", label: "买单日期" },
      { key: "totalUnits", label: "总课时" },
      { key: "renewalStatus", label: "是否续课" },
    ],
  },
  {
    title: "教学安排",
    fields: [
      { key: "teacherName", label: "上课老师" },
      { key: "material", label: "教材" },
      { key: "scheduleText", label: "上课时间" },
      { key: "frequencyText", label: "周上课频次" },
      { key: "firstLessonDate", label: "第一节课" },
    ],
  },
  {
    title: "学习特点与偏好",
    fields: [
      { key: "personality", label: "小孩性格" },
      { key: "foreignTeacherExperience", label: "外教上课经验" },
      { key: "preferences", label: "喜欢的老师类型" },
    ],
  },
  {
    title: "月度上课情况",
    fields: [
      { key: "originalPlanned", label: "月应上课" },
      { key: "originalActual", label: "7月实际" },
    ],
  },
  {
    title: "课中相关",
    fields: [
      { key: "legacyComplaints", label: "投诉记录（次数）" },
      { key: "legacyCompensations", label: "赠课记录（补偿次数）" },
      { key: "legacyMissed", label: "被缺席记录（次数）" },
    ],
  },
  {
    title: "换老师记录",
    fields: [
      { key: "originalTeacher", label: "原老师" },
      { key: "firstChangedTeacher", label: "首次换老师" },
      { key: "secondChangedTeacher", label: "二次换老师" },
    ],
  },
];

const surveyOverviewFields: Record<string, StudentField[]> = {
  "学生基本信息": [{ key: "ageGroup", label: "年龄段" }],
  "学习特点与偏好": [
    { key: "level", label: "口语基础" },
    { key: "interests", label: "兴趣爱好" },
    { key: "membershipDuration", label: "加入体系时长" },
    { key: "listeningHours", label: "听力输入总时长" },
  ],
};
export const studentOverviewFieldGroups = [
  ...studentFieldGroups.map((group) => ({
    ...group,
    fields: [...group.fields, ...(surveyOverviewFields[group.title] ?? [])],
  })),
  {
    title: "上课偏好与备注",
    fields: [
      { key: "preferredLessonTime", label: "预选上课时段" },
      { key: "learningNotes", label: "其他备注" },
    ] satisfies StudentField[],
  },
];

export function studentFieldValue(
  student: Student,
  key: StudentField["key"],
): string | number | null {
  if (key === "originalPlanned" || key === "originalActual") {
    const month = student.monthlyRecords.find(
      (record) => record.month === originalStudentMonth,
    );
    return key === "originalPlanned"
      ? (month?.planned ?? null)
      : (month?.actual ?? null);
  }
  if (key === "age")
    return (
      student.age === null ? (student.ageGroup ?? student.ageText) || null : `${student.age} 岁`
    );
  const value = student[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}
