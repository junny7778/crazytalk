import {
  emptyStudentProfile,
  type DemoState,
  type StudentProfileInput,
} from "@crazytalk/shared";

export const studentWorkbookHeaders = [
  "渠道",
  "订单状态",
  "买单日期",
  "序号",
  "学生群名",
  "学生名字",
  "手机号码",
  "总课时",
  "上课老师",
  "教材",
  "上课时间",
  "周上课频次",
  "月应上课",
  "7月实际",
  "第一节课",
  "年龄",
  "性别",
  "小孩性格",
  "外教上课经验",
  "喜欢的老师类型",
  "投诉记录（次数）",
  "赠课记录（补偿次数）",
  "被缺席记录（次数）",
  "原老师",
  "首次换老师",
  "二次换老师",
  "是否续课",
];
export const originalStudentMonth = "7月（原表，年份未注明）";
type WorkbookProfile = Pick<StudentProfileInput, keyof StudentProfileInput>;

export function studentWorkbookRow(
  student: WorkbookProfile,
  data?: DemoState,
): (string | number)[] {
  const month = student.monthlyRecords.find(
    (record) => record.month === originalStudentMonth,
  );
  return [
    student.channel,
    student.orderStatus,
    student.purchaseDate,
    student.sourceSequence,
    student.groupName,
    student.name,
    student.phone,
    student.totalUnits ?? "",
    student.teacherName ||
      data?.teachers.find((t) => t.id === student.teacherId)?.name ||
      "",
    student.material,
    student.scheduleText,
    student.frequencyText,
    month?.planned ?? "",
    month?.actual ?? "",
    student.firstLessonDate,
    student.ageText || (student.age ?? ""),
    student.gender,
    student.personality,
    student.foreignTeacherExperience,
    student.preferences,
    student.legacyComplaints,
    student.legacyCompensations,
    student.legacyMissed,
    student.originalTeacher,
    student.firstChangedTeacher,
    student.secondChangedTeacher,
    student.renewalStatus,
  ];
}

function normalized(value: string) {
  return value
    .replace(/\s/g, "")
    .replace(/[()]/g, (v) => (v === "(" ? "（" : "）"));
}
function cellValue(value: unknown): string | number | Date {
  if (
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number"
  )
    return value;
  if (value && typeof value === "object") {
    if ("result" in value) return cellValue(value.result);
    if ("richText" in value && Array.isArray(value.richText))
      return value.richText
        .map((part: unknown) =>
          part && typeof part === "object" && "text" in part
            ? String(part.text)
            : "",
        )
        .join("");
    if ("text" in value) return String(value.text);
  }
  return "";
}
function text(value: string | number | Date): string {
  return String(value).trim();
}
function number(
  value: string | number | Date,
  label: string,
  row: number,
): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`第 ${row} 行「${label}」需要填写非负数字，或留空。`);
  return parsed;
}
function date(value: string | number | Date, date1904: boolean): string {
  if (value === "") return "";
  const parsed =
    value instanceof Date
      ? value
      : typeof value === "number"
        ? new Date(
            Date.UTC(1899, 11, 30) + (value + (date1904 ? 1462 : 0)) * 86400000,
          )
        : null;
  return parsed ? parsed.toISOString().slice(0, 10) : text(value);
}

export async function readStudentWorkbook(
  buffer: ArrayBuffer,
  data: DemoState,
): Promise<{
  rows: StudentProfileInput[];
  warnings: string[];
  skipped: number;
}> {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.worksheets.find((s) => s.actualRowCount > 0);
  if (!sheet) throw new Error("文件没有可读取的学员表。");
  const headers = studentWorkbookHeaders.map((header) => normalized(header));
  const first = sheet.getRow(1);
  const second = sheet.getRow(2);
  const original =
    normalized(first.getCell(6).text) === "学生名字" &&
    normalized(second.getCell(21).text) === headers[20];
  const indexes = headers.map((header) => {
    for (let col = 1; col <= sheet.columnCount; col++) {
      const candidate =
        original && col >= 21 && col <= 26
          ? second.getCell(col).text
          : first.getCell(col).text;
      if (normalized(candidate) === header) return col;
    }
    return -1;
  });
  const missing = studentWorkbookHeaders.filter((_, i) => indexes[i] < 0);
  if (missing.length)
    throw new Error(
      `无法识别表头：${missing.join("、")}。请使用「学生课程信息表」原表或下载的模板。`,
    );
  const rows: StudentProfileInput[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  const teacherKey = (name: string) =>
    name
      .replace(/^T\.\s*/i, "")
      .trim()
      .toLowerCase();
  for (let line = original ? 3 : 2; line <= sheet.rowCount; line++) {
    const row = sheet.getRow(line);
    const v = indexes.map((col) => cellValue(row.getCell(col).value));
    if (v.every((value) => value === "")) continue;
    if (v.every((value, i) => i === 3 || value === "")) {
      skipped++;
      continue;
    }
    const profile = emptyStudentProfile();
    profile.channel = text(v[0]);
    profile.orderStatus = text(v[1]);
    profile.purchaseDate = date(v[2], !!book.properties.date1904);
    profile.sourceSequence = text(v[3]);
    profile.groupName = text(v[4]);
    profile.name = text(v[5]);
    profile.phone = text(v[6]);
    profile.totalUnits = number(v[7], "总课时", line);
    profile.teacherName = text(v[8]);
    profile.teacherId =
      data.teachers.find(
        (teacher) =>
          teacherKey(teacher.name) === teacherKey(profile.teacherName),
      )?.id ?? "";
    if (profile.teacherName && !profile.teacherId)
      warnings.push(
        `第 ${line} 行：老师「${profile.teacherName}」尚未关联，已保留原名。`,
      );
    profile.material = text(v[9]);
    profile.scheduleText = text(v[10]);
    profile.frequencyText = text(v[11]);
    const planned = number(v[12], "月应上课", line),
      actual = number(v[13], "7月实际", line);
    profile.monthlyRecords = [
      {
        id: `original-${line}`,
        month: originalStudentMonth,
        planned,
        actual,
        note: "",
      },
    ];
    profile.firstLessonDate = date(v[14], !!book.properties.date1904);
    profile.ageText =
      v[15] !== "" && !Number.isFinite(Number(v[15])) ? text(v[15]) : "";
    profile.age = profile.ageText ? null : number(v[15], "年龄", line);
    profile.gender = text(v[16]);
    profile.personality = text(v[17]);
    profile.foreignTeacherExperience = text(v[18]);
    profile.preferences = text(v[19]);
    profile.legacyComplaints = text(v[20]);
    profile.legacyCompensations = text(v[21]);
    profile.legacyMissed = text(v[22]);
    profile.originalTeacher = text(v[23]);
    profile.firstChangedTeacher = text(v[24]);
    profile.secondChangedTeacher = text(v[25]);
    profile.renewalStatus = text(v[26]);
    switch (profile.orderStatus) {
      case "正常":
      case "在读":
        profile.status = "在读";
        break;
      case "退款":
      case "退费":
        profile.status = "退费";
        break;
      case "停课":
        profile.status = "停课";
        break;
      case "结课":
        profile.status = "结课";
        break;
      default:
        profile.status = "待排课";
        if (profile.orderStatus)
          warnings.push(
            `第 ${line} 行：订单状态「${profile.orderStatus}」保留原文，学员状态暂为待排课。`,
          );
    }
    rows.push(profile);
  }
  return { rows, warnings, skipped };
}
