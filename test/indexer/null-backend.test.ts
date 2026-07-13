import { describe, expect, it } from "vitest";
import { NullBackend } from "../../src/indexer/null-backend.js";

describe("NullBackend", () => {
  const backend = new NullBackend();

  it("has name 'null'", () => {
    expect(backend.name).toBe("null");
  });

  it("ensureSynced always fails with INDEX_UNAVAILABLE mentioning a future release", async () => {
    const result = await backend.ensureSynced(8453);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INDEX_UNAVAILABLE");
    expect(result.error.message).toMatch(/future release/i);
  });

  it("search always fails with INDEX_UNAVAILABLE mentioning a future release", async () => {
    const result = await backend.search(8453, "some query", 20);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INDEX_UNAVAILABLE");
    expect(result.error.message).toMatch(/future release/i);
  });
});
