/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DemoProvider } from "@crazytalk/shared/react";
import { ToastProvider } from "@crazytalk/ui";
import "@crazytalk/ui/styles.css";
import "./style.css";
import StudentSurvey from "./components/StudentSurvey";
import App from "./App";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter([{path:"/intake/:token",element:<StudentSurvey/>},{ path: "*", element: <App /> }]);
function LocalRoster({children}:{children:React.ReactNode}){
  const shouldLoad=import.meta.env.DEV && ["localhost","127.0.0.1"].includes(location.hostname) && !/^\/(intake|teacher)(\/|$)/.test(location.pathname);
  const [ready,setReady]=React.useState(!shouldLoad),[error,setError]=React.useState("");
  React.useEffect(()=>{if(!shouldLoad)return;let active=true;
    import("./lib/localRoster").then(m=>m.loadLocalRoster()).then(()=>{if(active)setReady(true);}).catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[shouldLoad]);
  if(!ready)return <main className="panel"><p role="status">{error || "正在载入本地学生信息表…"}</p>{error && <button onClick={()=>location.reload()}>重新读取</button>}</main>;
  return <>{children}</>;
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <LocalRoster><DemoProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </DemoProvider></LocalRoster>
    </QueryClientProvider>
  </React.StrictMode>,
);
