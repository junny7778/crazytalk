import {customerWorkbook} from "./customerWorkbook";
import {classInLookup} from "./classInLookup";
import {surveyRelay} from "./surveyRelay";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react(),customerWorkbook(),surveyRelay(),classInLookup()],
  server: { fs: { allow: ["../.."] } },
});
