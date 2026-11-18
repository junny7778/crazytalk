import { database, lockBusiness } from "../store";
import { applyClassInEvent } from "./webhook-events";

export async function processMappedClassInEvents() {
  await database.$transaction(async tx => {
    await lockBusiness(tx);
    const pending = await tx.classInWebhook.findMany({ where: { processedAt: null, error: "待关联外部课节" }, orderBy: { receivedAt: "asc" } });
    for (const row of pending) {
      const event = row.payload as { ClassID?: string | number; CourseID?: string | number };
      const mapping = await tx.classInLesson.findFirst({ where: { classId: String(event.ClassID), courseId: String(event.CourseID) } });
      if (!mapping?.teacherUid || !mapping.studentUid) continue;
      let error: string | null;
      try { error = await applyClassInEvent(tx, row.payload); }
      catch { error = "事件字段与订阅契约不一致"; }
      await tx.classInWebhook.update({ where: { id: row.id }, data: { error, processedAt: error ? null : new Date() } });
    }
  }, { timeout: 30000 });
}
