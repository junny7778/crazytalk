import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { classinConfiguration } from "./classin";

const directory = resolve(process.env.CLASSIN_DATA_DIRECTORY || ".data");
const file = resolve(directory, "classin-credentials.json");
export async function loadClassInConfiguration() {
  try {
    return classinConfiguration.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    return classinConfiguration.parse(process.env);
  }
}
