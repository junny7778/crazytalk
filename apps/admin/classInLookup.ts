import { createHash } from "node:crypto";
import type { Plugin } from "vite";

export function demoClassInLookup(): Plugin {
  return {
    name: "demo-classin-account-lookup",
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
        try {
          let raw = "";
          for await (const chunk of req) {
            raw += chunk;
            if (raw.length > 256) return reply(413, { error: "请求过大" });
          }
          const { phone: input } = JSON.parse(raw);
          const phone = typeof input === "string" ? input.trim() : "";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phone) && !/^1\d{10}$/.test(phone))
            return reply(400, { error: "请填写有效的手机号或邮箱" });

          const hash = createHash("sha256").update(phone).digest();
          return reply(200, { uid: `9${hash.readBigUInt64BE()}`, addedToInstitution: false, demo: true });
        } catch {
          return reply(400, { error: "无效的查询请求" });
        }
      });
    },
  };
}
