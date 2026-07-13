import { describe, expect, it } from "vitest";
import { buildTrustSummary, type SummaryInput } from "../../src/trust/summary.js";

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const LEADING_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";

describe("buildTrustSummary — R-9 snapshots", () => {
  it("T-8: healthy agent (verified file, high feedback, has validation, medium confidence)", () => {
    const input: SummaryInput = {
      chainId: 8453,
      agentId: "0",
      agentName: "ExampleAgent",
      fileVerified: true,
      reputationCount: 57,
      reputationAverage: 100,
      hasValidations: true,
      confidence: "medium",
      leadingCaveat: LEADING_CAVEAT,
    };
    const summary = buildTrustSummary(input);
    expect(summary).toMatchInlineSnapshot(
      `"Agent 0 ("ExampleAgent") on chain 8453. Its registration file is cryptographically verified. It has 57 feedback entries averaging 100.0/100. At least one independent validation has been recorded. Confidence in this assessment is medium. Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal."`,
    );
    expect(wordCount(summary)).toBeLessThanOrEqual(120);
  });

  it("T-8: zero-feedback agent", () => {
    const input: SummaryInput = {
      chainId: 8453,
      agentId: "42",
      agentName: null,
      fileVerified: null,
      reputationCount: 0,
      reputationAverage: null,
      hasValidations: false,
      confidence: "low",
      leadingCaveat: LEADING_CAVEAT,
    };
    const summary = buildTrustSummary(input);
    expect(summary).toMatchInlineSnapshot(
      `"Agent 42 on chain 8453. Its registration file is unverifiable (no on-chain hash commitment). It has received no feedback yet. No independent validations have been recorded. Confidence in this assessment is low. Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal."`,
    );
    expect(wordCount(summary)).toBeLessThanOrEqual(120);
  });

  it("T-8: mismatch agent (file failed verification) with taskContext", () => {
    const input: SummaryInput = {
      chainId: 1,
      agentId: "7",
      agentName: null,
      fileVerified: false,
      reputationCount: 3,
      reputationAverage: 42,
      hasValidations: false,
      confidence: "low",
      leadingCaveat: LEADING_CAVEAT,
      taskContext: "paying a large invoice on behalf of my company",
    };
    const summary = buildTrustSummary(input);
    expect(summary).toMatchInlineSnapshot(
      `"Agent 7 on chain 1. Its registration file FAILED hash/CID verification. It has 3 feedback entries averaging 42.0/100. No independent validations have been recorded. Confidence in this assessment is low. Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal. For the requested task (paying a large invoice on behalf of my company), weigh these signals against task-specific risk."`,
    );
    expect(wordCount(summary)).toBeLessThanOrEqual(120);
  });

  it("T-8: partial-failure report (reputation/validations unavailable)", () => {
    const input: SummaryInput = {
      chainId: 8453,
      agentId: "13",
      agentName: null,
      fileVerified: true,
      reputationCount: null,
      reputationAverage: null,
      hasValidations: null,
      confidence: "low",
      leadingCaveat: LEADING_CAVEAT,
    };
    const summary = buildTrustSummary(input);
    expect(summary).toMatchInlineSnapshot(
      `"Agent 13 on chain 8453. Its registration file is cryptographically verified. Feedback data is unavailable. Validation data is unavailable. Confidence in this assessment is low. Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal."`,
    );
    expect(wordCount(summary)).toBeLessThanOrEqual(120);
  });

  it("taskContext is truncated to 80 chars in the summary", () => {
    const longContext = "x".repeat(200);
    const input: SummaryInput = {
      chainId: 8453,
      agentId: "1",
      agentName: null,
      fileVerified: true,
      reputationCount: 10,
      reputationAverage: 90,
      hasValidations: true,
      confidence: "medium",
      leadingCaveat: LEADING_CAVEAT,
      taskContext: longContext,
    };
    const summary = buildTrustSummary(input);
    const match = /\(([^)]*)\)/g;
    const matches = [...summary.matchAll(match)];
    const taskClauseMatch = matches[matches.length - 1];
    expect(taskClauseMatch).toBeDefined();
    expect((taskClauseMatch?.[1] ?? "").length).toBeLessThanOrEqual(80);
  });

  it("deterministic: same input always yields the same output", () => {
    const input: SummaryInput = {
      chainId: 8453,
      agentId: "0",
      agentName: "A",
      fileVerified: true,
      reputationCount: 10,
      reputationAverage: 50,
      hasValidations: true,
      confidence: "medium",
      leadingCaveat: LEADING_CAVEAT,
    };
    expect(buildTrustSummary(input)).toBe(buildTrustSummary(input));
  });
});
