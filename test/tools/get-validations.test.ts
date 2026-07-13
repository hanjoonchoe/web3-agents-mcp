import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { ok, err } from "../../src/shared/result.js";
import { bridgeError } from "../../src/shared/errors.js";
import type { ValidationEntry, ValidationsPage } from "../../src/registry/validation.js";

const VALIDATOR_A: Address = "0x0000000000000000000000000000000000000003";
const HASH_A: Hex = `0x${"a".repeat(64)}`;

const pages = new Map<string, ReturnType<typeof ok<ValidationsPage>> | ReturnType<typeof err>>();

vi.mock("../../src/registry/validation.js", () => ({
  getValidations: vi.fn(
    async (
      chainId: number,
      agentId: bigint,
      { limit, offset }: { limit: number; offset: number },
    ) => {
      const key = `${chainId}:${agentId.toString()}`;
      const found = pages.get(key);
      if (found) {
        if (found.ok) {
          const sliced = found.value.entries.slice(offset, offset + limit);
          return ok({ entries: sliced, total: found.value.total });
        }
        return found;
      }
      return err(bridgeError("AGENT_NOT_FOUND", "no fixture"));
    },
  ),
}));

const { getValidations, GetValidationsOutput } = await import("../../src/tools/get-validations.js");

const CHAIN_ID = 8453;

function setPage(agentId: bigint, entries: ValidationEntry[]): void {
  pages.set(`${CHAIN_ID}:${agentId.toString()}`, ok({ entries, total: entries.length }));
}

function setNotFound(agentId: bigint): void {
  pages.set(`${CHAIN_ID}:${agentId.toString()}`, err(bridgeError("AGENT_NOT_FOUND", "not found")));
}

describe("get_validations tool", () => {
  it("T-7: happy path decodes entries incl. method classification", async () => {
    setPage(1n, [
      { validator: VALIDATOR_A, method: "tee", requestHash: HASH_A, response: 80, timestamp: 123n },
      {
        validator: VALIDATOR_A,
        method: "other",
        requestHash: HASH_A,
        response: 50,
        timestamp: 456n,
      },
    ]);
    const result = await getValidations({ agentId: "1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.count).toBe("2");
    expect(result.value.entries[0]?.method).toBe("tee");
    expect(result.value.entries[0]?.timestamp).toBe("123");
    expect(result.value.entries[1]?.method).toBe("other");
  });

  it("T-8: zero validations -> entries [], count '0', ok:true (not an error)", async () => {
    setPage(2n, []);
    const result = await getValidations({ agentId: "2" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toEqual([]);
    expect(result.value.count).toBe("0");
  });

  it("T-9: response bounds 0 and 100 pass through unchanged", async () => {
    setPage(3n, [
      { validator: VALIDATOR_A, method: "other", requestHash: HASH_A, response: 0, timestamp: 1n },
      {
        validator: VALIDATOR_A,
        method: "other",
        requestHash: HASH_A,
        response: 100,
        timestamp: 2n,
      },
    ]);
    const result = await getValidations({ agentId: "3" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries[0]?.response).toBe(0);
    expect(result.value.entries[1]?.response).toBe(100);
  });

  it("T-6: unregistered agentId -> AGENT_NOT_FOUND", async () => {
    setNotFound(4n);
    const result = await getValidations({ agentId: "4" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("T-11: limit clamped at 200", async () => {
    setPage(5n, [
      { validator: VALIDATOR_A, method: "other", requestHash: HASH_A, response: 1, timestamp: 1n },
    ]);
    const result = await getValidations({ agentId: "5", limit: 10_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pagination.limit).toBe(200);
  });

  it("T-11: negative offset -> INVALID_INPUT", async () => {
    const result = await getValidations({ agentId: "1", offset: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("nonsensical agentId -> INVALID_INPUT", async () => {
    const result = await getValidations({ agentId: "-3" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("T-10: output validates against the exported zod output schema", async () => {
    setPage(6n, [
      { validator: VALIDATOR_A, method: "zk", requestHash: HASH_A, response: 42, timestamp: 999n },
    ]);
    const result = await getValidations({ agentId: "6" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => GetValidationsOutput.parse(result.value)).not.toThrow();
  });

  it("T-10: zero-entry output validates against the exported zod output schema", async () => {
    setPage(7n, []);
    const result = await getValidations({ agentId: "7" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(() => GetValidationsOutput.parse(result.value)).not.toThrow();
  });
});
