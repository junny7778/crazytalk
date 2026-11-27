/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, BusinessProvider } from "@crazytalk/shared/react";
import { configureDemoClock, demoRepository } from "@crazytalk/shared";
import { LoadingFailureScreen, LoadingScreen, ToastProvider } from "@crazytalk/ui";
import "@crazytalk/ui/styles.css";
import "./style.css";
import StudentSurvey from "./components/StudentSurvey";
import BusinessLogin from "./components/BusinessLogin";
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
function DemoStartup({children}:{children:React.ReactNode}){
  const [error] = React.useState(() => {
    if (import.meta.env.MODE === "business" || location.pathname.startsWith("/intake/")) return "";
    try {
      configureDemoClock();
      demoRepository.initializeDemoSamples();
      return "";
    } catch (error) {
      return String(error);
    }
  });
  if (error) return <main className="panel"><p role="alert">{error}</p><button onClick={() => location.reload()}>重新读取</button></main>;
  return <>{children}</>;
}
const routerView = <RouterProvider router={router} />;
const root = ReactDOM.createRoot(document.getElementById("root")!);
if (import.meta.hot) {
  const hot = import.meta.hot;
  const cleanup = () => {
    if (hot.data.cleanupApp !== cleanup) return;
    delete hot.data.cleanupApp;
    router.dispose();
    root.unmount();
    client.clear();
  };
  hot.data.cleanupApp = cleanup;
  hot.dispose(cleanup);
}
root.render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <DemoStartup>
        <ToastProvider>
          {routerView}
        </ToastProvider>
      </DemoStartup>
    </QueryClientProvider>
  </React.StrictMode>,
);
