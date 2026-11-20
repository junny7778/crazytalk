import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { ClassInClient, ClassInUncertainError } from "./classin";
const config = { CLASSIN_API_BASE: "https://api.eeo.cn", CLASSIN_SID: "test", CLASSIN_SECRET: "secret" };
describe("ClassIn boundary", () => {
  it.each([1, 106])("accepts cloud credential response %s", async errno => {
    const request: typeof fetch = async () => new Response(JSON.stringify({ error_info: { errno } }));
    await expect(new ClassInClient(config, request).checkCredentials()).resolves.toBeUndefined();
  });
  it("rejects failed credential authentication", async () => {
    const request: typeof fetch = async () => new Response(JSON.stringify({ error_info: { errno: 102 } }));
    await expect(new ClassInClient(config, request).checkCredentials()).rejects.toThrow("机构凭证验证失败");
  });
  it.each([
    ["teacher", 1, 135], ["teacher", 133, 461],
    ["student", 1, 461], ["student", 133, 135],
  ] as const)("links %s membership %s then obtains UID", async (role, membershipCode, uidCode) => {
    const actions: string[] = [];
    const request: typeof fetch = async (url, init) => {
      const action = new URL(String(url)).searchParams.get("action")!;
      actions.push(action);
      const body = new URLSearchParams(String(init?.body));
      if (action !== "register") {
        expect(body.get(role === "teacher" ? "teacherAccount" : "studentAccount")).toBe("person@example.com");
        expect(body.get(role === "teacher" ? "teacherName" : "studentName")).toBe("Alice");
        return new Response(JSON.stringify({ error_info: { errno: membershipCode }, data: 999 }));
      }
      expect(body.get("email")).toBe("person@example.com");
      expect(body.get("md5pass")).toMatch(/^[a-f0-9]{32}$/);
      expect(body.has("password")).toBe(false);
      expect(body.has("addToSchoolMember")).toBe(false);
      return new Response(JSON.stringify({ error_info: { errno: uidCode }, data: 12345 }));
    };
    await expect(new ClassInClient(config, request).linkAccount("person@example.com", "Alice", role))
      .resolves.toEqual({ phone: "person@example.com", uid: "12345", addedToInstitution: membershipCode === 1 });
    expect(actions).toEqual([role === "teacher" ? "addTeacher" : "addSchoolStudent", "register"]);
  });
  it.each([113, 102, 845])("stops before register when adding member fails: %s", async errno => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error_info:{errno}})));
    await expect(new ClassInClient(config, request).linkAccount("13800138000", "Alice", "student"))
      .rejects.toThrow(errno === 113 ? "该账号尚未注册" : String(errno));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([820, 1])("does not report association success without confirmed existing UID: %s", async errno => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({error_info:{errno:1}})))
      .mockResolvedValueOnce(new Response(JSON.stringify({error_info:{errno},data:12345})));
    await expect(new ClassInClient(config, request).linkAccount("13800138000", "Alice", "teacher")).rejects.toThrow("未确认已有账号 UID");
  });
  it("signs requests and rejects explicit API errors", async () => {
    const request: typeof fetch = async (_url, init) => {
      const values = new URLSearchParams(String(init?.body));
      expect(values.get("SID")).toBe("test");
      expect(values.get("safeKey")).toBe(createHash("md5").update("secret" + values.get("timeStamp")).digest("hex"));
      return new Response(JSON.stringify({ error_info: { errno: 102 } }));
    };
    await expect(new ClassInClient(config, request).createCourse("test", "unique")).rejects.toThrow("102");
  });
  it("signs v2 and treats partial creation as unknown instead of retryable", async () => {
    const request: typeof fetch = async (_url, init) => {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body));
      const params = { ...body, sid: "test", timeStamp: headers.get("X-EEO-TS") };
      const signed = Object.keys(params).sort().map(key => key + "=" + params[key]).join("&") + "&key=secret";
      expect(headers.get("X-EEO-SIGN")).toBe(createHash("md5").update(signed).digest("hex"));
      return new Response(JSON.stringify({ code: 267 }));
    };
    await expect(new ClassInClient(config, request).callV2("/lms/activity/createClass", { courseId: 1, teacherUid: 2 })).rejects.toBeInstanceOf(ClassInUncertainError);
  });
  it.each([212, 823])("recognizes documented lesson deletion outcome %s", async errno => {
    const request: typeof fetch = async () => new Response(JSON.stringify({ error_info: { errno } }));
    const client = new ClassInClient(config, request);
    await expect(client.cancelLesson("1", "2")).resolves.toBeUndefined();
    await expect(client.createCourse("course", "identity")).rejects.toThrow("ClassIn errno " + errno);
  });
  it("verifies webhook signature and rejects stale delivery", () => {
    const timestamp = Math.floor(Date.now()/1000);
    const payload = { SID: "test", TimeStamp: timestamp, Cmd: "test", SafeKey: createHash("md5").update("secret" + timestamp).digest("hex") };
    const client = new ClassInClient(config);
    expect(client.verifyWebhook(payload).eventKey).toHaveLength(64);
    expect(() => client.verifyWebhook(payload, (timestamp+601)*1000)).toThrow();
    expect(() => client.verifyWebhook({...payload, SafeKey:"0".repeat(32)})).toThrow();
  });
  it("AC-20 keeps teacher UID arrays in the body but excludes them and long values from signing", async () => {
    const clock=vi.spyOn(Date,"now").mockReturnValue(1700000000000);
    try {
      const request:typeof fetch=async(_url,init)=>{
        expect(JSON.parse(String(init?.body)).teacherUids).toEqual(["42"]);
        expect(new Headers(init?.headers).get("X-EEO-SIGN")).toBe(createHash("md5").update("courseId=7&sid=test&timeStamp=1700000000&key=secret").digest("hex"));
        return new Response(JSON.stringify({code:1,data:[]}));
      };
      await new ClassInClient(config,request).callV2("/course/addCourseTeacher",{courseId:7,teacherUids:["42"],description:"中".repeat(400)});
    } finally {clock.mockRestore();}
  });
  it.each([1,133,30022])("AC-19 accepts confirmed teacher membership %s",async code=>{
    const request:typeof fetch=async()=>new Response(JSON.stringify({code:1,data:[{teacherUid:42,code}]}));
    await expect(new ClassInClient(config,request).addCourseTeacher("7","42")).resolves.toBeUndefined();
  });
  it("AC-19 rejects a failed member even when the outer response succeeds",async()=>{
    const request:typeof fetch=async()=>new Response(JSON.stringify({code:1,data:[{teacherUid:42,code:387}]}));
    await expect(new ClassInClient(config,request).addCourseTeacher("7","42")).rejects.toThrow("387");
  });
});
