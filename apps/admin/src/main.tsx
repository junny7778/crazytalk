/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, BusinessProvider } from "@crazytalk/shared/react";
import { LoadingFailureScreen, LoadingScreen, ToastProvider } from "@crazytalk/ui";
import "@crazytalk/ui/styles.css";
import "./style.css";
import StudentSurvey from "./components/StudentSurvey";
import BusinessLogin from "./components/BusinessLogin";
import {
  browserDiagnosticsEnabled,
  noteReactCommit,
  noteReactMount,
  noteReactUnmount,
  pulseBrowserDiagnostics,
} from "./lib/browserDiagnostics";
import App from "./App";
const previousCleanup: (() => void) | undefined = import.meta.hot?.data.cleanupApp;
previousCleanup?.();
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter([
  { path: "/intake/:token", element: <StudentSurvey /> },
  {
    path: "*",
    element: import.meta.env.MODE === "business"
      ? <BusinessProvider loginPage={BusinessLogin} failureScreen={LoadingFailureScreen} loadingScreen={<LoadingScreen message="正在加载业务数据…" />}><App /></BusinessProvider>
      : <DemoProvider><App /></DemoProvider>,
  },
]);
function LocalRoster({children}:{children:React.ReactNode}){
  const shouldLoad=import.meta.env.MODE !== "business" && import.meta.env.DEV && ["localhost","127.0.0.1"].includes(location.hostname) && !/^\/(intake|teacher)(\/|$)/.test(location.pathname);
  const [ready,setReady]=React.useState(!shouldLoad),[error,setError]=React.useState("");
  React.useEffect(()=>{if(!shouldLoad)return;let active=true;
    import("./lib/localRoster").then(m=>m.loadLocalRoster()).then(()=>{if(active)setReady(true);}).catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[shouldLoad]);
  if (!ready && error) return <main className="panel"><p role="alert">{error}</p><button onClick={() => location.reload()}>重新读取</button></main>;
  if (!ready) return <LoadingScreen message="正在加载学员数据…" />;
  return <>{children}</>;
}
const routerView = <RouterProvider router={router} />;
if (browserDiagnosticsEnabled) {
  router.subscribe(pulseBrowserDiagnostics);
  noteReactMount();
}
const root = ReactDOM.createRoot(document.getElementById("root")!);
if (import.meta.hot) {
  const hot = import.meta.hot;
  const cleanup = () => {
    if (hot.data.cleanupApp !== cleanup) return;
    delete hot.data.cleanupApp;
    noteReactUnmount("unmounting");
    router.dispose();
    root.unmount();
    client.clear();
    noteReactUnmount("unmounted");
  };
  hot.data.cleanupApp = cleanup;
  hot.dispose(cleanup);
}
root.render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <LocalRoster>
        <ToastProvider>
          {browserDiagnosticsEnabled
            ? <React.Profiler id="admin" onRender={noteReactCommit}>{routerView}</React.Profiler>
            : routerView}
        </ToastProvider>
      </LocalRoster>
    </QueryClientProvider>
  </React.StrictMode>,
);
