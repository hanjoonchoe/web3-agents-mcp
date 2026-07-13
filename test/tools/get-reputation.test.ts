import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { isOk, ok, err } from "../../src/shared/result.js";
import { bridgeError } from "../../src/shared/errors.js";
import type { FeedbackEntry, FeedbackSummary } from "../../src/registry/reputation.js";

const CLIENT_A: Address = "0x0000000000000000000000000000000000000001";

const summaries = new Map<
  string,
  ReturnType<typeof ok<FeedbackSummary>> | ReturnType<typeof err>
>();
const feedbacks = new Map<string, FeedbackEntry[]>();

vi.mock("../../src/registry/reputation.js", () => ({
  getSummary: vi.fn(async (chainId: number, agentId: bigint) => {
    const key = `${chainId}:${agentId.toString()}`;
    const found = summaries.get(key);
    if (found) return found;
    return err(bridgeError("AGENT_NOT_FOUND", "no fixture"));
  }),
  readFeedback: vi.fn(
    async (
      chainId: number,
      agentId: bigint,
      { limit, offset }: { limit: number; offset: number },
    ) => {
      const key = `${chainId}:${agentId.toString()}`;
      const all = feedbacks.get(key) ?? [];
      return ok(all.slice(offset, offset + limit));
    },
  ),
}));

const { getReputation, GetReputationOutput } = await import("../../src/tools/get-reputation.js");

const CHAIN_ID = 8453;
const SYBIL_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";

function setSummary(agentId: bigint, summary: FeedbackSummary): void {
  summaries.set(`${CHAIN_ID}:${agentId.toString()}`, ok(summary));
}

function setNotFound(agentId: bigint): void {
  summaries.set(
    `${CHAIN_ID}:${agentId.toString()}`,
    err(bridgeError("AGENT_NOT_FOUND", "not found")),
  );
}

function setFeedback(agentId: bigint, entries: FeedbackEntry[]): void {
  feedbacks.set(`${CHAIN_ID}:${agentId.toString()}`, entries);
}

describe("get_reputation tool", () => {
  it("T-1/T-3: happy path (count >= 5) includes the Sybil caveat but not the low-volume caveat", async () => {
    setSummary(1n, { count: 10n, averageScore: 85, lastFeedbackAt: null });
    const result = await getReputation({ agentId: "1" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.summary.count).toBe("10");
    expect(result.value.summary.averageScore).toBe(85);
    expect(result.value.caveats).toContain(SYBIL_CAVEAT);
    expect(result.value.caveats).not.toContain("No feedback recorded.");
    expect(result.value.caveats.some((c) => c.includes("statistics are not meaningful"))).toBe(
      false,
    );
  });

  it("T-2: zero feedback -> averageScore null, 'No feedback recorded.' caveat, ok:true, Sybil caveat present", async () => {
    setSummary(2n, { count: 0n, averageScore: null, lastFeedbackAt: null });
    const result = await getReputation({ agentId: "2" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.summary.count).toBe("0");
    expect(result.value.summary.averageScore).toBeNull();
    expect(result.value.caveats).toContain("No feedback recorded.");
    expect(result.value.caveats).toContain(SYBIL_CAVEAT);
  });

  it("T-3: count < 5 (and > 0) includes the low-volume caveat, substituting N; Sybil caveat present", async () => {
    setSummary(3n, { count: 3n, averageScore: 90, lastFeedbackAt: null });
    const result = await getReputation({ agentId: "3" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.caveats).toContain(
      "Only 3 feedback entries exist; statistics are not meaningful.",
    );
    expect(result.value.caveats).toContain(SYBIL_CAVEAT);
  });

  it("T-4/T-5: includeRaw false -> raw and pagination keys are absent entirely", async () => {
    setSummary(4n, { count: 2n, averageScore: 50, lastFeedbackAt: null });
    const result = await getReputation({ agentId: "4" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect("raw" in result.value).toBe(false);
    expect("pagination" in result.value).toBe(false);
  });

  it("T-4: includeRaw true -> paginated raw with pagination echo", async () => {
    setSummary(5n, { count: 3n, averageScore: 70, lastFeedbackAt: null });
    setFeedback(5n, [
      { client: CLIENT_A, score: 60, tag: "a", uri: null, timestamp: null },
      { client: CLIENT_A, score: 70, tag: "b", uri: null, timestamp: null },
      { client: CLIENT_A, score: 80, tag: "c", uri: null, timestamp: null },
    ]);
    const result = await getReputation({ agentId: "5", includeRaw: true, limit: 2, offset: 0 });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.raw).toHaveLength(2);
    expect(result.value.pagination).toEqual({ limit: 2, offset: 0, total: "3" });
  });

  it("T-4: includeRaw true with offset beyond total -> empty raw array, ok:true", async () => {
    setSummary(6n, { count: 1n, averageScore: 40, lastFeedbackAt: null });
    setFeedback(6n, [{ client: CLIENT_A, score: 40, tag: null, uri: null, timestamp: null }]);
    const result = await getReputation({ agentId: "6", includeRaw: true, limit: 50, offset: 100 });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.raw).toEqual([]);
  });

  it("T-6: unregistered agentId -> AGENT_NOT_FOUND", async () => {
    setNotFound(7n);
    const result = await getReputation({ agentId: "7" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AGENT_NOT_FOUND");
    }
  });

  it("T-11: limit is clamped at 200 (passed through to readFeedback clamped)", async () => {
    setSummary(8n, { count: 1n, averageScore: 50, lastFeedbackAt: null });
    setFeedback(8n, [{ client: CLIENT_A, score: 50, tag: null, uri: null, timestamp: null }]);
    const result = await getReputation({
      agentId: "8",
      includeRaw: true,
      limit: 10_000,
      offset: 0,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.pagination?.limit).toBe(200);
  });

  it("T-11: negative offset -> INVALID_INPUT", async () => {
    const result = await getReputation({ agentId: "1", offset: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("T-11: negative limit -> INVALID_INPUT", async () => {
    const result = await getReputation({ agentId: "1", limit: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("nonsensical agentId (not a decimal string) -> INVALID_INPUT", async () => {
    const result = await getReputation({ agentId: "not-a-number" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("T-10: happy-path output validates against the exported zod output schema", async () => {
    setSummary(9n, { count: 10n, averageScore: 85, lastFeedbackAt: null });
    setFeedback(9n, [{ client: CLIENT_A, score: 85, tag: "x", uri: null, timestamp: null }]);
    const result = await getReputation({ agentId: "9", includeRaw: true });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(() => GetReputationOutput.parse(result.value)).not.toThrow();
  });

  it("T-10: zero-feedback output (no raw) validates against the exported zod output schema", async () => {
    setSummary(10n, { count: 0n, averageScore: null, lastFeedbackAt: null });
    const result = await getReputation({ agentId: "10" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(() => GetReputationOutput.parse(result.value)).not.toThrow();
  });
});
