import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import "@crazytalk/ui/styles.css";
import "./style.css";
import App from "./App";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter([{ path: "*", element: <App /> }]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <DemoProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DemoProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
