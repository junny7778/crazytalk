import type { Plugin } from "vite";
import { z } from "zod";
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

import { studentSurveyAnswers } from "../../packages/shared/src/model";
import { matchingSurveyAnswers, studentSurveyPrefillSchema, type StudentSurveyPrefill } from "../../packages/shared/src/studentSurvey";
type Entry = { secret: string; chineseName?: string; prefill?: StudentSurveyPrefill; answers?: unknown; nameEdited?: boolean; submittedAt?: string; revisionOpen?: boolean };
const profileUpdateSchema = studentSurveyPrefillSchema.extend({ submittedAt: z.string().optional() });
const legacySubmissionSchema = z.object({
  answers: studentSurveyAnswers,
  submittedAt: z.string().datetime({ offset: true }),
  prefill: studentSurveyPrefillSchema,
});
const uuid = z.string().uuid();

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
    submitted: !!entry.answers, revisionOpen: !!entry.revisionOpen, answers: entry.answers, nameEdited: entry.nameEdited, submittedAt: entry.submittedAt,
  });
  return {
    name: "student-survey-relay",
    configureServer(server) {
      server.middlewares.use("/api/intake", async (req, res) => {
        const [token, action] = (req.url || "/").split("?")[0].slice(1).split("/"),
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
        const restoreLegacy = action === "restore-legacy" && req.method === "POST";
        if (restoreLegacy && (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") ||
          !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host ?? "")
        )) return reply(403, {});
        if ((!token && req.method === "POST") || req.method === "PATCH" || restoreLegacy) {
          let body = "";
          for await (const chunk of req) {
            body += chunk;
            if (Buffer.byteLength(body) > 16384) return reply(413, {});
          }
          let input: unknown;
          try {
            input = body ? JSON.parse(body) : {};
          } catch {
            return reply(400, {});
          }
          if (restoreLegacy) {
            const secret = uuid.safeParse(req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]);
            if (!secret.success || !uuid.safeParse(token).success) return reply(403, {});
            const archive = legacySubmissionSchema.safeParse(input);
            if (!archive.success) return reply(400, {});
            const current = read(token);
            if (current && current.secret !== secret.data) return reply(403, {});
            if (current?.submittedAt) return reply(200, submission(current));
            const restored = { ...current, ...archive.data, secret: secret.data };
            save(token, restored);
            return reply(200, submission(restored));
          }
          const update = profileUpdateSchema.safeParse(input);
          if (!update.success) return reply(400, {});
          const { submittedAt, ...prefill } = update.data;
          if (req.method === "PATCH") {
            const current = read(token);
            if (!current) return reply(404, {});
            if (current.submittedAt === submittedAt)
              save(token, { ...current, prefill });
            return reply(200, submission(current));
          }
          const nextToken = randomUUID(), secret = randomUUID();
          save(nextToken, { secret, prefill });
          return reply(201, { token: nextToken, secret });
        }
        if (!entry) return reply(404, {});
        if (action === "reopen" && req.method === "POST") {
          if (req.headers.authorization !== "Bearer " + entry.secret) return reply(403, {});
          if (!entry.answers) return reply(409, {});
          save(token, { ...entry, revisionOpen: true });
          return reply(201, { revisionOpen: true });
        }
        if (req.method === "GET") {
          if (req.headers.authorization === "Bearer " + entry.secret)
            return reply(200, submission(entry));
          if (entry.answers && !entry.revisionOpen)
            return reply(200, { submitted: true });
          const original = studentSurveyPrefillSchema.safeParse(entry.answers);
          const prefill = entry.prefill ?? (original.success
            ? original.data
            : studentSurveyPrefillSchema.parse({ chineseName: entry.chineseName }));
          return reply(200, { submitted: false, chineseName: prefill.chineseName, prefill });
        }
        if (
          req.method === "DELETE" &&
          req.headers.authorization === "Bearer " + entry.secret
        ) {
          unlinkSync(join(root, token));
          return reply(200, submission(entry));
        }
        if (req.method !== "POST") return reply(405, {});
        if (entry.answers && !entry.revisionOpen) return reply(409, {});
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
          if (latest.answers && !latest.revisionOpen) return reply(409, {});
          const nameEdited = input.initialName !== parsed.data.chineseName;
          const prefill = {
            ...parsed.data,
            chineseName: nameEdited ? parsed.data.chineseName : latest.prefill?.chineseName || parsed.data.chineseName,
          };
          save(token, { ...latest, prefill, answers: parsed.data, submittedAt: new Date().toISOString(),
            nameEdited, revisionOpen: false });
          return reply(200, {});
        } catch {
          return reply(400, {});
        }
      });
    },
  };
}
