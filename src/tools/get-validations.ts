import { z } from "zod";
import { getValidations as readValidations } from "../registry/validation.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";

/**
 * `get_validations` MCP tool. Imports only `registry`/`shared` (never `viem` directly),
 * per WP-4 R-8.
 *
 * chainId default: `DEFAULT_CHAIN_ID` env var if set and a valid integer, else `8453`
 * (Base) — see WP-4 R-7.
 *
 * `response` is passed through as `unknown` (see registry/validation.ts header): the
 * minimal ABI cannot distinguish "validated with score 0" from "not yet responded to",
 * so no pending/zero disambiguation is invented here.
 */

const MAX_LIMIT = 200;

export const GetValidationsInput = z.object({
  chainId: z.number().int().optional(),
  agentId: z.string().regex(/^\d+$/, "agentId must be a non-negative decimal integer string"),
  limit: z.number().int().optional().default(50),
  offset: z.number().int().optional().default(0),
});
export type GetValidationsInput = z.input<typeof GetValidationsInput>;

const ValidationEntryOutput = z.object({
  validator: z.string(),
  method: z.enum(["tee", "zk", "reexec", "other"]),
  requestHash: z.string().nullable(),
  response: z.unknown(),
  timestamp: z.string().nullable(),
});

export const GetValidationsOutput = z.object({
  entries: z.array(ValidationEntryOutput),
  count: z.string(),
  pagination: z.object({ limit: z.number(), offset: z.number() }),
});
export type GetValidationsOutput = z.infer<typeof GetValidationsOutput>;

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

export async function getValidations(input: unknown): Promise<Result<GetValidationsOutput>> {
  const parsed = GetValidationsInput.safeParse(input);
  if (!parsed.success) {
    return err(bridgeError("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join("; ")));
  }
  const { agentId: agentIdStr, chainId: chainIdInput, limit, offset } = parsed.data;

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

  const chainId = chainIdInput ?? resolveDefaultChainId();

  const result = await readValidations(chainId, agentId, { limit: clampedLimit, offset });
  if (!isOk(result)) {
    return result;
  }

  const entries = result.value.entries.map((entry) => ({
    validator: entry.validator,
    method: entry.method,
    requestHash: entry.requestHash,
    response: entry.response,
    timestamp: entry.timestamp !== null ? entry.timestamp.toString() : null,
  }));

  return ok({
    entries,
    count: result.value.total.toString(),
    pagination: { limit: clampedLimit, offset },
  });
}
