import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export function classInLookup(): Plugin {
  return {
    name: "classin-account-lookup",
    configureServer(server) {
      server.middlewares.use("/api/classin-account", async (req, res) => {
        const reply = (code: number, result: object) => {
          res.statusCode = code;
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        };
        if (
          req.method !== "POST" ||
          req.headers["content-type"] !== "application/json" ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress || "",
          ) ||
          (req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host)
        )
          return reply(403, { error: "请通过本机教务端查询" });
        const {
          CLASSIN_API_BASE: base,
          CLASSIN_SID: sid,
          CLASSIN_SECRET: secret,
        } = process.env;
        if (!base || !sid || !secret)
          return reply(503, { error: "未配置机构查询凭据，请先登记手机号" });
        try {
          let raw = "";
          for await (const chunk of req) {
            raw += chunk;
            if (raw.length > 256) return reply(413, { error: "请求过大" });
          }
          const { phone } = JSON.parse(raw);
          if (typeof phone !== "string" || !/^1\d{10}$/.test(phone))
            return reply(400, { error: "请填写有效手机号" });
          const stamp = String(Math.floor(Date.now() / 1000));
          const dest = new URL(
            "/partner/api/school.api.php?action=getSchoolMemberList",
            base,
          );
          if (dest.protocol !== "https:")
            return reply(503, { error: "机构接口需使用 HTTPS" });
          const response = await fetch(dest, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
            body: new URLSearchParams({
              SID: sid,
              timeStamp: stamp,
              safeKey: createHash("md5")
                .update(secret + stamp)
                .digest("hex"),
              keyword: phone,
              page: "1",
              perpage: "200",
            }),
          });
          const j = await response.json();
          if (!response.ok || Number(j.error_info?.errno) !== 1)
            return reply(502, { error: "机构未确认查询成功" });
          const rows = Array.isArray(j.data)
            ? j.data
            : (j.data?.list ??
              j.data?.rows ??
              j.data?.members ??
              j.data?.memberList ??
              []);
          const uids = new Set<string>();
          for (const r of rows) {
            if (
              [
                r.mobile,
                r.telephone,
                r.phone,
                r.classInAccount,
                r.account,
                r.loginName,
              ].some(
                (v) =>
                  String(v ?? "")
                    .replace(/[\s-]/g, "")
                    .replace(/^\+?86(?=1\d{10}$)/, "") === phone,
              )
            ) {
              const uid = String(r.uid ?? r.userId ?? r.classinUid ?? "");
              if (/^[1-9]\d*$/.test(uid)) uids.add(uid);
            }
          }
          if (uids.size !== 1)
            return reply(409, {
              error: uids.size
                ? "存在多个匹配 UID，请核实"
                : "当前机构未找到精确匹配账号",
            });
          return reply(200, { uid: [...uids][0] });
        } catch {
          return reply(502, { error: "查询未完成，请重试" });
        }
      });
    },
  };
}
