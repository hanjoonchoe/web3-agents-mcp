import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAgent } from "../../src/registry/identity.js";

// Requires `anvil` (Foundry) on PATH. Run via `pnpm test:fork` — excluded from the
// plain `pnpm test` run (see package.json).
const ANVIL_PORT = 8548;
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const BASE_FORK_RPC = process.env["BASE_FORK_RPC_URL"] ?? "https://mainnet.base.org";

// Fixture: a real agent registered on Base mainnet's Identity Registry
// (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432), resolved manually via eth_getLogs /
// eth_call against a public Base RPC on 2026-07-13. See SOURCE.md for how the
// deployment block / addresses were derived.
const FIXTURE_AGENT_ID = 0n;
const FIXTURE_OWNER = "0xa1DaEe3EB47f05f857aCA817523F9ff11d95bD71";
const HUGE_NONEXISTENT_ID = 2n ** 200n;

let anvil: ChildProcessWithoutNullStreams | undefined;
let anvilAvailable = false;

async function waitForRpc(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // anvil not up yet — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

beforeAll(async () => {
  process.env["RPC_URL_8453"] = ANVIL_URL;
  try {
    anvil = spawn("anvil", ["--fork-url", BASE_FORK_RPC, "--port", String(ANVIL_PORT)], {
      stdio: "pipe",
    });
  } catch {
    anvilAvailable = false;
    return;
  }
  anvilAvailable = await waitForRpc(ANVIL_URL, 30_000);
}, 40_000);

afterAll(() => {
  anvil?.kill();
  delete process.env["RPC_URL_8453"];
});

describe("identity registry reads (Base fork)", () => {
  it("T-8: resolves a real registered agent with its expected owner", async () => {
    if (!anvilAvailable) {
      throw new Error("anvil is not available/failed to start — cannot run fork test");
    }
    const result = await getAgent(8453, FIXTURE_AGENT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.owner.toLowerCase()).toBe(FIXTURE_OWNER.toLowerCase());
    }
  }, 30_000);

  it("T-8: a huge nonexistent agentId resolves to AGENT_NOT_FOUND", async () => {
    if (!anvilAvailable) {
      throw new Error("anvil is not available/failed to start — cannot run fork test");
    }
    const result = await getAgent(8453, HUGE_NONEXISTENT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  }, 30_000);
});
