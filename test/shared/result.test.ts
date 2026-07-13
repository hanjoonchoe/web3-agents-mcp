import { describe, expect, it } from "vitest";
import { err, isOk, ok, type Result } from "../../src/shared/result.js";
import { bridgeError } from "../../src/shared/errors.js";

describe("Result", () => {
  it("ok() produces an ok result carrying the value", () => {
    const result = ok(42);
    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("err() produces a failed result carrying the error", () => {
    const error = bridgeError("INVALID_INPUT", "bad input");
    const result = err(error);
    expect(result).toEqual({ ok: false, error });
  });

  it("isOk() narrows the type so .value is accessible", () => {
    const result: Result<number> = ok(7);
    if (isOk(result)) {
      const value: number = result.value;
      expect(value).toBe(7);
    } else {
      throw new Error("expected ok result");
    }
  });

  it("isOk() returns false for an error result", () => {
    const result: Result<number> = err(bridgeError("RPC_ERROR", "boom"));
    expect(isOk(result)).toBe(false);
  });
});
