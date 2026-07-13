import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./register-tools.js";
import { logger } from "../shared/logger.js";

async function main(): Promise<void> {
  const server = new McpServer({ name: "mcp-8004-bridge", version: "0.1.0" });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("mcp-8004-bridge server connected over stdio");
}

main().catch((error: unknown) => {
  logger.error("fatal error starting server", { error });
  process.exitCode = 1;
});
