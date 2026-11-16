import { demoRepository } from "@crazytalk/shared";
import { readStudentWorkbook } from "./studentWorkbook";

const batchId = "customer-workbook-20261111";
let pending: Promise<void> | undefined;
export function loadLocalRoster() {
  if (demoRepository.read().importedBatches?.includes(batchId)) {
    demoRepository.populateRosterActivity();
    return Promise.resolve();
  }
  return (pending ??= (async () => {
    const response = await fetch("/api/demo-student-workbook");
    if (response.status === 404) return;
    if (!response.ok) throw new Error("本地学生信息表读取失败");
    const { rows } = await readStudentWorkbook(
      await response.arrayBuffer(),
      demoRepository.read(),
    );
    if (!rows.length || !rows.every((r) => r.roster))
      throw new Error("未识别新版学生信息表");
    demoRepository.execute({
      type: "student.import",
      students: rows,
      mode: "skip",
      batchId,
    });
    demoRepository.populateRosterActivity();
  })().finally(() => {
    pending = undefined;
  }));
}
