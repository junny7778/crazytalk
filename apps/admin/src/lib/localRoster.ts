import { demoRepository } from "@crazytalk/shared";
import { readStudentWorkbook } from "./studentWorkbook";

const batchId = "customer-workbook-20261111";
let pending: Promise<void> | undefined;
export function loadLocalRoster() {
  if (demoRepository.read().importedBatches?.includes(batchId)) {
    demoRepository.initializeRoster();
    return Promise.resolve();
  }
  return (pending ??= (async () => {
    const response = await fetch("/api/demo-student-workbook");
    if (response.status === 404) return;
    if (!response.ok) throw new Error("学员数据加载失败");
    const { rows } = await readStudentWorkbook(
      await response.arrayBuffer(),
      demoRepository.read(),
    );
    if (!rows.length || !rows.every((r) => r.roster))
      throw new Error("未识别新版学生信息表");
    demoRepository.initializeRoster({
      type: "student.import",
      students: rows,
      mode: "skip",
      batchId,
    });
  })().finally(() => {
    pending = undefined;
  }));
}
