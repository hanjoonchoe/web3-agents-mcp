import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { Result } from "../shared/result.js";
import type { BridgeError } from "../shared/errors.js";
import { ping, pingOutputSchema } from "../tools/ping.js";
import {
  resolveAgent,
  resolveAgentInputShape,
  resolveAgentOutputSchema,
} from "../tools/resolve-agent.js";
import {
  getRegistrationFile,
  getRegistrationFileInputShape,
  getRegistrationFileOutputSchema,
} from "../tools/get-registration-file.js";
import { GetReputationInput, GetReputationOutput, getReputation } from "../tools/get-reputation.js";
import {
  GetValidationsInput,
  GetValidationsOutput,
  getValidations,
} from "../tools/get-validations.js";
import {
  assessTrust,
  assessTrustInputShape,
  assessTrustOutputSchema,
} from "../tools/assess-trust.js";
import {
  searchAgents,
  searchAgentsInputShape,
  searchAgentsOutputSchema,
} from "../tools/search-agents.js";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: Omit<BridgeError, "cause"> };

// Upstream libraries (viem especially) can produce multi-KB, multi-line error
// messages — including entire embedded HTML error pages from failing RPCs. MCP tool
// consumers are LLMs, so the serialized envelope keeps only the first line, capped
// at MAX_ERROR_MESSAGE_CHARS. The full original message remains available internally
// on the BridgeError (and its `cause`), which is never serialized into the envelope.
const MAX_ERROR_MESSAGE_CHARS = 300;
const TRUNCATION_MARKER = "… [truncated]";

function sanitizeErrorMessage(message: string): string {
  const newlineIndex = message.search(/\r|\n/);
  const firstLine = newlineIndex === -1 ? message : message.slice(0, newlineIndex);
  // The marker counts toward the cap so the serialized message never exceeds it.
  const capped =
    firstLine.length > MAX_ERROR_MESSAGE_CHARS
      ? firstLine.slice(0, MAX_ERROR_MESSAGE_CHARS - TRUNCATION_MARKER.length)
      : firstLine;
  return capped.length < message.length ? capped + TRUNCATION_MARKER : capped;
}

/** Exported for tests only; not part of the tool surface. */
export function toEnvelope<T>(result: Result<T>): Envelope<T> {
  if (result.ok) {
    return { ok: true, data: result.value };
  }
  const { code, message, retryable } = result.error;
  return { ok: false, error: { code, message: sanitizeErrorMessage(message), retryable } };
}

function toCallToolResult<T>(result: Result<T>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(toEnvelope(result)) }],
  };
}

async function toCallToolResultAsync<T>(result: Promise<Result<T>>): Promise<CallToolResult> {
  return toCallToolResult(await result);
}

/**
 * Single source of truth for each tool's name/description/schemas — used both to
 * register the tool below and (via `scripts/gen-tool-docs.ts`) to generate
 * `docs/tools.md`, so the two can never drift apart.
 */
export type ToolMetadata = {
  name: string;
  description: string;
  inputShape?: Record<string, z.ZodTypeAny>;
  outputSchema: z.ZodTypeAny;
};

export const TOOL_METADATA: ToolMetadata[] = [
  {
    name: "ping",
    description: "Liveness check; returns pong and the server version.",
    outputSchema: pingOutputSchema,
  },
  {
    name: "resolve_agent",
    description:
      "Resolves an ERC-8004 agent by agentId or ownerAddress (exactly one selector), " +
      "returning identity fields plus best-effort endpoints/capabilities parsed from " +
      "its registration file.",
    inputShape: resolveAgentInputShape,
    outputSchema: resolveAgentOutputSchema,
  },
  {
    name: "get_registration_file",
    description:
      "Fetches and verifies an agent's registration file (via its tokenUri): " +
      "ipfs:// CIDs are verified, data: URIs are inherently verified, https:// is " +
      "unverifiable in v1 (no on-chain hash commitment).",
    inputShape: getRegistrationFileInputShape,
    outputSchema: getRegistrationFileOutputSchema,
  },
  {
    name: "get_reputation",
    description:
      "Reads an agent's Reputation Registry feedback summary (and optionally the raw " +
      "feedback entries). Always returns honesty caveats — feedback is self-reported " +
      "by clients and is a weak signal, especially for low feedback counts.",
    inputShape: GetReputationInput.shape,
    outputSchema: GetReputationOutput,
  },
  {
    name: "get_validations",
    description:
      "Reads an agent's Validation Registry entries (validator, best-effort method " +
      "classification, response, timestamp). An agent with zero validations is a " +
      "normal, successful result — not an error.",
    inputShape: GetValidationsInput.shape,
    outputSchema: GetValidationsOutput,
  },
  {
    name: "assess_trust",
    description:
      "Factual trust report for an ERC-8004 agent: runs identity, registration " +
      "file, reputation, and validation lookups in parallel with graceful partial " +
      "failure, and returns the raw sections plus deterministic honesty caveats " +
      "and a short factual natural-language summary. No numeric scoring. " +
      "`taskContext` only shapes the summary text.",
    inputShape: assessTrustInputShape,
    outputSchema: assessTrustOutputSchema,
  },
  {
    name: "search_agents",
    description:
      "Searches for ERC-8004 agents by name/capability/description. MVP stub: no " +
      "local index backend ships yet, so this always returns INDEX_UNAVAILABLE " +
      "(input validation still runs first).",
    inputShape: searchAgentsInputShape,
    outputSchema: searchAgentsOutputSchema,
  },
];

export function registerTools(server: McpServer): void {
  const metaFor = (name: string): ToolMetadata => {
    const meta = TOOL_METADATA.find((m) => m.name === name);
    if (!meta) {
      throw new Error(`missing TOOL_METADATA entry for "${name}"`);
    }
    return meta;
  };

  server.registerTool("ping", { description: metaFor("ping").description }, () =>
    toCallToolResult(ping()),
  );

  server.registerTool(
    "resolve_agent",
    { description: metaFor("resolve_agent").description, inputSchema: resolveAgentInputShape },
    async (input) => toCallToolResult(await resolveAgent(input)),
  );

  server.registerTool(
    "get_registration_file",
    {
      description: metaFor("get_registration_file").description,
      inputSchema: getRegistrationFileInputShape,
    },
    async (input) => toCallToolResult(await getRegistrationFile(input)),
  );

  server.registerTool(
    "get_reputation",
    { description: metaFor("get_reputation").description, inputSchema: GetReputationInput.shape },
    (args) => toCallToolResultAsync(getReputation(args)),
  );

  server.registerTool(
    "get_validations",
    { description: metaFor("get_validations").description, inputSchema: GetValidationsInput.shape },
    (args) => toCallToolResultAsync(getValidations(args)),
  );

  server.registerTool(
    "assess_trust",
    { description: metaFor("assess_trust").description, inputSchema: assessTrustInputShape },
    async (input) => toCallToolResult(await assessTrust(input)),
  );

  server.registerTool(
    "search_agents",
    { description: metaFor("search_agents").description, inputSchema: searchAgentsInputShape },
    async (input) => toCallToolResult(await searchAgents(input)),
  );
}
