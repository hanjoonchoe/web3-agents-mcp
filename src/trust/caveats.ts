/**
 * Caveat rules for the `assess_trust` composite tool (WP-5, descoped).
 *
 * The MVP ships NO numeric trust score — `assess_trust` returns the raw sections
 * plus these documented, deterministic caveats. Pure by construction: no I/O, no
 * clock, no randomness.
 *
 * Rules:
 * - Sybil caveat: always present (so `caveats` is always non-empty).
 * - Scale caveat: when reputation is present and count > 0.
 * - File mismatch caveat: file present with verified === false.
 * - File unverifiable caveat: file present with verified === null.
 * - Low-volume caveat: reputation present with count < 5.
 * - One caveat per missing section.
 */

export type CaveatIdentityInput = {
  agentId: bigint;
  owner: string;
  tokenUri: string;
  registeredAt: bigint | null;
} | null;

export type CaveatFileInput = {
  verified: boolean | null;
} | null;

export type CaveatReputationInput = {
  count: bigint;
  averageScore: number | null;
} | null;

export type CaveatValidationsInput = {
  total: number;
} | null;

export type TrustSections = {
  identity: CaveatIdentityInput;
  file: CaveatFileInput;
  reputation: CaveatReputationInput;
  validations: CaveatValidationsInput;
};

export const SYBIL_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";
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

export function deriveMissingSections(sections: TrustSections): MissingSection[] {
  const missing: MissingSection[] = [];
  if (sections.identity === null) missing.push("identity");
  if (sections.file === null) missing.push("registrationFile");
  if (sections.reputation === null) missing.push("reputation");
  if (sections.validations === null) missing.push("validations");
  return missing;
}

/** Always returns at least one caveat (the Sybil caveat is unconditional). */
export function buildCaveats(sections: TrustSections, missing: MissingSection[]): string[] {
  const caveats: string[] = [SYBIL_CAVEAT];

  if (sections.reputation !== null && sections.reputation.count > 0n) {
    caveats.push(SCALE_CAVEAT);
  }

  if (sections.file !== null && sections.file.verified === false) {
    caveats.push(FILE_MISMATCH_CAVEAT);
  }
  if (sections.file !== null && sections.file.verified === null) {
    caveats.push(FILE_UNVERIFIABLE_CAVEAT);
  }

  if (sections.reputation !== null && Number(sections.reputation.count) < 5) {
    caveats.push(LOW_VOLUME_CAVEAT);
  }

  for (const section of missing) {
    caveats.push(missingCaveat(section));
  }

  return caveats;
}
