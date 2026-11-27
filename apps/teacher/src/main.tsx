import { configureDemoClock, demoRepository } from "@crazytalk/shared";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider, BusinessProvider, businessMode } from "@crazytalk/shared/react";
import { LoadingFailureScreen, LoadingScreen, ToastProvider } from "@crazytalk/ui";
import "@crazytalk/ui/styles.css";
import App from "./App";
if (!businessMode()) {
  configureDemoClock();
  demoRepository.initializeDemoSamples();
}
const app = <ToastProvider><App /></ToastProvider>;
const entry = businessMode()
  ? <BusinessProvider failureScreen={LoadingFailureScreen} loadingScreen={<LoadingScreen message="正在加载业务数据…" />}>{app}</BusinessProvider>
  : <DemoProvider>{app}</DemoProvider>;
const client = new QueryClient();
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      {entry}
    </QueryClientProvider>
  </React.StrictMode>,
);
