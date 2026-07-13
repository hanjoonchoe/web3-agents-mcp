import { describe, expect, it } from "vitest";
import { bridgeError } from "../../src/shared/errors.js";

describe("bridgeError", () => {
  it("defaults RPC_ERROR to retryable:true", () => {
    const error = bridgeError("RPC_ERROR", "rpc failed");
    expect(error).toEqual({
      code: "RPC_ERROR",
      message: "rpc failed",
      retryable: true,
      cause: undefined,
    });
  });

  it("defaults AGENT_NOT_FOUND to retryable:false", () => {
    const error = bridgeError("AGENT_NOT_FOUND", "no such agent");
    expect(error.retryable).toBe(false);
  });

  it("defaults FILE_UNREACHABLE to retryable:true", () => {
    const error = bridgeError("FILE_UNREACHABLE", "no reach");
    expect(error.retryable).toBe(true);
  });

  it("allows overriding the default retryable value", () => {
    const error = bridgeError("RPC_ERROR", "rpc failed", { retryable: false });
    expect(error.retryable).toBe(false);
  });

  it("carries an optional cause through", () => {
    const cause = new Error("underlying");
    const error = bridgeError("INDEX_UNAVAILABLE", "index down", { cause });
    expect(error.cause).toBe(cause);
  });
});
