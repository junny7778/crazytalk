import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const logDirectory = join(homedir(), ".crazytalk", "logs");

export async function writeBusinessLog(source: "api" | "browser" | "proxy", entry: object) {
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  await appendFile(
    join(logDirectory, `business-${source}.log`),
    JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n",
    { mode: 0o600 },
  );
}
