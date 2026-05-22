import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

export async function createPlaywrightMCPClient() {
  return createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "npx",
      args: ["@playwright/mcp", "--headless"],
    }),
  });
}
