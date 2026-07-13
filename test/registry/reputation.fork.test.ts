import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSummary, readFeedback } from "../../src/registry/reputation.js";

// Requires `anvil` (Foundry) on PATH. Run via `pnpm test:fork` — excluded from the
// plain `pnpm test` run (see package.json), same convention as identity.fork.test.ts.
const ANVIL_PORT = 8549;
const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const BASE_FORK_RPC = process.env["BASE_FORK_RPC_URL"] ?? "https://mainnet.base.org";

// Fixture: the same real registered agent used by identity.fork.test.ts
// (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432, agentId 0, Base mainnet). Unlike that
// agent's Identity Registry record, it turns out this agent *does* have real
// Reputation Registry feedback (57 entries as of the retrieval date in SOURCE.md,
// 2026-07-13) — manually verified via `getClients`/`getSummary`/`readAllFeedback`
// against a public Base RPC. That data is a useful real-world case: the feedback
// submitters used *inconsistent* value scales (e.g. raw value 74200 at 2 decimals
// decodes to 742, well above any 0-100 convention), so the live contract's own
// `getSummary` aggregate (count 57, summaryValue 15377, decimals 2 -> 153.77) is
// itself outside [0, 100]. This is exactly the scenario the documented clamp in
// `normalizeScore` (see registry/reputation.ts header) exists for, and this test
// asserts the clamp fires against real on-chain data, not just a synthetic mock.
const FIXTURE_AGENT_ID = 0n;
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

describe("reputation registry reads (Base fork)", () => {
  it("decodes a real agent's summary and clamps an out-of-range on-chain average to 100", async () => {
    if (!anvilAvailable) {
      throw new Error("anvil is not available/failed to start — cannot run fork test");
    }
    const result = await getSummary(8453, FIXTURE_AGENT_ID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.count).toBe(57n);
      // Real on-chain average (15377 / 10^2 = 153.77) exceeds 100 — clamped.
      expect(result.value.averageScore).toBe(100);
      expect(result.value.lastFeedbackAt).toBeNull();
    }
  }, 30_000);

  it("readFeedback decodes real feedback entries with scores clamped into [0, 100]", async () => {
    if (!anvilAvailable) {
      throw new Error("anvil is not available/failed to start — cannot run fork test");
    }
    const result = await readFeedback(8453, FIXTURE_AGENT_ID, { limit: 10, offset: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(10);
      for (const entry of result.value) {
        expect(entry.score).toBeGreaterThanOrEqual(0);
        expect(entry.score).toBeLessThanOrEqual(100);
        expect(entry.uri).toBeNull();
        expect(entry.timestamp).toBeNull();
      }
    }
  }, 30_000);

  it("a huge nonexistent agentId resolves to AGENT_NOT_FOUND", async () => {
    if (!anvilAvailable) {
      throw new Error("anvil is not available/failed to start — cannot run fork test");
    }
    const result = await getSummary(8453, HUGE_NONEXISTENT_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  }, 30_000);
});
