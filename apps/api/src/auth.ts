import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { database } from "./store";
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function sessionToken(req: IncomingMessage) {
  return (
    req.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("ct_session="))
      ?.slice(11) || ""
  );
}
export function assertOrigin(req: IncomingMessage) {
  if (
    !req.headers.origin ||
    !(
      process.env.BUSINESS_ORIGIN ||
      "http://127.0.0.1:5175,http://127.0.0.1:5176"
    )
      .split(",")
      .includes(req.headers.origin)
  )
    throw new ForbiddenException("请求来源无效");
}
export async function requireIdentity(req: IncomingMessage, write = false) {
  const session = await database.session.findUnique({
    where: { id: tokenHash(sessionToken(req)) },
    include: { account: true },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    !session.account.enabled
  )
    throw new UnauthorizedException("请登录");
  if (write) {
    assertOrigin(req);
    if (req.headers["x-csrf-token"] !== session.csrfToken)
      throw new ForbiddenException("请求校验失败");
  }
  return {
    accountId: session.account.id,
    roleId: session.account.roleId,
    teacherId: session.account.teacherId || undefined,
    name: session.account.name,
    csrfToken: session.csrfToken,
  };
}
