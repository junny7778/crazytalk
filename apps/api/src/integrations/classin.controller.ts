import { loadClassInConfiguration } from "./credentials";
import { Body, Controller, Post, Req, ServiceUnavailableException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { IncomingMessage } from "node:http";
import { z } from "zod";
import { ClassInClient } from "./classin";
import { requireIdentity } from "../auth";
import { assertCommandAccess, canBusiness } from "../../../../packages/shared/src/access";
import { readState } from "../store";

@Controller("classin-account")
export class ClassInAccountController {
  @Post()
  async link(@Req() request: IncomingMessage, @Body() body: unknown) {
    const identity = await requireIdentity(request, true);
    const parsed = z.object({
      phone: z.string().trim().refine(value => /^1\d{10}$/.test(value) || /^00\d{1,4}-\d+$/.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
      name: z.string().trim().min(1).max(24), role: z.enum(["student", "teacher", "staff"]), targetId: z.string().min(1),
    }).safeParse(body);
    if (!parsed.success) throw new BadRequestException("请填写有效账号和姓名");
    const { phone, name, role, targetId } = parsed.data;
    const state = await readState();
    if (!canBusiness(state, identity, role === "staff" ? "account.manage" : role === "teacher" ? "teacher.edit" : "classin_account.link")) throw new ForbiddenException();
    try {
      if (role === "student") {
        const known = state.classInAccounts?.find(a => a.phone === phone);
        assertCommandAccess(state, identity, {type: "student.bindClassIn", id: targetId, phone, uid: known?.uid || "unresolved"});
      } else if (role === "teacher") {
        const teacher = state.teachers.find(t => t.id === targetId);
        if (!teacher) throw new Error("请先保存老师档案");
        assertCommandAccess(state, identity, {type: "teacher.save", teacher});
      } else if (!state.accounts.some(a => a.id === targetId && a.enabled && ["ops", "tm"].includes(a.roleId))) {
        throw new Error("请选择已保存且启用的教务或 TM 账号");
      }
    } catch (error) { throw new ForbiddenException(error instanceof Error ? error.message : "对象不在授权范围内"); }
    const configuration = await loadClassInConfiguration();
    try {
      return await new ClassInClient(configuration).linkAccount(phone, name, role === "staff" ? "teacher" : role);
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error && (error.message.startsWith("ClassIn ") || error.message.startsWith("该账号尚未注册")) ? error.message : "ClassIn 关联结果未确认，请核对账号状态");
    }
  }
}
