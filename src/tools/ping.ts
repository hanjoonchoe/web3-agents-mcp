import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { type Result, ok } from "../shared/result.js";

export type PingData = { pong: true; version: string };

function readPackageVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.join(here, "../../package.json");
  const raw = readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(raw) as { version: string };
  return parsed.version;
}

export function ping(): Result<PingData> {
  return ok({ pong: true, version: readPackageVersion() });
}
