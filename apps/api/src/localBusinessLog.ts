import { type ArgumentsHost, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { writeBusinessLog } from "../../../scripts/local-business-log";

export class LocalBusinessLog extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      const req = host.switchToHttp().getRequest();
      const id = req.headers["x-request-id"];
      const requestId = typeof id === "string" && /^[\da-f-]{36}$/i.test(id) ? id : undefined;
      const error = exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.code
        : exception instanceof Error ? exception.constructor.name : "UnknownError";
      void writeBusinessLog("api", {
        event: "request-failed",
        method: req.method,
        route: req.route?.path,
        requestId,
        status,
        error,
      }).catch(() => process.stderr.write("Could not write local API diagnostic log.\n"));
    }
    super.catch(exception, host);
  }
}
