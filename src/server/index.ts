#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./register-tools.js";
import { logger } from "../shared/logger.js";

async function main(): Promise<void> {
  const server = new McpServer({ name: "web3-agents-mcp", version: "0.1.0" });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("web3-agents-mcp server connected over stdio");
}

main().catch((error: unknown) => {
  logger.error("fatal error starting server", { error });
  process.exitCode = 1;
});
