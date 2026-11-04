#!/usr/bin/env node
const origin = process.env.CT_DEMO_URL || "http://127.0.0.1:5173";
for (const path of [
  "/",
  "/src/main.tsx",
  "/fonts/HarmonyOS_Sans_SC_Regular.woff2",
]) {
  const response = await fetch(origin + path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error(`${path}: empty response`);
  console.log(`PASS ${path} HTTP ${response.status}`);
}
