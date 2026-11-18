import { loadClassInConfiguration } from "./credentials";
import { Body, Controller, Post, Req, ServiceUnavailableException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { IncomingMessage } from "node:http";
import { z } from "zod";
import { ClassInClient } from "./classin";
import { requireIdentity } from "../auth";
import { canBusiness } from "../../../../packages/shared/src/access";
import { readState } from "../store";

@Controller("classin-account")
export class ClassInAccountController {
  @Post()
  async lookup(@Req() request: IncomingMessage, @Body() body: unknown) {
    const identity = await requireIdentity(request, true);
    const parsed = z.object({
      phone: z.string().trim().refine(value => /^1\d{10}$/.test(value) || /^00\d{1,4}-\d+$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
      password: z.string().min(6).max(20), consent: z.literal(true), role: z.enum(["student", "teacher"]),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("请填写有效账号及6至20位初始密码，并确认已获得账号持有人同意");
    const { phone, password, role } = parsed.data;
    if (!canBusiness(await readState(), identity, role === "teacher" ? "teacher.edit" : "classin_account.link")) throw new ForbiddenException();
    const configuration = await loadClassInConfiguration();
    try {
      return await new ClassInClient(configuration).registerAccount(phone, password, role);
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error && error.message.startsWith("ClassIn 注册") ? error.message : "ClassIn 注册/获取 UID 结果未确认，请核对账号状态");
    }
  }
}
