import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({mode}) => ({
  plugins: [react()],
  publicDir: "../admin/public",
  server: { ...(mode === "business" ? {port:5176,proxy:{"/api":{ target: "http://127.0.0.1:3011" }}} : {}), fs: { allow: ["../.."] } },
}));
