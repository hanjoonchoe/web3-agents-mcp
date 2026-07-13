/**
 * Scorer contract for the `assess_trust` composite tool (WP-5 R-4).
 *
 * Implementations MUST be pure: no I/O, no `Date.now()`, no `Math.random()`. If a
 * future scorer ever needs "now", it must take it as an injected parameter rather
 * than reading the clock itself.
 */

export type ScorerIdentityInput = {
  agentId: bigint;
  owner: string;
  tokenUri: string;
  registeredAt: bigint | null;
} | null;

export type ScorerFileInput = {
  verified: boolean | null;
} | null;

export type ScorerReputationInput = {
  count: bigint;
  averageScore: number | null;
} | null;

export type ScorerValidationEntryInput = { method: string };

export type ScorerValidationsInput = {
  entries: ScorerValidationEntryInput[];
  total: number;
} | null;

export type ScorerInput = {
  identity: ScorerIdentityInput;
  file: ScorerFileInput;
  reputation: ScorerReputationInput;
  validations: ScorerValidationsInput;
};

export type Confidence = "low" | "medium" | "high";

export type ScoreResult = {
  score: number | null;
  confidence: Confidence;
  caveats: string[];
};

export interface Scorer {
  score(input: ScorerInput): ScoreResult;
}
