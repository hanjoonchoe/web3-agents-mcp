import { describe, expect, it, vi } from "vitest";
import type { Address } from "viem";
import { bridgeError } from "../../src/shared/errors.js";
import { err, isOk, ok } from "../../src/shared/result.js";
import { assembleTrustReport, type AssembleDeps } from "../../src/trust/assemble.js";
import type { AgentRecord } from "../../src/registry/identity.js";
import type { FeedbackSummary } from "../../src/registry/reputation.js";
import type { ValidationsPage } from "../../src/registry/validation.js";
import type { FetchedFile } from "../../src/fetcher/fetch.js";

const OWNER: Address = "0x0000000000000000000000000000000000000001";

const IDENTITY_RECORD: AgentRecord = {
  agentId: 1n,
  owner: OWNER,
  tokenUri: "data:application/json,{}",
  registeredAt: null,
};

const FILE: FetchedFile = {
  content: { name: "Test Agent" },
  raw: new Uint8Array(),
  verified: true,
  source: "data",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  hashComputed: "0xabc",
  contentError: null,
};

const REPUTATION: FeedbackSummary = { count: 57n, averageScore: 100, lastFeedbackAt: null };
const VALIDATIONS: ValidationsPage = { entries: [], total: 0 };

function makeDeps(overrides: Partial<AssembleDeps> = {}): AssembleDeps {
  return {
    getAgent: vi.fn(async () => ok(IDENTITY_RECORD)),
    getSummary: vi.fn(async () => ok(REPUTATION)),
    getValidations: vi.fn(async () => ok(VALIDATIONS)),
    fetchRegistrationFile: vi.fn(async () => ok(FILE)),
    ...overrides,
  };
}

describe("assembleTrustReport — R-1/R-2 happy path", () => {
  it("full success: all sections populated, missing empty, score matches hand-computation", async () => {
    const deps = makeDeps();
    const result = await assembleTrustReport(8453, 1n, { deps });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const report = result.value;
    expect(report.missing).toEqual([]);
    expect(report.identity).not.toBeNull();
    expect(report.registrationFile).not.toBeNull();
    expect(report.reputation).not.toBeNull();
    expect(report.validations).not.toBeNull();
    // 30 base + 20 verified + 20 volume cap + 15 avg + 0 validation = 85
    expect(report.assessment.score).toBe(85);
    expect(report.assessment.confidence).toBe("low"); // 0 validations
  });
});

describe("assembleTrustReport — R-2 identity failure semantics", () => {
  it("T-2: AGENT_NOT_FOUND from identity -> plain error envelope, no report", async () => {
    const deps = makeDeps({
      getAgent: vi.fn(async () => err(bridgeError("AGENT_NOT_FOUND", "no such agent"))),
    });
    const result = await assembleTrustReport(8453, 999n, { deps });
    expect(isOk(result)).toBe(false);
    if (isOk(result)) return;
    expect(result.error.code).toBe("AGENT_NOT_FOUND");
  });

  it("T-2: non-AGENT_NOT_FOUND identity failure (e.g. RPC_ERROR) -> report with identity+registrationFile missing, score null", async () => {
    const deps = makeDeps({
      getAgent: vi.fn(async () => err(bridgeError("RPC_ERROR", "rpc down"))),
    });
    const result = await assembleTrustReport(8453, 1n, { deps });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const report = result.value;
    expect(report.identity).toBeNull();
    expect(report.registrationFile).toBeNull();
    expect(report.missing).toContain("identity");
    expect(report.missing).toContain("registrationFile");
    expect(report.assessment.score).toBeNull();
  });
});

describe("assembleTrustReport — T-3 exactly one of reputation/validations failing", () => {
  it("reputation fails, validations succeed -> validations populated, reputation missing, ok:true", async () => {
    const deps = makeDeps({
      getSummary: vi.fn(async () => err(bridgeError("RPC_ERROR", "reputation rpc down"))),
    });
    const result = await assembleTrustReport(8453, 1n, { deps });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const report = result.value;
    expect(report.reputation).toBeNull();
    expect(report.validations).not.toBeNull();
    expect(report.missing).toEqual(["reputation"]);
  });

  it("validations fail, reputation succeeds -> reputation populated, validations missing, ok:true", async () => {
    const deps = makeDeps({
      getValidations: vi.fn(async () => err(bridgeError("RPC_ERROR", "validations rpc down"))),
    });
    const result = await assembleTrustReport(8453, 1n, { deps });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const report = result.value;
    expect(report.validations).toBeNull();
    expect(report.reputation).not.toBeNull();
    expect(report.missing).toEqual(["validations"]);
  });
});

describe("assembleTrustReport — R-3 wall-clock budget (T-7)", () => {
  it("hanging sub-query does not block the report; hung part ends up in missing", async () => {
    vi.useFakeTimers();
    try {
      const hangingPromise = new Promise<never>(() => {
        /* never resolves */
      });
      const deps = makeDeps({
        getValidations: vi.fn(
          () => hangingPromise as unknown as ReturnType<AssembleDeps["getValidations"]>,
        ),
      });

      const resultPromise = assembleTrustReport(8453, 1n, { deps, timeoutMs: 1000 });
      // Let all microtasks (identity/reputation/file resolution) flush, then advance
      // past the budget so the hanging validations call is abandoned.
      await vi.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(isOk(result)).toBe(true);
      if (!isOk(result)) return;
      const report = result.value;
      expect(report.validations).toBeNull();
      expect(report.missing).toContain("validations");
      // The other sections should have completed normally within the budget.
      expect(report.identity).not.toBeNull();
      expect(report.reputation).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("assembleTrustReport — exceptions from deps never throw out (R-1)", () => {
  it("a dep that throws synchronously is mapped to a missing section, not an uncaught rejection", async () => {
    const deps = makeDeps({
      getSummary: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const result = await assembleTrustReport(8453, 1n, { deps });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.reputation).toBeNull();
    expect(result.value.missing).toContain("reputation");
  });
});
