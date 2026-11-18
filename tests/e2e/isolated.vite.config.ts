import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: fileURLToPath(new URL("../../apps/admin", import.meta.url)),
  plugins: [react()],
  server: {
    port: 5177,
    proxy: { "/api": "http://127.0.0.1:3192" },
    fs: { allow: [fileURLToPath(new URL("../../", import.meta.url))] },
  },
});
