import { z } from "zod";
import { fetchRegistrationFile } from "../fetcher/fetch.js";
import { getAgent } from "../registry/identity.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";

// R-9: this module imports only from registry/fetcher/shared — never viem directly.

const AGENT_ID_PATTERN = /^\d+$/;

export const getRegistrationFileInputShape = {
  chainId: z.number().int().optional(),
  agentId: z.string(),
  requireVerified: z.boolean().optional(),
};
export const getRegistrationFileInputSchema = z.object(getRegistrationFileInputShape);
export type GetRegistrationFileInput = z.infer<typeof getRegistrationFileInputSchema>;

export const getRegistrationFileOutputSchema = z.object({
  verified: z.boolean().nullable(),
  hashComputed: z.string(),
  source: z.enum(["ipfs", "https", "data", "cache"]),
  fetchedAt: z.string(),
  content: z.unknown(),
  contentError: z.enum(["not-json"]).nullable(),
  notes: z.array(z.string()).optional(),
});
export type GetRegistrationFileOutput = z.infer<typeof getRegistrationFileOutputSchema>;

function resolveChainId(chainId: number | undefined): number {
  if (chainId !== undefined) {
    return chainId;
  }
  const envValue = process.env["DEFAULT_CHAIN_ID"];
  const parsed = envValue !== undefined ? Number(envValue) : NaN;
  return Number.isInteger(parsed) ? parsed : 8453;
}

export async function getRegistrationFile(
  input: GetRegistrationFileInput,
): Promise<Result<GetRegistrationFileOutput>> {
  if (!AGENT_ID_PATTERN.test(input.agentId)) {
    return err(
      bridgeError(
        "INVALID_INPUT",
        `agentId must be a decimal integer string, got: ${input.agentId}`,
      ),
    );
  }
  const chainId = resolveChainId(input.chainId);
  const requireVerified = input.requireVerified ?? false;

  const agentResult = await getAgent(chainId, BigInt(input.agentId));
  if (!isOk(agentResult)) {
    return agentResult;
  }

  const fileResult = await fetchRegistrationFile(agentResult.value.tokenUri);
  if (!isOk(fileResult)) {
    return fileResult;
  }
  const file = fileResult.value;

  // verified === null means "unverifiable" (no on-chain hash commitment exists for
  // https:// files in v1 — see WP-2 audit amendment 1) and must NOT trigger
  // FILE_HASH_MISMATCH; only an explicit verified:false does (R-7).
  if (requireVerified && file.verified === false) {
    return err(
      bridgeError(
        "FILE_HASH_MISMATCH",
        `fetched registration file for agent ${input.agentId} on chain ${chainId} failed hash/CID verification`,
      ),
    );
  }

  const notes = file.verified === null ? ["unverifiable"] : undefined;

  return ok({
    verified: file.verified,
    hashComputed: file.hashComputed,
    source: file.source,
    fetchedAt: file.fetchedAt,
    content: file.content,
    contentError: file.contentError,
    ...(notes ? { notes } : {}),
  });
}
