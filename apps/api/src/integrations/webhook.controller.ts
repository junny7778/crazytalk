import { loadClassInConfiguration } from "./credentials";
import { Body, Controller, ForbiddenException, Post, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { classinAcknowledgement, ClassInClient, classinConfiguration } from "./classin";
import { applyClassInEvent } from "./webhook-events";
import { database, lockBusiness } from "../store";

@Controller("webhooks/classin")
export class ClassInWebhookController {
  @Post()
  async receive(@Body() body: unknown) {
    const configuration = await loadClassInConfiguration();
    let verified;
    try {
      verified = new ClassInClient(configuration).verifyWebhook(body);
    } catch {
      throw new ForbiddenException("ClassIn 回调验签失败");
    }
    const payload: Prisma.InputJsonObject = JSON.parse(JSON.stringify(verified.event));
    await database.$transaction(async tx => {
      await lockBusiness(tx);
      const existing = await tx.classInWebhook.findUnique({ where: { id: verified.eventKey } });
      if (existing?.processedAt) return;
      let error: string | null;
      try { error = await applyClassInEvent(tx, payload); }
      catch { error = "事件字段与订阅契约不一致"; }
      await tx.classInWebhook.upsert({
        where: { id: verified.eventKey },
        create: { id: verified.eventKey, command: String(verified.event.Cmd), payload, error, processedAt: error ? null : new Date() },
        update: { error, processedAt: error ? null : new Date() },
      });
    });
    return classinAcknowledgement;
  }
}
