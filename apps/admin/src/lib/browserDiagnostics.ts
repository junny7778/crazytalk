import type { BrowserDiagnostic } from "./browserDiagnostics.worker";

export const browserDiagnosticsEnabled = import.meta.env.DEV && ["127.0.0.1", "localhost"].includes(location.hostname);
const documentId: string = import.meta.hot?.data.diagnosticDocumentId || crypto.randomUUID();
if (import.meta.hot) import.meta.hot.data.diagnosticDocumentId = documentId;
let worker: Worker | undefined;
let stage: BrowserDiagnostic["stage"] = "boot";
let action: string | undefined;
let commits = 0, errors = 0, longTaskMs = 0, pendingRequests = 0, updateSequence = 0;
let errorSource: BrowserDiagnostic["errorSource"];
let errorKind: BrowserDiagnostic["errorKind"];
let errorCode: BrowserDiagnostic["errorCode"];
const seenErrorCodes = new Set<string>();
let frames: BrowserDiagnostic["frames"];
let request: BrowserDiagnostic["request"];
let hotUpdate: BrowserDiagnostic["hotUpdate"];
let lastErrorSent = -1000, lastClickSent = -1000, commitWindow = performance.now(), windowCommits = 0;

function sourceFrames(stack: string) {
  return [...stack.matchAll(/\/([\w.-]{1,80}\.(?:tsx?|jsx?))(?:\?[^\s:)]*)?:(\d+):(\d+)/g)]
    .slice(0, 6).map(match => ({ file: match[1], line: Number(match[2]), column: Number(match[3]) }));
}
function pulse(reason: BrowserDiagnostic["reason"] = "heartbeat") {
  if (!worker) return;
  const path = location.pathname.split("/")[1] || "dashboard";
  let screen = ["dashboard", "settings", "students", "teachers", "schedule", "lessons", "feedback", "payroll", "teacher", "intake"].includes(path) ? path : "other";
  if (screen === "settings") {
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "roles") screen = params.has("role") ? "role-detail" : "role-list";
    if (params.get("tab") === "basics") screen = "basic-settings";
    if (params.get("tab") === "org") screen = "organization-settings";
  }
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  worker.postMessage({ version: 2, documentId, reason, screen, stage, action, commits, errors, errorSource, errorKind, errorCode, frames,
    longTaskMs, pendingRequests, request, updateSequence, hotUpdate,
    mode: import.meta.env.MODE === "business" ? "business" : "demo",
    visible: document.visibilityState === "visible",
    heapMB: heap && Math.round(heap.usedJSHeapSize / 1048576),
    interaction: { blocked: document.body?.style.pointerEvents === "none", dialogs: document.querySelectorAll('[role="dialog"]').length, overlays: document.querySelectorAll('.overlay').length },
  } satisfies BrowserDiagnostic);
  longTaskMs = 0;
}
export function pulseBrowserDiagnostics() { pulse(); }
export function noteReactMount() { stage = "render"; pulse("mount"); }
export function noteReactUnmount(next: "unmounting" | "unmounted") { stage = next; pulse("lifecycle"); }
export function noteReactCommit() {
  commits++; stage = "committed"; windowCommits++;
  if (performance.now() - commitWindow >= 1000) {
    if (windowCommits >= 100) pulse("render-burst");
    commitWindow = performance.now(); windowCommits = 0;
  }
}
function noteError(kind: BrowserDiagnostic["errorKind"], error?: Error) {
  errors++; errorKind = kind;
  const message = error?.message || "";
  errorCode = message.includes("removeChild") ? "dom-remove-child"
    : message.includes("insertBefore") ? "dom-insert-before"
    : message.includes("业务页面缺少登录上下文") ? "business-context-missing"
    : message.includes("Maximum update depth") ? "update-depth"
    : message.includes("createRoot") ? "duplicate-root" : "other";
  const firstOccurrence = !seenErrorCodes.has(errorCode);
  seenErrorCodes.add(errorCode);
  if (!firstOccurrence && performance.now() - lastErrorSent < 1000) return;
  lastErrorSent = performance.now();
  frames = sourceFrames((error || new Error()).stack || ""); errorSource = frames[0];
  pulse("error");
}
function startBrowserDiagnostics() {
  const previousCleanup: (() => void) | undefined = import.meta.hot?.data.stopBrowserDiagnostics;
  previousCleanup?.();
  try { worker = new Worker(new URL("./browserDiagnostics.worker.ts", import.meta.url), { type: "module" }); } catch { return; }
  const listeners = new AbortController();
  const interval = window.setInterval(pulseBrowserDiagnostics, 1000);
  document.addEventListener("visibilitychange", () => pulse("visibility"), { signal: listeners.signal });
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || performance.now() - lastClickSent < 500) return;
    lastClickSent = performance.now();
    const target = event.target.closest("[data-diagnostic-action]");
    action = target?.getAttribute("data-diagnostic-action") ||
      (event.target.closest('.sidebar nav a') ? "sidebar-navigation" : event.target.closest('.overlay') ? "overlay-click" : "other-click");
    pulse("click");
  }, { capture: true, signal: listeners.signal });
  window.addEventListener("error", event => {
    noteError("uncaught", event.error instanceof Error ? event.error : undefined);
  }, { signal: listeners.signal });
  window.addEventListener("unhandledrejection", event => {
    noteError("rejection", event.reason instanceof Error ? event.reason : undefined);
  }, { signal: listeners.signal });
  const originalError = console.error;
  const diagnosticError: typeof console.error = (...args) => {
    originalError(...args);
    const message = typeof args[0] === "string" ? args[0] : "";
    const kind = message.includes("Maximum update depth") ? "update-depth"
      : message.includes("createRoot") ? "duplicate-root"
      : message.includes("React Router") || message.includes("ErrorBoundary") ? "react-boundary" : "console-error";
    noteError(kind, args.find((arg): arg is Error => arg instanceof Error));
  };
  console.error = diagnosticError;
  const originalFetch = window.fetch;
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const endpoint = address.replace(location.origin, "");
    if (endpoint !== "/api/me" && endpoint !== "/api/state") return originalFetch(input, init);
    const started = performance.now();
    const id = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)).get("X-Request-Id") || crypto.randomUUID();
    pendingRequests++; request = { id, endpoint, phase: "start" }; pulse("request");
    try {
      const response = await originalFetch(input, init);
      request = { id, endpoint, phase: "response", status: response.status, elapsedMs: Math.round(performance.now() - started) };
      return response;
    } catch (error) {
      request = { id, endpoint, phase: "rejected", elapsedMs: Math.round(performance.now() - started) };
      throw error;
    } finally { pendingRequests--; pulse("request"); }
  };
  window.fetch = diagnosticFetch;
  const beforeUpdate = () => { hotUpdate = "update"; updateSequence++; pulse("hmr-start"); };
  const afterUpdate = () => { hotUpdate = undefined; pulse("hmr-end"); };
  const beforeReload = () => { hotUpdate = "reload"; pulse("hmr-start"); };
  import.meta.hot?.on("vite:beforeUpdate", beforeUpdate);
  import.meta.hot?.on("vite:afterUpdate", afterUpdate);
  import.meta.hot?.on("vite:beforeFullReload", beforeReload);
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    observer = new PerformanceObserver(entries => {
      for (const entry of entries.getEntries()) longTaskMs = Math.max(longTaskMs, Math.round(entry.duration));
    });
    observer.observe({ type: "longtask" });
  }
  pulse("boot");
  const cleanup = () => {
    pulse("dispose");
    clearInterval(interval); listeners.abort(); observer?.disconnect();
    import.meta.hot?.off("vite:beforeUpdate", beforeUpdate);
    import.meta.hot?.off("vite:afterUpdate", afterUpdate);
    import.meta.hot?.off("vite:beforeFullReload", beforeReload);
    if (console.error === diagnosticError) console.error = originalError;
    if (window.fetch === diagnosticFetch) window.fetch = originalFetch;
    worker?.terminate(); worker = undefined;
    if (import.meta.hot?.data.stopBrowserDiagnostics === cleanup) delete import.meta.hot.data.stopBrowserDiagnostics;
  };
  if (import.meta.hot) {
    import.meta.hot.data.stopBrowserDiagnostics = cleanup;
    import.meta.hot.dispose(cleanup);
  }
}
if (browserDiagnosticsEnabled && typeof Worker !== "undefined") startBrowserDiagnostics();
