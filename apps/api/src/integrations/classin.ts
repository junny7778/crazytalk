import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const classinConfiguration = z.object({
  CLASSIN_API_BASE: z.string().url().refine(value => new URL(value).protocol === "https:"),
  CLASSIN_SID: z.string().min(1),
  CLASSIN_SECRET: z.string().min(1),
});
const responseSchema = z.object({
  error_info: z.object({ errno: z.coerce.number(), error: z.string().optional() }),
  data: z.unknown().optional(),
});
export class ClassInUncertainError extends Error {}
export class ClassInTransportError extends ClassInUncertainError {}
export class ClassInApiError extends Error {
  constructor(readonly code: number) { super("ClassIn errno " + code); }
}
export class ClassInClient {
  constructor(
    private readonly configuration: z.infer<typeof classinConfiguration>,
    private readonly request: typeof fetch = fetch,
  ) {}

  async call(action: string, parameters: Record<string, string>) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHash("md5").update(this.configuration.CLASSIN_SECRET + timestamp).digest("hex");
    const url = new URL("/partner/api/course.api.php", this.configuration.CLASSIN_API_BASE);
    url.searchParams.set("action", action);
    const response = await this.request(url, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({ ...parameters, SID: this.configuration.CLASSIN_SID, timeStamp: timestamp, safeKey: signature }),
    }).catch(() => { throw new ClassInTransportError("ClassIn 请求结果未知，请核对外部记录"); });
    if (!response.ok) throw new (response.status >= 500 || response.status === 429 ? ClassInTransportError : ClassInUncertainError)("ClassIn HTTP " + response.status + "，执行结果待核实");
    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ClassInUncertainError("ClassIn 响应格式异常，执行结果待核实");
    const result = parsed.data;
    if ([280, 281, 398, 824, 841].includes(result.error_info.errno)) throw new ClassInUncertainError("ClassIn 唯一标识已存在，请核对外部 ID");
    const canceled = action === "delCourseClass" && [212, 823].includes(result.error_info.errno);
    const alreadyMember = action === "addCourseStudent" && result.error_info.errno === 133 || action === "delCourseStudent" && result.error_info.errno === 162;
    if (result.error_info.errno !== 1 && !canceled && !alreadyMember) throw new ClassInApiError(result.error_info.errno);
    return result.data;
  }

  async linkAccount(phone: string, name: string, role: "student" | "teacher") {
    const requestAccount = async (action: string, parameters: Record<string, string>) => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const response = await this.request(new URL("/partner/api/course.api.php?action=" + action, this.configuration.CLASSIN_API_BASE), {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        body: new URLSearchParams({ ...parameters, SID: this.configuration.CLASSIN_SID, timeStamp: timestamp,
          safeKey: createHash("md5").update(this.configuration.CLASSIN_SECRET + timestamp).digest("hex"),
        }),
      });
      if (!response.ok) throw new Error("ClassIn 关联请求 HTTP " + response.status + "，请核对账号状态");
      return responseSchema.parse(await response.json());
    };
    const membership = await requestAccount(role === "teacher" ? "addTeacher" : "addSchoolStudent",
      role === "teacher" ? { teacherAccount: phone, teacherName: name } : { studentAccount: phone, studentName: name });
    const code = membership.error_info.errno;
    if (code === 113) throw new Error("该账号尚未注册 ClassIn，请先注册后再关联");
    if (![1, 133].includes(code)) throw new Error("ClassIn 机构关联失败，错误码 " + code);
    // 仅在添加接口确认账号已存在后获取 UID；随机密码参数不会修改已有账号密码。
    const result = await requestAccount("register", {
      ...(phone.includes("@") ? { email: phone } : { telephone: phone }),
      md5pass: createHash("md5").update(randomBytes(10).toString("hex")).digest("hex"),
    });
    if (![135, 461].includes(result.error_info.errno))
      throw new Error("ClassIn 未确认已有账号 UID，错误码 " + result.error_info.errno + "，请核对账号状态");
    const uid = z.union([z.string().regex(/^[1-9]\d*$/), z.number().int().positive()]).parse(result.data);
    return { phone, uid: String(uid), addedToInstitution: code === 1 };
  }

  async callV2(path: string, body: Record<string, string | number | string[]>) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params = { ...body, sid: this.configuration.CLASSIN_SID, timeStamp: timestamp };
    const signature = createHash("md5").update(Object.entries(params).filter(([,value]) => !Array.isArray(value) && Buffer.byteLength(String(value), "utf8") <= 1024).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => key + "=" + value).join("&") + "&key=" + this.configuration.CLASSIN_SECRET).digest("hex");
    const response = await this.request(new URL(path, this.configuration.CLASSIN_API_BASE), {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", "X-EEO-SIGN": signature, "X-EEO-UID": this.configuration.CLASSIN_SID, "X-EEO-TS": timestamp },
      body: JSON.stringify(body),
    }).catch(() => { throw new ClassInTransportError("ClassIn 请求结果未知，请核对外部记录"); });
    if (!response.ok) throw new (response.status >= 500 || response.status === 429 ? ClassInTransportError : ClassInUncertainError)("ClassIn v2 HTTP " + response.status + "，执行结果待核实");
    const parsed = z.object({ code: z.coerce.number(), data: z.unknown().optional() }).safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ClassInUncertainError("ClassIn v2 响应格式异常，执行结果待核实");
    const result = parsed.data;
    if ([267, 398, 451, 824].includes(result.code)) throw new ClassInUncertainError("ClassIn v2 部分执行或唯一标识已存在，请核对外部记录");
    if (result.code !== 1) throw new Error("ClassIn v2 code " + result.code);
    return result.data;
  }

  async checkCredentials() {
    const stamp = String(Math.floor(Date.now() / 1000));
    const url = new URL("/partner/api/cloud.api.php?action=getFolderList", this.configuration.CLASSIN_API_BASE);
    const response = await this.request(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), body: new URLSearchParams({
      SID: this.configuration.CLASSIN_SID, timeStamp: stamp,
      safeKey: createHash("md5").update(this.configuration.CLASSIN_SECRET + stamp).digest("hex"),
    }) });
    const result = responseSchema.parse(await response.json());
    if (!response.ok || ![1, 106].includes(result.error_info.errno)) throw new Error("机构凭证验证失败");
  }

  createCourse(name: string, identity: string, mainTeacherUid?: string) {
    return this.call("addCourse", { courseName: name, courseUniqueIdentity: identity, ...(mainTeacherUid ? {mainTeacherUid} : {}) });
  }
  async addCourseTeacher(courseId: string, uid: string) {
    const response = await this.callV2("/course/addCourseTeacher", {courseId: Number(courseId), teacherUids: [uid]});
    const parsed = z.array(z.object({teacherUid:z.coerce.string(), code:z.coerce.number()})).safeParse(response);
    const member = parsed.success ? parsed.data.find(item => item.teacherUid === uid) : undefined;
    if (!member) throw new ClassInUncertainError("ClassIn 未返回该成员的添加结果，请核实班级成员");
    if (![1,133,30022].includes(member.code)) throw new ClassInApiError(member.code);
  }
  editLesson(courseId: string, classId: string, beginTime: number, endTime: number, teacherUid: string) {
    return this.call("editCourseClass", { courseId, classId, beginTime: String(beginTime), endTime: String(endTime), teacherUid });
  }
  cancelLesson(courseId: string, classId: string) {
    return this.call("delCourseClass", { courseId, classId });
  }

  verifyWebhook(input: unknown, now = Date.now()) {
    const payload = z.object({
      SID: z.coerce.string(), TimeStamp: z.coerce.number(),
      SafeKey: z.string().regex(/^[a-f0-9]{32}$/i), Cmd: z.union([z.string(), z.number()]),
    }).passthrough().parse(input);
    if (payload.SID !== this.configuration.CLASSIN_SID || Math.abs(now / 1000 - payload.TimeStamp) > 600)
      throw new Error("ClassIn 回调机构或时间戳不匹配");
    const expected = createHash("md5").update(this.configuration.CLASSIN_SECRET + payload.TimeStamp).digest();
    if (!timingSafeEqual(expected, Buffer.from(payload.SafeKey, "hex"))) throw new Error("ClassIn 回调签名无效");
    const { SafeKey, SID, TimeStamp, ...event } = payload;
    const serialized = JSON.stringify(event, (_key, value: unknown) => {
      if (value && typeof value === "object" && !Array.isArray(value))
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
      return value;
    });
    const eventKey = createHash("sha256").update(typeof event._id === "string" ? event._id : serialized).digest("hex");
    return { eventKey, event };
  }
}
export const classinAcknowledgement = { error_info: { errno: 1, error: "程序正常执行" } };
