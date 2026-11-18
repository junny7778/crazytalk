import "reflect-metadata";
import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { ClassInWebhookController } from "./webhook.controller";
import { ClassInClient } from "./classin";
import { database } from "../store";

async function verify() {
  process.env.CLASSIN_API_BASE = "https://api.eeo.cn";
  process.env.CLASSIN_SID = "local-webhook-test";
  process.env.CLASSIN_SECRET = randomUUID();
  const timeStamp = Math.floor(Date.now() / 1000);
  const payload = {
    SID: process.env.CLASSIN_SID,
    TimeStamp: timeStamp,
    SafeKey: createHash("md5").update(process.env.CLASSIN_SECRET + timeStamp).digest("hex"),
    Cmd: "local-verification",
    testId: randomUUID(),
    data: { classId: "local-only" },
  };
  const client = new ClassInClient({
    CLASSIN_API_BASE: process.env.CLASSIN_API_BASE,
    CLASSIN_SID: process.env.CLASSIN_SID,
    CLASSIN_SECRET: process.env.CLASSIN_SECRET,
  });
  const { eventKey } = client.verifyWebhook(payload);
  const controller = new ClassInWebhookController();
  try {
    assert.equal((await controller.receive(payload)).error_info.errno, 1);
    assert.equal((await controller.receive(payload)).error_info.errno, 1);
    assert.equal(await database.classInWebhook.count({ where: { id: eventKey } }), 1);
    await assert.rejects(controller.receive({ ...payload, SafeKey: "0".repeat(32) }));
    const saved = await database.classInWebhook.findUniqueOrThrow({ where: { id: eventKey } });
    assert.equal(saved.processedAt, null);
    console.log("PASS webhook signature, duplicate delivery, durable inbox, pending processing");
  } finally {
    await database.classInWebhook.deleteMany({ where: { id: eventKey } });
    await database.$disconnect();
  }
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });
