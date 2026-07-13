import { z } from "zod";
import { getSummary, readFeedback } from "../registry/reputation.js";
import { chainSchema } from "../chains/schema.js";
import { chainIdForSlug } from "../chains/config.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";

/**
 * `get_reputation` MCP tool. Imports only `registry`/`shared`/the shared chain
 * schema/slug lookup (never `viem` directly), per WP-4 R-8.
 *
 * chainId default: `DEFAULT_CHAIN_ID` env var if set and a valid integer, else `8453`
 * (Base) — see WP-4 R-7. Chain support is enforced at the MCP schema layer (enum of
 * configured chain slugs) and, as defense-in-depth, downstream by `getSummary`/
 * `readFeedback` (CHAIN_UNSUPPORTED) for direct (non-MCP) callers.
 */

const MAX_LIMIT = 200;

export const GetReputationInput = z.object({
  chain: chainSchema,
  agentId: z.string().regex(/^\d+$/, "agentId must be a non-negative decimal integer string"),
  includeRaw: z.boolean().optional().default(false),
  limit: z.number().int().optional().default(50),
  offset: z.number().int().optional().default(0),
});
export type GetReputationInput = z.input<typeof GetReputationInput>;

const FeedbackEntryOutput = z.object({
  client: z.string(),
  score: z.number(),
  tag: z.string().nullable(),
  uri: z.string().nullable(),
  timestamp: z.string().nullable(),
});

export const GetReputationOutput = z.object({
  summary: z.object({
    count: z.string(),
    averageScore: z.number().nullable(),
    lastFeedbackAt: z.string().nullable(),
  }),
  raw: z.array(FeedbackEntryOutput).optional(),
  pagination: z.object({ limit: z.number(), offset: z.number(), total: z.string() }).optional(),
  caveats: z.array(z.string()).min(1),
});
export type GetReputationOutput = z.infer<typeof GetReputationOutput>;

const SYBIL_CAVEAT =
  "Feedback is self-reported by clients and may include Sybil or spam entries; treat scores as a weak signal.";

function resolveDefaultChainId(): number {
  const raw = process.env["DEFAULT_CHAIN_ID"];
  if (raw !== undefined && raw.length > 0) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return 8453;
}

export async function getReputation(input: unknown): Promise<Result<GetReputationOutput>> {
  const parsed = GetReputationInput.safeParse(input);
  if (!parsed.success) {
    return err(bridgeError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; ")));
  }
  const { agentId: agentIdStr, includeRaw, chain, limit, offset } = parsed.data;

  if (limit < 0 || offset < 0) {
    return err(bridgeError("INVALID_INPUT", "limit and offset must be non-negative"));
  }
  const clampedLimit = Math.min(limit, MAX_LIMIT);

  let agentId: bigint;
  try {
    agentId = BigInt(agentIdStr);
  } catch {
    return err(
      bridgeError("INVALID_INPUT", "agentId must be a non-negative decimal integer string"),
    );
  }

  const chainId =
    (chain !== undefined ? chainIdForSlug(chain) : undefined) ?? resolveDefaultChainId();

  const summaryResult = await getSummary(chainId, agentId);
  if (!isOk(summaryResult)) {
    return summaryResult;
  }
  const summary = summaryResult.value;

  const caveats: string[] = [SYBIL_CAVEAT];
  if (summary.count === 0n) {
    caveats.push("No feedback recorded.");
  } else if (summary.count < 5n) {
    caveats.push(
      `Only ${summary.count.toString()} feedback entries exist; statistics are not meaningful.`,
    );
  }

  const output: GetReputationOutput = {
    summary: {
      count: summary.count.toString(),
      averageScore: summary.averageScore,
      lastFeedbackAt: summary.lastFeedbackAt !== null ? summary.lastFeedbackAt.toString() : null,
    },
    caveats,
  };

  if (includeRaw) {
    const feedbackResult = await readFeedback(chainId, agentId, { limit: clampedLimit, offset });
    if (!isOk(feedbackResult)) {
      return feedbackResult;
    }
    output.raw = feedbackResult.value.map((entry) => ({
      client: entry.client,
      score: entry.score,
      tag: entry.tag,
      uri: entry.uri,
      timestamp: entry.timestamp !== null ? entry.timestamp.toString() : null,
    }));
    output.pagination = { limit: clampedLimit, offset, total: summary.count.toString() };
  }

  return ok(output);
}
