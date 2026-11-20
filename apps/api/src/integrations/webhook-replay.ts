import { database, lockBusiness } from "../store";
import { applyClassInEvent } from "./webhook-events";

export async function processMappedClassInEvents() {
  await database.$transaction(async tx => {
    await lockBusiness(tx);
    const pending = await tx.classInWebhook.findMany({ where: { processedAt: null, error: {in:["待关联外部课节","待关联外部班级"]} }, orderBy: { receivedAt: "asc" } });
    for (const row of pending) {
      let error: string | null;
      try { error = await applyClassInEvent(tx, row.payload); }
      catch { error = "事件字段与订阅契约不一致"; }
      await tx.classInWebhook.update({ where: { id: row.id }, data: { error, processedAt: error ? null : new Date() } });
    }
  }, { timeout: 30000 });
}
