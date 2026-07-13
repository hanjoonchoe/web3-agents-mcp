import { z } from "zod";
import { fetchRegistrationFile } from "../fetcher/fetch.js";
import { getAgent, getAgentsByOwner, type AgentRecord } from "../registry/identity.js";
import { bridgeError } from "../shared/errors.js";
import { type Result, err, isOk, ok } from "../shared/result.js";

// R-9: this module imports only from registry/fetcher/shared — never viem directly.
// chainId validity (CHAIN_UNSUPPORTED) is enforced by the registry functions
// themselves (getAgent/getAgentsByOwner -> resolveClientAndConfig), so this tool
// never needs to touch src/chains.

const AGENT_ID_PATTERN = /^\d+$/;
const OWNER_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export const resolveAgentInputShape = {
  chainId: z.number().int().optional(),
  agentId: z.string().optional(),
  ownerAddress: z.string().optional(),
};
export const resolveAgentInputSchema = z.object(resolveAgentInputShape);
export type ResolveAgentInput = z.infer<typeof resolveAgentInputSchema>;

export const resolveAgentOutputSchema = z.object({
  chainId: z.number(),
  agentId: z.string().nullable(),
  owner: z.string().nullable(),
  tokenUri: z.string().nullable(),
  registrationFileUrl: z.string().nullable(),
  endpoints: z.array(z.string()).nullable(),
  capabilities: z.array(z.string()).nullable(),
  registeredAt: z.string().nullable(),
  candidates: z.array(z.string()).optional(),
});
export type ResolveAgentOutput = z.infer<typeof resolveAgentOutputSchema>;

function resolveChainId(chainId: number | undefined): number {
  if (chainId !== undefined) {
    return chainId;
  }
  const envValue = process.env["DEFAULT_CHAIN_ID"];
  const parsed = envValue !== undefined ? Number(envValue) : NaN;
  return Number.isInteger(parsed) ? parsed : 8453;
}

// Default IPFS gateway used only to build a human/browser-followable
// `registrationFileUrl` for ipfs:// tokenUris; the actual fetch/verify path
// (src/fetcher) independently tries every configured gateway.
const DISPLAY_GATEWAY = "https://ipfs.io";

function toRegistrationFileUrl(tokenUri: string): string {
  const ipfsMatch = /^ipfs:\/\/([^/]+)(\/.*)?$/.exec(tokenUri);
  if (ipfsMatch) {
    const cid = ipfsMatch[1];
    const path = ipfsMatch[2] ?? "";
    return `${DISPLAY_GATEWAY}/ipfs/${cid}${path}`;
  }
  return tokenUri;
}

// Registration-file field mapping (WP-3 spec R-6). The live example (Base agent #0)
// has the shape: { name, description, services: [{ type, url }, ...], supportedTrust,
// active, ... }. Some registration files instead use an `endpoints` key in place of
// `services`. Mapping used here:
//   endpoints     <- services[].url, or endpoints[].url / endpoints[] (string form)
//   capabilities  <- capabilities[] if present, else supportedTrust[]
// Anything not matching this shape (or a fetch failure) yields explicit nulls, never
// omitted fields.
function extractEndpointsAndCapabilities(content: unknown): {
  endpoints: string[] | null;
  capabilities: string[] | null;
} {
  if (content === null || typeof content !== "object") {
    return { endpoints: null, capabilities: null };
  }
  const obj = content as Record<string, unknown>;

  const serviceLike = Array.isArray(obj["services"])
    ? obj["services"]
    : Array.isArray(obj["endpoints"])
      ? obj["endpoints"]
      : null;
  const endpoints = serviceLike
    ? serviceLike
        .map((entry): string | null => {
          if (typeof entry === "string") {
            return entry;
          }
          if (entry !== null && typeof entry === "object") {
            const url = (entry as Record<string, unknown>)["url"];
            return typeof url === "string" ? url : null;
          }
          return null;
        })
        .filter((url): url is string => url !== null)
    : null;

  const capabilityLike = Array.isArray(obj["capabilities"])
    ? obj["capabilities"]
    : Array.isArray(obj["supportedTrust"])
      ? obj["supportedTrust"]
      : null;
  const capabilities = capabilityLike
    ? capabilityLike.filter((v): v is string => typeof v === "string")
    : null;

  return { endpoints, capabilities };
}

async function buildAgentData(
  chainId: number,
  record: AgentRecord,
): Promise<Omit<ResolveAgentOutput, "candidates">> {
  const fileResult = await fetchRegistrationFile(record.tokenUri);
  const { endpoints, capabilities } = isOk(fileResult)
    ? extractEndpointsAndCapabilities(fileResult.value.content)
    : { endpoints: null, capabilities: null };

  return {
    chainId,
    agentId: record.agentId.toString(),
    owner: record.owner,
    tokenUri: record.tokenUri,
    registrationFileUrl: toRegistrationFileUrl(record.tokenUri),
    endpoints,
    capabilities,
    registeredAt: record.registeredAt !== null ? record.registeredAt.toString() : null,
  };
}

export async function resolveAgent(input: ResolveAgentInput): Promise<Result<ResolveAgentOutput>> {
  const hasAgentId = input.agentId !== undefined;
  const hasOwnerAddress = input.ownerAddress !== undefined;

  if (hasAgentId === hasOwnerAddress) {
    return err(
      bridgeError(
        "INVALID_INPUT",
        "exactly one of agentId or ownerAddress must be provided (zero or both were given)",
      ),
    );
  }

  const chainId = resolveChainId(input.chainId);

  if (hasAgentId) {
    const agentIdRaw = input.agentId as string;
    if (!AGENT_ID_PATTERN.test(agentIdRaw)) {
      return err(
        bridgeError(
          "INVALID_INPUT",
          `agentId must be a decimal integer string, got: ${agentIdRaw}`,
        ),
      );
    }
    const agentResult = await getAgent(chainId, BigInt(agentIdRaw));
    if (!isOk(agentResult)) {
      return agentResult;
    }
    const data = await buildAgentData(chainId, agentResult.value);
    return ok(data);
  }

  const ownerAddressRaw = input.ownerAddress as string;
  if (!OWNER_ADDRESS_PATTERN.test(ownerAddressRaw)) {
    return err(
      bridgeError(
        "INVALID_INPUT",
        `ownerAddress must be a 0x-prefixed 20-byte hex address, got: ${ownerAddressRaw}`,
      ),
    );
  }
  const ownerAddress = ownerAddressRaw as `0x${string}`;

  const agentIdsResult = await getAgentsByOwner(chainId, ownerAddress);
  if (!isOk(agentIdsResult)) {
    return agentIdsResult;
  }
  const agentIds = agentIdsResult.value;

  if (agentIds.length === 0) {
    return err(
      bridgeError("AGENT_NOT_FOUND", `no agents owned by ${ownerAddressRaw} on chain ${chainId}`),
    );
  }

  if (agentIds.length > 1) {
    return ok({
      chainId,
      agentId: null,
      owner: ownerAddressRaw,
      tokenUri: null,
      registrationFileUrl: null,
      endpoints: null,
      capabilities: null,
      registeredAt: null,
      candidates: agentIds.map((id) => id.toString()),
    });
  }

  const soleAgentId = agentIds[0] as bigint;
  const agentResult = await getAgent(chainId, soleAgentId);
  if (!isOk(agentResult)) {
    return agentResult;
  }
  const data = await buildAgentData(chainId, agentResult.value);
  return ok(data);
}
