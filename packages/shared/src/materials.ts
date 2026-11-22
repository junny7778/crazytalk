import type { DemoState, Student, Teacher } from "./model";

// Legacy student profiles stored one textbook name. An explicit empty list stays empty.
export function studentMaterialIds(
  data: DemoState,
  student: Pick<Student, "material" | "materialIds">,
) {
  return (
    student.materialIds ??
    data.catalog
      .filter((c) => c.type === "教材" && c.name === student.material)
      .map((c) => c.id)
  );
}
export function studentMaterials(
  data: DemoState,
  student: Pick<Student, "material" | "materialIds">,
) {
  const ids = studentMaterialIds(data, student);
  return data.catalog.filter(
    (c) => c.type === "教材" && c.enabled && ids.includes(c.id),
  );
}
export function materialMatchIssue(
  data: DemoState,
  student: Student,
  teacher: Teacher,
  material: string,
) {
  const entry = data.catalog.find(
    (c) => c.type === "教材" && c.enabled && c.name === material,
  );
  if (!entry) return "请先选择教材目录中启用的教材";
  if (!studentMaterialIds(data, student).includes(entry.id))
    return "请先在学员资料中登记本次学习教材";
  if (!teacher.materialIds?.includes(entry.id))
    return "老师未登记本节教材的授课能力，请选择其他老师或完善老师资料";
  return "";
}
