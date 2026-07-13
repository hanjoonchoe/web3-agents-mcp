import type { Confidence, ScoreResult, Scorer, ScorerInput } from "./scorer.js";

/**
 * `NaiveScorer` — the v0 deterministic trust heuristic (WP-5 R-5/R-6/R-7).
 *
 * PURE by construction: reads only its `input` argument, no I/O, no `Date.now()`,
 * no `Math.random()`. Table-driven tests in test/trust/naive-scorer.test.ts mirror
 * every row below verbatim.
 *
 * | Component                                              | Points                              |
 * |----------------------------------------------------------|--------------------------------------|
 * | Base (identity resolved)                                | 30                                   |
 * | Registration file verified === true                     | +20                                  |
 * | File present but verified === null (unverifiable)        | +5                                    |
 * | File verified === false (hash/CID mismatch)              | −30                                   |
 * | Feedback volume                                          | +min(20, floor(count / 5) * 4)       |
 * | Average score contribution (only when count >= 5)        | +(averageScore/100) * 15             |
 * | >=1 validation entry                                     | +10                                   |
 * | >=1 validation with method "tee" or "zk"                  | +5 more                              |
 *
 * Final score is clamped to [0, 100] and rounded to the nearest integer.
 * identity === null => score: null (base cannot be established).
 */

export const SYBIL_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";
export const NAIVE_HEURISTIC_CAVEAT =
  "Score computed by NaiveScorer v0 heuristics; not Sybil-resistant.";
export const SCALE_CAVEAT =
  "On-chain feedback uses inconsistent score scales; averages are clamped to 0-100 and may overstate quality.";
export const FILE_MISMATCH_CAVEAT =
  "Registration file failed hash/CID verification; the file's authenticity could not be confirmed.";
export const FILE_UNVERIFIABLE_CAVEAT =
  "Registration file could not be verified against an on-chain commitment (e.g. an https:// source); treat its contents as unauthenticated.";
export const LOW_VOLUME_CAVEAT =
  "Fewer than 5 feedback entries exist; feedback statistics are not statistically meaningful.";

export type MissingSection = "identity" | "registrationFile" | "reputation" | "validations";

const MISSING_LABELS: Record<MissingSection, string> = {
  identity: "Identity",
  registrationFile: "Registration file",
  reputation: "Reputation",
  validations: "Validation",
};

export function missingCaveat(section: MissingSection): string {
  return `${MISSING_LABELS[section]} data unavailable for this assessment.`;
}

export function deriveMissingSections(input: ScorerInput): MissingSection[] {
  const missing: MissingSection[] = [];
  if (input.identity === null) missing.push("identity");
  if (input.file === null) missing.push("registrationFile");
  if (input.reputation === null) missing.push("reputation");
  if (input.validations === null) missing.push("validations");
  return missing;
}

function computeScore(input: ScorerInput): number | null {
  if (input.identity === null) {
    return null;
  }

  let points = 30;

  const file = input.file;
  if (file !== null) {
    if (file.verified === true) {
      points += 20;
    } else if (file.verified === null) {
      points += 5;
    } else if (file.verified === false) {
      points -= 30;
    }
  }

  const reputation = input.reputation;
  if (reputation !== null) {
    const count = Number(reputation.count);
    points += Math.min(20, Math.floor(count / 5) * 4);
    if (count >= 5 && reputation.averageScore !== null) {
      points += (reputation.averageScore / 100) * 15;
    }
  }

  const validations = input.validations;
  if (validations !== null && validations.total >= 1) {
    points += 10;
    if (validations.entries.some((entry) => entry.method === "tee" || entry.method === "zk")) {
      points += 5;
    }
  }

  const clamped = Math.max(0, Math.min(100, points));
  return Math.round(clamped);
}

// "high" is intentionally unreachable in v0 — hard-capped at "medium" (R-6).
function computeConfidence(input: ScorerInput): Confidence {
  if (input.identity === null) {
    return "low";
  }
  const fileVerifiedTrue = input.file !== null && input.file.verified === true;
  const count = input.reputation !== null ? Number(input.reputation.count) : 0;
  const hasValidation = input.validations !== null && input.validations.total >= 1;

  if (fileVerifiedTrue && count >= 10 && hasValidation) {
    return "medium";
  }
  return "low";
}

function computeCaveats(input: ScorerInput, missing: MissingSection[]): string[] {
  const caveats: string[] = [SYBIL_CAVEAT, NAIVE_HEURISTIC_CAVEAT];

  if (input.reputation !== null && input.reputation.count > 0n) {
    caveats.push(SCALE_CAVEAT);
  }

  if (input.file !== null && input.file.verified === false) {
    caveats.push(FILE_MISMATCH_CAVEAT);
  }
  if (input.file !== null && input.file.verified === null) {
    caveats.push(FILE_UNVERIFIABLE_CAVEAT);
  }

  if (input.reputation !== null && Number(input.reputation.count) < 5) {
    caveats.push(LOW_VOLUME_CAVEAT);
  }

  for (const section of missing) {
    caveats.push(missingCaveat(section));
  }

  return caveats;
}

export class NaiveScorer implements Scorer {
  score(input: ScorerInput): ScoreResult {
    const missing = deriveMissingSections(input);
    return {
      score: computeScore(input),
      confidence: computeConfidence(input),
      caveats: computeCaveats(input, missing),
    };
  }
}
