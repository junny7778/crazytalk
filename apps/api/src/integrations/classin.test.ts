import { describe, expect, it } from "vitest";
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
  it.each([1, 135, 461])("registers or obtains existing UID with official contract: %s", async errno => {
    const request: typeof fetch = async (url, init) => {
      expect(String(url)).toBe("https://api.eeo.cn/partner/api/course.api.php?action=register");
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("email")).toBe("teacher@example.com");
      expect(body.has("telephone")).toBe(false);
      expect(body.has("password")).toBe(false);
      expect(body.get("md5pass")).toBe(createHash("md5").update("initial123").digest("hex"));
      expect(body.get("addToSchoolMember")).toBe("2");
      return new Response(JSON.stringify({ error_info: { errno }, data: 12345 }));
    };
    await expect(new ClassInClient(config, request).registerAccount("teacher@example.com", "initial123", "teacher"))
      .resolves.toEqual({ phone: "teacher@example.com", uid: "12345" });
  });
  it("does not bind when registration succeeds but institution membership fails", async () => {
    const request: typeof fetch = async () => new Response(JSON.stringify({ error_info: { errno: 820 }, data: 12345 }));
    await expect(new ClassInClient(config, request).registerAccount("13800138000", "initial123", "student")).rejects.toThrow("820");
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
});
