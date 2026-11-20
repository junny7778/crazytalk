import type { Plugin, ProxyOptions } from "vite";
import { z } from "zod";
import { writeBusinessLog } from "../../scripts/local-business-log";

const loadFailure = z.object({
  requestId: z.string().uuid(),
  endpoint: z.enum(["/me", "/state"]),
  kind: z.enum(["timeout", "network", "http", "invalid-response", "unexpected"]),
  status: z.number().int().min(100).max(599).optional(),
  elapsedMs: z.number().int().nonnegative(),
});

const renderEvent = z.object({
  event: z.enum(["diagnostic", "checkpoint", "page-start", "main-thread-stall", "main-thread-recovered", "long-task", "runtime-error", "heap-high"]),
  pageId: z.string().uuid(),
  version: z.literal(2).optional(),
  documentId: z.string().uuid().optional(),
  reason: z.enum(["lifecycle", "heartbeat", "boot", "mount", "dispose", "visibility", "click", "error", "request", "hmr-start", "hmr-end", "render-burst"]).optional(),
  updateSequence: z.number().int().nonnegative().optional(),
  pendingRequests: z.number().int().nonnegative().optional(),
  interaction: z.object({ blocked: z.boolean(), dialogs: z.number().int().nonnegative(), overlays: z.number().int().nonnegative() }).optional(),
  errorCode: z.enum(["dom-remove-child", "dom-insert-before", "business-context-missing", "update-depth", "duplicate-root", "other"]).optional(),
  errorKind: z.enum(["uncaught", "rejection", "update-depth", "duplicate-root", "react-boundary", "console-error"]).optional(),
  frames: z.array(z.object({ file: z.string().regex(/^[\w.-]{1,80}\.(?:tsx?|jsx?)$/), line: z.number().int().nonnegative(), column: z.number().int().nonnegative() })).max(6).optional(),
  request: z.object({ id: z.string().uuid(), endpoint: z.enum(["/api/me", "/api/state"]), phase: z.enum(["start", "response", "rejected"]), status: z.number().int().min(100).max(599).optional(), elapsedMs: z.number().int().nonnegative().optional() }).optional(),
  mode: z.enum(["business", "demo"]).default("business"),
  screen: z.enum(["dashboard", "settings", "basic-settings", "role-list", "role-detail", "students",
    "teachers", "schedule", "lessons", "feedback", "payroll", "teacher", "intake", "other", "organization-settings"]),
  stage: z.enum(["boot", "render", "committed", "unmounting", "unmounted"]),
  action: z.enum(["new-role", "copy-role", "save-role", "confirm-role", "save-teacher", "sidebar-navigation", "overlay-click", "other-click"]).optional(),
  hotUpdate: z.enum(["update", "reload"]).optional(),
  visible: z.boolean(),
  commits: z.number().int().nonnegative(),
  heapMB: z.number().int().nonnegative().optional(),
  longTaskMs: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  errorSource: z.object({
    file: z.string().regex(/^[\w.-]{1,80}\.(?:tsx?|jsx?)$/),
    line: z.number().int().nonnegative(),
  }).optional(),
  gapMs: z.number().int().nonnegative().optional(),
});

export function localBusinessLog(): Plugin {
  return {
    name: "local-business-log",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler: () => [{
        tag: "script",
        attrs: { type: "module", src: "/src/lib/browserDiagnostics.ts" },
        injectTo: "head-prepend",
      }],
    },
    handleHotUpdate(context) {
      void writeBusinessLog("browser", { event: "source-update", port: context.server.config.server.port,
        file: context.file.split("/").slice(-3).join("/"), modules: context.modules.length,
      }).catch(() => process.stderr.write("Could not write local update diagnostic log.\n"));
    },
    configureServer(server) {
      const endpoints = [
        ["/__business-load-log", loadFailure],
        ["/__business-render-log", renderEvent],
      ] as const;
      for (const [endpoint, schema] of endpoints) server.middlewares.use(endpoint, async (req, res) => {
        if (
          req.method !== "POST" ||
          req.headers["content-type"] !== "application/json" ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress || "") ||
          req.headers.origin !== `http://${req.headers.host}`
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 4096) {
            res.statusCode = 413;
            res.end();
            return;
          }
        }

        try {
          const entry = schema.parse(JSON.parse(raw));
          await writeBusinessLog("browser", { event: "startup-load-failed", port: req.socket.localPort, ...entry });
          res.statusCode = 204;
        } catch (error) {
          res.statusCode = error instanceof SyntaxError || error instanceof z.ZodError ? 400 : 500;
        }
        res.end();
      });
    },
  };
}

export const businessApiProxy: ProxyOptions = {
  target: "http://127.0.0.1:3011",
  configure(proxy) {
    proxy.on("error", (error, req) => {
      const endpoint = req.url?.split("?")[0];
      if (endpoint !== "/api/me" && endpoint !== "/api/state") return;
      const requestId = z.string().uuid().safeParse(req.headers["x-request-id"]);
      void writeBusinessLog("proxy", {
        event: "upstream-unavailable",
        endpoint,
        requestId: requestId.success ? requestId.data : undefined,
        error: "code" in error ? error.code : error.name,
      }).catch(() => process.stderr.write("Could not write local proxy diagnostic log.\n"));
    });
  },
};
