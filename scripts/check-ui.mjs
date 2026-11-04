#!/usr/bin/env node
import ts from "typescript";
import { readdir, readFile } from "node:fs/promises";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const errors = [];
for (const dir of ["apps/admin/src", "apps/teacher/src"])
  for (const path of await files(dir)) {
    if (!/\.(tsx|css)$/.test(path)) continue;
    const source = await readFile(path, "utf8");
    if (/\.tsx$/.test(path) && /<(?:select|datalist)(?:\s|>)/.test(source))
      errors.push(
        `${path}: use shared Select instead of browser-native select`,
      );
    if (/#[\da-f]{3,8}\b/i.test(source))
      errors.push(`${path}: hardcoded color outside shared tokens`);
    if (/(?:bg|text|border)-(?:orange|slate|green|blue|red)-\d/.test(source))
      errors.push(`${path}: default palette`);
    if (/rounded-\[/.test(source)) errors.push(`${path}: arbitrary radius`);
  }
async function locale(name) {
  const source = await readFile(`apps/teacher/src/locales/${name}.ts`, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  return (
    await import(
      "data:text/javascript;base64," +
        Buffer.from(outputText).toString("base64")
    )
  ).default;
}
const en = await locale("en");
const zh = await locale("zh");
if (
  JSON.stringify(Object.keys(en).sort()) !==
  JSON.stringify(Object.keys(zh).sort())
)
  errors.push("Teacher locale keys differ");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log("PASS page colors, radii and teacher locale keys");
