import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureSyncedMock = vi.fn();
const searchMock = vi.fn();

vi.mock("../../src/indexer/null-backend.js", () => ({
  NullBackend: class {
    readonly name = "null";
    ensureSynced(...args: unknown[]): unknown {
      return ensureSyncedMock(...args);
    }
    search(...args: unknown[]): unknown {
      return searchMock(...args);
    }
  },
}));

const { searchAgents } = await import("../../src/tools/search-agents.js");
const { bridgeError } = await import("../../src/shared/errors.js");
const { err, ok } = await import("../../src/shared/result.js");

const ORIGINAL_INDEX_BACKEND = process.env["INDEX_BACKEND"];

describe("search_agents tool", () => {
  beforeEach(() => {
    ensureSyncedMock.mockReset();
    searchMock.mockReset();
    delete process.env["INDEX_BACKEND"];
  });

  afterEach(() => {
    if (ORIGINAL_INDEX_BACKEND === undefined) {
      delete process.env["INDEX_BACKEND"];
    } else {
      process.env["INDEX_BACKEND"] = ORIGINAL_INDEX_BACKEND;
    }
  });

  it("validation runs before backend selection: query too short -> INVALID_INPUT", async () => {
    const result = await searchAgents({ query: "a" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(ensureSyncedMock).not.toHaveBeenCalled();
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("missing query -> INVALID_INPUT", async () => {
    const result = await searchAgents({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("with the default (null) backend, returns the INDEX_UNAVAILABLE error envelope", async () => {
    ensureSyncedMock.mockResolvedValue(
      err(bridgeError("INDEX_UNAVAILABLE", "no local index backend is configured")),
    );
    const result = await searchAgents({ query: "translator agent" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INDEX_UNAVAILABLE");
    expect(result.error.retryable).toBe(false);
  });

  it("clamps a huge limit to the MAX_LIMIT (100) before calling the backend", async () => {
    ensureSyncedMock.mockResolvedValue(
      ok({ freshBlock: 1n, freshAt: new Date().toISOString(), syncing: false }),
    );
    searchMock.mockResolvedValue(ok([]));

    await searchAgents({ query: "translator", limit: 1_000_000 });

    expect(searchMock).toHaveBeenCalledTimes(1);
    const call = searchMock.mock.calls[0] as unknown[];
    expect(call[2]).toBe(100);
  });

  it("unknown INDEX_BACKEND env value -> INDEX_UNAVAILABLE mentioning valid values", async () => {
    process.env["INDEX_BACKEND"] = "sqlite-remote";
    const result = await searchAgents({ query: "translator" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INDEX_UNAVAILABLE");
    expect(result.error.message).toMatch(/sqlite-remote/);
    expect(result.error.message).toMatch(/null/);
    expect(ensureSyncedMock).not.toHaveBeenCalled();
  });
});
