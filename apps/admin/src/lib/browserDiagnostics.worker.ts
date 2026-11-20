export type BrowserDiagnostic = {
  version: 2;
  documentId: string;
  reason: "lifecycle" | "heartbeat" | "boot" | "mount" | "dispose" | "visibility" | "click" | "error" | "request" | "hmr-start" | "hmr-end" | "render-burst";
  updateSequence: number;
  pendingRequests: number;
  interaction: { blocked: boolean; dialogs: number; overlays: number };
  errorCode?: "dom-remove-child" | "dom-insert-before" | "business-context-missing" | "update-depth" | "duplicate-root" | "other";
  errorKind?: "uncaught" | "rejection" | "update-depth" | "duplicate-root" | "react-boundary" | "console-error";
  frames?: { file: string; line: number; column: number }[];
  request?: { id: string; endpoint: "/api/me" | "/api/state"; phase: "start" | "response" | "rejected"; status?: number; elapsedMs?: number };
  screen: string;
  mode: "business" | "demo";
  stage: "boot" | "render" | "committed" | "unmounting" | "unmounted";
  action?: string;
  visible: boolean;
  commits: number;
  heapMB?: number;
  longTaskMs: number;
  errors: number;
  errorSource?: { file: string; line: number };
  hotUpdate?: "update" | "reload";
};

const pageId = crypto.randomUUID();
let last: BrowserDiagnostic | undefined;
let receivedAt = 0;
let missed = 0;
let reportedErrors = 0;
let lastCheckpoint = 0;
let signalWindow = 0, signals = 0;
let lastLongTaskAt = -10000;
let nextHeapWarningMB = 512;

function report(
  event: "diagnostic" | "checkpoint" | "page-start" | "main-thread-stall" | "main-thread-recovered" | "long-task" | "runtime-error" | "heap-high",
  snapshot: BrowserDiagnostic,
  gapMs?: number,
) {
  void fetch("/__business-render-log", {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, pageId, ...snapshot, gapMs }),
  }).catch(() => {});
}

addEventListener("message", ({ data }: MessageEvent<BrowserDiagnostic>) => {
  const now = performance.now();
  if (!last) report("page-start", data);
  if (data.reason === "heartbeat" && missed >= 6) report("main-thread-recovered", data, Math.round(now - receivedAt));
  if (data.errors > reportedErrors && !reportedErrors) report("runtime-error", data);
  if (data.heapMB !== undefined && data.heapMB >= nextHeapWarningMB) {
    report("heap-high", data);
    nextHeapWarningMB = data.heapMB * 2;
  }
  if (data.longTaskMs >= 500 && now - lastLongTaskAt >= 10000) {
    report("long-task", data);
    lastLongTaskAt = now;
  }
  if (now - signalWindow >= 1000) { signalWindow = now; signals = 0; }
  if (data.reason !== "heartbeat" && signals++ < 10) report("diagnostic", data);
  if (now - lastCheckpoint >= 15000) { lastCheckpoint = now; report("checkpoint", data); }
  reportedErrors = data.errors;
  last = data;
  if (data.reason === "heartbeat" || !receivedAt) { receivedAt = now; missed = 0; }
});

// Count worker ticks so a system sleep does not look like a blocked renderer.
setInterval(() => {
  if (last?.visible && ++missed === 6)
    report("main-thread-stall", last, Math.round(performance.now() - receivedAt));
}, 1000);
