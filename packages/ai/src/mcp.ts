import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const playwrightMcpCli = join(dirname(require.resolve("@playwright/mcp/package.json")), "cli.js");

export async function createPlaywrightMCPClient() {
  return createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: "node",
      args: [playwrightMcpCli, "--headless"],
    }),
  });
}
