import type { Plugin } from "vite";
import { randomUUID, createHash } from "node:crypto";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

const answers = z.object({
  age: z.number().int().min(1).max(120),
  level: z.enum(["L0", "L1", "L2", "L3", "L4", "待评估"]),
  personality: z.string().max(80),
  interests: z.string().max(500),
  experience: z.string().max(500),
  material: z.string().max(500),
  times: z.string().max(500),
  needs: z.string().max(1000),
});
type Entry = { secret: string; answers?: z.infer<typeof answers> };
export function surveyRelay(): Plugin {
  const root = join(
    tmpdir(),
    "crazytalk-surveys-" +
      createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16),
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const save = (token: string, entry: Entry) => {
    const file = join(root, token);
    const tmp = file + "." + randomUUID();
    writeFileSync(tmp, JSON.stringify(entry), { mode: 0o600 });
    renameSync(tmp, file);
  };
  const read = (token: string): Entry | undefined =>
    /^[a-f0-9-]{36}$/.test(token) && existsSync(join(root, token))
      ? JSON.parse(readFileSync(join(root, token), "utf8"))
      : undefined;
  return {
    name: "student-survey-relay",
    configureServer(server) {
      server.middlewares.use("/api/intake", async (req, res) => {
        const token = (req.url || "/").split("?")[0].slice(1),
          entry = read(token);
        const reply = (status: number, value: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(value));
        };
        if (
          req.method === "POST" &&
          req.headers["content-type"] !== "application/json"
        )
          return reply(415, {});
        if (
          req.headers.origin &&
          new URL(req.headers.origin).host !== req.headers.host
        )
          return reply(403, {});
        if (!token && req.method === "POST") {
          if (
            !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress || "",
            )
          )
            return reply(403, {});
          const token = randomUUID(),
            secret = randomUUID();
          save(token, { secret });
          return reply(201, { token, secret });
        }
        if (!entry) return reply(404, {});
        if (req.method === "GET")
          return reply(
            200,
            req.headers.authorization === "Bearer " + entry.secret
              ? { submitted: !!entry.answers, answers: entry.answers }
              : { submitted: !!entry.answers },
          );
        if (
          req.method === "DELETE" &&
          req.headers.authorization === "Bearer " + entry.secret
        ) {
          unlinkSync(join(root, token));
          return reply(200, {});
        }
        if (req.method !== "POST") return reply(405, {});
        if (entry.answers) return reply(409, {});
        try {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16384) return reply(413, {});
          }
          const parsed = answers.safeParse(JSON.parse(body));
          if (!parsed.success) return reply(400, {});
          const latest = read(token);
          if (!latest) return reply(404, {});
          if (latest.answers) return reply(409, {});
          save(token, { ...latest, answers: parsed.data });
          return reply(200, {});
        } catch {
          return reply(400, {});
        }
      });
    },
  };
}
