import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Result } from "../shared/result.js";
import type { BridgeError } from "../shared/errors.js";
import { ping } from "../tools/ping.js";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: Omit<BridgeError, "cause"> };

function toEnvelope<T>(result: Result<T>): Envelope<T> {
  if (result.ok) {
    return { ok: true, data: result.value };
  }
  const { code, message, retryable } = result.error;
  return { ok: false, error: { code, message, retryable } };
}

function toCallToolResult<T>(result: Result<T>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(toEnvelope(result)) }],
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "ping",
    {
      description: "Liveness check; returns pong and the server version.",
    },
    () => toCallToolResult(ping()),
  );
}
