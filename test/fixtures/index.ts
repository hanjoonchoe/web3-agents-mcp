import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const VALID_REGISTRATION_PATH = path.join(here, "registration-valid.json");
export const NOT_JSON_PATH = path.join(here, "registration-not-json.txt");

export const validRegistrationBytes = (): Uint8Array =>
  new Uint8Array(readFileSync(VALID_REGISTRATION_PATH));
export const notJsonBytes = (): Uint8Array => new Uint8Array(readFileSync(NOT_JSON_PATH));
