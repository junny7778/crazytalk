import { businessApiProxy, localBusinessLog } from "./localBusinessLog";
import {customerWorkbook} from "./customerWorkbook";
import {demoClassInLookup} from "./classInLookup";
import {surveyRelay} from "./surveyRelay";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  cacheDir: mode === "business" ? "node_modules/.vite-business" : "node_modules/.vite-demo",
  plugins: [react(), localBusinessLog(), ...(mode === "business" ? [] : [customerWorkbook(), surveyRelay(), demoClassInLookup()])],
  server: { ...(mode === "business" ? { port: 5175, proxy: { "/api": businessApiProxy } } : {}), fs: { allow: ["../.."] } },
}));
