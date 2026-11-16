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

import { matchingSurveyAnswers } from "../../packages/shared/src/studentSurvey";
type Entry = { secret: string; chineseName?: string; answers?: unknown; nameEdited?: boolean; submittedAt?: string };
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
  const submission = (entry: Entry) => ({
    submitted: !!entry.answers, answers: entry.answers, nameEdited: entry.nameEdited, submittedAt: entry.submittedAt,
  });
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
          (req.method === "POST" || req.method === "PATCH") &&
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
        }
        if (req.method === "PATCH" && (!entry || req.headers.authorization !== "Bearer " + entry.secret))
          return reply(entry ? 403 : 404, {});
        if ((!token && req.method === "POST") || req.method === "PATCH") {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16384) return reply(413, {});
          }
          let chineseName = "";
          try {
            const input = body ? JSON.parse(body) : {};
            if (input.chineseName !== undefined && typeof input.chineseName !== "string") return reply(400, {});
            chineseName = input.chineseName?.trim() || "";
          } catch {
            return reply(400, {});
          }
          if (req.method === "PATCH") {
            const current = read(token);
            if (!current) return reply(404, {});
            if (!current.answers && chineseName !== current.chineseName)
              save(token, { ...current, chineseName });
            return reply(200, submission(current));
          }
          const nextToken = randomUUID(), secret = randomUUID();
          save(nextToken, { secret, chineseName });
          return reply(201, { token: nextToken, secret });
        }
        if (!entry) return reply(404, {});
        if (req.method === "GET")
          return reply(
            200,
            req.headers.authorization === "Bearer " + entry.secret
              ? submission(entry)
              : { submitted: !!entry.answers, ...(!entry.answers && {chineseName: entry.chineseName || ""}) },
          );
        if (
          req.method === "DELETE" &&
          req.headers.authorization === "Bearer " + entry.secret
        ) {
          unlinkSync(join(root, token));
          return reply(200, submission(entry));
        }
        if (req.method !== "POST") return reply(405, {});
        if (entry.answers) return reply(409, {});
        try {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16384) return reply(413, {});
          }
          const input = JSON.parse(body);
          const parsed = matchingSurveyAnswers.safeParse(input);
          if (!parsed.success) return reply(400, {});
          const latest = read(token);
          if (!latest) return reply(404, {});
          if (latest.answers) return reply(409, {});
          save(token, { ...latest, answers: parsed.data, submittedAt: new Date().toISOString(),
            nameEdited: input.initialName !== parsed.data.chineseName });
          return reply(200, {});
        } catch {
          return reply(400, {});
        }
      });
    },
  };
}
