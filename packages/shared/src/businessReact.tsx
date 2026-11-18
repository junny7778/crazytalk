import { ZodError } from "zod";
import { createContext, useContext, useEffect, useState, type ComponentType, type FormEventHandler, type ReactNode } from "react";
import { stateSchema, configureBusinessClock, type Command, type DemoState } from "./model";
import { BusinessRequestError, businessRequest, executeBusinessCommand, identitySchema, setBusinessIdentity, type Identity } from "./businessClient";

type BusinessContextValue = {
  data: DemoState; identity: Identity;
  act: (command: Command) => Promise<{ message: string; data: DemoState; undo?: () => void }>;
};
const BusinessContext = createContext<BusinessContextValue | null>(null);
export const useBusiness = () => useContext(BusinessContext);

export type BusinessLoginProps = {
  login: string;
  password: string;
  onLoginChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  error: string;
  busy: boolean;
};

export function BusinessProvider({ children, loadingScreen, failureScreen: FailureScreen, loginPage: LoginPage }: {
  children: ReactNode;
  loadingScreen: ReactNode;
  failureScreen: ComponentType<{ onRetry: () => void }>;
  loginPage?: ComponentType<BusinessLoginProps>;
}) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [data, setData] = useState<DemoState | null>(null);
  const [startup, setStartup] = useState<"loading" | "failed" | "ready">("loading");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function acceptState(next: DemoState) { setData(current => !current || next.revision >= current.revision ? next : current); }
  useEffect(() => {
    const clear = () => { setIdentity(null); setData(null); setPassword(""); };
    window.addEventListener("crazytalk-session-expired", clear);
    return () => window.removeEventListener("crazytalk-session-expired", clear);
  }, []);
  async function load(cancel?: AbortSignal) {
    setStartup("loading");
    setError("");
    const timeout = AbortSignal.timeout(15000);
    const signal = cancel ? AbortSignal.any([cancel, timeout]) : timeout;
    const started = performance.now();
    const requestId = crypto.randomUUID();
    let endpoint: "/me" | "/state" = "/me";
    try {
      configureBusinessClock();
      const account = identitySchema.parse(await businessRequest(endpoint, "GET", undefined, signal, requestId));
      setBusinessIdentity(account);
      endpoint = "/state";
      const next = stateSchema.parse(await businessRequest(endpoint, "GET", undefined, signal, requestId));
      setIdentity(account);
      setData(next);
      setStartup("ready");
    } catch (cause) {
      if (cancel?.aborted) return;
      const status = cause instanceof BusinessRequestError ? cause.status : undefined;
      if (status === 401) {
        setStartup("ready");
        return;
      }
      setStartup("failed");
      if ((import.meta as ImportMeta & { env?: { DEV: boolean } }).env?.DEV) {
        const kind = timeout.aborted ? "timeout"
          : status && status >= 400 ? "http"
          : cause instanceof ZodError || status ? "invalid-response"
          : cause instanceof TypeError ? "network" : "unexpected";
        const entry = { requestId, endpoint, status, kind, elapsedMs: Math.round(performance.now() - started) };
        void fetch("/__business-load-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
          keepalive: true,
        }).then(response => {
          if (!response.ok) console.warn("Could not save business load diagnostic", entry);
        }).catch(() => console.warn("Could not save business load diagnostic", entry));
      }
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || refreshing) return;
      refreshing = true;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      try {
        const account = identitySchema.parse(await businessRequest("/me", "GET", undefined, signal));
        const next = stateSchema.parse(await businessRequest("/state", "GET", undefined, signal));
        if (signal.aborted) return;
        setBusinessIdentity(account); setIdentity(account);
        configureBusinessClock(); acceptState(next); setError("");
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "业务服务连接失败");
      } finally {
        refreshing = false;
      }
    };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [identity?.accountId]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await businessRequest("/session", "POST", { login, password }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }
  if (startup === "loading") return loadingScreen;
  if (startup === "failed") return <FailureScreen onRetry={() => void load()} />;
  if ((!identity || !data) && LoginPage) return <LoginPage
    login={login}
    password={password}
    onLoginChange={setLogin}
    onPasswordChange={setPassword}
    onSubmit={signIn}
    error={error}
    busy={busy}
  />;
  if (!identity || !data) return <main className="panel" style={{ maxWidth: 400, margin: "10vh auto" }}>
    <h1>登录 Crazy Talk</h1>
    <form onSubmit={signIn} className="stack">
      <label>账号<input autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} required /></label>
      <label>密码<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? "登录中…" : "登录"}</button>
    </form>
  </main>;
  async function act(command: Command) {
    const result = await executeBusinessCommand(command);
    acceptState(result.data);
    return { ...result, undo: result.undoToken ? async () => {
      const undone = await businessRequest("/undo", "POST", { token: result.undoToken });
      acceptState(stateSchema.parse(undone.data));
    } : undefined };
  }
  return <BusinessContext.Provider value={{ data, identity, act }}>{error && <p role="alert">{error}</p>}{children}</BusinessContext.Provider>;
}
