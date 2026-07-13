import type { BridgeError } from "./errors.js";

export type Result<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: BridgeError): Result<T> {
  return { ok: false, error };
}

export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}
