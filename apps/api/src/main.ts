import { ClassInClassesController } from "./integrations/classes.controller";
import "reflect-metadata";
import "dotenv/config";
import { config } from "dotenv";
import { ClassInWebhookController } from "./integrations/webhook.controller";
import { ClassInAccountController } from "./integrations/classin.controller";
if (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "production")
  config({ path: "../admin/.env.local", override: false });
import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { NestFactory } from "@nestjs/core";
import { LocalBusinessLog } from "./localBusinessLog";
import { writeBusinessLog } from "../../../scripts/local-business-log";
import { processClassInJob } from "./integrations/worker";
import { settleCompletedLessons } from "./settlement";
import { database, ensureStaffRoles } from "./store";
import { FilesController } from "./integrations/files.controller";
import { IntakeController } from "./integrations/intake.controller";
import { BusinessController } from "./controllers";
import { z } from "zod";

const configuration = z
  .object({
    DATABASE_URL: z.string().url(),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3011),
  })
  .safeParse(process.env);

if (!configuration.success) {
  throw new Error(
    "Invalid API configuration: " +
      configuration.error.issues
        .map((issue) => issue.path.join("."))
        .join(", "),
  );
}

const { API_PORT } = configuration.data;

@Controller("health")
class HealthController {
  @Get()
  async check() {
    try {
      await database.account.count();
      return { service: "crazytalk-api", database: "ready" };
    } catch {
      throw new ServiceUnavailableException("Database schema is not ready");
    }
  }
}

let settlementTimer: NodeJS.Timeout;
let workerTimer: NodeJS.Timeout;
let settlementWork: Promise<void> | undefined;
let workerWork: Promise<void> | undefined;

@Module({
  controllers: [
    HealthController,
    BusinessController,
    IntakeController,
    FilesController,
    ClassInAccountController,
    ClassInClassesController,
    ClassInWebhookController,
  ],
})
class AppModule {
  async onApplicationShutdown() {
    clearInterval(settlementTimer);
    clearInterval(workerTimer);
    await Promise.allSettled([settlementWork, workerWork]);
    await database.$disconnect();
  }
}

async function start() {
  await database.$connect();
  await ensureStaffRoles();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    app.useGlobalFilters(new LocalBusinessLog(app.getHttpAdapter()));
  }
  app.useBodyParser("json", { limit: "15mb" });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();
  await app.listen(API_PORT, "127.0.0.1");
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    void writeBusinessLog("api", { event: "started", port: API_PORT, pid: process.pid })
      .catch(() => process.stderr.write("Could not write local API diagnostic log.\n"));
  }
  settlementTimer = setInterval(() => {
    if (settlementWork) return;
    settlementWork = settleCompletedLessons()
      .then(
        () => {},
        () => {
          process.stderr.write(
            "Automatic settlement failed; records remain pending.\n",
          );
        },
      )
      .finally(() => {
        settlementWork = undefined;
      });
  }, 30000);
  workerTimer = setInterval(() => {
    if (workerWork) return;
    workerWork = processClassInJob()
      .catch(() => {
        process.stderr.write(
          "ClassIn worker failed; records require review.\n",
        );
      })
      .finally(() => {
        workerWork = undefined;
      });
  }, 5000);
  settlementTimer.unref();
  workerTimer.unref();
}

start().catch(() => {
  process.stderr.write(
    "API startup failed. Check database availability and configuration.\n",
  );
  process.exitCode = 1;
});
