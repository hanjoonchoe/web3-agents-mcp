import { describe, expect, it } from "vitest";
import { toEnvelope } from "../../src/server/register-tools.js";
import { bridgeError } from "../../src/shared/errors.js";
import { err, ok } from "../../src/shared/result.js";

describe("tool envelope error-message hygiene", () => {
  it("a BridgeError with a 10KB multi-line message serializes to a single-line message <= ~310 chars ending in the truncation marker", () => {
    // Simulates viem passing through an entire embedded HTML error page.
    const firstLine = "HTTP request failed. " + "x".repeat(500);
    const hugeMessage = firstLine + "\n" + "<html>" + "y".repeat(10_000) + "</html>";
    expect(hugeMessage.length).toBeGreaterThan(10_000);

    const envelope = toEnvelope(
      err(bridgeError("RPC_ERROR", hugeMessage, { cause: new Error("keep me internal") })),
    );
    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;

    expect(envelope.error.message.length).toBeLessThanOrEqual(310);
    expect(envelope.error.message).not.toMatch(/\r|\n/);
    expect(envelope.error.message.endsWith("… [truncated]")).toBe(true);
    expect(envelope.error.message.startsWith("HTTP request failed.")).toBe(true);

    // code/retryable untouched; cause never serialized.
    expect(envelope.error.code).toBe("RPC_ERROR");
    expect(envelope.error.retryable).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain("keep me internal");
    expect("cause" in envelope.error).toBe(false);
  });

  it("truncates a multi-line message at the first newline even when short", () => {
    const envelope = toEnvelope(err(bridgeError("RPC_ERROR", "line one\nline two")));
    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.message).toBe("line one… [truncated]");
  });

  it("leaves short single-line messages unchanged", () => {
    const envelope = toEnvelope(err(bridgeError("INVALID_INPUT", "bad input")));
    expect(envelope.ok).toBe(false);
    if (envelope.ok) return;
    expect(envelope.error.message).toBe("bad input");
  });

  it("passes success results through untouched", () => {
    const envelope = toEnvelope(ok({ hello: "world" }));
    expect(envelope).toEqual({ ok: true, data: { hello: "world" } });
  });
});
