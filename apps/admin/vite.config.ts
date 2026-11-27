import {demoClassInLookup} from "./classInLookup";
import {surveyRelay} from "./surveyRelay";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  cacheDir: mode === "business" ? "node_modules/.vite-business" : "node_modules/.vite-demo",
  plugins: [react(), ...(mode === "business" ? [] : [surveyRelay(), demoClassInLookup()])],
  server: { ...(mode === "business" ? { port: 5175, proxy: { "/api": { target: "http://127.0.0.1:3011" } } } : {}), fs: { allow: ["../.."] } },
}));
