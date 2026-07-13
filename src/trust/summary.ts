/**
 * Pure, deterministic natural-language summary template for `assess_trust` (WP-5,
 * descoped — the MVP ships no numeric score, so the summary is purely factual).
 * No LLM calls, no I/O, no randomness — same input always yields the same string.
 * Output is capped at 120 words (asserted in tests, not enforced here beyond the
 * template's own brevity).
 */

export type SummaryInput = {
  chainId: number;
  agentId: string;
  /** Best-effort agent name parsed from the registration file's `name` field, if any. */
  agentName: string | null;
  /** "unavailable" when the registration-file section is missing (fetch failed/timed out). */
  fileVerified: boolean | null | "unavailable";
  /** null when the reputation section is missing. */
  reputationCount: number | null;
  reputationAverage: number | null;
  /** null when the validations section is missing. */
  hasValidations: boolean | null;
  leadingCaveat: string;
  /** Raw, untruncated taskContext (truncated internally to 80 chars). */
  taskContext?: string | undefined;
};

const TASK_CONTEXT_MAX_CHARS = 80;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function agentLabel(agentId: string, agentName: string | null): string {
  return agentName ? `Agent ${agentId} ("${agentName}")` : `Agent ${agentId}`;
}

function fileClause(fileVerified: boolean | null | "unavailable"): string {
  if (fileVerified === "unavailable") {
    return "Its registration file could not be assessed.";
  }
  if (fileVerified === true) {
    return "Its registration file is cryptographically verified.";
  }
  if (fileVerified === false) {
    return "Its registration file FAILED hash/CID verification.";
  }
  return "Its registration file is unverifiable (no on-chain hash commitment).";
}

function reputationClause(count: number | null, average: number | null): string {
  if (count === null) {
    return "Feedback data is unavailable.";
  }
  if (count === 0) {
    return "It has received no feedback yet.";
  }
  const entryWord = count === 1 ? "entry" : "entries";
  const averageText = average !== null ? average.toFixed(1) : "an unclear";
  return `It has ${count} feedback ${entryWord} averaging ${averageText}/100.`;
}

function validationClause(hasValidations: boolean | null): string {
  if (hasValidations === null) {
    return "Validation data is unavailable.";
  }
  return hasValidations
    ? "At least one independent validation has been recorded."
    : "No independent validations have been recorded.";
}

export function buildTrustSummary(input: SummaryInput): string {
  const sentences: string[] = [
    `${agentLabel(input.agentId, input.agentName)} on chain ${input.chainId}.`,
    fileClause(input.fileVerified),
    reputationClause(input.reputationCount, input.reputationAverage),
    validationClause(input.hasValidations),
    input.leadingCaveat,
  ];

  if (input.taskContext !== undefined && input.taskContext.length > 0) {
    sentences.push(
      `For the requested task (${truncate(input.taskContext, TASK_CONTEXT_MAX_CHARS)}), weigh these signals against task-specific risk.`,
    );
  }

  return sentences.join(" ");
}
