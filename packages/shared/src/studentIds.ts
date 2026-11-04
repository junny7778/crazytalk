import type { Command, DemoState, Student } from "./model";

export function nextStudentId(students: readonly Pick<Student, "id">[]) {
  const used = new Set(students.map((student) => student.id));
  let candidate = 10000001;
  while (used.has(String(candidate))) candidate++;
  if (candidate > 99999999) throw new Error("学员ID已用完，暂时无法新建档案");
  return String(candidate);
}

export function resolveStudentId(data: DemoState, value: string) {
  return data.studentIdAliases?.[value] ?? value;
}

export function migrateStudentIds(current: DemoState) {
  if (current.students.some((student) => !student.id.trim()))
    throw new Error("学员ID为空，请先核对档案；原数据未修改");
  if (
    new Set(current.students.map((student) => student.id)).size !==
    current.students.length
  )
    throw new Error("学员ID存在重复，请先核对档案；原数据未修改");
  if (
    !current.studentIdAliases &&
    current.students.every((student) => /^\d{8}$/.test(student.id))
  )
    return { data: current, changed: false };
  const data = structuredClone(current);
  const mapping = new Map<string, string>();
  for (const student of data.students) {
    if (/^\d{8}$/.test(student.id)) continue;
    const old = student.id;
    student.id = nextStudentId(data.students);
    mapping.set(old, student.id);
  }
  let changed = mapping.size > 0;
  const remap = (value: string) => {
    const next =
      mapping.get(value) ?? current.studentIdAliases?.[value] ?? value;
    if (next !== value) changed = true;
    return next;
  };
  data.studentIdAliases = Object.fromEntries([
    ...Object.entries(data.studentIdAliases ?? {}).map(([old, value]) => [
      old,
      remap(value),
    ]),
    ...mapping,
  ]);
  for (const records of [
    data.lessons,
    data.feedback,
    data.credits,
    data.reports,
    data.tasks,
    data.referrals,
    data.events,
  ])
    for (const record of records) record.studentId = remap(record.studentId);
  for (const referral of data.referrals)
    referral.referrerStudentId = remap(referral.referrerStudentId);
  for (const task of data.tasks)
    if (task.sourceType === "student" && task.sourceId) {
      const parts = task.sourceId.split(":");
      if (parts[0] === "refund" && parts.length >= 3) {
        parts[1] = remap(parts[1]);
        task.sourceId = parts.join(":");
      } else task.sourceId = remap(task.sourceId);
    }
  for (const event of data.events)
    if (event.relatedType === "student" && event.relatedId)
      event.relatedId = remap(event.relatedId);
  return { data: changed ? data : current, changed };
}

export function resolveStudentCommand(
  data: DemoState,
  command: Command,
): Command {
  const next = { ...command };
  if ("studentId" in next)
    next.studentId = resolveStudentId(data, next.studentId);
  if ("referrerStudentId" in next)
    next.referrerStudentId = resolveStudentId(data, next.referrerStudentId);
  if (
    next.type === "student.details.update" ||
    next.type === "student.history.update" ||
    next.type === "student.profile" ||
    next.type === "student.balance.open" ||
    next.type === "student.edit"
  )
    next.id = resolveStudentId(data, next.id);
  if (next.type === "feedback.create" || next.type === "feedback.edit")
    next.feedback = {
      ...next.feedback,
      studentId: resolveStudentId(data, next.feedback.studentId),
    };
  if (next.type === "report.save")
    next.report = {
      ...next.report,
      studentId: resolveStudentId(data, next.report.studentId),
    };
  return next;
}
