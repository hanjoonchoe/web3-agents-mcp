import { z } from "zod";
import { assembleTrustReport } from "../trust/assemble.js";
import { chainSchema } from "../chains/schema.js";
import { chainIdForSlug } from "../chains/config.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, ok } from "../shared/result.js";
import { getRegistrationFileOutputSchema } from "./get-registration-file.js";
import { GetReputationOutput } from "./get-reputation.js";
import { GetValidationsOutput } from "./get-validations.js";

/**
 * `assess_trust` MCP tool — the WP-5 composite trust-report tool (descoped: the
 * MVP ships NO numeric trust score or confidence level).
 *
 * Runs identity/reputation/validations/registration-file sub-queries concurrently
 * (see src/trust/assemble.ts), attaches deterministic caveats
 * (src/trust/caveats.ts), and renders a short factual natural-language summary
 * (src/trust/summary.ts). `taskContext` only shapes the summary text — the
 * data/caveats are byte-identical with or without it (WP-5 R-8).
 */

const AGENT_ID_PATTERN = /^\d+$/;
const MAX_TASK_CONTEXT_CHARS = 500;

export const assessTrustInputShape = {
  chain: chainSchema,
  agentId: z.string(),
  taskContext: z.string().max(MAX_TASK_CONTEXT_CHARS).optional(),
};
export const assessTrustInputSchema = z.object(assessTrustInputShape);
export type AssessTrustInput = z.infer<typeof assessTrustInputSchema>;

const identitySectionSchema = z
  .object({
    agentId: z.string(),
    owner: z.string(),
    tokenUri: z.string(),
    registeredAt: z.string().nullable(),
  })
  .nullable();

const reputationSectionSchema = GetReputationOutput.shape.summary.nullable();
const validationsSectionSchema = GetValidationsOutput.nullable();
const registrationFileSectionSchema = getRegistrationFileOutputSchema
  .omit({ notes: true })
  .nullable();

const missingSectionSchema = z.enum(["identity", "registrationFile", "reputation", "validations"]);

export const assessTrustOutputSchema = z.object({
  identity: identitySectionSchema,
  registrationFile: registrationFileSectionSchema,
  reputation: reputationSectionSchema,
  validations: validationsSectionSchema,
  caveats: z.array(z.string()).min(1),
  summary: z.string(),
  missing: z.array(missingSectionSchema),
});
export type AssessTrustOutput = z.infer<typeof assessTrustOutputSchema>;

function resolveChainId(chain: string | undefined): number {
  if (chain !== undefined) {
    const id = chainIdForSlug(chain);
    if (id !== undefined) {
      return id;
    }
  }
  const envValue = process.env["DEFAULT_CHAIN_ID"];
  const parsed = envValue !== undefined ? Number(envValue) : NaN;
  return Number.isInteger(parsed) ? parsed : 8453;
}

export async function assessTrust(input: AssessTrustInput): Promise<Result<AssessTrustOutput>> {
  if (!AGENT_ID_PATTERN.test(input.agentId)) {
    return err(
      bridgeError(
        "INVALID_INPUT",
        `agentId must be a decimal integer string, got: ${input.agentId}`,
      ),
    );
  }
  const chainId = resolveChainId(input.chain);

  const reportResult = await assembleTrustReport(chainId, BigInt(input.agentId), {
    taskContext: input.taskContext,
  });
  if (!reportResult.ok) {
    return reportResult;
  }

  const report = reportResult.value;
  return ok({
    identity: report.identity,
    registrationFile: report.registrationFile,
    reputation: report.reputation,
    validations: report.validations,
    caveats: report.caveats,
    summary: report.summary,
    missing: report.missing,
  });
}
