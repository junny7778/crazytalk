import { businessApiProxy, localBusinessLog } from "../admin/localBusinessLog";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({mode}) => ({
  plugins: mode === "business" ? [react(), localBusinessLog()] : [react()],
  publicDir: "../admin/public",
  server: { ...(mode === "business" ? {port:5176,proxy:{"/api":businessApiProxy}} : {}), fs: { allow: ["../.."] } },
}));
