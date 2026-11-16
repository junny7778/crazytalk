import type { Cell, Worksheet } from "exceljs";
import {
  emptyStudentProfile,
  splitRosterName,
  studentOrganization,
  type Student,
  type DemoState,
  type StudentProfileInput,
} from "@crazytalk/shared";

// One label per business column. Blank and merged header cells are resolved
// from both header rows before any student is read.
export const rosterHeaders = [
  "订单状态",
  "停课日期",
  "学生",
  "手机号",
  "拉群日期（充值）",
  "匹配老师",
  "教务",
  "队别",
  "组别",
  "备注",
  "上课时间",
  "套餐共用",
  "每周固定课节数",
  "开始上课时间",
  "总课时",
  "起始教材",
  "性别",
  "年龄",
  "基础",
  "性格",
  "孩子兴趣爱好",
  "加入体系时间",
  "是否有接触过外教",
  "学员其他需求",
  "是否有坚持拍周一视频",
  "对体系了解程度",
  "换老师原因",
  "首三节课回访",
  "二次回访",
  "首月回访",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月上课状态",
  "11月",
  "续费次数",
  "应跟进月份",
  "续费套餐",
  "续费跟进日期",
  "续费状态",
  "实际续费日期",
  "不续费原因",
];
const clean = (v: string) =>
  v.replace(/\s/g, "").replace(/\(/g, "（").replace(/\)/g, "）");
function value(cell: Cell): string {
  if (cell.isMerged && cell.master.address !== cell.address) return "";
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) {
    // Excel uses a fictitious 1900-02-29. ExcelJS applies its offset even to earlier serial dates.
    const stamp = v.getTime();
    return new Date(
      stamp >= Date.UTC(1899, 11, 31) && stamp < Date.UTC(1900, 1, 28)
        ? stamp + 86400000
        : stamp,
    )
      .toISOString()
      .slice(0, 10);
  }
  if (v && typeof v === "object" && "result" in v && v.result instanceof Date)
    return v.result.toISOString().slice(0, 10);
  return cell.text.trim();
}
export function parseCustomerRoster(sheet: Worksheet, data: DemoState) {
  const positions = new Map<string, number>();
  const flat =
    sheet.getCell(1, 1).text === "学员ID" &&
    Array.from(
      { length: sheet.columnCount },
      (_, i) => sheet.getCell(1, i + 1).text,
    ).includes("套餐共用");
  for (let i = 1; i <= sheet.columnCount; i++) {
    const header = clean(
      flat
        ? sheet.getCell(1, i).text
        : sheet.getCell(2, i).text || sheet.getCell(1, i).text,
    );
    const match = rosterHeaders.find(
      (h) =>
        header === h ||
        (["订单状态", "上课时间", "对体系了解程度"].includes(h) &&
          header.startsWith(h + "（")),
    );
    if (flat && ["学生中文名", "学生英文名"].includes(header)) positions.set(header, i);
    if (match) positions.set(match, i);
  }
  if (!positions.has("队别") || !positions.has("套餐共用")) return null;
  const missing = rosterHeaders.filter((h) => !positions.has(h));
  if (missing.length)
    throw new Error("新版学生信息表缺少字段：" + missing.join("、"));
  const rows: StudentProfileInput[] = [],
    warnings: string[] = [];
  const keys = new Map<string, number>();
  const tutors = new Map(
    data.teachers.map((t) => [
      t.name.replace(/^T\.\s*/i, "").toLowerCase(),
      t.id,
    ]),
  );
  for (let n = flat ? 2 : 3; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);

    const fields: Record<string, string> = {};
    for (const [label, index] of positions) {
      const v = value(row.getCell(index));
      if (v) fields[label] = v;
    }
    const get = (h: string) => fields[h] || "";
    const raw = get("学生"),
      date = get("拉群日期（充值）");
    if (!raw && !get("学生中文名") && !get("学生英文名")) continue;
    const names = splitRosterName(raw);
    const chineseColumn = positions.get("学生中文名");
    const englishColumn = positions.get("学生英文名");
    const chineseName = (chineseColumn && get("学生中文名")) || names.chineseName;
    const englishName = englishColumn ? get("学生英文名") : names.englishName;
    const name = chineseName || englishName || raw;
    const sourceName = raw || [chineseName, englishName].filter(Boolean).join(" ");
    const base = JSON.stringify([sourceName, date]),
      occurrence = (keys.get(base) || 0) + 1;
    keys.set(base, occurrence);
    if (occurrence > 1)
      warnings.push(`第 ${n} 行学员标识和拉群日期重复，保留独立档案，请核对。`);
    const key = JSON.stringify([sourceName, date, occurrence]);
    const total = get("总课时"),
      age = get("年龄"),
      status = get("订单状态"),
      teacher = get("匹配老师"),
      phone = get("手机号");
    rows.push({
      ...emptyStudentProfile(),
      ...(flat && row.getCell(1).text
        ? { importStudentId: row.getCell(1).text.trim() }
        : {}),
      roster: { key, fields, row: n },
      name, chineseName, englishName,
      owner: get("教务"),
      phone: /^1\d{10}$/.test(phone) ? phone : "",
      teacherName: teacher,
      teacherId:
        tutors.get(teacher.replace(/^T\.\s*/i, "").toLowerCase()) || "",
      orderStatus: status,
      status: status.includes("退费")
        ? "退费"
        : status.includes("停课")
          ? "停课"
          : status.includes("结课")
            ? "结课"
            : status === "已开课"
              ? "在读"
              : "待排课",
      totalUnits: /^\d+(\.\d+)?$/.test(total) ? Number(total) : null,
      material: get("起始教材"),
      scheduleText: get("上课时间"),
      firstLessonDate: get("开始上课时间"),
      frequencyText: get("每周固定课节数"),
      gender: get("性别"),
      ageText: age,
      age: /^\d{1,2}岁?$/.test(age) ? parseInt(age) : null,
      level: get("基础"),
      personality: get("性格"),
      interests: get("孩子兴趣爱好"),
      foreignTeacherExperience: get("是否有接触过外教"),
      preferences: get("学员其他需求"),
      renewalStatus: get("续费状态"),
    });
  }
  return { rows, warnings, skipped: 0 };
}

export function rosterValues(
  s: Student,
  data: DemoState,
): Record<string, string | number> {
  const raw = s.roster?.fields ?? {};
  const org = studentOrganization(data.accounts, s.owner, s.roster);
  return {
    ...raw,
    学生: raw["学生"] || s.name,
    手机号:
      s.phone ||
      (raw["手机号"] && !/^1\d{10}$/.test(raw["手机号"]) ? raw["手机号"] : ""),
    订单状态: s.orderStatus,
    匹配老师:
      data.teachers.find((t) => t.id === s.teacherId)?.name || s.teacherName,
    教务: s.owner,
    队别: org.team,
    组别: org.group,
    上课时间: s.scheduleText,
    每周固定课节数: s.frequencyText,
    开始上课时间: s.firstLessonDate,
    总课时:
      s.totalUnits ??
      (raw["总课时"] && !/^\d+(\.\d+)?$/.test(raw["总课时"])
        ? raw["总课时"]
        : ""),
    起始教材: s.material,
    性别: s.gender,
    年龄: s.ageText || s.age || "",
    基础: s.level,
    性格: s.personality,
    孩子兴趣爱好: s.interests ?? "",
    是否有接触过外教: s.foreignTeacherExperience,
    学员其他需求: s.preferences,
    续费状态: s.renewalStatus,
  };
}
